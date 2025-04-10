<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { TRACKLIST } from '$lib/tracklist';

	const trackName = (page.url.searchParams.get('t') || '').toLowerCase();
	const startTime = Number(page.url.searchParams.get('s') || 0);
	const loopDuration = Number(page.url.searchParams.get('l') || 19);
	const title = page.url.searchParams.get('title') || 'untitled';

	// svelte-ignore non_reactive_update
	let audioElm: HTMLAudioElement | null;

	let troof: string | null = $state(null);

	let showControls = $state(false);
	let paused = $state(true);

	let errors: string[] = $state([]);

	let currentTime = $state(0);
	let duration = $state(0);

	let sliceStartTime = $state(0);
	let sliceDuration = $state(10);
	let sliceTitle = $state('');

	let pos = $derived.by(() => {
		const fullWidth = duration;
		const perc = (startTime + loopDuration) / fullWidth;
		return perc;
	});

	let width = $derived.by(() => {
		return (startTime + loopDuration) / duration;
	});

	const formatTime = (value: number) => {
		if (isNaN(value)) return '...';

		const minutes = Math.floor(value / 60);
		const seconds = Math.floor(value % 60);

		return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
	};

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
			if (!audioElm) {
				return;
			}

			const duration = audioElm.duration || 0;
			errors = [];
			if (startTime > duration || startTime < 0) {
				errors.push(`Start time out of range`);
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
		<audio
			bind:currentTime
			bind:duration
			bind:paused
			src={troof}
			controls={showControls}
			bind:this={audioElm}
		></audio>
	</div>

	<div class="mt-5 text-2xl text-red-500">
		{#each errors as error}
			<div>
				{error}
			</div>
		{/each}
	</div>

	<div>
		{currentTime.toFixed(1)} : {duration.toFixed(1)}

		<div class="mt-5 flex">
			{#if paused}
				<button onclick={drawpIt} aria-label="Play">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="size-12"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
						/>
					</svg>
				</button>
			{:else}
				<button onclick={prawpIt} aria-label="Pause">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="size-12"
					>
						<path
							fill-rule="evenodd"
							d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			{/if}

			{formatTime(currentTime)}
			<div class="relative h-16 w-full bg-blue-500">
				<div class="absolute bg-green-500 w-[{width}%] h-full left-[{pos}%]"></div>
			</div>
			{formatTime(duration)}
		</div>

		<!-- {paused} -->
	</div>

	<!-- <div class="mt-5">
		track={trackName}<br/>
		start={startTime}<br/>
		duration={duration}<br/>
	</div> -->

	<div class="mt-5">
		<input class="border border-solid border-slate-500 bg-black p-2" bind:value={sliceStartTime} />
		<input class="border border-solid border-slate-500 bg-black p-2" bind:value={sliceDuration} />
		<input class="border border-solid border-slate-500 bg-black p-2 w-96" bind:value={sliceTitle} placeholder="Now I made a record deal..." />

		(This doesn't work quite right yet...)
		<a href="/wtc?t={trackName}&s={sliceStartTime}&l={sliceDuration}&title={sliceTitle}">
			<button class="bg-violet-500 p-2">Clice</button>
		</a>
	</div>

	<div class="mt-5">
		<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
	</div>
</div>

<style scoped></style>
