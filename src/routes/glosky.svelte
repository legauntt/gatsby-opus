<script lang="ts">
	import Wavey from '$lib/comps/wavey.svelte';
	import { formatTrack } from '$lib/utilz';

	interface IGloskyProps {
		filename: string;
		onPlayTrack: Function;
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
	};

	document.addEventListener('pirates_and_traitors', (e) => {
		console.log(`Message received: ${(e as CustomEvent).detail}`);

		waves.forEach((wave) => {
			wave.paused = true;
		});

		waves = [];
		activePlays = 0;
	});
</script>

<div>
	<div class="mb-3 w-256 border border-solid border-slate-500 p-5" class:active={activePlays > 0}>
		<button onclick={drawpIt}>
			{formatTrack(props.filename)}
		</button>

		{#each waves as wave}
			<div>
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
