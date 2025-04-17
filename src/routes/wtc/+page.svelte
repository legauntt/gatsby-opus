<script lang="ts">
	import { TREASURE_TROVE } from '$lib/cetlist';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Wavey from '$lib/comps/wavey.svelte';
	import Cashew from './cashew.svelte';

	const trackName = (page.url.searchParams.get('t') || '').toLowerCase();
	const startTime = Number(page.url.searchParams.get('s') || 0);
	const loopDuration = Number(page.url.searchParams.get('l') || 19);
	const title = page.url.searchParams.get('title') || 'untitled';

	let troof: string | null = $state(null);
	let paused = $state(true);

	let errors: string[] = $state([]);
	let currentTime = $state(startTime);
	let duration = $state(loopDuration);

	onMount(() => {
		const worker = new Worker('/work_faster.js');
		worker.onmessage = (e) => {
			timerLoop();
		};

		if (!trackName) {
			return;
		}

		let fullName = '';

		for (const [key, tracks] of Object.entries(TREASURE_TROVE)) {
			const track = tracks.find((entry) => {
				const name = entry.split('/').slice(-1)[0].replace('.m4a', '').replace('.mp3', '');
				// console.log("heh", name, trackName);
				return name == trackName;
			});

			if (track) {
				fullName = track;
				break;
			}
		}

		if (fullName) {
			console.log(`Found track from ${trackName}`, fullName);
			troof = fullName;
		}
	});

	const onTogglePause = () => {
		paused = !paused;
	};

	const onSeek = () => {};

	const timerLoop = () => {
		if (currentTime > startTime + loopDuration) {
			currentTime = startTime;
		}
	};
</script>

<svelte:head>
	<title>What The C?</title>
	<meta name="description" content="Yehhh fotabip fotaboop" />
</svelte:head>

<div class="p-5">
	<div class="text-3xl">What The C?...</div>

	<div class="text-2xl text-slate-500">
		{title}
	</div>

	<div class="mt-5">
		<audio src={troof} bind:currentTime bind:duration bind:paused></audio>
	</div>

	<div class="mt-5 text-2xl text-red-500">
		{#each errors as error}
			<div>
				{error}
			</div>
		{/each}
	</div>

	<div>
		<Wavey
			{currentTime}
			{paused}
			{duration}
			{onTogglePause}
			{onSeek}
			subslice={{ start: startTime, end: startTime + loopDuration }}
		/>
	</div>

	<div>
		<Cashew />
	</div>

	<div class="mt-5">
		<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
	</div>
</div>

<style scoped></style>
