<script lang="ts">
	import { TREASURE_TROVE } from '$lib/cetlist';
	import Glosky from './glosky.svelte';

	const KEYS = ['DEMON', 'BONUS', 'SEVEN', 'CLICES'];

	let discCoverImage: string = $state('/lar/marquee.png');
	let insanityFactor = $state(0);
	let activeTab = $state('DEMON');

	let activePlaysByTab: any = $state({});

	KEYS.forEach((key) => {
		activePlaysByTab[key] = 0;
	});

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
						class="mr-3 bg-slate-500 p-2"
						class:active={activeTab == tab}
						onclick={() => clickTab(tab)}
					>
						{tab}
						{#if activePlaysByTab[tab] > 0}
							({activePlaysByTab[tab]})
						{/if}
					</button>
				{/each}

				{#if insanityFactor > 2}
					<button onclick={sanity} class="ml-3 bg-violet-500 p-2 text-white"
						>Make It Stop ({insanityFactor})</button
					>
				{/if}
			</div>

			<div class="mt-5">
				{#each KEYS as key}
					<div class:hidden={activeTab != key}>
						{#each (TREASURE_TROVE as any)[key] as filename}
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
