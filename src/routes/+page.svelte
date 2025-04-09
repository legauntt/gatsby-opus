<script lang="ts">
	import { TRACKLIST } from '$lib/tracklist';

	let audioRefs: HTMLAudioElement[] = $state([]);
	let discCoverImage: string = $state('/lar/marquee.png');

	let playCounts: any = $state({});

	// Remove parent folder from displayed name
	const formatTrack = (track: string) => {
		return track.split('/').slice(-1)[0];
	};

	const playTruth = (track: string) => {
		const troof = new Audio(track);

		if (playCounts[track]) {
			playCounts[track]++;
		} else {
			playCounts[track] = 1;
		}

		if (track.includes('bonus_')) {
			discCoverImage = '/lar/20.png';
		} else {
			discCoverImage = '/lar/marquee.png';
		}

		troof.addEventListener('canplaythrough', (event) => {
			troof.play();
			audioRefs = [...audioRefs, troof];
		});

		troof.addEventListener('ended', (event) => {
			playCounts[track]--;
		});
	};

	const sanity = () => {
		audioRefs.forEach((ref) => {
			ref?.pause();
		});

		audioRefs = [];
		playCounts = {};
	};
</script>

<div class="p-5">
	<div class="block lg:flex">
		<div>
			<img src={discCoverImage} alt="Pitchaw on da 20" class="h-96 object-contain lg:h-256" />
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

					{#if playCounts[track] > 0}
						<span class="ml-3 text-slate-500">{playCounts[track]}</span>
					{/if}
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
