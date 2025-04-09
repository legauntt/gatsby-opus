<script lang="ts">
	import { TRACKLIST } from '$lib/tracklist';

	let audioRefs: HTMLAudioElement[] = $state([]);
	let surreal: string = $state('/lar/20.png');

	const formatTrack = (track: string) => {
		return track.split('/').slice(-1)[0];
	};

	setInterval(() => {
		if (surreal.includes('marquee')) {
			surreal = '/lar/20.png';
		} else {
			surreal = '/lar/marquee.png';
		}
	}, 20000);

	const playTruth = (track: string) => {
		const troof = new Audio(track);

		troof.addEventListener('canplaythrough', (event) => {
			troof.play();
			audioRefs = [...audioRefs, troof];
		});
	};

	const sanity = () => {
		audioRefs.forEach((ref) => {
			ref?.pause();
		});

		audioRefs = [];
	};
</script>

<div class="p-5">
	<div class="block lg:flex">
		<div>
			<img src={surreal} alt="Pitchaw on da 20" class="h-96 object-contain lg:h-256" />
		</div>

		<div class="ml-5">
			{#each TRACKLIST as track}
				<div class="pt-2">
					<button
						onclick={() => playTruth(track)}
						class="text-violet-500 hover:text-yellow-500 hover:underline"
					>
						{formatTrack(track)}
					</button>
				</div>
			{/each}
		</div>
	</div>

	<div>
		{#if audioRefs.length > 2}
			<div class="mt-5">
				<div>
					Insanity Factor: {audioRefs.length}
					<button onclick={sanity} class="ml-3 bg-orange-100 p-2 text-black">Make It Stop</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style scoped>
</style>
