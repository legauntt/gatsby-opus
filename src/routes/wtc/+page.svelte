<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { TRACKLIST } from '$lib/tracklist';

	const trackName = (page.url.searchParams.get('t') || '').toLowerCase();
	const startTime = Number(page.url.searchParams.get('s') || 0);
	const loopDuration = Number(page.url.searchParams.get('l') || 19);
	const title = page.url.searchParams.get("title") || "untitled";

	// svelte-ignore non_reactive_update
	let audioElm: HTMLAudioElement | null;

	let troof: string | null = $state(null);

	let showControls = $state(false);
	let paused = $state(true);

	let errors: string[] = $state([]);

	onMount(() => {
		if (!trackName) {
			return;
		}

		if (!audioElm) {
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
		audioElm.currentTime = Number(startTime);
		troof = fullName;

		audioElm.addEventListener('pause', (event) => {
			paused = true;
		});

		audioElm.addEventListener('play', (event) => {
			paused = false;
		});

		audioElm.addEventListener('loadedmetadata', (event) => {
			console.log('whew', event, audioElm?.duration, startTime);
			if (!audioElm) {
				return;
			}

			const duration = audioElm.duration || 0;
			errors = [];
			if (startTime > duration || startTime < 0) {
				errors.push(`Start time out of range`)
			}
			if (loopDuration < 0) {
				errors.push(`Invalid loop duration`);
			}
			if (startTime + loopDuration > duration) {
				errors.push(`Loop duration out of range`);
			}

			errors = [...errors];
		});
	});

	setInterval(() => {
		if (!audioElm) {
			return;
		}

		if (audioElm.currentTime > startTime + loopDuration) {
			audioElm.currentTime = startTime;
		}
	}, 100);

	const drawpIt = () => {
		if (!audioElm) {
			return;
		}

		audioElm.play();
	};

	const prawpIt = () => {
		if (!audioElm) {
			return;
		}

		audioElm.pause();
	};
</script>

<div class="p-5">
	<div class="text-3xl">What The C?...</div>

	<div class="text-2xl text-slate-500">
		{title}
	</div>

	<div class="mt-5">
		<audio src={troof} controls={showControls} bind:this={audioElm}></audio>
	</div>

	<div class="mt-5">
		<button class="bg-violet-500 p-3 disabled:bg-slate-500" disabled={!paused} onclick={drawpIt}
			>Drawp It</button
		>
		<button class="ml-3 bg-yellow-700 p-3 disabled:bg-slate-500" disabled={paused} onclick={prawpIt}
			>Prawp It</button
		>
	</div>

	<div class="text-red-500 mt-5 text-2xl">
		{#each errors as error}
			<div>
				{error}
			</div>
		{/each}
	</div>

	<!-- <div class="mt-5">
		track={trackName}<br/>
		start={startTime}<br/>
		duration={duration}<br/>
	</div> -->

	<div class="mt-5">
		<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
	</div>
</div>

<style scoped></style>
