<script lang="ts">
	import { formatTime } from '$lib/utilz';
	import { getPeaks } from '$lib/peaks';

	interface IWaveyProps {
		currentTime: number;
		duration: number;
		paused: boolean;

		onSeek: (newTime: number) => void;
		onTogglePause: () => void;

		/** Audio file to render an actual waveform for. Optional: without it
		 *  (or before it decodes) we fall back to a plain progress bar. */
		src?: string;

		subslice?: {
			start: number;
			end: number;
		};
	}

	let props: IWaveyProps = $props();

	let previewSeekValue: string = $state('');
	let peaks: number[] | null = $state(null);

	$effect(() => {
		const src = props.src;
		peaks = null;
		if (!src) return;

		let cancelled = false;
		getPeaks(src).then((p) => {
			if (!cancelled) peaks = p;
		});

		return () => {
			cancelled = true;
		};
	});

	const clamp = (n: number) => Math.max(0, Math.min(1, n));

	let progress = $derived(props.duration ? clamp(props.currentTime / props.duration) : 0);

	let sliceStart = $derived(
		props.subslice && props.duration ? clamp(props.subslice.start / props.duration) : 0
	);
	let sliceEnd = $derived(
		props.subslice && props.duration ? clamp(props.subslice.end / props.duration) : 1
	);

	const barState = (i: number, total: number): 'played' | 'slice' | 'rest' => {
		const ratio = i / total;
		if (ratio <= progress) return 'played';
		if (props.subslice && ratio >= sliceStart && ratio <= sliceEnd) return 'slice';
		return 'rest';
	};

	const previewSeek = (e: MouseEvent) => {
		const div = e.currentTarget as HTMLElement;
		const { left, width } = div.getBoundingClientRect();

		let p = (e.clientX - left) / width;
		if (p < 0) p = 0;
		if (p > 1) p = 1;

		previewSeekValue = formatTime(p * props.duration);
	};

	const dragsYaDown = (e: PointerEvent) => {
		const div = e.currentTarget as HTMLElement;

		function seek(e: PointerEvent) {
			const { left, width } = div.getBoundingClientRect();

			let p = (e.clientX - left) / width;
			if (p < 0) p = 0;
			if (p > 1) p = 1;

			const newTime = p * props.duration;
			props.onSeek(newTime);
		}

		seek(e);

		window.addEventListener('pointermove', seek);

		window.addEventListener(
			'pointerup',
			() => {
				window.removeEventListener('pointermove', seek);
			},
			{
				once: true
			}
		);
	};
</script>

<div class="grow">
	<div class="flex items-center">
		<div class="mt-2 ml-1 w-38">
			<div class="inline-block align-top">
				{#if props.paused}
					<button aria-label="Play" onclick={() => props.onTogglePause()}>
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
					</button>
				{:else}
					<button aria-label="Pause" onclick={() => props.onTogglePause()}>
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
					</button>
				{/if}
			</div>

			<div class="mt-5 ml-3 inline-block align-top">
				{formatTime(props.currentTime)}
			</div>
		</div>

		<div class="w-full">
			{#if peaks}
				<!-- Real waveform: one bar per amplitude bucket -->
				<div
					class="flex cursor-pointer items-center gap-px rounded-2xl bg-slate-800 px-2"
					class:h-32={props.subslice}
					class:h-16={!props.subslice}
					onpointerdown={dragsYaDown}
					onmousemove={previewSeek}
					title={previewSeekValue}
					role="tooltip"
				>
					{#each peaks as peak, i (i)}
						{@const state = barState(i, peaks.length)}
						<div
							class="pointer-events-none flex-1 rounded-full"
							class:bg-violet-500={state === 'played'}
							class:bg-slate-400={state === 'slice'}
							class:bg-slate-600={state === 'rest'}
							style="height: {Math.max(peak * 100, 6)}%"
						></div>
					{/each}
				</div>
			{:else if props.subslice}
				<!-- Fallback (pre-decode): slice-aware plain bar -->
				<div
					class="relative my-5 h-32 cursor-pointer rounded-2xl bg-slate-700"
					onpointerdown={dragsYaDown}
					onmousemove={previewSeek}
					title={previewSeekValue}
					role="tooltip"
				>
					<div
						class="absolute h-full bg-slate-500"
						style="left: {sliceStart * 100}%; width: {(sliceEnd - sliceStart) * 100}%"
					></div>
					<div class="absolute h-full bg-violet-500" style="width: {progress * 100}%"></div>
				</div>
			{:else}
				<!-- Fallback (pre-decode): plain bar -->
				<div
					class="h-6 cursor-pointer rounded-2xl bg-slate-700"
					onpointerdown={dragsYaDown}
					onmousemove={previewSeek}
					title={previewSeekValue}
					role="tooltip"
				>
					<div class="h-full bg-violet-500" style="width: {progress * 100}%"></div>
				</div>
			{/if}
		</div>

		<div class="inline-block">{formatTime(props.duration)}</div>
	</div>
</div>
