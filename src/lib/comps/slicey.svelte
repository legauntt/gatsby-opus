<script lang="ts">
	import { onMount } from 'svelte';
	import { bucketize, getAudioBuffer } from '$lib/peaks';

	interface ISliceyProps {
		src: string;
		start: number;
		length: number;

		/** Playhead in absolute track seconds; null hides it. */
		pos?: number | null;

		/** Fired continuously while dragging handles / moving the slice. */
		onChange: (start: number, length: number) => void;
	}

	let props: ISliceyProps = $props();

	const MIN_LEN = 0.1;
	const HANDLE_PX = 9;

	const BAR = '#475569'; // slate-600
	const BAR_IN = '#a78bfa'; // violet-400
	const REGION = 'rgba(139, 92, 246, 0.16)';
	const HANDLE = '#facc15'; // yellow-400
	const PLAYHEAD = '#f8fafc';
	const TICK = '#94a3b8'; // slate-400

	let container: HTMLDivElement;
	let mainCanvas: HTMLCanvasElement | null = $state(null);
	let zoomCanvas: HTMLCanvasElement | null = $state(null);

	let buffer: AudioBuffer | null = $state(null);
	let failed = $state(false);
	let retryTick = $state(0);
	let widthPx = $state(0);
	let mainCursor = $state('crosshair');
	let zoomCursor = $state('crosshair');

	/** While dragging on the zoom strip its window is frozen, otherwise the
	 *  waveform would slide around under the pointer mid-drag. */
	let frozenWin: { s: number; e: number } | null = $state(null);

	const duration = $derived.by(() => buffer?.duration ?? NaN);
	const end = $derived(props.start + props.length);

	const zoomWin = $derived.by(() => {
		if (frozenWin) return frozenWin;
		if (isNaN(duration)) return { s: 0, e: 1 };

		const pad = Math.max(1, props.length * 0.75);
		return { s: Math.max(0, props.start - pad), e: Math.min(duration, end + pad) };
	});

	$effect(() => {
		const src = props.src;
		void retryTick;
		buffer = null;
		failed = false;
		if (!src) return;

		let cancelled = false;
		getAudioBuffer(src).then((b) => {
			if (cancelled) return;
			buffer = b;
			failed = !b;
		});

		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		const ro = new ResizeObserver(() => {
			widthPx = container.clientWidth;
		});
		ro.observe(container);
		widthPx = container.clientWidth;

		return () => ro.disconnect();
	});

	const buckets = $derived(Math.max(40, Math.floor(widthPx / 3)));

	const mainPeaks = $derived.by(() => {
		if (!buffer || !widthPx) return null;
		return bucketize(buffer, buckets);
	});

	/** Both views normalize against the full track's max so the zoom keeps
	 *  true relative loudness instead of blowing up quiet windows. */
	const peakMax = $derived(mainPeaks?.length ? Math.max(...mainPeaks) : 1);

	const zoomPeaks = $derived.by(() => {
		if (!buffer || !widthPx) return null;
		return bucketize(buffer, buckets, zoomWin.s, zoomWin.e);
	});

	// ------------------------------------------------------------- drawing

	const fmtTick = (t: number, dec: number) => {
		const m = Math.floor(t / 60);
		const s = t - m * 60;
		const ss = s.toFixed(dec);
		return `${m}:${Number(ss) < 10 ? '0' : ''}${ss}`;
	};

	const drawInto = (
		canvas: HTMLCanvasElement,
		peaks: number[],
		winS: number,
		winE: number,
		ticks: boolean
	) => {
		const W = canvas.clientWidth || widthPx;
		const H = canvas.clientHeight;
		const dpr = window.devicePixelRatio || 1;

		canvas.width = Math.max(1, Math.round(W * dpr));
		canvas.height = Math.max(1, Math.round(H * dpr));

		const ctx = canvas.getContext('2d');
		if (!ctx || winE <= winS) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);

		const span = winE - winS;
		const toX = (t: number) => ((t - winS) / span) * W;

		// Bars
		const n = peaks.length;
		const step = W / n;
		const max = peakMax || 1;

		for (let i = 0; i < n; i++) {
			const t = winS + ((i + 0.5) / n) * span;
			const h = Math.max(Math.min(peaks[i] / max, 1) * (H - 12), 3);
			ctx.fillStyle = t >= props.start && t <= end ? BAR_IN : BAR;
			ctx.fillRect(i * step, (H - h) / 2, Math.max(step - 1, 1), h);
		}

		// Time ruler (zoom strip only)
		if (ticks) {
			const pxPerSec = W / span;
			const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
			const tick = steps.find((s) => s * pxPerSec >= 70) ?? 60;
			const dec = tick < 1 ? 2 : 0;

			ctx.fillStyle = TICK;
			ctx.font = '10px sans-serif';
			ctx.textBaseline = 'bottom';

			for (let i = Math.ceil(winS / tick); i * tick <= winE; i++) {
				const t = i * tick;
				const x = toX(t);
				ctx.globalAlpha = 0.6;
				ctx.fillRect(x, H - 8, 1, 8);
				ctx.fillText(fmtTick(t, dec), x + 3, H - 1);
				ctx.globalAlpha = 1;
			}
		}

		// Slice region + handles
		const xs = toX(props.start);
		const xe = toX(end);

		if (xe >= 0 && xs <= W) {
			ctx.fillStyle = REGION;
			ctx.fillRect(xs, 0, xe - xs, H);

			ctx.fillStyle = HANDLE;
			for (const x of [xs, xe]) {
				ctx.fillRect(x - 1, 0, 2, H);
				ctx.beginPath();
				ctx.roundRect(x - 3.5, H / 2 - 11, 7, 22, 3);
				ctx.fill();
			}
		}

		// Playhead
		if (props.pos != null && props.pos >= winS && props.pos <= winE) {
			ctx.fillStyle = PLAYHEAD;
			ctx.fillRect(toX(props.pos) - 0.75, 0, 1.5, H);
		}
	};

	$effect(() => {
		if (mainCanvas && mainPeaks && !isNaN(duration)) {
			drawInto(mainCanvas, mainPeaks, 0, duration, false);
		}
	});

	$effect(() => {
		if (zoomCanvas && zoomPeaks && !isNaN(duration)) {
			drawInto(zoomCanvas, zoomPeaks, zoomWin.s, zoomWin.e, true);
		}
	});

	// ---------------------------------------------------------- interaction

	interface IDrag {
		kind: 'l' | 'r' | 'body' | 'select';
		pointerId: number;
		anchor: number;
		start0: number;
		len0: number;
		win: { s: number; e: number };
		moved: boolean;
	}

	let drag: IDrag | null = null;

	const r2 = (n: number) => Math.round(n * 100) / 100;
	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

	const timeAt = (e: PointerEvent, win: { s: number; e: number }) => {
		const el = e.currentTarget as HTMLElement;
		const { left, width } = el.getBoundingClientRect();
		const p = clamp((e.clientX - left) / width, 0, 1);
		return win.s + p * (win.e - win.s);
	};

	const hitTest = (e: PointerEvent, win: { s: number; e: number }): IDrag['kind'] => {
		const el = e.currentTarget as HTMLElement;
		const { left, width } = el.getBoundingClientRect();
		const x = e.clientX - left;
		const toX = (t: number) => ((t - win.s) / (win.e - win.s)) * width;

		const dl = Math.abs(x - toX(props.start));
		const dr = Math.abs(x - toX(end));

		if (Math.min(dl, dr) <= HANDLE_PX) return dl <= dr ? 'l' : 'r';
		if (x > toX(props.start) && x < toX(end)) return 'body';
		return 'select';
	};

	const cursorFor = (kind: IDrag['kind']) =>
		kind === 'body' ? 'grab' : kind === 'select' ? 'crosshair' : 'ew-resize';

	const mainWin = () => ({ s: 0, e: duration });

	const downOn = (zoomed: boolean) => (e: PointerEvent) => {
		// One drag at a time: a second finger must not hijack an in-flight
		// drag with the other canvas's time mapping.
		if (!buffer || drag) return;

		const win = zoomed ? { ...zoomWin } : mainWin();
		if (zoomed) frozenWin = win;

		drag = {
			kind: hitTest(e, win),
			pointerId: e.pointerId,
			anchor: timeAt(e, win),
			start0: props.start,
			len0: props.length,
			win,
			moved: false
		};

		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	};

	const moveOn = (zoomed: boolean) => (e: PointerEvent) => {
		if (!buffer || isNaN(duration)) return;

		if (!drag) {
			const kind = hitTest(e, zoomed ? zoomWin : mainWin());
			if (zoomed) {
				zoomCursor = cursorFor(kind);
			} else {
				mainCursor = cursorFor(kind);
			}
			return;
		}

		if (e.pointerId !== drag.pointerId) return;

		const t = timeAt(e, drag.win);
		const pxPerSec = widthPx / (drag.win.e - drag.win.s);
		if (Math.abs(t - drag.anchor) * pxPerSec > 3) {
			drag.moved = true;
		}

		const end0 = drag.start0 + drag.len0;

		if (drag.kind === 'l') {
			const ns = clamp(r2(t), 0, r2(end0 - MIN_LEN));
			props.onChange(ns, r2(end0 - ns));
		} else if (drag.kind === 'r') {
			const ne = clamp(r2(t), r2(drag.start0 + MIN_LEN), duration);
			props.onChange(drag.start0, r2(ne - drag.start0));
		} else if (drag.kind === 'body') {
			const ns = clamp(
				r2(t - (drag.anchor - drag.start0)),
				0,
				Math.max(0, r2(duration - drag.len0))
			);
			props.onChange(ns, drag.len0);
		} else if (drag.moved) {
			// Drag on empty space: rubber-band a fresh slice.
			const a = Math.min(drag.anchor, t);
			const b = Math.max(drag.anchor, t);
			const ns = clamp(r2(a), 0, Math.max(0, r2(duration - MIN_LEN)));
			props.onChange(ns, clamp(r2(b - ns), MIN_LEN, r2(duration - ns)));
		}
	};

	const upOn = () => (e: PointerEvent) => {
		if (drag && e.pointerId !== drag.pointerId) return;

		if (drag && drag.kind === 'select' && !drag.moved) {
			// Plain click: park the slice there, keep its length.
			const t = timeAt(e, drag.win);
			const ns = clamp(r2(t), 0, Math.max(0, r2(duration - drag.len0)));
			props.onChange(ns, drag.len0);
		}

		drag = null;
		frozenWin = null;
	};
</script>

<div bind:this={container}>
	{#if buffer}
		<div class="relative rounded-2xl bg-slate-800 px-2 py-1">
			<span
				class="pointer-events-none absolute top-1.5 left-3 z-10 rounded bg-slate-900/80 px-1.5 text-[10px] tracking-[0.2em] text-slate-400"
			>
				FULL TRACK
			</span>
			<canvas
				bind:this={mainCanvas}
				class="h-28 w-full touch-none"
				style="cursor: {mainCursor}"
				role="slider"
				aria-label="Slice region"
				aria-valuemin="0"
				aria-valuemax={duration}
				aria-valuenow={props.start}
				tabindex="0"
				onpointerdown={downOn(false)}
				onpointermove={moveOn(false)}
				onpointerup={upOn()}
				onpointercancel={upOn()}
			></canvas>
		</div>

		<div class="relative mt-2 rounded-2xl bg-slate-800 px-2 py-1">
			<span
				class="pointer-events-none absolute top-1.5 left-3 z-10 rounded bg-slate-900/80 px-1.5 text-[10px] tracking-[0.2em] text-slate-400"
			>
				CLOSE-UP
			</span>
			<canvas
				bind:this={zoomCanvas}
				class="h-24 w-full touch-none"
				style="cursor: {zoomCursor}"
				role="slider"
				aria-label="Slice region, zoomed"
				aria-valuemin="0"
				aria-valuemax={duration}
				aria-valuenow={props.start}
				tabindex="0"
				onpointerdown={downOn(true)}
				onpointermove={moveOn(true)}
				onpointerup={upOn()}
				onpointercancel={upOn()}
			></canvas>
			<div class="flex justify-between px-1 pb-1 text-xs text-slate-500">
				<span>{fmtTick(zoomWin.s, 1)}</span>
				<span>same slice, zoomed in &mdash; fine-tune the edges here</span>
				<span>{fmtTick(zoomWin.e, 1)}</span>
			</div>
		</div>
	{:else if failed}
		<div
			class="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-800 text-slate-400"
		>
			<span>Couldn't load dat track. Damn shame.</span>
			<button
				class="rounded-full border border-solid border-slate-500 px-3 py-1 text-sm hover:border-slate-300"
				onclick={() => retryTick++}
			>
				Retry
			</button>
		</div>
	{:else if props.src}
		<div class="h-28 animate-pulse rounded-2xl bg-slate-800"></div>
		<div class="mt-2 flex h-24 items-center justify-center rounded-2xl bg-slate-800 text-slate-500">
			Decoding da waveform...
		</div>
	{/if}
</div>
