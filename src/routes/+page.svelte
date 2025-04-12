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

	<div class="mt-5">
		<div>
			<a
				target="_blank"
				class="text-yellow-300 hover:underline"
				href="/wtc?t=02_glosky&s=173&l=5&title=8x10%20glosky">Glowsky</a
			>
		</div>
		<div>
			<a
				target="_blank"
				class="text-yellow-300 hover:underline"
				href="/wtc?t=06_someday&s=7&l=3.2&title=A%20pink%20slip">A Pink Slip</a
			>
		</div>

		<!-- <div>
		<a href="/but" class="text-red-300 hover:underline">Heh</a>
	</div> -->

		<div>
			<a href="/but_slide" class="text-red-300 hover:underline">Heh (Heh)</a>
		</div>
	</div>
</div>

<style scoped>
</style>
