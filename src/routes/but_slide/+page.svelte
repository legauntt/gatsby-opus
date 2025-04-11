<script lang="ts">
	import { SLOW_C as tracklist } from '$lib/tracklist';
	import dayjs from 'dayjs';
	import Stool from './stool.svelte';

	interface IClice {
		audioFile: string;
		label: string;
		paused: boolean;
		duration: number;
		currentTime: number;
		volume: number;
		muted: boolean;
	}

	let selectedTrack = $state('/butts/ambience.mp3');
	let clices: IClice[] = $state([]);
	let logs: string[] = $state([]);

	let editorState = $state('editing');
	const formatTrack = (track: string) => {
		return track.split('/').slice(-1)[0];
	};

	const addTrack = () => {
		clices.push({
			audioFile: selectedTrack,
			label: formatTrack(selectedTrack),
			paused: true,
			duration: NaN,
			currentTime: 0,
			volume: 1,
			muted: false
		});
	};

	const startInsanity = () => {
		editorState = 'playing';
		logIt('Started the insanity...');
	};

	const endInsanity = () => {
		editorState = 'editing';
		logIt('Ended the insanity...');
	};

	const logIt = (mess: string) => {
		logs.push(dayjs().format('h:mm:ss A') + ': ' + mess);
	};

	const onTogglePause = (entry: IClice) => {
		entry.paused = !entry.paused;
	};
</script>

<svelte:head>
	<title>Garden Sim</title>
	<meta name="description" content="Woooooooooah" />
</svelte:head>

<div class="butterfly-garden relative bg-slate-900 xl:flex">
	<img class="xl:h-[100vh]" src="/butts/image.webp" alt="Butterfly" />

	<div class="w-full border border-solid border-black p-5 text-lg">
		{#if editorState == 'editing'}
			<select
				class="border border-solid border-slate-500 bg-black p-2 align-middle"
				bind:value={selectedTrack}
			>
				{#each tracklist as track}
					<option value={track}>{formatTrack(track)}</option>
				{/each}
			</select>

			<button class="align-middle text-green-500" aria-label="Add track" onclick={addTrack}>
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

			<div class="mt-5">
				{#each clices as entry}
					<audio
						src={entry.audioFile}
						bind:duration={entry.duration}
						bind:currentTime={entry.currentTime}
						bind:paused={entry.paused}
						bind:volume={entry.volume}
						bind:muted={entry.muted}
					></audio>
					<Stool
						{...entry}
						onTogglePause={() => onTogglePause(entry)}
						onSeek={() => {}}
					/>
				{/each}
			</div>

			{#if clices.length > 0}
				<div class="mt-5">
					<button class="bg-orange-700 p-2" onclick={startInsanity}> Aw let aw blow </button>
				</div>
			{/if}

			<div class="absolute bottom-5 left-5 text-lg text-slate-500">2025-04-11 latenightradio</div>
		{:else}
			<div class="bg-slate-500 p-2 text-black">
				{#each logs as log}
					<div>
						{log}
					</div>
				{/each}
			</div>
			<div class="mt-5">
				<button class="bg-amber-950 p-2" onclick={endInsanity}>Go Back</button>
			</div>
		{/if}
	</div>
</div>

<style scoped>
	.butterfly-garden {
		font-size: 0;
	}
</style>
