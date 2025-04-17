<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { TREASURE_TROVE } from '$lib/cetlist';
	import Wavey from '$lib/comps/wavey.svelte';
	import { formatTrack } from '$lib/utilz';

	let shareName = $state(page.url.searchParams.get('s') || '');

	const allTracks = TREASURE_TROVE.DEMON.concat(
		TREASURE_TROVE.BONUS,
		TREASURE_TROVE.SEVEN,
		TREASURE_TROVE.CLICES
	);

	/**
	 * @type {any}
	 */
	let glawski = $state({
		start: 0,
		duration: 5,
		title: '',
		audioFile: ''
	});

	let troof: string | null = $state(null);
	let paused = $state(true);

	let errors: string[] = $state([]);
	let currentTime = $state(0);
	let duration = $state(NaN);

	onMount(() => {
		const worker = new Worker('/work_faster.js');
		worker.onmessage = (e) => {
			timerLoop();
		};

		if (!shareName) {
			return;
		}
	});

	const onTogglePause = () => {
		paused = !paused;
	};

	const onSeek = () => {};

	const timerLoop = () => {
		// if (currentTime > glawski.start + glawski.duration) {
		// 	currentTime = glawski.start;
		// }
	};

	const newGlawski = () => {
		shareName = '';
		glawski.audioFile = allTracks[0];
		troof = glawski.audioFile;
		console.log('heh', troof);
	};

	const saveGlawski = () => {};
</script>

<svelte:head>
	<title>What The C?</title>
	<meta name="description" content="Yehhh fotabip fotaboop" />
</svelte:head>

<div class="p-5">
	<div>
		<button class="bg-green-700 p-2" onclick={newGlawski}>Create Glawski</button>
	</div>

	<div class="mt-5 text-3xl">What The C?...</div>
	<audio src={troof} bind:currentTime bind:duration bind:paused></audio>

	{#if shareName}
		<div class="text-2xl text-slate-500">
			{glawski?.title}
		</div>

		<div class="mt-5 text-2xl text-red-500">
			{#each errors as error}
				<div>
					{error}
				</div>
			{/each}
		</div>

		<div>
			<Wavey {currentTime} {paused} {duration} {onTogglePause} {onSeek} />
			<!-- subslice={{ start: startTime, end: startTime + loopDuration }} -->
		</div>
	{:else}
		<div class="mt-5">
			<select class="border border-solid border-slate-500 bg-black p-2 align-middle">
				{#each allTracks as track}
					<option value={track}>{formatTrack(track)}</option>
				{/each}
			</select>
			<!-- 
			<button aria-label="Play" onclick={() => onTogglePause()} class="align-middle">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-8"
				>
					<path
						fill-rule="evenodd"
						d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z"
						clip-rule="evenodd"
					/>
				</svg>
			</button> -->

			<Wavey {currentTime} {paused} {duration} {onTogglePause} {onSeek} />

			<div class="mt-5">
				<div>
					Start
					<input
						type="text"
						class="border border-solid border-slate-500 p-2"
						value={glawski.start}
					/>

					Duration
					<input
						type="text"
						class="border border-solid border-slate-500 p-2"
						value={glawski.duration}
					/>

					Title
					<input
						type="text"
						class="border border-solid border-slate-500 p-2"
						value={glawski.title}
					/>
				</div>

				<div class="mt-5">
					<button class="bg-violet-500 p-2" onclick={saveGlawski}>Save Glawski</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="mt-5">
		<div>
			<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
		</div>
	</div>
</div>

<style scoped></style>
