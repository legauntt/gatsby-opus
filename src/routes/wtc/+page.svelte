<script lang="ts">
	import { PUBLIC_BACKEND_BASE_URL } from '$env/static/public';
	import { pushState } from '$app/navigation';
	import axios from 'axios';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { TREASURE_TROVE } from '$lib/cetlist';
	import Wavey from '$lib/comps/wavey.svelte';
	import { formatTrack } from '$lib/utilz';
	import toast from 'svelte-5-french-toast';

	let shareName = $state(page.url.searchParams.get('s') || '');
	let saving = $state(false);
	let loading = $state(false);

	const allTracks = TREASURE_TROVE.DEMON.concat(
		TREASURE_TROVE.BONUS,
		TREASURE_TROVE.SEVEN,
		TREASURE_TROVE.CLICES
	);

	allTracks.sort((a, b) => {
		return a.localeCompare(b);
	});

	/**
	 * @type {any}
	 */
	let glawski = $state({
		start: 0,
		loopLength: 19,
		duration: NaN,
		title: '',
		audioFile: '',
		paused: false,
		currentTime: 0
	});

	onMount(async () => {
		const worker = new Worker('/work_faster.js');
		worker.onmessage = (e) => {
			timerLoop();
		};

		if (!shareName) {
			newGlawski();
		}

		try {
			loading = true;
			const response = await axios.get(`${PUBLIC_BACKEND_BASE_URL}/gatsby/glawskis/${shareName}`);
			loading = false;
			glawski = response.data.glawski;
		} catch (e) {
			console.error(`Failed to load glawski`, e);
		}
	});

	const onTogglePause = () => {
		glawski.paused = !glawski.paused;
	};

	const onSeek = (newValue: number) => {
		newValue = Number(newValue.toFixed(1));
		glawski.currentTime = newValue;
		glawski.start = newValue;

		capLoopLength();
	};

	const timerLoop = () => {
		if (glawski.currentTime > glawski.start + glawski.loopLength) {
			glawski.currentTime = glawski.start;
		}
	};

	const newGlawski = () => {
		shareName = '';
		glawski.audioFile = allTracks[0];
	};

	const saveGlawski = async () => {
		saving = true;
		try {
			const response = await axios.post(`${PUBLIC_BACKEND_BASE_URL}/gatsby/glawskis`, {
				glawski
			});

			saving = false;
			toast.success('Saved (dat sucka)');

			if (response.data.glawski?.shareName) {
				page.url.searchParams.set('s', response.data.glawski.shareName);
				pushState(page.url, {});
			} else {
				alert('doh');
			}
		} catch (e) {
			toast.error('Damn shame');
			console.error(`Failed to save glawski`, e);
			saving = false;
		}
	};

	const updateStartValue = (e: Event) => {
		const value = Number((e.currentTarget as HTMLInputElement).value);

		if (value <= 0 || isNaN(value)) {
			return;
		}

		glawski.currentTime = value;
		glawski.start = value;
	};

	const updateLoopLength = (e: Event) => {
		const value = Number((e.currentTarget as HTMLInputElement).value);

		if (value <= 0 || isNaN(value)) {
			return;
		}

		glawski.loopLength = value;
		capLoopLength();
	};

	const changedTrack = () => {
		glawski.start = 0;
		glawski.loopLength = 19;
		capLoopLength();
	};

	const capLoopLength = () => {
		if (glawski.start + glawski.loopLength > glawski.duration) {
			glawski.loopLength = Number((glawski.duration - glawski.start).toFixed(1));
		}
	};
</script>

<svelte:head>
	<title>What The C?</title>
	<meta name="description" content="Yehhh fotabip fotaboop" />
</svelte:head>

<div class="p-5">
	<div class="text-3xl">What The C?...</div>

	{#if saving}
		<div class="text-3xl text-slate-500">Saving...</div>
	{/if}

	<audio
		src={glawski.audioFile}
		bind:currentTime={glawski.currentTime}
		bind:duration={glawski.duration}
		bind:paused={glawski.paused}
		onloadeddata={capLoopLength}
	></audio>

	<div class="mt-5">
		<select
			class="border border-solid border-slate-500 bg-black p-2 align-middle"
			bind:value={glawski.audioFile}
			onchange={changedTrack}
		>
			{#each allTracks as track}
				<option value={track}>{formatTrack(track)}</option>
			{/each}
		</select>

		<input
			type="text"
			class="ml-3 min-w-128 border border-solid border-slate-500 p-2 align-middle"
			bind:value={glawski.title}
			placeholder="Yeh I remembaw..."
		/>

		<button
			aria-label="Save"
			class="align-middle text-blue-400 disabled:text-slate-500"
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

		<Wavey
			currentTime={glawski.currentTime}
			paused={glawski.paused}
			duration={glawski.duration}
			{onTogglePause}
			{onSeek}
			subslice={{ start: glawski.start, end: glawski.start + glawski.loopLength }}
		/>

		<div class="mt-5">
			<div>
				<div class="inline-block align-middle">
					Start
					<input
						type="text"
						class="border border-solid border-slate-500 p-2"
						value={glawski.start}
						onchange={updateStartValue}
					/>
				</div>

				<div class="ml-5 inline-block align-middle">
					Duration
					<input
						type="text"
						class="border border-solid border-slate-500 p-2"
						value={glawski.loopLength}
						onchange={updateLoopLength}
					/>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-5">
		<div>
			<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
		</div>
	</div>
</div>

<style scoped></style>
