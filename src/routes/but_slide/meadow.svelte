<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Da meadow: butterflies over the garden while the insanity plays.
	 *
	 * Built as the seed of the walking simulator (see ROADMAP.md):
	 * - Flutterbys live in WORLD coordinates (0..100 on both axes), never
	 *   screen coordinates.
	 * - A camera {x, y} maps world -> screen. Today it's pinned at the
	 *   origin; tomorrow WASD / drag moves it and this file doesn't care.
	 * - Depth (z, 0..1) already scales size and drift speed, so parallax
	 *   is one multiply away when the camera starts moving.
	 *
	 * The spawner talks to us the house way: a 'butterfly_fwoosh' document
	 * event per spawned sound sends a lil burst of extra butterflies.
	 */

	interface IFlutterBy {
		id: number;
		x: number; // world coords, 0..100
		y: number;
		z: number; // depth 0..1: far and small -> near and beeg
		vx: number;
		vy: number;
		wobble: number; // phase for the sine flutter
		hue: number; // hue-rotate degrees for variety
		ttl: number | null; // frames left for burst flutterbys; ambient live forever
	}

	const AMBIENT_COUNT = 10;
	const BURST_COUNT = 4;
	const BURST_TTL = 420; // ~7s at 60fps

	let flutterbys: IFlutterBy[] = $state([]);
	let camera = $state({ x: 0, y: 0 }); // future: walking moves this

	let nextId = 0;

	const hatch = (ttl: number | null = null): IFlutterBy => ({
		id: nextId++,
		x: Math.random() * 100,
		y: 20 + Math.random() * 75,
		z: Math.random(),
		vx: (Math.random() - 0.5) * 0.12,
		vy: (Math.random() - 0.5) * 0.05,
		wobble: Math.random() * Math.PI * 2,
		hue: Math.floor(Math.random() * 360),
		ttl
	});

	const fwoosh = () => {
		for (let i = 0; i < BURST_COUNT; i++) {
			flutterbys.push(hatch(BURST_TTL));
		}

		// Spook the locals a lil
		flutterbys.forEach((b) => {
			b.vx += (Math.random() - 0.5) * 0.2;
			b.vy -= Math.random() * 0.08;
		});
	};

	onMount(() => {
		for (let i = 0; i < AMBIENT_COUNT; i++) {
			flutterbys.push(hatch());
		}

		document.addEventListener('butterfly_fwoosh', fwoosh);

		let raf = 0;
		const flap = () => {
			flutterbys = flutterbys.filter((b) => b.ttl == null || --b.ttl > 0);

			flutterbys.forEach((b) => {
				b.wobble += 0.06 + b.z * 0.04;

				// Gentle wander, closer ones drift faster (proto-parallax)
				b.x += b.vx * (0.5 + b.z);
				b.y += b.vy * (0.5 + b.z) + Math.sin(b.wobble) * 0.06;

				// Calm back down after a fwoosh
				b.vx *= 0.995;
				b.vy *= 0.995;

				// Wrap around the world instead of flying off it
				if (b.x < -5) b.x = 105;
				if (b.x > 105) b.x = -5;
				if (b.y < 5) b.y = 5;
				if (b.y > 98) b.y = 98;
			});

			raf = requestAnimationFrame(flap);
		};
		raf = requestAnimationFrame(flap);

		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener('butterfly_fwoosh', fwoosh);
		};
	});
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
	{#each flutterbys as b (b.id)}
		<div
			data-flutterby
			class="absolute"
			style:left="{b.x - camera.x}%"
			style:top="{b.y - camera.y}%"
			style:font-size="{14 + b.z * 22}px"
			style:filter="hue-rotate({b.hue}deg) saturate(1.4)"
			style:opacity={b.ttl != null && b.ttl < 60 ? b.ttl / 60 : 0.9}
		>
			<span class="flapper inline-block" style:animation-delay="{-b.wobble}s">🦋</span>
		</div>
	{/each}
</div>

<style scoped>
	.flapper {
		animation: flap 0.5s ease-in-out infinite alternate;
	}

	@keyframes flap {
		from {
			transform: scaleX(1) rotate(-8deg);
		}
		to {
			transform: scaleX(0.55) rotate(8deg);
		}
	}
</style>
