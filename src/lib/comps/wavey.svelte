<script lang="ts">
	import { formatTime } from '$lib/utilz';

	interface IWaveyProps {
		currentTime: number;
		duration: number;
		paused: boolean;

		onSeek: Function;
		onTogglePause: Function;

		subslice?: {
			start: number;
			end: number;
		};

		label?: string;
	}

	let props: IWaveyProps = $props();

	// svelte-ignore non_reactive_update
	let progressDiv: HTMLDivElement;

	// svelte-ignore non_reactive_update
	let sliceDiv: HTMLDivElement;

	let previewSeekValue: string = $state('');

	$effect(() => {
		const parentWidth = progressDiv.parentElement?.clientWidth;
		if (!parentWidth) {
			return;
		}

		if (props.subslice) {
			const left = (props.subslice.start / props.duration) * 100;
			const sliceDuration = props.subslice.end - props.subslice.start;
			const sliceWidth = (sliceDuration / props.duration) * 100;

			const adjustedStarted = props.currentTime - props.subslice.start;
			const progressWidth = (adjustedStarted / props.duration) * 100;

			sliceDiv.style.left = left + '%';
			sliceDiv.style.width = sliceWidth + '%';

			progressDiv.style.left = left + '%';
			progressDiv.style.width = progressWidth + '%';
		} else {
			const percProgress = props.currentTime / props.duration;
			progressDiv.style.width = percProgress * 100 + '%';
		}
	});

	const previewSeek = (e: any) => {
		const div = e.currentTarget;

		const { left, width } = div.getBoundingClientRect();

		let p = (e.clientX - left) / width;
		if (p < 0) p = 0;
		if (p > 1) p = 1;

		previewSeekValue = formatTime(p * props.duration);
	};

	const dragsYaDown = (e: any) => {
		const div = e.currentTarget;

		function seek(e: any) {
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
			<div>{props.label}</div>

			{#if props.subslice}
				<div
					class="relative h-6 rounded-2xl bg-slate-700"
					onpointerdown={dragsYaDown}
					onmousemove={previewSeek}
					title={previewSeekValue}
					role="tooltip"
				>
					<div bind:this={sliceDiv} class="absolute h-[100%] w-0 bg-slate-300"></div>
					<div bind:this={progressDiv} class="absolute h-[100%] w-0 bg-violet-500"></div>
				</div>
			{:else}
				<div
					class="h-6 cursor-pointer rounded-2xl bg-slate-700"
					onpointerdown={dragsYaDown}
					onmousemove={previewSeek}
					title={previewSeekValue}
					role="tooltip"
				>
					<div bind:this={progressDiv} class="h-[100%] w-0 bg-violet-500"></div>
				</div>
			{/if}
		</div>

		<div class="inline-block">{formatTime(props.duration)}</div>
	</div>
</div>
