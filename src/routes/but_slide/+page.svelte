<script lang="ts">
	import { SLOW_C as tracklist } from '$lib/tracklist';
	import dayjs from 'dayjs';
	import Stool from './stool.svelte';
	import { nanoid } from 'nanoid';
	import { random } from 'lodash';
	import { tick } from 'svelte';

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

		orca: {
			startType: string;
			maxInstances: number;
			dieRoll: number;
		};
	}

	let selectedTrack = $state('/butts/ambience.mp3');
	let clices: IClice[] = $state([]);
	let logs: string[] = $state([]);

	let gameLoop: any = $state(null);
	let gameRefs: any[] = $state([]);
	let trackCounts: any = $state({});

	let dragon = $state(false);

	// svelte-ignore non_reactive_update
	let logsDiv: HTMLDivElement;

	// svelte-ignore non_reactive_update
	let fileInput: HTMLInputElement;

	let showFile = $state(false);
	let title = $state('');
	let fileInputError = $state('');

	let editorState = $state('editing');
	const formatTrack = (track: string) => {
		return track.split('/').slice(-1)[0];
	};

	const onFileChange = () => {
		const file = fileInput?.files?.[0];
		if (!file) {
			fileInputError = 'No file';
			return;
		}

		loadFromFile(file);
	};

	const loadFromFile = (file: any) => {
		const reader = new FileReader();

		reader.onload = (e: any) => {
			const contents = e.target.result;
			try {
				const parsedContents = JSON.parse(contents);

				if (!Array.isArray(parsedContents.clices)) {
					fileInputError = `Invalid format - no clices`;
					return;
				}

				title = parsedContents.title || '';
				clices = parsedContents.clices || [];
				showFile = false;
			} catch (e) {
				console.error(`Failed to parse JSON`, e);
			}
		};

		reader.readAsText(file);
	};

	const saveToFile = async () => {
		const data = {
			version: '2025-04-12',
			title,
			abzolutely: true,
			clices
		};

		const json = JSON.stringify(data, null, 4);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		// Create the anchor element in memory
		const a = document.createElement('a');
		a.href = url;
		a.download = 'dynamodb-fotabip.txt';

		// Programmatically trigger the download
		a.click();

		// Cleanup
		URL.revokeObjectURL(url);
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

			orca: {
				startType: ambience ? 'onload' : 'random',
				maxInstances: 1,
				dieRoll: 69
			}
		});
	};

	const startInsanity = () => {
		logs = [];
		trackCounts = {};
		editorState = 'playing';
		logIt('Started the insanity...');

		clices.forEach((entry) => {
			trackCounts[entry.id] = 0;
		});

		const distinctTracks = clices.reduce((acc: any, entry) => {
			acc[entry.audioFile] = true;
			return acc;
		}, {});

		logIt(`Preloading distinct tracks...`);
		let activelyLoading = 0;

		Object.keys(distinctTracks).forEach((audioFile) => {
			logIt(`Preloading track ${audioFile}`);
			const temp = new Audio(audioFile);
			activelyLoading++;

			temp.addEventListener('canplaythrough', () => {
				activelyLoading--;
				checkIfLoaded();
			});
		});

		const checkIfLoaded = () => {
			if (activelyLoading <= 0) {
				movingOnOverToTheBreakdownLane();
			}
		};

		const movingOnOverToTheBreakdownLane = () => {
			const loaders = clices.filter((entry) => entry.orca.startType == 'onload');
			const spawners = clices.filter((entry) => entry.orca.startType == 'random');

			logIt(`Processing loaders...`);
			loaders.forEach((loader) => {
				logIt(`Playing ${loader.audioFile} ${loader.id} (onload), loop=${loader.loop}`);
				const audioElm = new Audio(loader.audioFile);
				audioElm.loop = loader.loop;
				audioElm.play();

				audioElm.addEventListener('ended', () => {
					logIt(`Track ended: ${loader.audioFile} ${loader.id}`);
				});

				gameRefs.push({
					clice: loader,
					audio: audioElm
				});
			});

			clearInterval(gameLoop);
			logIt("Started 'game loop'");
			gameLoop = setInterval(() => {
				spawners.forEach((spawner) => {
					if (trackCounts[spawner.id] >= spawner.orca.maxInstances) {
						return;
					}

					const dieRoll = random(1, spawner.orca.dieRoll);
					if (dieRoll == spawner.orca.dieRoll) {
						const audioElm = new Audio(spawner.audioFile);
						trackCounts[spawner.id]++;

						logIt(
							`Spawning ${spawner.audioFile} ${spawner.id} from dieRoll=${dieRoll}, instances=${trackCounts[spawner.id]}`
						);

						// probably shouldn't allow the loop
						audioElm.loop = spawner.loop;
						audioElm.play();

						gameRefs.push({
							clice: spawner,
							audio: audioElm
						});

						audioElm.addEventListener('ended', () => {
							trackCounts[spawner.id]--;
						});
					}
				});
			}, 1000);
		};
	};

	const endInsanity = () => {
		editorState = 'editing';
		logIt('Ended the insanity...');
		clearInterval(gameLoop);

		gameRefs.forEach((ref) => {
			ref.audio.pause();
		});
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

	const drawp = (e: any) => {
		stopDefaults(e);
		dragon = false;

		const file = e.dataTransfer.files?.[0];
		if (!file) {
			return;
		}

		loadFromFile(file);
	};

	const dragover = (e: any) => {
		stopDefaults(e);
		dragon = true;
	};

	const dragleave = (e: any) => {
		stopDefaults(e);
		dragon = false;
	};

	const stopDefaults = (e: any) => {
		e.stopPropagation();
		e.preventDefault();
	};
</script>

<svelte:head>
	<title>Garden Sim</title>
	<meta name="description" content="Woooooooooah" />
</svelte:head>

<div
	class="butterfly-garden relative bg-slate-900 xl:flex"
	class:dropIt={dragon}
	ondragleave={dragleave}
	ondragover={dragover}
	ondrop={drawp}
	role="application"
>
	<img class="xl:h-[85vh] 2xl:h-[100vh]" src="/butts/image.webp" alt="Butterfly" />

	<div class="w-full border border-solid border-black px-5 text-lg">
		{#if editorState == 'editing'}
			<div>
				{#if showFile}
					{#if fileInputError}
						<div class="p-2 text-red-500">
							{fileInputError}
						</div>
					{/if}
					<div>
						<input
							type="file"
							name="ncis"
							bind:this={fileInput}
							class="bg-transparent file:mr-5 file:border-[1px] file:bg-stone-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-stone-700"
							accept="text/plain"
							onchange={onFileChange}
						/>

						<button type="button" class="p-2 text-orange-500" onclick={() => (showFile = false)}
							>SHIT</button
						>
					</div>
				{:else}
					<button type="button" class="p-2 text-orange-500" onclick={() => (showFile = true)}
						>DynamoDB</button
					>
				{/if}
			</div>

			<div>
				<input
					type="text"
					bind:value={title}
					class="w-full border border-solid border-slate-500 bg-black p-2 align-middle text-sm"
					placeholder="Untitled"
				/>
			</div>

			<div class="mt-3">
				<select
					class="border border-solid border-slate-500 bg-black p-2 align-middle"
					bind:value={selectedTrack}
				>
					{#each tracklist as track}
						<option value={track}>{formatTrack(track)}</option>
					{/each}
				</select>

				<button class="align-middle text-green-500" aria-label="Add track" onclick={addClice}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="size-6"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
				</button>
			</div>

			<div class="mt-5">
				{#each clices as entry}
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
					/>
				{/each}
			</div>

			{#if clices.length > 0}
				<div class="mt-5">
					<button class="bg-orange-700 p-2" onclick={startInsanity}> MAW BEAUTIFUL </button>
					<button class="ml-3 bg-violet-700 p-2" onclick={saveToFile}>Bowlin' Chain </button>
				</div>
			{/if}

			<div class="bottom-5 left-5 mt-5 text-lg text-slate-500 md:absolute md:mt-0">
				2025-04-12 dragon+
			</div>
		{:else}
			<div
				class="h-[75vh] overflow-y-scroll bg-slate-500 p-2 text-black 2xl:h-[90vh]"
				bind:this={logsDiv}
			>
				{#each logs as log}
					<div>
						{log}
					</div>
				{/each}
			</div>
			<div class="mt-5">
				<button class="bg-amber-950 p-2" onclick={endInsanity}>Stop the insanity</button>
			</div>

			<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
		{/if}
	</div>
</div>

<style scoped>
	.butterfly-garden {
		font-size: 0;
	}

	.dropIt {
		opacity: 0.5;
	}
</style>
