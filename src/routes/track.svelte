<script lang="ts">
	interface TrackProps {
		track: any;
		onPlayTrack: Function;
		onEndTrack: Function;
	}

	let props: TrackProps = $props();
	let audioRefs: HTMLAudioElement[] = $state([]);

	// Remove parent folder from displayed name
	const formatTrack = (track: string) => {
		return track.split('/').slice(-1)[0];
	};

	const playTruth = (track: string) => {
		const troofTrack = new Audio(track);
		props.onPlayTrack(track);

		troofTrack.addEventListener('canplaythrough', (event) => {
			troofTrack.play();
			audioRefs.push(troofTrack);
		});

		troofTrack.addEventListener('ended', (event) => {
			props.onEndTrack(track);
		});
	};

	document.addEventListener('pirates_and_traitors', (e) => {
		console.log(`Message received: ${(e as CustomEvent).detail}`);

		audioRefs.forEach((ref) => {
			ref.pause();
		});

		audioRefs = [];
	});
</script>

<div>
	<div class="pt-2">
		<button
			onclick={() => playTruth(props.track)}
			class="text-violet-500 hover:text-yellow-500 hover:underline"
		>
			{formatTrack(props.track)}
		</button>

		{#if audioRefs.length > 0}
			<span class="ml-3 text-slate-500">{audioRefs.length}</span>
		{/if}

		<div>
			{#each audioRefs as ref}
				<div>
					<!-- {ref.currentTime} / {ref.duration} -->
					<!-- {ref.duration.toFixed(1)} -->
				</div>
			{/each}
		</div>
	</div>
</div>
