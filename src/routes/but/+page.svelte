<script lang="ts">
	import { random } from 'lodash';

	let audioElm: HTMLAudioElement;
	let woahing = $state(false);
	let moodyCount = $state(0);
	let dreams = $state(0);

	let dreamsElm: HTMLDivElement;

	let dreamsQueue: HTMLAudioElement[] = $state([]);

	let lastDream: number | null = $state(null);

	$effect(() => {
		if (!dreamsElm) {
			return;
		}

		dreamsElm.style.width = dreams * 10 + '%';
	});

	const forceAudio = () => {
		if (audioElm && audioElm.paused) {
			audioElm.play();
		} else {
			if (dreams >= 10) {
				return;
			}

			const dreamsTrack = new Audio('/butts/dreams.mp3');
			if (dreams > 0) {
				dreamsQueue.push(dreamsTrack);
			} else {
				dreamsTrack.play();
				lastDream = Date.now();
			}

			dreams++;

			dreamsTrack.addEventListener('ended', () => {
				dreams--;
			});
		}
	};

	setInterval(() => {
		if (audioElm?.paused) {
			return;
		}

		if (dreamsQueue.length > 0) {
			if (Date.now() - (lastDream || 0) >= 5000) {
				let dreamTrack = dreamsQueue.shift();
				console.log(`Dripping in a queued dream.`);
				dreamTrack?.play();
				lastDream = Date.now();
			}
		}

		if (!woahing && random(1, 255) == 255) {
			const woah = new Audio('/butts/woah.mp3');
			woahing = true;
			woah.play();

			woah.addEventListener('ended', () => {
				woahing = false;
			});

			console.log(new Date(), 'added woah');
		}

		if (random(1, 69) == 69) {
			console.log(new Date(), 'added pullin flow');

			const pullingBiggest = new Audio('/butts/pullin_doublexl.mp3');
			pullingBiggest.play();

			pullingBiggest.addEventListener('ended', () => {
				const pullinLarge = new Audio('/butts/pullin_large.mp3');
				pullinLarge.play();
			});
		}

		if (random(1, 69) == 69) {
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

<svelte:head>
	<title>
		{woahing ? 'WOOOOOOOOOOOAH' : "Butterfly C'anctuary"}
	</title>
	<meta name="description" content="Woooooooooah" />
</svelte:head>

<div class="butterfly-garden relative bg-slate-900">
	<audio src="/butts/JGE.mp3" loop class="absolute top-5 left-5" autoplay bind:this={audioElm}
	></audio>

	{#if moodyCount > 0}
		<div class="absolute top-5 left-5 text-2xl text-slate-500">
			{moodyCount}
		</div>
	{/if}

	<div class="absolute right-5 bottom-5 text-lg text-slate-500">2025-04-11 1:27pm</div>

	<div bind:this={dreamsElm} class="absolute top-100 left-0 h-4 bg-red-500"></div>

	{#if woahing}
		<div class="absolute top-1/2 left-1/3 text-7xl text-red-500">WOOOOOOOOOOAH</div>
	{/if}

	<button onclick={forceAudio}>
		<img src="/butts/image.webp" alt="Butterfly" class:pulse={woahing} />
	</button>
</div>

<style scoped>
	.butterfly-garden {
		font-size: 0;
	}
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
