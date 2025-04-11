<script lang="ts">
	import * as _ from 'lodash';

	let audioElm: HTMLAudioElement;
	let woahing = $state(false);
	let moodyCount = $state(0);

	const forceAudio = () => {
		if (audioElm && audioElm.paused) {
			audioElm.play();
		}
	};

	setInterval(() => {
		if (!woahing && _.random(1, 255) == 255) {
			const woah = new Audio('/butts/woah.mp3');
			woahing = true;
			woah.play();

			woah.addEventListener('ended', () => {
				woahing = false;
			});

			console.log(new Date(), 'added woah');
		}

		if (_.random(1, 69) == 69) {
			const moody = new Audio('/butts/moody.mp3');
			moody.play();
			moodyCount++;
			console.log(new Date(), 'added moody');

			moody.addEventListener('ended', () => {
				moodyCount--;
			});
		}
	}, 500);
</script>

<div class="relative bg-slate-900">
	<audio src="/butts/JGE.mp3" loop class="absolute top-5 left-5" autoplay bind:this={audioElm}
	></audio>

	{#if moodyCount > 0}
		<div class="absolute top-5 left-5 text-slate-500 text-2xl">
			{moodyCount}
		</div>
	{/if}

	{#if woahing}
		<div class="absolute top-1/2 left-1/3 text-7xl text-red-500">WOOOOOOOOOOAH</div>
	{/if}

	<button onclick={forceAudio}>
		<img src="/butts/image.webp" alt="Butterfly" class:pulse={woahing} />
	</button>
</div>

<style scoped>
	img {
		width: 100vw;
		height: 100vh;
		object-fit: fill;
	}

	@keyframes pulseOpacity {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
		100% {
			opacity: 1;
		}
	}

	.pulse {
		animation: pulseOpacity 2s infinite;
	}
</style>
