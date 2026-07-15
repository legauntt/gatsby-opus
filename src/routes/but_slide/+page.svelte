<script lang="ts">
	import { PUBLIC_BACKEND_BASE_URL } from '$env/static/public';
	import { pushState } from '$app/navigation';

	import { page } from '$app/state';
	import dayjs from 'dayjs';
	import Stool from './stool.svelte';
	import Meadow from './meadow.svelte';
	import { nanoid } from 'nanoid';
	import { random } from 'lodash';
	import { onMount, onDestroy, tick } from 'svelte';
	import axios from 'axios';
	import toast from 'svelte-5-french-toast';
	import { jukebawx } from '$lib/player.svelte';
	import { copyToClippy } from '$lib/utilz';

	const buildTime = dayjs(__BUILD_TIME__).format('YYYY-MM-DD HH:mm:ss');

	const shareName = page.url.searchParams.get('s') || '';

	interface IClice {
		id: string;
		audioFile: string;
		label: string;
		paused: boolean;
		duration: number;
		currentTime: number;
		volume: number;
		muted: boolean;
		loop: boolean;
		played: boolean;

		orca: {
			startType: string;
			maxInstances: number;
			dieRoll: number;
			delay: number;
		};
	}

	let selectedTrack = $state('/butts/ambience.mp3');
	let clices: IClice[] = $state([]);
	let logs: string[] = $state([]);

	let gameRefs: { clice: IClice; audio: HTMLAudioElement }[] = $state([]);
	let trackCounts: { [id: string]: number } = $state({});

	// svelte-ignore non_reactive_update
	let logsDiv: HTMLDivElement;

	let title = $state('');

	let editorState = $state('editing');
	let rockAndRoll = $state(false);
	let fullScreen = $state(false);
	let gameLoopStartTime = $state(0);
	let loading = $state(false);

	let worker: Worker | null = null;
	let preloadTimeout: ReturnType<typeof setTimeout> | null = null;

	onMount(async () => {
		worker = new Worker('/workWork.js');
		worker.onmessage = () => {
			gameLoop();
		};

		if (shareName) {
			try {
				loading = true;
				const response = await axios.get(`${PUBLIC_BACKEND_BASE_URL}/gatsby/presets/${shareName}`);
				loading = false;
				const preset = response.data.preset || {};
				title = preset.title;
				clices = preset.clices.map((entry: IClice) => {
					entry.currentTime = 0;
					entry.paused = true;
					return entry;
				});
			} catch (e) {
				console.error(`Failed to load preset`, e);
			}
		}
	});

	onDestroy(() => {
		// The garden must not keep spawning sounds after we leave: detached
		// Audio elements and the worker tick both outlive the component.
		endInsanity();
		worker?.terminate();

		if (preloadTimeout) {
			clearTimeout(preloadTimeout);
		}
	});

	const formatTrack = (track: string) => {
		return track.split('/').slice(-1)[0];
	};

	/**
	 * All roads to a spawned sound go through here: honors the clice's
	 * volume/mute from the editor, tracks the ref so endInsanity can kill
	 * it, and tells da meadow to fwoosh.
	 */
	const spawnAudio = (clice: IClice, onEnded?: () => void) => {
		const audioElm = new Audio(clice.audioFile);
		audioElm.loop = clice.loop;
		audioElm.volume = clice.volume;
		audioElm.muted = clice.muted;
		audioElm.play();

		if (onEnded) {
			audioElm.addEventListener('ended', onEnded);
		}

		gameRefs.push({
			clice,
			audio: audioElm
		});

		document.dispatchEvent(new CustomEvent('butterfly_fwoosh'));

		return audioElm;
	};

	const addClice = () => {
		const ambience = formatTrack(selectedTrack) == 'ambience.mp3';

		clices.push({
			id: nanoid(8),
			audioFile: selectedTrack,
			label: formatTrack(selectedTrack),
			paused: true,
			duration: NaN,
			currentTime: 0,
			volume: 1,
			muted: false,
			loop: ambience,
			played: false,

			orca: {
				startType: ambience ? 'onload' : 'random',
				maxInstances: 1,
				dieRoll: 69,
				delay: 30
			}
		});
	};

	const saveToCloud = async () => {
		try {
			const response = await axios.post(`${PUBLIC_BACKEND_BASE_URL}/gatsby/presets`, {
				preset: {
					version: '2025-04-16',
					abzolutely: true,
					title: title,
					clices
				}
			});

			toast.success('Saved!');

			if (response.data.preset.shareName) {
				page.url.searchParams.set('s', response.data.preset.shareName);
				pushState(page.url, {});

				const clipped = await copyToClippy(page.url.href);

				if (clipped) {
					toast.success(`Copied URL to Clipboard`);
				} else {
					toast.error(`Failed to copy URL to clipboard`);
				}
			} else {
				toast.error(`Unexpected response from backend`);
			}
		} catch (e) {
			console.error(`Failed to save preset`, e);
			toast.error('Failed to save');
		}
	};

	const startInsanity = () => {
		fullScreen = true;
		logs = [];
		trackCounts = {};
		editorState = 'playing';
		logIt('Started the insanity...');

		// The garden is its own soundscape -- hush da jukebawx
		jukebawx.paused = true;

		clices.forEach((entry) => {
			trackCounts[entry.id] = 0;
			entry.played = false;
		});

		const distinctTracks = clices.reduce((acc: { [audioFile: string]: boolean }, entry) => {
			acc[entry.audioFile] = true;
			return acc;
		}, {});

		logIt(`Preloading distinct tracks...`);
		let activelyLoading = 0;
		let rolling = false;

		const checkIfLoaded = () => {
			if (activelyLoading <= 0 && !rolling) {
				rolling = true;

				if (preloadTimeout) {
					clearTimeout(preloadTimeout);
					preloadTimeout = null;
				}

				movingOnOverToTheBreakdownLane();
			}
		};

		Object.keys(distinctTracks).forEach((audioFile) => {
			logIt(`Preloading track ${audioFile}`);
			const temp = new Audio(audioFile);
			activelyLoading++;

			temp.addEventListener('canplaythrough', () => {
				activelyLoading--;
				checkIfLoaded();
			});

			// A track that errors must not hang the whole garden
			temp.addEventListener('error', () => {
				logIt(`Failed to preload ${audioFile}, moving on`);
				activelyLoading--;
				checkIfLoaded();
			});
		});

		// Belt and suspenders: if canplaythrough never comes, go anyway
		preloadTimeout = setTimeout(() => {
			if (!rolling) {
				logIt('Preload is dragging its feet, starting anyway...');
				activelyLoading = 0;
				checkIfLoaded();
			}
		}, 10000);

		const movingOnOverToTheBreakdownLane = () => {
			const loaders = clices.filter((entry) => entry.orca.startType == 'onload');

			logIt(`Processing loaders...`);
			loaders.forEach((loader) => {
				logIt(`Playing ${loader.audioFile} ${loader.id} (onload), loop=${loader.loop}`);
				spawnAudio(loader, () => {
					logIt(`Track ended: ${loader.audioFile} ${loader.id}`);
				});
			});

			rockAndRoll = true;
			gameLoopStartTime = Date.now();
		};
	};

	const gameLoop = () => {
		if (!rockAndRoll) {
			return;
		}

		const spawners = clices.filter((entry) => entry.orca.startType != 'onload');

		spawners.forEach((spawner) => {
			if (spawner.orca.startType == 'onload_delay' && !spawner.played) {
				const diff = Math.floor((Date.now() - gameLoopStartTime) / 1000);

				if (diff >= spawner.orca.delay) {
					spawner.played = true;

					logIt(`Spawning ${spawner.audioFile} ${spawner.id} from delay`);
					spawnAudio(spawner);
				}
			}

			if (trackCounts[spawner.id] >= spawner.orca.maxInstances) {
				return;
			}

			const dieRoll = random(1, spawner.orca.dieRoll);
			if (dieRoll == spawner.orca.dieRoll) {
				trackCounts[spawner.id]++;

				logIt(
					`Spawning ${spawner.audioFile} ${spawner.id} from dieRoll=${dieRoll}, instances=${trackCounts[spawner.id]}`
				);

				spawnAudio(spawner, () => {
					trackCounts[spawner.id]--;
				});
			}
		});
	};

	const endInsanity = () => {
		fullScreen = false;
		editorState = 'editing';
		logIt('Ended the insanity...');
		rockAndRoll = false;

		gameRefs.forEach((ref) => {
			ref.audio.pause();
		});

		// Don't hoard dead refs across rounds
		gameRefs = [];
	};

	const logIt = async (mess: string) => {
		logs.push(dayjs().format('h:mm:ss A') + ': ' + mess);
		await tick();

		if (!logsDiv) {
			return;
		}

		logsDiv.scroll({ top: logsDiv.scrollHeight, behavior: 'smooth' });
	};

	const onDelete = (trashed: IClice) => {
		clices = clices.filter((entry) => entry != trashed);
	};
</script>

<svelte:head>
	<title>Garden Sim</title>
	<meta name="description" content="Woooooooooah" />
</svelte:head>

<div class="butterfly-garden relative bg-slate-900 xl:flex" role="application">
	<img
		class="xl:h-[85vh] 2xl:h-[100vh]"
		src="/butts/image.webp"
		alt="Butterfly"
		class:butto={editorState != 'editing'}
	/>

	{#if editorState != 'editing'}
		<Meadow />

		{#if fullScreen}
			<div class="absolute top-5 left-5 text-2xl text-black">
				<button class="bg-slate-300 p-2" onclick={() => (fullScreen = false)}> Show logs </button>
			</div>

			<div class="absolute top-5 right-5 text-2xl text-black">
				<button class="bg-violet-300 p-2" onclick={endInsanity}> Stop it </button>
			</div>
		{:else}
			<div class="absolute top-5 left-5 text-2xl text-black">
				<button class="bg-slate-300 p-2" onclick={() => (fullScreen = true)}> Hide logs </button>
			</div>
		{/if}
	{/if}

	<div class="w-full border border-solid border-black px-5 text-lg" class:buttMax={fullScreen}>
		{#if editorState == 'editing'}
			<div class="mt-3">
				<input
					type="text"
					bind:value={title}
					class="w-[calc(100%-130px)] border border-solid border-slate-500 bg-black p-2 align-middle text-sm"
					placeholder="Untitled"
				/>

				<button class="align-middle text-green-500" aria-label="Add track" onclick={addClice}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="size-8"
					>
						<path
							fill-rule="evenodd"
							d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>

				<button
					aria-label="Play"
					class="disabled align-middle text-red-500 disabled:text-slate-500"
					onclick={startInsanity}
					disabled={clices.length == 0}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="size-8"
					>
						<path
							fill-rule="evenodd"
							d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>

				<button
					aria-label="Save"
					class="align-middle text-blue-400 disabled:text-slate-500"
					disabled={clices.length == 0}
					onclick={saveToCloud}
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

			{#if loading}
				<div class="mt-3 text-4xl text-slate-500">Loading preset...</div>
			{/if}

			<div class="mt-5">
				{#each clices as entry (entry.id)}
					<audio
						src={entry.audioFile}
						bind:duration={entry.duration}
						bind:currentTime={entry.currentTime}
						bind:paused={entry.paused}
						bind:volume={entry.volume}
						bind:muted={entry.muted}
						onended={() => {
							entry.currentTime = 0;
						}}
						loop={entry.loop}
					></audio>
					<Stool
						{...entry}
						onTogglePause={() => (entry.paused = !entry.paused)}
						onSeek={(newTime: number) => (entry.currentTime = newTime)}
						onLoopChange={() => (entry.loop = !entry.loop)}
						onDelete={() => onDelete(entry)}
						onToggleMute={() => (entry.muted = !entry.muted)}
						onChangeStartType={(newValue: string) => (entry.orca.startType = newValue)}
						onChangeMaxInstances={(newValue: number) => (entry.orca.maxInstances = newValue)}
						onChangeDieRoll={(newValue: number) => (entry.orca.dieRoll = newValue)}
						onChangeTrack={(newTrack: string) => (entry.audioFile = newTrack)}
						onChangeDelay={(newValue: number) => (entry.orca.delay = newValue)}
					/>
				{/each}
			</div>

			<a href="/" class="mt-5 ml-3 text-yellow-200 hover:underline">Denny, let's go hoooome.</a>
		{:else}
			<!-- Controls above the logs: the bottom of the viewport belongs to
			     da jukebawx bar, and stopping shouldn't require scrolling anyway -->
			<div class="my-3">
				<button class="bg-amber-950 p-2" onclick={endInsanity}>Stop the insanity</button>

				<a href="/" class="ml-3 text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
			</div>

			<div
				class="h-[65vh] overflow-y-scroll bg-slate-500 p-2 text-black 2xl:h-[80vh]"
				bind:this={logsDiv}
			>
				{#each logs as log, i (i)}
					<div>
						{log}
					</div>
				{/each}
			</div>
		{/if}

		<div class="bottom-5 left-5 mt-5 text-lg text-slate-500 md:absolute md:mt-0">
			{buildTime}
		</div>
	</div>
</div>

<style scoped>
	.butterfly-garden {
		font-size: 0;
	}

	.butto {
		width: 100%;
	}

	.buttMax {
		display: none;
	}
</style>
