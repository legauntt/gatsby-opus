import { getAudioBuffer, getCtx } from '$lib/peaks';

/** One entry in da mix: a slice of a track, repeated `loops` times. */
export interface MixSlice {
	id: string;
	audioFile: string;
	start: number;
	length: number;
	loops: number;
}

/** A flattened, schedulable chunk: play `src` from `offset` for `duration`, at mix-time `when`. */
export interface Segment {
	when: number;
	src: string;
	offset: number;
	duration: number;
}

/**
 * Flatten slices (x their loop counts) into back-to-back segments, clamped
 * to each track's real duration so bad data can't schedule silence/errors.
 */
export const buildSegments = (
	slices: MixSlice[],
	durations: Map<string, number>
): { segments: Segment[]; total: number } => {
	const segments: Segment[] = [];
	let acc = 0;

	for (const s of slices) {
		const trackDur = durations.get(s.audioFile);
		if (trackDur == null) continue;

		const offset = Math.max(0, Math.min(s.start, trackDur));
		const duration = Math.min(s.length, trackDur - offset);
		if (duration <= 0) continue;

		// Hard engine-side cap: each repetition is its own scheduled source,
		// so a runaway loops value (typo, hand-crafted share link) would
		// otherwise flatten into millions of nodes and take the tab down.
		const loops = Math.max(1, Math.min(999, Math.floor(s.loops || 1)));
		for (let k = 0; k < loops; k++) {
			segments.push({ when: acc, src: s.audioFile, offset, duration });
			acc += duration;
		}
	}

	return { segments, total: acc };
};

const MIN_LOOP = 0.05;

/**
 * Da decks: Web Audio playback for the /wtc editor.
 *
 * Two modes:
 *  - 'loop': one slice looping seamlessly forever (AudioBufferSourceNode
 *    loopStart/loopEnd -- sample accurate, and adjustable LIVE while it
 *    plays, which is what makes dialing in a slice actually pleasant).
 *  - 'mix': the whole sequence of slices scheduled back-to-back.
 *
 * `position` is a display-side playhead advanced by rAF off the audio
 * clock. In loop mode it's absolute seconds within the track; in mix mode
 * it's seconds into the mix.
 */
class Decks {
	mode: '' | 'loop' | 'mix' = $state('');
	playing: boolean = $state(false);
	loading: boolean = $state(false);
	position: number = $state(0);
	totalDuration: number = $state(0);

	/** Whole-mix repeat, like the classic single-slice glawski looped forever. */
	loopMix: boolean = $state(true);

	/** Which track the loop preview belongs to (so UIs can match playheads). */
	loopSrc: string = $state('');

	private loopStart = 0;
	private loopLen = MIN_LOOP;
	private loopNode: AudioBufferSourceNode | null = null;
	private loopBuffer: AudioBuffer | null = null;

	private segments: Segment[] = [];
	private buffers = new Map<string, AudioBuffer>();
	private mixNodes: AudioBufferSourceNode[] = [];
	private t0 = 0;
	private startedAt = 0;

	/** Mix-time (seconds since t0's position) we've scheduled sources up to. */
	private scheduledV = 0;

	/** Interval that keeps looping passes queued -- rAF freezes in hidden tabs. */
	private schedTimer = 0;

	private raf = 0;
	private gen = 0;

	private ensureCtx(): AudioContext | null {
		const ctx = getCtx();
		if (ctx && ctx.state === 'suspended') {
			ctx.resume().catch(() => {});
		}
		return ctx;
	}

	private silence() {
		for (const node of this.mixNodes) {
			try {
				node.stop();
			} catch {
				// never started / already stopped -- don't care
			}
			node.disconnect();
		}
		this.mixNodes = [];

		if (this.loopNode) {
			try {
				this.loopNode.stop();
			} catch {
				// ditto
			}
			this.loopNode.disconnect();
			this.loopNode = null;
		}

		if (this.schedTimer) {
			clearInterval(this.schedTimer);
			this.schedTimer = 0;
		}

		if (this.raf) {
			cancelAnimationFrame(this.raf);
			this.raf = 0;
		}

		this.playing = false;
	}

	stop() {
		this.gen++;
		this.silence();
		this.mode = '';
		this.loading = false;
		this.loopSrc = '';
		this.loopBuffer = null;
		this.segments = [];
		this.buffers.clear();
		this.position = 0;
		this.totalDuration = 0;
	}

	// ---------------------------------------------------------------- loop

	async playLoop(src: string, start: number, length: number) {
		const gen = ++this.gen;
		this.silence();

		this.mode = 'loop';
		this.loopSrc = src;
		this.loading = true;

		const buffer = await getAudioBuffer(src);

		if (gen !== this.gen) return;
		this.loading = false;

		if (!buffer) {
			this.stop();
			return;
		}

		this.loopBuffer = buffer;
		this.clampLoopWindow(start, length);
		this.position = this.loopStart;
		this.startLoopNode(this.loopStart);
	}

	/** Live-update the loop window (drags, nudges) -- works mid-play. */
	updateLoop(start: number, length: number) {
		if (this.mode !== 'loop' || !this.loopBuffer) return;

		this.clampLoopWindow(start, length);

		if (this.loopNode) {
			this.loopNode.loopStart = this.loopStart;
			this.loopNode.loopEnd = this.loopStart + this.loopLen;
		}
	}

	private clampLoopWindow(start: number, length: number) {
		const dur = this.loopBuffer?.duration ?? Infinity;
		this.loopStart = Math.max(0, Math.min(start, Math.max(0, dur - MIN_LOOP)));
		this.loopLen = Math.max(MIN_LOOP, Math.min(length, dur - this.loopStart));
	}

	private startLoopNode(offset: number) {
		const ctx = this.ensureCtx();
		if (!ctx || !this.loopBuffer) return;

		const node = ctx.createBufferSource();
		node.buffer = this.loopBuffer;
		node.loop = true;
		node.loopStart = this.loopStart;
		node.loopEnd = this.loopStart + this.loopLen;
		node.connect(ctx.destination);
		node.start(0, offset);

		this.loopNode = node;
		this.playing = true;
		this.tickLoop(ctx);
	}

	private tickLoop(ctx: AudioContext) {
		const gen = this.gen;
		let last = ctx.currentTime;

		const step = () => {
			if (gen !== this.gen || !this.playing) return;

			const now = ctx.currentTime;
			let pos = this.position + (now - last);
			last = now;

			// Mirror the source's wrap behavior for the display playhead.
			const end = this.loopStart + this.loopLen;
			if (pos >= end) {
				pos = this.loopStart + ((pos - this.loopStart) % this.loopLen);
			}

			this.position = pos;
			this.raf = requestAnimationFrame(step);
		};

		this.raf = requestAnimationFrame(step);
	}

	// ----------------------------------------------------------------- mix

	async playMix(slices: MixSlice[], from = 0) {
		const gen = ++this.gen;
		this.silence();

		this.mode = 'mix';
		this.loopSrc = '';
		this.loading = true;

		const srcs = [...new Set(slices.map((s) => s.audioFile).filter(Boolean))];
		const decoded = await Promise.all(srcs.map((src) => getAudioBuffer(src)));

		if (gen !== this.gen) return;
		this.loading = false;

		this.buffers.clear();
		const durations = new Map<string, number>();
		srcs.forEach((src, i) => {
			const buf = decoded[i];
			if (buf) {
				this.buffers.set(src, buf);
				durations.set(src, buf.duration);
			}
		});

		const { segments, total } = buildSegments(slices, durations);
		if (!segments.length) {
			this.stop();
			return;
		}

		this.segments = segments;
		this.totalDuration = total;
		this.scheduleFrom(Math.max(0, Math.min(from, total)));
	}

	private startMixNode(
		ctx: AudioContext,
		when: number,
		src: string,
		offset: number,
		duration: number
	) {
		const buffer = this.buffers.get(src);
		if (!buffer) return;

		const node = ctx.createBufferSource();
		node.buffer = buffer;
		node.connect(ctx.destination);
		node.start(when, offset, duration);

		// Looping schedules passes forever; finished nodes must not pile up.
		node.onended = () => {
			const i = this.mixNodes.indexOf(node);
			if (i >= 0) this.mixNodes.splice(i, 1);
			node.disconnect();
		};

		this.mixNodes.push(node);
	}

	/** Queue one more full pass of the mix right behind whatever's scheduled. */
	private schedulePass(ctx: AudioContext) {
		for (const seg of this.segments) {
			this.startMixNode(
				ctx,
				this.t0 + this.scheduledV + seg.when,
				seg.src,
				seg.offset,
				seg.duration
			);
		}
		this.scheduledV += this.totalDuration;
	}

	/**
	 * Keep a generous window of passes queued ahead of the audio clock. Driven
	 * by both the rAF tick and a 1s interval: rAF freezes in hidden tabs, and
	 * background playback (the whole point of looping forever) must not starve.
	 */
	private topUp(ctx: AudioContext) {
		if (!this.playing || !this.loopMix || this.totalDuration <= 0) return;

		const elapsed = ctx.currentTime - this.t0;

		// Safety net for deep throttling: skip wholly-elapsed passes instead of
		// start()ing them in the past, which would stack every missed pass into
		// one simultaneous burst.
		if (this.scheduledV < elapsed) {
			const missed = Math.ceil((elapsed - this.scheduledV) / this.totalDuration);
			this.scheduledV += missed * this.totalDuration;
		}

		const lookahead = Math.max(this.totalDuration, 30);
		while (this.scheduledV - elapsed < lookahead) {
			this.schedulePass(ctx);
		}
	}

	private scheduleFrom(pos: number) {
		const ctx = this.ensureCtx();
		if (!ctx) return;

		// A hair of headroom so the first segment isn't scheduled in the past.
		const t0 = ctx.currentTime + 0.06;
		this.t0 = t0;

		for (const seg of this.segments) {
			if (seg.when + seg.duration <= pos) continue;

			const skip = Math.max(0, pos - seg.when);
			this.startMixNode(
				ctx,
				t0 + Math.max(0, seg.when - pos),
				seg.src,
				seg.offset + skip,
				seg.duration - skip
			);
		}

		this.scheduledV = this.totalDuration - pos;
		this.startedAt = pos;
		this.position = pos;
		this.playing = true;

		if (this.loopMix) {
			this.topUp(ctx);
			this.schedTimer = window.setInterval(() => this.topUp(ctx), 1000);
		}

		this.tickMix(ctx);
	}

	private tickMix(ctx: AudioContext) {
		const gen = this.gen;

		const step = () => {
			if (gen !== this.gen || !this.playing) return;

			const elapsed = ctx.currentTime - this.t0;
			const pos = this.startedAt + elapsed;

			if (this.loopMix) {
				this.topUp(ctx);
				this.position = Math.max(0, pos % this.totalDuration);
			} else if (pos >= this.totalDuration) {
				// Ran off the end: park at zero, ready to go again.
				this.silence();
				this.position = 0;
				return;
			} else {
				this.position = Math.max(0, pos);
			}

			this.raf = requestAnimationFrame(step);
		};

		this.raf = requestAnimationFrame(step);
	}

	/** Flip whole-mix looping; a playing mix is re-scheduled in place. */
	toggleLoopMix() {
		this.loopMix = !this.loopMix;

		if (this.mode === 'mix' && this.playing) {
			const pos = this.position;
			this.gen++;
			this.silence();
			this.scheduleFrom(pos);
		}
	}

	seekMix(to: number) {
		if (this.mode !== 'mix') return;

		to = Math.max(0, Math.min(to, this.totalDuration));

		if (this.playing) {
			this.gen++;
			this.silence();
			this.scheduleFrom(to);
		} else {
			this.position = to;
		}
	}

	// ------------------------------------------------------------- shared

	pause() {
		if (!this.playing) return;

		const ctx = getCtx();

		if (this.mode === 'mix' && ctx) {
			// Freeze the playhead off the audio clock before killing the nodes.
			const pos = this.startedAt + (ctx.currentTime - this.t0);
			this.position =
				this.loopMix && this.totalDuration > 0
					? pos % this.totalDuration
					: Math.min(pos, this.totalDuration);
		}

		this.gen++;
		this.silence();
	}

	resume() {
		if (this.playing || this.loading) return;

		if (this.mode === 'loop' && this.loopBuffer) {
			const end = this.loopStart + this.loopLen;
			const offset =
				this.position >= this.loopStart && this.position < end ? this.position : this.loopStart;
			this.position = offset;
			this.startLoopNode(offset);
		} else if (this.mode === 'mix' && this.segments.length) {
			const from = this.position >= this.totalDuration ? 0 : this.position;
			this.scheduleFrom(from);
		}
	}

	togglePause() {
		if (this.playing) {
			this.pause();
		} else {
			this.resume();
		}
	}
}

export const decks = new Decks();
