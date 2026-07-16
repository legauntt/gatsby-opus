<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
	import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
	import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
	import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
	import toast from 'svelte-5-french-toast';

	import { jukebawx, ALBUM_TITLES } from '$lib/player.svelte';
	import { TREASURE_TROVE } from '$lib/cetlist';
	import { formatTrack } from '$lib/utilz';
	import { Flock, type AudioFrame } from './choreography';

	const KEYS = ['DEMON', 'BONUS', 'SEVEN', 'CLICES'];
	const LEARNED_KEY = 'tct_but_dance_learned';
	const N_BUTTERFLIES = 34;
	const MODEL_SCALE = 13; // GLB is ~0.1u wide; scale so wingspan reads big

	// svelte-ignore non_reactive_update
	let container: HTMLDivElement;
	// svelte-ignore non_reactive_update
	let audioEl: HTMLAudioElement;

	let album = $state('DEMON');
	let index = $state(0);
	let dancing = $state(false); // audio playing
	let started = $state(false); // audio graph built at least once
	let loadingGlb = $state(true);
	let loadError = $state(false);
	let showHelp = $state(false);
	let formationName = $state('');

	const tracks = $derived(TREASURE_TROVE[album] ?? []);
	const track = $derived(tracks[index] ?? '');

	// Web Audio -- page-local, built on the first user gesture
	let ctx: AudioContext | null = null;
	let srcNode: MediaElementAudioSourceNode | null = null;
	let analyser: AnalyserNode | null = null;
	let freq: Uint8Array = new Uint8Array(0);

	// shared with the render loop
	const audioFrame: AudioFrame = {
		bass: 0,
		mids: 0,
		treble: 0,
		energy: 0,
		beat: false,
		beatStrength: 0,
		live: false
	};
	const runningMax = { bass: 0.2, mids: 0.2, treble: 0.2 };
	const bassHistory: number[] = [];
	let lastBeat = -1;

	const dismissHelp = () => {
		showHelp = false;
		try {
			localStorage.setItem(LEARNED_KEY, 'yeh');
		} catch {
			// no storage -- they'll just meet the tutorial again, survivable
		}
	};

	const pickAlbum = (k: string) => {
		album = k;
		index = 0;
	};

	const startDance = async () => {
		jukebawx.paused = true; // da dance is its own soundscape (but_slide precedent)
		if (!ctx) ctx = new AudioContext();
		await ctx.resume(); // user gesture: required on iOS/Chrome
		if (!srcNode) {
			// createMediaElementSource is ONE-SHOT per element -- guard it
			srcNode = ctx.createMediaElementSource(audioEl);
			analyser = ctx.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.75;
			freq = new Uint8Array(analyser.frequencyBinCount);
			srcNode.connect(analyser);
			analyser.connect(ctx.destination); // skip this and the page is SILENT
		}
		try {
			await audioEl.play();
			dancing = true;
			started = true;
		} catch (e) {
			toast.error('No play? Damn shame');
			console.error(e);
		}
	};

	const togglePlay = async () => {
		if (!started) return startDance();
		if (dancing) {
			audioEl.pause();
			dancing = false;
		} else {
			jukebawx.paused = true;
			await ctx?.resume();
			await audioEl.play();
			dancing = true;
		}
	};

	const nextTrack = () => {
		index = (index + 1) % (tracks.length || 1);
		if (started) queueMicrotask(() => audioEl.play().catch(() => {}));
	};

	const onEnded = () => {
		// Loop forever -- a dance video shouldn't just stop (see memory note)
		index = (index + 1) % (tracks.length || 1);
		queueMicrotask(() => audioEl.play().catch(() => {}));
	};

	/** Pull the current audio features into audioFrame (called each frame). */
	const sampleAudio = (dt: number) => {
		if (!analyser || !dancing) {
			// ease everything toward idle
			audioFrame.bass *= 0.9;
			audioFrame.mids *= 0.9;
			audioFrame.treble *= 0.9;
			audioFrame.energy *= 0.9;
			audioFrame.beat = false;
			audioFrame.live = false;
			return;
		}
		analyser.getByteFrequencyData(freq);
		const bandRaw = (lo: number, hi: number) => {
			let s = 0;
			for (let i = lo; i < hi; i++) s += freq[i];
			return s / (hi - lo) / 255;
		};
		const norm = (key: 'bass' | 'mids' | 'treble', raw: number) => {
			runningMax[key] = Math.max(raw, runningMax[key] * 0.9995, 0.12);
			return Math.min(1, raw / runningMax[key]);
		};
		const bassR = bandRaw(1, 8);
		const midsR = bandRaw(12, 90);
		const trebR = bandRaw(100, 400);
		audioFrame.bass = norm('bass', bassR);
		audioFrame.mids = norm('mids', midsR);
		audioFrame.treble = norm('treble', trebR);
		audioFrame.energy = audioFrame.energy * 0.85 + (bassR + midsR + trebR) / 3 * 0.15;
		audioFrame.live = bassR + midsR + trebR > 0.02;

		// beat detection: bass energy vs rolling average
		bassHistory.push(bassR);
		if (bassHistory.length > 43) bassHistory.shift();
		const avg = bassHistory.reduce((s, v) => s + v, 0) / bassHistory.length;
		const now = performance.now();
		audioFrame.beat = false;
		if (bassR > avg * 1.32 && bassR > 0.22 && now - lastBeat > 190) {
			audioFrame.beat = true;
			audioFrame.beatStrength = Math.min(4, (bassR - avg) / (avg + 0.01));
			lastBeat = now;
			document.dispatchEvent(new CustomEvent('butterfly_fwoosh')); // house event contract
		}
	};

	onMount(() => {
		try {
			showHelp = !localStorage.getItem(LEARNED_KEY);
		} catch {
			// no storage, no first-visit detection -- leave it closed
		}

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		// Neutral tone mapping keeps the monarch orange saturated (ACES washes
		// bright oranges toward white); still tames highlights so wings don't blow out.
		renderer.toneMapping = THREE.NeutralToneMapping;
		renderer.toneMappingExposure = 1.0;
		container.appendChild(renderer.domElement);
		renderer.domElement.style.display = 'block';
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';

		const scene = new THREE.Scene();

		// gradient backdrop (dusk garden) via a CanvasTexture
		const bgCanvas = document.createElement('canvas');
		bgCanvas.width = 8;
		bgCanvas.height = 256;
		const bgg = bgCanvas.getContext('2d')!;
		const grad = bgg.createLinearGradient(0, 0, 0, 256);
		grad.addColorStop(0, '#243b6b');
		grad.addColorStop(0.45, '#3a4a7a');
		grad.addColorStop(0.8, '#7d6f9c');
		grad.addColorStop(1, '#c99a86');
		bgg.fillStyle = grad;
		bgg.fillRect(0, 0, 8, 256);
		const bgTex = new THREE.CanvasTexture(bgCanvas);
		bgTex.colorSpace = THREE.SRGBColorSpace;
		scene.background = bgTex;
		scene.fog = new THREE.Fog(0x5a5a86, 22, 46);

		// image-based lighting for believable wing sheen
		const pmrem = new THREE.PMREMGenerator(renderer);
		const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		scene.environment = envTex;
		scene.environmentIntensity = 0.5; // dim the IBL so orange stays saturated

		const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
		camera.position.set(0, 1.6, 13);

		// lights: warm key + cool rim + soft sky fill
		const key = new THREE.DirectionalLight(0xfff1dd, 1.7);
		key.position.set(6, 9, 7);
		scene.add(key);
		const rim = new THREE.DirectionalLight(0xbcd2ff, 1.2);
		rim.position.set(-7, 4, -6);
		scene.add(rim);
		scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x40381f, 0.4));

		// drifting pollen / petal motes for the "video" ambiance
		const MOTES = 320;
		const motePos = new Float32Array(MOTES * 3);
		const moteSpd = new Float32Array(MOTES);
		for (let i = 0; i < MOTES; i++) {
			motePos[i * 3] = (Math.random() - 0.5) * 44;
			motePos[i * 3 + 1] = (Math.random() - 0.5) * 30;
			motePos[i * 3 + 2] = (Math.random() - 0.5) * 30;
			moteSpd[i] = 0.2 + Math.random() * 0.6;
		}
		const moteGeo = new THREE.BufferGeometry();
		moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
		const moteMat = new THREE.PointsMaterial({
			color: 0xffe6b0,
			size: 0.09,
			transparent: true,
			opacity: 0.55,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		const motes = new THREE.Points(moteGeo, moteMat);
		motes.frustumCulled = false;
		scene.add(motes);

		// controls: user can look; auto-orbit when idle
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.enablePan = false;
		controls.minDistance = 6;
		controls.maxDistance = 40;
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.6;
		let userActiveUntil = 0;
		controls.addEventListener('start', () => (userActiveUntil = performance.now() + 6000));

		// postprocessing: subtle bloom that breathes with the beat
		let composer: EffectComposer | null = null;
		let bloom: UnrealBloomPass | null = null;
		try {
			composer = new EffectComposer(renderer);
			composer.addPass(new RenderPass(scene, camera));
			// subtle, tasteful bloom -- high threshold so only highlights glow
			bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.5, 0.95);
			composer.addPass(bloom);
		} catch (e) {
			console.warn('bloom unavailable, falling back to direct render', e);
			composer = null;
		}

		const flock = new Flock(N_BUTTERFLIES);
		const roots: THREE.Object3D[] = [];
		const mixers: THREE.AnimationMixer[] = [];
		const wingMats: THREE.MeshStandardMaterial[] = [];
		const flockGroup = new THREE.Group();
		scene.add(flockGroup);

		new GLTFLoader()
			.loadAsync('/but_dance/monarch.glb')
			.then((gltf) => {
				const flapClip =
					gltf.animations.find((a) => /flap/i.test(a.name)) ?? gltf.animations[0];

				// collect the wing materials off the master for the treble shimmer
				gltf.scene.traverse((o) => {
					const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
					if (m && /wing/i.test(m.name)) {
						m.emissive = new THREE.Color(0xff7a2e);
						m.emissiveIntensity = 0;
						m.envMapIntensity = 0.85; // keep the orange from washing to pale under IBL
						if (!wingMats.includes(m)) wingMats.push(m);
					}
				});

				for (let i = 0; i < N_BUTTERFLIES; i++) {
					const root = skeletonClone(gltf.scene);
					root.scale.setScalar(MODEL_SCALE);
					const mixer = new THREE.AnimationMixer(root);
					const action = mixer.clipAction(flapClip);
					action.play();
					action.time = Math.random() * flapClip.duration; // desync the flock
					flockGroup.add(root);
					roots.push(root);
					mixers.push(mixer);
				}
				loadingGlb = false;
				formationName = flock.formationName;
			})
			.catch((e) => {
				console.error('Butterfly GLB failed to load', e);
				loadError = true;
				loadingGlb = false;
				toast.error('Butterfly went missing');
			});

		const resize = () => {
			const w = container.clientWidth || 1;
			const h = container.clientHeight || 1;
			renderer.setSize(w, h, false);
			composer?.setSize(w, h);
			bloom?.setSize(w, h);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		};
		const ro = new ResizeObserver(resize);
		ro.observe(container);
		resize();

		const clock = new THREE.Clock();
		const camTarget = new THREE.Vector3();
		let raf = 0;
		let shimmer = 0;

		const frame = () => {
			raf = requestAnimationFrame(frame);
			const dt = Math.min(clock.getDelta(), 1 / 30);
			const t = clock.elapsedTime;

			sampleAudio(dt);
			flock.update(dt, t, audioFrame);

			// place + orient each dancer, drive its wing mixer
			for (let i = 0; i < roots.length; i++) {
				const d = flock.dancers[i];
				roots[i].position.copy(d.pos);
				roots[i].quaternion.copy(d.quat);
				mixers[i].update(dt * d.flapRate);
			}
			if (roots.length) formationName = flock.formationName;

			// treble shimmer on the shared wing material + beat bloom breathe
			const targetShimmer = audioFrame.treble * 0.5 + (audioFrame.beat ? 0.4 : 0);
			shimmer += (targetShimmer - shimmer) * (1 - Math.exp(-6 * dt));
			// small floor keeps edge-on wings from going dead black mid-flap
			for (const m of wingMats) m.emissiveIntensity = 0.03 + shimmer * 0.12;
			if (bloom) bloom.strength = 0.16 + audioFrame.energy * 0.26 + (audioFrame.beat ? 0.1 : 0);

			// motes drift up and wrap
			const mp = moteGeo.attributes.position.array as Float32Array;
			for (let i = 0; i < MOTES; i++) {
				mp[i * 3 + 1] += moteSpd[i] * dt;
				mp[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.15;
				if (mp[i * 3 + 1] > 16) mp[i * 3 + 1] = -16;
			}
			moteGeo.attributes.position.needsUpdate = true;

			// camera: follow the flock centroid; auto-orbit unless the user grabbed it
			camTarget.lerp(flock.centroid, 1 - Math.exp(-1.5 * dt));
			controls.target.copy(camTarget);
			controls.autoRotate = performance.now() > userActiveUntil;
			controls.autoRotateSpeed = 0.4 + audioFrame.energy * 0.9;
			controls.update();

			if (composer) composer.render();
			else renderer.render(scene, camera);
		};
		raf = requestAnimationFrame(frame);

		const onVisibility = () => {
			if (document.visibilityState === 'hidden') cancelAnimationFrame(raf);
			else {
				clock.getDelta();
				raf = requestAnimationFrame(frame);
			}
		};
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener('visibilitychange', onVisibility);
			ro.disconnect();
			controls.dispose();
			audioEl?.pause();
			try {
				srcNode?.disconnect();
				analyser?.disconnect();
				ctx?.close();
			} catch {
				// context may already be gone
			}
			ctx = null;
			srcNode = null;
			analyser = null;

			scene.traverse((o) => {
				const mesh = o as THREE.Mesh;
				mesh.geometry?.dispose?.();
				const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
				for (const mat of mats) {
					if (!mat) continue;
					for (const v of Object.values(mat)) {
						if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
					}
					mat.dispose();
				}
			});
			moteGeo.dispose();
			moteMat.dispose();
			bgTex.dispose();
			envTex.dispose();
			pmrem.dispose();
			composer?.dispose?.();
			renderer.dispose();
			renderer.forceContextLoss();
			renderer.domElement.remove();
		};
	});
</script>

{#snippet icon(d: string, cls: string = 'size-5')}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class={cls}
	>
		<path stroke-linecap="round" stroke-linejoin="round" {d} />
	</svg>
{/snippet}

<svelte:head>
	<title>Butterfly Dance</title>
	<meta name="description" content="Hyper-real monarchs dancing to da music" />
</svelte:head>

<audio bind:this={audioEl} src={track} preload="auto" onended={onEnded}></audio>

<div class="relative h-[86vh] w-full overflow-hidden bg-slate-900">
	<!-- the 3D stage -->
	<div bind:this={container} class="absolute inset-0"></div>

	<!-- loading / error veil -->
	{#if loadingGlb}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="animate-pulse text-2xl text-white/80">Hatching da butterflies...</div>
		</div>
	{/if}
	{#if loadError}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="text-xl text-red-300">Couldn't load the butterfly model.</div>
		</div>
	{/if}

	<!-- top-left title + help -->
	<div class="absolute top-4 left-4 flex items-center gap-3">
		<div class="text-2xl font-bold text-white drop-shadow-lg">Butterfly Dance</div>
		<button
			aria-label="How dis works"
			title="How dis works"
			class="flex size-7 items-center justify-center rounded-full border border-solid border-white/50 text-white/80 backdrop-blur hover:border-white hover:text-white"
			onclick={() => (showHelp ? dismissHelp() : (showHelp = true))}
		>
			?
		</button>
	</div>

	<!-- top-right: live formation readout (discoverability: name what you see) -->
	{#if !loadingGlb && !loadError}
		<div
			class="absolute top-4 right-4 rounded-full bg-black/40 px-3 py-1 text-sm text-white/85 backdrop-blur"
			title="The shape the flock is dancing in right now"
		>
			{dancing ? '♪ ' : ''}{formationName}
		</div>
	{/if}

	<!-- bottom control bar -->
	<div
		class="absolute right-0 bottom-0 left-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-gradient-to-t from-black/70 to-transparent p-4"
	>
		<label class="flex items-center gap-1" title="Which album to dance to">
			<span class="text-sm text-slate-300">Album</span>
			<select
				class="rounded border border-solid border-slate-500 bg-black/70 p-1.5 text-sm text-white"
				value={album}
				onchange={(e) => pickAlbum((e.currentTarget as HTMLSelectElement).value)}
			>
				{#each KEYS as k (k)}
					<option value={k}>{ALBUM_TITLES[k] ?? k}</option>
				{/each}
			</select>
		</label>

		<label class="flex items-center gap-1" title="Which track drives the dance">
			<span class="text-sm text-slate-300">Track</span>
			<select
				class="max-w-[46vw] rounded border border-solid border-slate-500 bg-black/70 p-1.5 text-sm text-white"
				value={index}
				onchange={(e) => (index = Number((e.currentTarget as HTMLSelectElement).value))}
			>
				{#each tracks as tr, i (tr)}
					<option value={i}>{formatTrack(tr)}</option>
				{/each}
			</select>
		</label>

		<button
			class="inline-flex items-center gap-2 rounded-full bg-yellow-500 px-5 py-2 font-bold text-black hover:bg-yellow-400"
			title={started ? (dancing ? 'Pause the music' : 'Resume the music') : 'Start the music + the dance'}
			onclick={togglePlay}
		>
			{#if dancing}
				{@render icon('M15.75 5.25v13.5m-7.5-13.5v13.5', 'size-5')}
				Pause
			{:else}
				{@render icon(
					'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z',
					'size-5'
				)}
				{started ? 'Play' : 'Start the dance'}
			{/if}
		</button>

		<button
			aria-label="Next track"
			title="Skip to the next track"
			class="rounded-full border border-solid border-slate-400 p-2 text-white hover:border-white"
			onclick={nextTrack}
		>
			{@render icon('M3 5.25 12 12l-9 6.75V5.25ZM21 5.25v13.5', 'size-4')}
		</button>

		<span class="ml-auto hidden text-xs text-slate-300/90 sm:block">
			drag to look around &middot; scroll to zoom &middot; the music makes them dance
		</span>
	</div>

	<!-- first-visit tutorial (same pattern as What The C?) -->
	{#if showHelp}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
			<div class="max-w-lg rounded-xl border border-solid border-violet-500/60 bg-slate-900 p-5">
				<div class="flex items-center justify-between">
					<div class="text-xs tracking-[0.3em] text-violet-300">HOW DIS WORKS</div>
					<button aria-label="Close tutorial" class="text-slate-400 hover:text-white" onclick={dismissHelp}>
						{@render icon('M6 18 18 6M6 6l12 12', 'size-5')}
					</button>
				</div>

				<ol class="mt-3 list-decimal space-y-2 pl-5 text-slate-300">
					<li><span class="font-bold text-white">Pick an album + track</span> in the bar down bottom.</li>
					<li>
						<span class="font-bold text-white">Hit "Start the dance."</span> A flock of hyper-real monarchs
						flies to the music &mdash; wingbeats follow the treble, blooms burst on the bass, and the flock
						morphs between formations (ring, helix, figure-8, heart&hellip;) on the big beats.
					</li>
					<li>
						<span class="font-bold text-white">Look around.</span> Drag to orbit, scroll to zoom. Let go and
						the camera drifts on its own again.
					</li>
				</ol>

				<div class="mt-3 text-sm text-slate-400">
					It uses its own player, so it politely hushes da jukebawx while it dances.
				</div>

				<button
					class="mt-4 rounded-full bg-violet-600 px-4 py-1.5 font-bold hover:bg-violet-500"
					onclick={dismissHelp}
				>
					Got it
				</button>
			</div>
		</div>
	{/if}
</div>

<div class="p-4">
	<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
</div>
