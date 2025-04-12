<script lang="ts">
	import { onMount } from 'svelte';

	interface StoolProps {
		label: string;
		paused: boolean;
		currentTime: number;
		muted: boolean;
		volume: number;
		duration: number;
		loop: boolean;
		onTogglePause: Function;
		onSeek: Function;
		onLoopChange: Function;
		onDelete: Function;
		onToggleMute: Function;
		onChangeStartType: Function;
		onChangeMaxInstances: Function;
		onChangeDieRoll: Function;

		orca: {
			startType: string;
			maxInstances: number;
			dieRoll: number;
		};
	}

	let props: StoolProps = $props();
	let previewSeekValue: string = $state('');
	let progressDiv: HTMLDivElement;
	let showTriggers = $state(true);

	const approxFrequency = $derived.by(() => {
		return formatTime(props.orca.dieRoll);
	});

	$effect(() => {
		const parentWidth = progressDiv.parentElement?.clientWidth;
		if (!parentWidth) {
			return;
		}
		const percProgress = props.currentTime / props.duration;
		// console.log('progress', percProgress);
		// progressDiv.style.width = percProgress * parentWidth + 'px';
		progressDiv.style.width = percProgress * 100 + '%';
	});

	const formatTime = (value: number) => {
		if (isNaN(value)) return '...';

		const minutes = Math.floor(value / 60);
		const seconds = Math.floor(value % 60);

		return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
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

	const previewSeek = (e: any) => {
		const div = e.currentTarget;

		const { left, width } = div.getBoundingClientRect();

		let p = (e.clientX - left) / width;
		if (p < 0) p = 0;
		if (p > 1) p = 1;

		previewSeekValue = formatTime(p * props.duration);
	};

	const verifyMaxInstances = (e: any) => {
		let value = Number(e.currentTarget.value);
		if (isNaN(value)) {
			value = 1;
		} else if (value <= 0) {
			value = 1;
		}

		props.onChangeMaxInstances(value);
	};

	const verifyDieRoll = (e: any) => {
		let value = Number(e.currentTarget.value);
		if (isNaN(value)) {
			value = 1;
		} else if (value <= 0) {
			value = 1;
		}

		props.onChangeDieRoll(value);
	};
</script>

<div class="relative mt-5 items-center border border-solid border-indigo-500 py-2 select-none">
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

			<div
				class="h-6 cursor-pointer overflow-hidden bg-green-700"
				onpointerdown={dragsYaDown}
				onmousemove={previewSeek}
				title={previewSeekValue}
				role="tooltip"
			>
				<div bind:this={progressDiv} class="h-[100%] w-0 bg-red-500"></div>
			</div>
		</div>

		<div class="mt-5 ml-3 w-42">
			<div class="inline-block">{formatTime(props.duration)}</div>
			<input
				title="Loop"
				type="checkbox"
				class="ml-2"
				checked={props.loop}
				onchange={() => props.onLoopChange(props.loop)}
			/>
			<span title="Loop"></span>L

			<!-- <div class="mt-1 ml-1 inline-block align-middle text-slate-300">
				{#if props.muted}
					<button aria-label="Mute" onclick={() => props.onToggleMute()} class="text-yellow-500">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
							/>
						</svg>
					</button>
				{:else}
					<button aria-label="Unmute" onclick={() => props.onToggleMute()} class="text-green-500">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
							/>
						</svg>
					</button>
				{/if}
			</div> -->

			<button
				onclick={() => props.onDelete()}
				aria-label="Delete"
				class="absolute top-1 right-1 text-red-400"
			>
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
						d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
					/>
				</svg>
			</button>
		</div>
	</div>

	<div class="mt-3 ml-3 text-sm">
		{#if showTriggers}
			<div>
				<div class="mt-3">
					<label class="grid grid-cols-2">
						<span class="mt-2">How does it start?</span>
						<select
							value={props.orca.startType}
							class="mr-3"
							onchange={(e) => props.onChangeStartType(e.currentTarget.value)}
						>
							<option value="onload">On Load</option>
							<option value="onload_delay" disabled>After delay...</option>
							<option value="random">Based on random chance</option>
						</select>
					</label>
				</div>

				{#if props.orca.startType == 'random'}
					<div class="mt-3">
						<label class="grid grid-cols-2">
							<span class="mt-2">Max simultaneous instances?</span>
							<input
								type="number"
								max="10"
								value={props.orca.maxInstances}
								onchange={verifyMaxInstances}
							/>
						</label>
					</div>

					<div class="mt-3">
						<label class="grid grid-cols-2">
							<span class="mt-2">Random Number Generator (1 out of...)</span>
							<input type="number" max="10" value={props.orca.dieRoll} onchange={verifyDieRoll} />
						</label>
					</div>

					<div class="text-slate-500">Plays about every {approxFrequency}</div>
				{/if}
			</div>

			<div class="mt-3">
				<button class="p-2 text-yellow-500 hover:underline" onclick={() => (showTriggers = false)}>
					Hide Triggers
				</button>
			</div>
		{:else}
			<button class="p-2 text-yellow-500 hover:underline" onclick={() => (showTriggers = true)}>
				Show Triggers
			</button>
		{/if}
	</div>
</div>

<style scoped>
	input {
		padding: 8px;
		border: 1px slategray solid;
		background: black;
	}

	select {
		background: black;
		padding: 8px;
		border: 1px slategray solid;
	}
</style>
