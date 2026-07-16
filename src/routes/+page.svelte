<script lang="ts">
	import { TREASURE_TROVE } from '$lib/cetlist';
	import { ALBUM_ART, ALBUM_TITLES, jukebawx } from '$lib/player.svelte';
	import { trackDuration } from '$lib/durations.svelte';
	import { formatTime, formatTrack } from '$lib/utilz';

	const KEYS = ['DEMON', 'BONUS', 'SEVEN', 'CLICES'];

	let activeAlbum = $state('DEMON');

	const albumTracks = $derived(TREASURE_TROVE[activeAlbum] ?? []);
	const albumIsPlaying = $derived(jukebawx.album == activeAlbum && !jukebawx.paused);

	const clickHeaderPlay = () => {
		if (jukebawx.album == activeAlbum && jukebawx.track) {
			jukebawx.togglePause();
		} else {
			jukebawx.playAlbum(activeAlbum);
		}
	};

	const clickTrack = (index: number) => {
		if (jukebawx.track == albumTracks[index]) {
			jukebawx.togglePause();
		} else {
			jukebawx.playTrack(activeAlbum, index);
		}
	};
</script>

<div class="p-5 lg:flex lg:gap-10">
	<!-- Cover art + album picker -->
	<div class="mx-auto w-full max-w-xl shrink-0 lg:mx-0 lg:w-[480px]">
		<img
			src={ALBUM_ART[activeAlbum]}
			alt={ALBUM_TITLES[activeAlbum] ?? activeAlbum}
			class="aspect-square w-full rounded-lg object-cover shadow-2xl"
		/>

		<div class="mt-4 flex gap-3">
			{#each KEYS as key (key)}
				<button
					aria-label={`Album ${key}`}
					title={ALBUM_TITLES[key] ?? key}
					onclick={() => (activeAlbum = key)}
					class="relative aspect-square w-20 overflow-hidden rounded transition-opacity"
					class:ring-2={activeAlbum == key}
					class:ring-yellow-400={activeAlbum == key}
					class:opacity-50={activeAlbum != key}
					class:hover:opacity-100={activeAlbum != key}
				>
					<img
						src={ALBUM_ART[key]}
						alt={ALBUM_TITLES[key] ?? key}
						class="h-full w-full object-cover"
					/>

					{#if jukebawx.album == key && jukebawx.track}
						<span
							class="absolute right-1 bottom-1 rounded-full bg-black/70 px-1.5 text-xs text-yellow-400"
							title="Now playing"
						>
							♪
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- Track list -->
	<div class="mt-8 w-full max-w-2xl lg:mt-0">
		<div class="text-xs tracking-[0.3em] text-slate-400">ALBUM</div>
		<h1 class="mt-1 text-4xl font-bold uppercase">{ALBUM_TITLES[activeAlbum] ?? activeAlbum}</h1>
		<div class="mt-1 text-slate-400">{albumTracks.length} tracks</div>

		<button
			onclick={clickHeaderPlay}
			class="mt-5 inline-flex items-center gap-2 rounded-full bg-yellow-500 px-6 py-2 font-bold text-black hover:bg-yellow-400"
		>
			{#if albumIsPlaying}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="size-5"
				>
					<path
						d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z"
					/>
				</svg>
				PAUSE
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="size-5"
				>
					<path
						d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z"
					/>
				</svg>
				PLAY
			{/if}
		</button>

		<div class="mt-6 divide-y divide-slate-800 border-t border-b border-slate-800">
			{#each albumTracks as filename, i (filename)}
				{@const current = jukebawx.track == filename}
				<button
					onclick={() => clickTrack(i)}
					class="group flex w-full items-center gap-4 px-3 py-3 text-left hover:bg-slate-800/60"
					class:text-yellow-400={current}
				>
					<span class="flex w-8 shrink-0 items-center justify-end">
						{#if current && !jukebawx.paused}
							<!-- Playing: lil equalizer, pause on hover -->
							<span
								class="eq inline-flex h-4 items-end gap-[2px] group-hover:hidden"
								aria-hidden="true"
							>
								<i></i><i></i><i></i>
							</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="hidden size-4 group-hover:inline"
							>
								<path
									d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z"
								/>
							</svg>
						{:else if current}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="size-4"
							>
								<path
									d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z"
								/>
							</svg>
						{:else}
							<span class="text-slate-500 tabular-nums group-hover:hidden">{i + 1}</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="hidden size-4 text-slate-300 group-hover:inline"
							>
								<path
									d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z"
								/>
							</svg>
						{/if}
					</span>

					<span class="grow truncate">{formatTrack(filename)}</span>

					<span class="shrink-0 text-sm text-slate-500 tabular-nums">
						{formatTime(trackDuration(filename) ?? NaN)}
					</span>
				</button>
			{/each}
		</div>

		<div class="mt-8 flex flex-col gap-2">
			<a href="/wtc" class="text-yellow-500 hover:underline">What The C?...</a>
			<a href="/but_dance" class="text-yellow-500 hover:underline">
				Butterfly Dance &mdash; watch a flock dance to da music
			</a>
		</div>
	</div>
</div>

<style scoped>
	.eq i {
		display: block;
		width: 3px;
		background: currentColor;
		animation: eq-bounce 0.8s ease-in-out infinite;
	}

	.eq i:nth-child(2) {
		animation-delay: 0.25s;
	}

	.eq i:nth-child(3) {
		animation-delay: 0.5s;
	}

	@keyframes eq-bounce {
		0%,
		100% {
			height: 30%;
		}
		50% {
			height: 100%;
		}
	}
</style>
