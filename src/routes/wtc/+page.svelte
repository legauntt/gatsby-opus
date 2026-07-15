<script lang="ts">
	import { PUBLIC_BACKEND_BASE_URL } from '$env/static/public';
	import { pushState } from '$app/navigation';
	import axios from 'axios';
	import { page } from '$app/state';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { nanoid } from 'nanoid';
	import { TREASURE_TROVE } from '$lib/cetlist';
	import Slicey from '$lib/comps/slicey.svelte';
	import { decks, type MixSlice } from '$lib/decks.svelte';
	import { getAudioBuffer } from '$lib/peaks';
	import { jukebawx } from '$lib/player.svelte';
	import { copyToClippy, formatTime, formatTrack } from '$lib/utilz';
	import { renderMixToWav, downloadBlob } from '$lib/wavout';
	import toast from 'svelte-5-french-toast';

	const DEF_LOOP_LEN = 5;
	const MIN_LEN = 0.1;
	const STASH_KEY = 'tct_wtc_wip';

	const allTracks = TREASURE_TROVE.DEMON.concat(
		TREASURE_TROVE.BONUS,
		TREASURE_TROVE.SEVEN,
		TREASURE_TROVE.CLICES
	);

	allTracks.sort((a, b) => {
		return a.localeCompare(b);
	});

	const blankSlice = (): MixSlice => ({
		id: nanoid(8),
		audioFile: '',
		start: 0,
		length: DEF_LOOP_LEN,
		loops: 1
	});

	/** Live view of the ?s= share param -- tracks shallow pushState AND browser back/forward. */
	const shareName = $derived(page.url.searchParams.get('s') || '');

	let saving = $state(false);
	let loading = $state(false);
	let exporting = $state(false);

	/** Bumped by New so a still-in-flight share-link GET can't hydrate over a fresh session. */
	let loadGen = 0;

	let title = $state('');
	let scratch: MixSlice = $state(blankSlice());
	let mix: MixSlice[] = $state([]);
	let editingId: string | null = $state(null);
	let trackDur = $state(NaN);

	/** Whatever's on the editor right now: a mix step being tweaked, or the scratch slice. */
	const active = $derived(mix.find((s) => s.id === editingId) ?? scratch);
	const editingIndex = $derived(mix.findIndex((s) => s.id === editingId));

	const r2 = (n: number) => Math.round(n * 100) / 100;
	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

	const num = (v: unknown, fallback: number) =>
		typeof v === 'number' && isFinite(v) ? v : fallback;

	// 99 is plenty of "one more time!" -- unbounded loop counts flatten into
	// one scheduled source per repetition and would eat the tab.
	const MAX_LOOPS = 99;
	const clampLoops = (v: unknown) => Math.min(MAX_LOOPS, Math.max(1, Math.floor(num(v, 1))));

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const cleanSlice = (s: any): MixSlice | null => {
		if (!s || typeof s.audioFile !== 'string' || !s.audioFile) return null;

		return {
			id: typeof s.id === 'string' && s.id ? s.id : nanoid(8),
			audioFile: s.audioFile,
			start: Math.max(0, num(s.start, 0)),
			length: Math.max(MIN_LEN, num(s.length, DEF_LOOP_LEN)),
			loops: clampLoops(s.loops)
		};
	};

	// ------------------------------------------------------------ lifecycle

	onMount(async () => {
		window.addEventListener('keydown', onKeyDown);

		if (!shareName) {
			unstash();
			return;
		}

		const gen = ++loadGen;
		try {
			loading = true;
			const response = await axios.get(`${PUBLIC_BACKEND_BASE_URL}/gatsby/glawskis/${shareName}`);
			if (gen === loadGen) {
				hydrate(response.data.glawski);
			}
		} catch (e) {
			if (gen === loadGen) {
				toast.error('Failed to load dat sucka');
			}
			console.error(`Failed to load glawski`, e);
		} finally {
			if (gen === loadGen) {
				loading = false;
			}
		}
	});

	onDestroy(() => {
		decks.stop();
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', onKeyDown);
		}
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const hydrate = (g: any) => {
		if (!g) return;

		title = g.title ?? '';
		scratch = {
			id: nanoid(8),
			audioFile: typeof g.audioFile === 'string' ? g.audioFile : '',
			start: Math.max(0, num(g.start, 0)),
			length: Math.max(MIN_LEN, num(g.loopLength, DEF_LOOP_LEN)),
			loops: clampLoops(g.loops)
		};
		mix = Array.isArray(g.slices)
			? g.slices.map(cleanSlice).filter((s: MixSlice | null): s is MixSlice => !!s)
			: [];
		editingId = null;
	};

	// Work-in-progress stash so a stray refresh doesn't eat da mix. Shared
	// links are the backend's job, so don't clobber the stash with those.
	$effect(() => {
		const body = JSON.stringify({ title, scratch, mix });
		if (loading || shareName || typeof localStorage === 'undefined') return;

		// A completely blank editor must not clobber a stash from an earlier
		// session (e.g. right after New when coming off a share link).
		if (!title && !scratch.audioFile && !mix.length) return;

		try {
			localStorage.setItem(STASH_KEY, body);
		} catch {
			// storage full / blocked -- not worth yelling about
		}
	});

	const unstash = () => {
		if (typeof localStorage === 'undefined') return;

		try {
			const raw = localStorage.getItem(STASH_KEY);
			if (!raw) return;

			const wip = JSON.parse(raw);
			const slices = Array.isArray(wip?.mix)
				? wip.mix.map(cleanSlice).filter((s: MixSlice | null): s is MixSlice => !!s)
				: [];

			if (!slices.length && !wip?.scratch?.audioFile && !wip?.title) return;

			title = typeof wip.title === 'string' ? wip.title : '';
			scratch = cleanSlice(wip.scratch) ?? blankSlice();
			mix = slices;
		} catch (e) {
			console.error('Failed to restore da WIP', e);
		}
	};

	// -------------------------------------------------------------- effects

	// Truce: da decks and da jukebawx yelling over each other helps nobody
	$effect(() => {
		if (decks.playing) {
			jukebawx.paused = true;
		}
	});

	// Track duration for clamping (from the decoded buffer)
	$effect(() => {
		const src = active.audioFile;
		trackDur = NaN;
		if (!src) return;

		let cancelled = false;
		getAudioBuffer(src).then((b) => {
			if (!cancelled && b) trackDur = b.duration;
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (isNaN(trackDur)) return;
		untrack(() => {
			capActive();
			capMixSlices(active.audioFile, trackDur);
		});
	});

	// Loop preview follows edits live (drags, nudges, typed values).
	// decks.playing is read on purpose: it flips when the decode finishes, so
	// nudges made while the track was still loading get re-applied.
	$effect(() => {
		void decks.playing;
		if (decks.mode === 'loop' && decks.loopSrc === active.audioFile) {
			decks.updateLoop(active.start, active.length);
		}
	});

	// Editor moved to a different track: a stale loop preview makes no sense
	$effect(() => {
		if (decks.mode === 'loop' && decks.loopSrc && decks.loopSrc !== active.audioFile) {
			decks.stop();
		}
	});

	// Mix edits invalidate a playing/paused mix schedule: stop instead of lying
	$effect(() => {
		JSON.stringify(mix);
		if (untrack(() => decks.mode) === 'mix') {
			decks.stop();
		}
	});

	// ------------------------------------------------------------ da editor

	const capActive = () => {
		if (isNaN(trackDur)) return;

		active.start = clamp(r2(active.start), 0, Math.max(0, r2(trackDur - MIN_LEN)));
		if (active.start + active.length > trackDur) {
			active.length = Math.max(MIN_LEN, r2(trackDur - active.start));
		}
	};

	/** Once a track's real duration is known, rein in every mix step on it
	 *  (oversized steps otherwise make the timeline lie about what plays).
	 *  Writes are guarded so an already-sane mix isn't touched. */
	const capMixSlices = (src: string, dur: number) => {
		if (!src || isNaN(dur)) return;

		for (const s of mix) {
			if (s.audioFile !== src) continue;

			const start = clamp(r2(s.start), 0, Math.max(0, r2(dur - MIN_LEN)));
			const length = Math.max(MIN_LEN, Math.min(s.length, r2(dur - start)));
			if (start !== s.start) s.start = start;
			if (length !== s.length) s.length = length;
		}
	};

	const isLoopingActive = $derived(decks.mode === 'loop' && decks.loopSrc === active.audioFile);
	const sliceyPos = $derived(isLoopingActive ? decks.position : null);

	const toggleLoopPlay = () => {
		if (!active.audioFile) return;

		if (isLoopingActive) {
			decks.togglePause();
		} else {
			decks.playLoop(active.audioFile, active.start, active.length);
		}
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (!active.audioFile) return;

		// Don't hijack keys while typing in the title / value fields.
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

		if (e.code === 'Space') {
			e.preventDefault();
			if (decks.mode === 'mix') {
				decks.togglePause();
			} else {
				toggleLoopPlay();
			}
			return;
		}

		// Nudge keys: arrows move the slice start, shift+arrows grow/shrink
		// the length. Alt makes either one 10x finer.
		if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
			e.preventDefault();
			const size = e.altKey ? 0.01 : 0.1;
			const step = e.code === 'ArrowRight' ? size : -size;

			if (e.shiftKey) {
				active.length = r2(Math.max(active.length + step, MIN_LEN));
			} else {
				// Clamp so the whole slice stays on the track: nudging into the
				// end must not silently eat the length.
				const maxStart = isNaN(trackDur) ? Infinity : Math.max(0, trackDur - active.length);
				active.start = r2(clamp(active.start + step, 0, maxStart));
			}

			capActive();
		}
	};

	const onTrackChange = (e: Event) => {
		active.audioFile = (e.currentTarget as HTMLSelectElement).value;
		active.start = 0;
		active.length = DEF_LOOP_LEN;
	};

	const onSliceyChange = (start: number, length: number) => {
		active.start = start;
		active.length = length;
	};

	const updateStartValue = (e: Event) => {
		const value = Number((e.currentTarget as HTMLInputElement).value);
		if (isNaN(value) || value < 0) return;

		active.start = r2(value);
		capActive();
	};

	const updateLoopLength = (e: Event) => {
		const value = Number((e.currentTarget as HTMLInputElement).value);
		if (isNaN(value) || value <= 0) return;

		active.length = Math.max(MIN_LEN, r2(value));
		capActive();
	};

	const updateLoops = (e: Event) => {
		const value = Number((e.currentTarget as HTMLInputElement).value);
		if (isNaN(value)) return;

		active.loops = clampLoops(value);
	};

	// --------------------------------------------------------------- da mix

	const stepSpans = $derived.by(() => {
		let acc = 0;
		return mix.map((s) => {
			const len = Math.max(0, s.length) * clampLoops(s.loops);
			const span = { begin: acc, len };
			acc += len;
			return span;
		});
	});

	const mixTotal = $derived(
		stepSpans.length
			? stepSpans[stepSpans.length - 1].begin + stepSpans[stepSpans.length - 1].len
			: 0
	);

	const currentStep = $derived.by(() => {
		if (decks.mode !== 'mix' || !stepSpans.length) return -1;
		for (let i = stepSpans.length - 1; i >= 0; i--) {
			if (decks.position >= stepSpans[i].begin) return i;
		}
		return 0;
	});

	const addToMix = () => {
		if (!active.audioFile) return;

		const copy = { ...$state.snapshot(active), id: nanoid(8) };
		if (!isNaN(trackDur)) {
			copy.start = clamp(r2(copy.start), 0, Math.max(0, r2(trackDur - MIN_LEN)));
			copy.length = Math.max(MIN_LEN, Math.min(copy.length, r2(trackDur - copy.start)));
		}

		mix.push(copy);
		toast.success('Iss in da mix');
	};

	const editStep = (id: string) => {
		editingId = editingId === id ? null : id;
	};

	const removeStep = (id: string) => {
		const i = mix.findIndex((s) => s.id === id);
		if (i < 0) return;

		mix.splice(i, 1);
		if (editingId === id) editingId = null;
	};

	const dupStep = (id: string) => {
		const i = mix.findIndex((s) => s.id === id);
		if (i < 0) return;

		mix.splice(i + 1, 0, { ...$state.snapshot(mix[i]), id: nanoid(8) });
	};

	const moveStep = (id: string, dir: -1 | 1) => {
		const i = mix.findIndex((s) => s.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= mix.length) return;

		const tmp = $state.snapshot(mix[i]);
		mix[i] = $state.snapshot(mix[j]);
		mix[j] = tmp;
	};

	const bumpLoops = (id: string, d: number) => {
		const s = mix.find((x) => x.id === id);
		if (!s) return;

		s.loops = clampLoops(s.loops + d);
	};

	const playMixFrom = (stepIndex: number) => {
		if (!mix.length) return;

		const from = stepSpans[stepIndex]?.begin ?? 0;
		decks.playMix($state.snapshot(mix) as MixSlice[], from);
	};

	const toggleMixPlay = () => {
		if (decks.mode === 'mix') {
			decks.togglePause();
		} else {
			playMixFrom(0);
		}
	};

	const seekBar = (e: MouseEvent) => {
		const el = e.currentTarget as HTMLElement;
		const { left, width } = el.getBoundingClientRect();
		const p = clamp((e.clientX - left) / width, 0, 1);

		if (decks.mode === 'mix') {
			decks.seekMix(p * decks.totalDuration);
		} else if (mix.length) {
			decks.playMix($state.snapshot(mix) as MixSlice[], p * mixTotal);
		}
	};

	const exportWav = async () => {
		if (!mix.length || exporting) return;

		exporting = true;
		try {
			const blob = await renderMixToWav($state.snapshot(mix) as MixSlice[]);
			if (!blob) {
				toast.error('Nuttin to export');
				return;
			}

			const name = (title.trim() || 'da_mix').replace(/[^\w-]+/g, '_');
			downloadBlob(blob, `${name}.wav`);
			toast.success('Bounced dat sucka');
		} catch (e) {
			toast.error('Damn shame');
			console.error(`Failed to export da mix`, e);
		} finally {
			exporting = false;
		}
	};

	// ----------------------------------------------------------- new / save

	const newGlawski = () => {
		const wasPlainSession = !shareName;

		// A late share-link GET must not hydrate over the fresh session.
		loadGen++;
		loading = false;

		decks.stop();

		title = '';
		scratch = blankSlice();
		mix = [];
		editingId = null;

		// New on your own WIP means "clear it". Coming off a share link it
		// doesn't -- the stash belongs to an earlier session that was never
		// even on screen.
		if (wasPlainSession) {
			try {
				localStorage.removeItem(STASH_KEY);
			} catch {
				// nothing stashed, nothing lost
			}
		}

		if (page.url.searchParams.get('s')) {
			const url = new URL(page.url);
			url.searchParams.delete('s');
			pushState(url, {});
		}
	};

	const saveGlawski = async () => {
		if (saving || loading) return;

		const wasPlainSession = !shareName;

		saving = true;
		try {
			const glawski = {
				// The classic single-slice fields, so old share links and old
				// clients keep working exactly as before...
				start: active.start,
				loopLength: active.length,
				// NaN would serialize to null and trip up the old client's
				// isNaN guard; undefined just drops the key.
				duration: isNaN(trackDur) ? undefined : trackDur,
				title,
				audioFile: active.audioFile,
				paused: true,
				currentTime: active.start,
				// ...and da new stuff.
				loops: active.loops,
				slices: $state.snapshot(mix)
			};

			const response = await axios.post(`${PUBLIC_BACKEND_BASE_URL}/gatsby/glawskis`, {
				glawski
			});

			toast.success('Saved (dat sucka)');

			const savedName = response.data.glawski?.shareName;
			if (!savedName) {
				toast.error(`Unexpected response from backend`);
				return;
			}

			// This session's WIP is durably saved now -- a stale stash would
			// only zombie it back later. (Off a share link the stash is someone
			// else's earlier session; leave it alone.)
			if (wasPlainSession) {
				try {
					localStorage.removeItem(STASH_KEY);
				} catch {
					// nothing stashed, nothing lost
				}
			}

			const url = new URL(page.url);
			url.searchParams.set('s', savedName);
			pushState(url, {});

			const clipped = await copyToClippy(url.href);
			if (clipped) {
				toast.success(`Copied URL to Clipboard`);
			} else {
				toast.error(`Failed to copy URL to clipboard`);
			}
		} catch (e) {
			toast.error('Damn shame');
			console.error(`Failed to save glawski`, e);
		} finally {
			saving = false;
		}
	};
</script>

{#snippet icon(d: string, cls: string = 'size-5')}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class={cls}
	>
		<path stroke-linecap="round" stroke-linejoin="round" {d} />
	</svg>
{/snippet}

<svelte:head>
	<title>What The C?</title>
	<meta name="description" content="Yehhh fotabip fotaboop" />
</svelte:head>

<div class="p-5">
	<div class="text-3xl">What The C?...</div>

	{#if loading}
		<div class="text-2xl text-slate-500">Loading...</div>
	{/if}

	{#if saving}
		<div class="text-3xl text-slate-500">Saving...</div>
	{/if}

	<div class="mt-5">
		<div class="xl:inline-block">
			<select
				class="border border-solid border-slate-500 bg-black p-2 align-middle"
				value={active.audioFile}
				onchange={onTrackChange}
			>
				<option value="" disabled>Pick a trizzack...</option>
				{#each allTracks as track (track)}
					<option value={track}>{formatTrack(track)}</option>
				{/each}
			</select>
		</div>

		<div class="xl:inline-block">
			<input
				type="text"
				class="border border-solid border-slate-500 p-2 align-middle xl:ml-3 xl:min-w-128"
				bind:value={title}
				placeholder="Yeh I remembaw..."
			/>

			<button aria-label="New" class="mr-3 ml-3 align-middle text-green-600" onclick={newGlawski}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-6"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
					/>
				</svg>
			</button>

			<button
				aria-label="Save"
				class="align-middle text-blue-400 disabled:text-slate-500"
				disabled={saving || loading}
				onclick={saveGlawski}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-8"
				>
					<path
						fill-rule="evenodd"
						d="M6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Zm1.5 1.5a.75.75 0 0 0-.75.75V16.5a.75.75 0 0 0 1.085.67L12 15.089l4.165 2.083a.75.75 0 0 0 1.085-.671V5.25a.75.75 0 0 0-.75-.75h-9Z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		</div>

		{#if active.audioFile}
			<div class="mt-5 rounded-xl border border-solid border-slate-700 p-4">
				<div class="mb-3 flex items-center gap-3">
					<div class="text-xl">Da Slice</div>

					{#if editingIndex >= 0}
						<span class="rounded-full bg-yellow-500/20 px-3 py-0.5 text-sm text-yellow-400">
							editing step {editingIndex + 1}
						</span>
						<button
							class="rounded-full bg-yellow-500 px-3 py-0.5 text-sm font-bold text-black hover:bg-yellow-400"
							onclick={() => (editingId = null)}
						>
							Done
						</button>
					{/if}
				</div>

				<Slicey
					src={active.audioFile}
					start={active.start}
					length={active.length}
					pos={sliceyPos}
					onChange={onSliceyChange}
				/>

				<div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
					<button
						aria-label={isLoopingActive && decks.playing ? 'Pause loop' : 'Play loop'}
						class="disabled:text-slate-600"
						disabled={decks.loading && isLoopingActive}
						onclick={toggleLoopPlay}
					>
						{#if isLoopingActive && decks.playing}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								class="size-10"
							>
								<path
									fill-rule="evenodd"
									d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z"
									clip-rule="evenodd"
								/>
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-10"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
								/>
							</svg>
						{/if}
					</button>

					<label>
						<span class="mr-1 text-slate-400">Start</span>
						<input
							type="text"
							class="w-24 border border-solid border-slate-500 p-2"
							value={active.start}
							onchange={updateStartValue}
						/>
					</label>

					<label>
						<span class="mr-1 text-slate-400">Length</span>
						<input
							type="text"
							class="w-24 border border-solid border-slate-500 p-2"
							value={active.length}
							onchange={updateLoopLength}
						/>
					</label>

					<label>
						<span class="mr-1 text-slate-400">Loops</span>
						<input
							type="number"
							min="1"
							step="1"
							class="w-20 border border-solid border-slate-500 p-2"
							value={active.loops}
							onchange={updateLoops}
						/>
					</label>

					{#if editingIndex < 0}
						<button
							class="rounded-full bg-violet-600 px-4 py-1.5 font-bold hover:bg-violet-500"
							onclick={addToMix}
						>
							+ Add to da mix
						</button>
					{/if}
				</div>

				<div class="mt-3 text-xs text-slate-500">
					drag da edges to resize &middot; drag da middle to move &middot; drag empty space to carve
					a new slice &middot; space = play &middot; &larr;&rarr; nudge start &middot;
					shift+&larr;&rarr; length &middot; alt = fine
				</div>
			</div>
		{/if}

		<div class="mt-8 rounded-xl border border-solid border-slate-700 p-4">
			<div class="flex items-center gap-3">
				<div class="text-xl">Da Mix</div>
				{#if mix.length}
					<span class="text-sm text-slate-400">
						{mix.length} step{mix.length === 1 ? '' : 's'} &middot; {formatTime(mixTotal)}
					</span>
				{/if}
			</div>

			{#if mix.length}
				<div class="mt-3 flex flex-wrap items-center gap-4">
					<button
						aria-label={decks.mode === 'mix' && decks.playing ? 'Pause mix' : 'Play mix'}
						class="disabled:text-slate-600"
						disabled={decks.loading && decks.mode === 'mix'}
						onclick={toggleMixPlay}
					>
						{#if decks.mode === 'mix' && decks.playing}
							{@render icon('M15.75 5.25v13.5m-7.5-13.5v13.5', 'size-9')}
						{:else}
							{@render icon(
								'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z',
								'size-9'
							)}
						{/if}
					</button>

					<button
						aria-label="Stop"
						class="text-slate-300 hover:text-white disabled:text-slate-600"
						disabled={decks.mode !== 'mix'}
						onclick={() => decks.stop()}
					>
						{@render icon(
							'M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z',
							'size-7'
						)}
					</button>

					<span class="tabular-nums">
						{formatTime(decks.mode === 'mix' ? decks.position : 0)} / {formatTime(mixTotal)}
					</span>

					<button
						class="ml-auto inline-flex items-center gap-2 rounded-full border border-solid border-slate-500 px-4 py-1.5 hover:border-slate-300 disabled:opacity-50"
						disabled={exporting}
						onclick={exportWav}
					>
						{@render icon(
							'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3'
						)}
						{exporting ? 'Bouncing...' : 'Export WAV'}
					</button>
				</div>

				<button
					class="relative mt-3 block h-4 w-full cursor-pointer overflow-hidden rounded bg-slate-800"
					aria-label="Mix position"
					onclick={seekBar}
				>
					<span class="flex h-full">
						{#each mix as s, i (s.id)}
							<span
								class="h-full border-r border-solid border-slate-900 {i === currentStep
									? 'bg-violet-500'
									: i % 2
										? 'bg-slate-600'
										: 'bg-slate-500'}"
								style="width: {mixTotal ? ((stepSpans[i]?.len ?? 0) / mixTotal) * 100 : 0}%"
								title={formatTrack(s.audioFile)}
							></span>
						{/each}
					</span>
					{#if decks.mode === 'mix' && decks.totalDuration}
						<span
							class="absolute top-0 h-full w-0.5 bg-white"
							style="left: {(decks.position / decks.totalDuration) * 100}%"
						></span>
					{/if}
				</button>

				<div class="mt-3 divide-y divide-slate-800 border-t border-b border-slate-800">
					{#each mix as s, i (s.id)}
						<div
							class="flex flex-wrap items-center gap-2 px-2 py-2 {i === currentStep
								? 'bg-slate-800/60'
								: ''} {editingId === s.id ? 'ring-1 ring-yellow-500' : ''}"
						>
							<span class="w-6 text-right text-slate-500 tabular-nums">{i + 1}</span>

							<button
								aria-label="Play from this step"
								title="Play from here"
								class="text-slate-300 hover:text-white"
								onclick={() => playMixFrom(i)}
							>
								{@render icon(
									'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z'
								)}
							</button>

							<div class="min-w-0 grow">
								<div class="truncate">{formatTrack(s.audioFile)}</div>
								<div class="text-xs text-slate-400 tabular-nums">
									{s.start.toFixed(2)}s &rarr; {r2(s.start + s.length).toFixed(2)}s &middot; {s.length.toFixed(
										2
									)}s
								</div>
							</div>

							<div class="flex items-center gap-1">
								<button
									aria-label="Fewer loops"
									class="w-6 rounded bg-slate-800 text-center hover:bg-slate-700 disabled:opacity-40"
									disabled={s.loops <= 1}
									onclick={() => bumpLoops(s.id, -1)}
								>
									&minus;
								</button>
								<span class="w-9 text-center tabular-nums" title="Loops">&times;{s.loops}</span>
								<button
									aria-label="More loops"
									class="w-6 rounded bg-slate-800 text-center hover:bg-slate-700"
									onclick={() => bumpLoops(s.id, 1)}
								>
									+
								</button>
							</div>

							<span class="w-16 text-right text-sm text-slate-400 tabular-nums">
								{formatTime(s.length * s.loops)}
							</span>

							<div class="flex items-center gap-1 text-slate-400">
								<button
									aria-label="Edit slice"
									title="Edit dis slice"
									class="p-1 hover:text-yellow-400 {editingId === s.id ? 'text-yellow-400' : ''}"
									onclick={() => editStep(s.id)}
								>
									{@render icon(
										'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125',
										'size-4'
									)}
								</button>
								<button
									aria-label="Duplicate"
									title="Dupe it"
									class="p-1 hover:text-white"
									onclick={() => dupStep(s.id)}
								>
									{@render icon(
										'M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-8.25A2.25 2.25 0 0 1 7.5 18v-7.5a2.25 2.25 0 0 1 2.25-2.25h6.75Z',
										'size-4'
									)}
								</button>
								<button
									aria-label="Move up"
									title="Up"
									class="p-1 hover:text-white disabled:opacity-30"
									disabled={i === 0}
									onclick={() => moveStep(s.id, -1)}
								>
									{@render icon('M4.5 15.75l7.5-7.5 7.5 7.5', 'size-4')}
								</button>
								<button
									aria-label="Move down"
									title="Down"
									class="p-1 hover:text-white disabled:opacity-30"
									disabled={i === mix.length - 1}
									onclick={() => moveStep(s.id, 1)}
								>
									{@render icon('M19.5 8.25l-7.5 7.5-7.5-7.5', 'size-4')}
								</button>
								<button
									aria-label="Delete"
									title="Yeet"
									class="p-1 hover:text-red-400"
									onclick={() => removeStep(s.id)}
								>
									{@render icon(
										'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
										'size-4'
									)}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="mt-3 text-slate-500">
					Carve out a slice up top and smash "+ Add to da mix". Loop 'em, stack 'em, sequence 'em
					&mdash; then bounce da whole thing to a WAV.
				</div>
			{/if}
		</div>
	</div>

	<div class="mt-5">
		<div>
			<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
		</div>
	</div>
</div>

<style scoped></style>
