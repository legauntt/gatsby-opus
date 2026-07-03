<script lang="ts">
	import { onMount } from 'svelte';
	import Wavey from '$lib/comps/wavey.svelte';
	import { jukebawx } from '$lib/player.svelte';
	import { formatTrack } from '$lib/utilz';

	interface IGloskyProps {
		filename: string;
		onPlayTrack: Function;
		onPauseTrack: Function;
		onEndTrack: Function;
	}

	const props: IGloskyProps = $props();

	let waves: any[] = $state([]);
	let activePlays = $state(0);

	const drawpIt = () => {
		props.onPlayTrack(props.filename);

		waves.push({
			filename: props.filename,
			startedAt: new Date(),
			paused: false,
			duration: NaN,
			currentTime: 0
		});

		activePlays++;
	};

	const onSeek = (wave: any, newValue: number) => {
		wave.currentTime = newValue;
	};

	const onTogglePause = (wave: any) => {
		wave.paused = !wave.paused;

		if (wave.paused) {
			props.onPauseTrack(props.filename);
			activePlays--;
		} else {
			props.onPlayTrack(props.filename);
			activePlays++;
		}
	};

	const onPlayTrackEvent = (e: Event) => {
		const message = (e as CustomEvent).detail;
		// console.log(`Message received:`, message);

		if (message.trackName == props.filename) {
			drawpIt();
		}
	};

	const onPiratesAndTraitors = () => {
		// console.log(`Message received: ${(e as CustomEvent).detail}`);

		waves.forEach((wave) => {
			wave.paused = true;
			wave.currentTime = 0;
		});

		waves = [];
		activePlays = 0;
	};

	onMount(() => {
		document.addEventListener('play_track', onPlayTrackEvent);
		document.addEventListener('pirates_and_traitors', onPiratesAndTraitors);

		return () => {
			document.removeEventListener('play_track', onPlayTrackEvent);
			document.removeEventListener('pirates_and_traitors', onPiratesAndTraitors);
		};
	});
</script>

<div>
	<!-- Gold border while da jukebawx is playing this one -->
	<div
		class="mb-3 w-256 border border-solid border-slate-500 p-5"
		style:border-color={jukebawx.track == props.filename ? 'gold' : ''}
	>
		<button onclick={drawpIt}>
			{formatTrack(props.filename)}
		</button>

		{#each waves as wave}
			<div class="my-2 p-2" class:active={!wave.paused}>
				<audio
					src={props.filename}
					bind:currentTime={wave.currentTime}
					bind:duration={wave.duration}
					bind:paused={wave.paused}
					onended={() => {
						props.onEndTrack(props.filename);
						activePlays--;
					}}
				></audio>

				<Wavey
					src={props.filename}
					currentTime={wave.currentTime}
					duration={wave.duration}
					paused={wave.paused}
					onSeek={(newValue: number) => onSeek(wave, newValue)}
					onTogglePause={() => onTogglePause(wave)}
				/>
			</div>
		{/each}
	</div>
</div>

<style scoped>
	.active {
		border: 1px gold solid;
	}
</style>
