<script lang="ts">
	import { TRACKLIST } from '$lib/tracklist';
	import Track from './track.svelte';

	let discCoverImage: string = $state('/lar/marquee.png');
	let insanityFactor = $state(0);
	let tracks: string[] = $state(TRACKLIST);

	const sanity = () => {
		const event = new CustomEvent('pirates_and_traitors', { detail: 'KTA' });
		document.dispatchEvent(event);

		insanityFactor = 0;
	};

	const onPlayTrack = (track: string) => {
		console.log('child played', track);

		insanityFactor++;

		if (track.includes('bonus_')) {
			discCoverImage = '/lar/20.png';
		} else {
			discCoverImage = '/lar/marquee.png';
		}
	};

	const onEndTrack = (track: string) => {
		insanityFactor--;
	};
</script>

<div class="p-5">
	<div class="block lg:flex">
		<div>
			<img src={discCoverImage} alt="Pitchaw on da 20" class="h-96 object-contain lg:h-256" />
		</div>

		<div class="ml-5">
			{#each tracks as track}
				<Track {track} {onPlayTrack} {onEndTrack} />
			{/each}
		</div>
	</div>

	{#if insanityFactor > 2}
		<div class="mt-5">
			<div>
				Insanity Factor: {insanityFactor}
				<button onclick={sanity} class="ml-3 bg-orange-100 p-2 text-black">Make It Stop</button>
			</div>
		</div>
	{/if}
</div>

<style scoped>
</style>
