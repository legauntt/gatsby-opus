<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { TRACKLIST } from '$lib/tracklist';
	import Wavey from '$lib/comps/wavey.svelte';

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
		if (!trackName) {
			return;
		}

		let prefix = 'dvdp';
		if (trackName.startsWith('bonus_')) {
			prefix = 'bonus';
		}

		const fullName = `/${prefix}/${trackName}.m4a`;

		const foundIt = TRACKLIST.some((track) => {
			return fullName == track;
		});

		if (!foundIt) {
			console.warn(`No such track ${fullName}`);
			return;
		}

		console.log(`Wup a doop`, fullName);
		troof = fullName;
	});

	setInterval(() => {
		if (currentTime > startTime + loopDuration) {
			currentTime = startTime;
		}
	}, 100);

	const onTogglePause = () => {
		console.log("hm", paused);
		paused = !paused;
	};

	const onSeek = () => {
		console.log("heh");
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
		<Wavey {currentTime} {paused} {duration} {onTogglePause} {onSeek} />
	</div>

	<div class="mt-5">
		<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
	</div>
</div>

<style scoped></style>
