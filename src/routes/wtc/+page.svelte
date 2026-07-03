<script lang="ts">
	import { PUBLIC_BACKEND_BASE_URL } from '$env/static/public';
	import { pushState } from '$app/navigation';
	import axios from 'axios';
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { TREASURE_TROVE } from '$lib/cetlist';
	import Wavey from '$lib/comps/wavey.svelte';
	import { copyToClippy, formatTrack } from '$lib/utilz';
	import toast from 'svelte-5-french-toast';

	let shareName = $state(page.url.searchParams.get('s') || '');
	let saving = $state(false);
	let loading = $state(false);

	const allTracks = TREASURE_TROVE.DEMON.concat(
		TREASURE_TROVE.BONUS,
		TREASURE_TROVE.SEVEN,
		TREASURE_TROVE.CLICES
	);

	const DEF_LOOP_LEN = 5;

	allTracks.sort((a, b) => {
		return a.localeCompare(b);
	});

	/**
	 * @type {any}
	 */
	let glawski = $state({
		start: 0,
		loopLength: DEF_LOOP_LEN,
		duration: NaN,
		title: '',
		audioFile: '',
		paused: false,
		currentTime: 0
	});

	let worker: Worker | null = null;

	onMount(async () => {
		worker = new Worker('/work_faster.js');
		worker.onmessage = (e) => {
			timerLoop();
		};

		window.addEventListener('keydown', onKeyDown);

		if (!shareName) {
			newGlawski();
			return;
		}

		try {
			loading = true;
			const response = await axios.get(`${PUBLIC_BACKEND_BASE_URL}/gatsby/glawskis/${shareName}`);
			loading = false;
			glawski = response.data.glawski;
			glawski.currentTime = glawski.start;
		} catch (e) {
			console.error(`Failed to load glawski`, e);
		}
	});

	const onTogglePause = () => {
		glawski.paused = !glawski.paused;
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.code !== 'Space' || !glawski.audioFile) return;

		// Don't hijack the spacebar while typing in the title / value fields.
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

		e.preventDefault();
		onTogglePause();
	};

	onDestroy(() => {
		worker?.terminate();
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', onKeyDown);
		}
	});

	const onSeek = (newValue: number) => {
		newValue = Number(newValue.toFixed(1));
		glawski.currentTime = newValue;
		glawski.start = newValue;

		capLoopLength();
	};

	const timerLoop = () => {
		if (glawski.currentTime >= glawski.start + glawski.loopLength) {
			glawski.currentTime = glawski.start;
		}
	};

	const newGlawski = () => {
		// console.log('new glawski');

		glawski = {
			start: 0,
			loopLength: DEF_LOOP_LEN,
			duration: NaN,
			title: '',
			audioFile: '',
			paused: false,
			currentTime: 0
		};

		shareName = '';

		if (page.url.searchParams.get('s')) {
			page.url.searchParams.delete('s');
			pushState(page.url, {});
		}
	};

	const saveGlawski = async () => {
		saving = true;
		try {
			const response = await axios.post(`${PUBLIC_BACKEND_BASE_URL}/gatsby/glawskis`, {
				glawski
			});

			saving = false;
			toast.success('Saved (dat sucka)');

			const shareName = response.data.glawski?.shareName;

			if (!shareName) {
				toast.error(`Unexpected response from backend`);
			}

			page.url.searchParams.set('s', shareName);
			pushState(page.url, {});
			const clipped = await copyToClippy(page.url.href);

			if (clipped) {
				toast.success(`Copied URL to Clipboard`);
			} else {
				toast.error(`Failed to copy URL to clipboard`);
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
		capLoopLength();
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
		glawski.loopLength = DEF_LOOP_LEN;
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

	{#if loading}
		<div class="text-2xl text-slate-500">Loading...</div>
	{/if}

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
		<div class="xl:inline-block">
			<select
				class="border border-solid border-slate-500 bg-black p-2 align-middle"
				bind:value={glawski.audioFile}
				onchange={changedTrack}
			>
				{#each allTracks as track}
					<option value={track}>{formatTrack(track)}</option>
				{/each}
			</select>
		</div>

		<div class="xl:inline-block">
			<input
				type="text"
				class="border border-solid border-slate-500 p-2 align-middle xl:ml-3 xl:min-w-128"
				bind:value={glawski.title}
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
				disabled={saving}
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

		{#if glawski.audioFile}
			<Wavey
				src={glawski.audioFile}
				currentTime={glawski.currentTime}
				paused={glawski.paused}
				duration={glawski.duration}
				{onTogglePause}
				{onSeek}
				subslice={{ start: glawski.start, end: glawski.start + glawski.loopLength }}
				editor={true}
			/>

			<div class="mt-5">
				<div>
					<div class="align-middle xl:inline-block">
						<label class="inline-block">
							<span class="inline-block w-24">Start</span>
							<input
								type="text"
								class="border border-solid border-slate-500 p-2"
								value={glawski.start}
								onchange={updateStartValue}
							/>
						</label>
					</div>

					<div class="align-middle xl:ml-5 xl:inline-block">
						<label>
							<span class="inline-block w-24">Duration</span>
							<input
								type="text"
								class="border border-solid border-slate-500 p-2"
								value={glawski.loopLength}
								onchange={updateLoopLength}
							/>
						</label>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="mt-5">
		<div>
			<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
		</div>
	</div>
</div>

<style scoped></style>
