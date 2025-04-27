<script lang="ts">
	import { TREASURE_TROVE } from '$lib/cetlist';
	import { tick } from 'svelte';
	import Glosky from './glosky.svelte';

	const KEYS = ['DEMON', 'BONUS', 'SEVEN', 'CLICES'];

	let discCoverImage: string = $state('/lar/marquee.png');
	let insanityFactor = $state(0);
	let activeTab = $state('DEMON');

	let activePlaysByTab: any = $state({});

	let playingAlbum = $state('');
	let playingTrackNum = $state(0);

	KEYS.forEach((key) => {
		activePlaysByTab[key] = 0;
	});

	const playAlbum = async (album: string) => {
		sanity();
		await tick();
		
		playingAlbum = album;
		playingTrackNum = 0;
		const trackName = TREASURE_TROVE[album][playingTrackNum];

		const event = new CustomEvent('play_track', {
			detail: {
				trackName
			}
		});

		document.dispatchEvent(event);
	};

	const sanity = () => {
		const event = new CustomEvent('pirates_and_traitors', { detail: 'KTA' });
		document.dispatchEvent(event);

		insanityFactor = 0;

		KEYS.forEach((key) => {
			activePlaysByTab[key] = 0;
		});
	};

	const onPlayTrack = (tab: string, track: string) => {
		insanityFactor++;
		activePlaysByTab[tab]++;
	};

	const onPauseTrack = (tab: string, track: string) => {
		insanityFactor--;
		activePlaysByTab[tab]--;
	};

	const onEndTrack = (tab: string, track: string) => {
		insanityFactor--;
		activePlaysByTab[tab]--;

		playingTrackNum++;
		const trackName = TREASURE_TROVE[playingAlbum][playingTrackNum];
		if (!trackName) {
			console.log(`Album ended`);
			return;
		}

		const event = new CustomEvent('play_track', {
			detail: {
				trackName
			}
		});

		document.dispatchEvent(event);
	};

	const clickTab = (tabName: string) => {
		activeTab = tabName;

		if (tabName.includes('BONUS')) {
			discCoverImage = '/lar/20.png';
		} else if (tabName.includes('CLICES')) {
			discCoverImage = '/lar/but.webp';
		} else if (tabName.includes('SEVEN')) {
			discCoverImage = '/lar/seven.png';
		} else {
			discCoverImage = '/lar/marquee.png';
		}
	};
</script>

<div class="p-5">
	<div class="block xl:flex">
		<div>
			<img src={discCoverImage} alt="Pitchaw on da 20" class="w-[1200px] object-contain lg:h-256" />
		</div>

		<div>
			<div>
				{#each KEYS as tab}
					<button
						class="bg-slate-500 p-2 align-middle"
						class:mr-3={activeTab != tab}
						class:active={activeTab == tab}
						onclick={() => clickTab(tab)}
					>
						{tab}
						{#if activePlaysByTab[tab] > 0}
							({activePlaysByTab[tab]})
						{/if}
					</button>

					{#if activeTab == tab}
						<button
							aria-label="Play album"
							title="Play album"
							onclick={() => playAlbum(tab)}
							class="mr-3 border border-solid border-blue-400 bg-blue-500 p-2 align-middle text-white"
						>
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
									d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
								/>
							</svg>
						</button>
					{/if}
				{/each}

				{#if insanityFactor > 2}
					<button onclick={sanity} class="ml-3 bg-violet-500 p-2 text-white"
						>Make It Stop ({insanityFactor})</button
					>
				{/if}
			</div>

			<div class="mt-5">
				{#each KEYS as key}
					<!-- Each album-->
					<div class:hidden={activeTab != key}>
						{#each TREASURE_TROVE[key] as filename}
							<Glosky
								{filename}
								onPlayTrack={(track: string) => onPlayTrack(key, track)}
								onPauseTrack={(track: string) => onPauseTrack(key, track)}
								onEndTrack={(track: string) => onEndTrack(key, track)}
							/>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style scoped>
	.active {
		background: orangered;
	}

	.hidden {
		visibility: none;
	}
</style>
