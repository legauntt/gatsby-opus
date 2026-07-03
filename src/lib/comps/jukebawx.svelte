<script lang="ts">
	import { onMount } from 'svelte';
	import { ALBUM_ART, jukebawx } from '$lib/player.svelte';
	import Wavey from '$lib/comps/wavey.svelte';
	import { formatTrack } from '$lib/utilz';

	// svelte-ignore non_reactive_update
	let audioEl: HTMLAudioElement;

	const applyPendingSeek = () => {
		if (jukebawx.pendingSeek == null) {
			return;
		}

		const cap = isNaN(audioEl?.duration) ? Infinity : audioEl.duration - 1;
		jukebawx.currentTime = Math.max(Math.min(jukebawx.pendingSeek, cap), 0);
		jukebawx.pendingSeek = null;
	};

	// Belt and suspenders: when the src flips mid-album, make sure the new
	// track actually starts once it's ready.
	const resumeIfNeeded = () => {
		if (!jukebawx.paused && audioEl?.paused) {
			audioEl.play().catch((e) => console.error('No play? Damn shame', e));
		}
	};

	onMount(() => {
		jukebawx.unstash();

		const stashTick = setInterval(() => {
			if (!jukebawx.paused) {
				jukebawx.stash();
			}
		}, 5000);

		const onBye = () => jukebawx.stash();
		window.addEventListener('beforeunload', onBye);

		// Lock screen / bluetooth / car controls
		if ('mediaSession' in navigator) {
			navigator.mediaSession.setActionHandler('play', () => {
				if (jukebawx.track) {
					jukebawx.paused = false;
				}
			});
			navigator.mediaSession.setActionHandler('pause', () => {
				jukebawx.paused = true;
			});
			navigator.mediaSession.setActionHandler('previoustrack', () => jukebawx.prev());
			navigator.mediaSession.setActionHandler('nexttrack', () => jukebawx.next());
			navigator.mediaSession.setActionHandler('seekto', (details) => {
				if (details.seekTime != null) {
					jukebawx.seek(details.seekTime);
				}
			});
		}

		return () => {
			clearInterval(stashTick);
			window.removeEventListener('beforeunload', onBye);

			if ('mediaSession' in navigator) {
				navigator.mediaSession.setActionHandler('play', null);
				navigator.mediaSession.setActionHandler('pause', null);
				navigator.mediaSession.setActionHandler('previoustrack', null);
				navigator.mediaSession.setActionHandler('nexttrack', null);
				navigator.mediaSession.setActionHandler('seekto', null);
			}
		};
	});

	$effect(() => {
		if (!jukebawx.track || !('mediaSession' in navigator)) {
			return;
		}

		navigator.mediaSession.metadata = new MediaMetadata({
			title: formatTrack(jukebawx.track),
			artist: 'Tony C and the Truth',
			album: jukebawx.album,
			artwork: [{ src: ALBUM_ART[jukebawx.album] ?? '/lar/20.png', sizes: '512x512' }]
		});
	});

	$effect(() => {
		if (!('mediaSession' in navigator)) {
			return;
		}

		navigator.mediaSession.playbackState = jukebawx.track
			? jukebawx.paused
				? 'paused'
				: 'playing'
			: 'none';

		if (!isNaN(jukebawx.duration) && jukebawx.duration > 0) {
			try {
				navigator.mediaSession.setPositionState({
					duration: jukebawx.duration,
					playbackRate: 1,
					position: Math.min(jukebawx.currentTime, jukebawx.duration)
				});
			} catch {
				// Some browsers are picky about position state. Not worth crashing
				// the whole bar over.
			}
		}
	});
</script>

{#if jukebawx.track}
	<div class="fixed inset-x-0 bottom-0 z-40 border-t border-solid border-slate-600 bg-slate-800 px-4 pb-2">
		<audio
			bind:this={audioEl}
			src={jukebawx.track}
			preload="metadata"
			bind:currentTime={jukebawx.currentTime}
			bind:duration={jukebawx.duration}
			bind:paused={jukebawx.paused}
			onloadedmetadata={applyPendingSeek}
			oncanplay={resumeIfNeeded}
			onended={() => jukebawx.next()}
		></audio>

		<div class="flex items-center gap-3">
			<img
				src={ALBUM_ART[jukebawx.album] ?? '/lar/20.png'}
				alt="Pitchaw of da album"
				class="hidden h-14 w-14 rounded object-cover md:block"
			/>

			<div class="w-44 shrink-0">
				<div class="truncate font-bold">{formatTrack(jukebawx.track)}</div>
				<div class="truncate text-sm text-slate-400">
					{jukebawx.album} &middot; {jukebawx.index + 1} / {jukebawx.queue.length}
				</div>
			</div>

			<button aria-label="Previous track" title="Previous track" onclick={() => jukebawx.prev()}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-7"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z"
					/>
				</svg>
			</button>

			<Wavey
				src={jukebawx.track}
				currentTime={jukebawx.currentTime}
				duration={jukebawx.duration}
				paused={jukebawx.paused}
				onSeek={(newTime: number) => jukebawx.seek(newTime)}
				onTogglePause={() => jukebawx.togglePause()}
			/>

			<button aria-label="Next track" title="Next track" onclick={() => jukebawx.next()}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-7"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z"
					/>
				</svg>
			</button>
		</div>
	</div>
{/if}
