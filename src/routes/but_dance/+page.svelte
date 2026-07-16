<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
	import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
	import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
	import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
	import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
	import toast from 'svelte-5-french-toast';

	import { jukebawx, ALBUM_TITLES } from '$lib/player.svelte';
	import { TREASURE_TROVE } from '$lib/cetlist';
	import { formatTrack } from '$lib/utilz';
	import { Flock, type AudioFrame } from './choreography';

	import { createBiome, type Biome } from '$lib/walk/biome';
	import {
		createAvatar,
		DEFAULT_CUSTOM,
		randomCustom,
		SKIN_TONES,
		HAIR_STYLES,
		type Avatar,
		type AvatarCustom
	} from '$lib/walk/avatar';
	import { createController, type Controller } from '$lib/walk/controller';
	import { NetSession, type NetStatus } from '$lib/walk/net';
	import { RemoteAvatars } from '$lib/walk/remotes';

	const KEYS = ['DEMON', 'BONUS', 'SEVEN', 'CLICES'];
	const LEARNED_KEY = 'tct_but_dance_walk_learned'; // bumped: re-onboard to walk controls
	const AVATAR_KEY = 'tct_but_dance_avatar';
	const NAME_KEY = 'tct_but_dance_name';
	const N_BUTTERFLIES = 40;
	const MODEL_SCALE = 13; // GLB is ~0.1u wide; scale so wingspan reads big
	const FLOCK_HEIGHT = 6; // butterflies dance this high above the walker

	// svelte-ignore non_reactive_update
	let container: HTMLDivElement;
	// svelte-ignore non_reactive_update
	let audioEl: HTMLAudioElement;

	// music
	let album = $state('DEMON');
	let index = $state(0);
	let dancing = $state(false);
	let started = $state(false);
	let loadingGlb = $state(true);
	let loadError = $state(false);
	const tracks = $derived(TREASURE_TROVE[album] ?? []);
	const track = $derived(tracks[index] ?? '');

	// walk / world / ui
	let formationName = $state('');
	let view = $state<'third' | 'first'>('third');
	let locked = $state(false);
	let showHelp = $state(false);
	let showCustomize = $state(false);
	let showMultiplayer = $state(false);

	let avatarParams = $state<AvatarCustom>({ ...DEFAULT_CUSTOM });
	let playerName = $state('Denny');
	let roomCode = $state('');
	let netStatus = $state<NetStatus>('local');
	let playerCount = $state(1);

	// module handles (set in onMount; used by $effects + UI handlers)
	let controller: Controller | null = null;
	let net: NetSession | null = null;
	let localAvatar: Avatar | null = null;

	// Web Audio -- page-local, built on the first user gesture (KEEP)
	let ctx: AudioContext | null = null;
	let srcNode: MediaElementAudioSourceNode | null = null;
	let analyser: AnalyserNode | null = null;
	let freq: Uint8Array = new Uint8Array(0);
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

	// Flipped true only AFTER onMount restores saved prefs, so these persist
	// effects can't fire on the initial default values and clobber localStorage
	// before the restore reads it.
	let restored = $state(false);

	// live-apply + persist + broadcast whenever the customization changes
	$effect(() => {
		const p = $state.snapshot(avatarParams);
		if (!restored) return;
		localAvatar?.applyCustom(p);
		net?.setParams(p);
		try {
			localStorage.setItem(AVATAR_KEY, JSON.stringify(p));
		} catch {
			// storage blocked -- fine
		}
	});
	$effect(() => {
		const n = playerName;
		if (!restored) return;
		localAvatar?.setName(n);
		net?.setName(n);
		try {
			localStorage.setItem(NAME_KEY, n);
		} catch {
			// fine
		}
	});

	const dismissHelp = () => {
		showHelp = false;
		try {
			localStorage.setItem(LEARNED_KEY, 'yeh');
		} catch {
			// survivable
		}
	};

	const pickAlbum = (k: string) => {
		album = k;
		index = 0;
	};

	const startDance = async () => {
		jukebawx.paused = true;
		if (!ctx) ctx = new AudioContext();
		await ctx.resume();
		if (!srcNode) {
			srcNode = ctx.createMediaElementSource(audioEl);
			analyser = ctx.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.75;
			freq = new Uint8Array(analyser.frequencyBinCount);
			srcNode.connect(analyser);
			analyser.connect(ctx.destination);
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
		index = (index + 1) % (tracks.length || 1);
		queueMicrotask(() => audioEl.play().catch(() => {}));
	};

	const randomizeAvatar = () => {
		avatarParams = { ...randomCustom() };
	};

	const joinRoom = async () => {
		const code = roomCode.trim();
		if (!code) {
			toast.error('Type a room code first');
			return;
		}
		netStatus = 'connecting';
		await net?.joinRoom(code);
	};
	const leaveRoom = () => net?.leaveRoom();
	const rollRoom = () => (roomCode = 'field-' + Math.random().toString(36).slice(2, 6));

	const netLabel = $derived(
		{
			local: 'Solo / same-device tabs',
			connecting: 'Connecting…',
			hosting: 'Hosting room ' + roomCode,
			joined: 'In room ' + roomCode,
			error: 'Connection failed'
		}[netStatus]
	);

	/** Audio features -> audioFrame (called each frame). KEEP verbatim. */
	const sampleAudio = (dt: number) => {
		if (!analyser || !dancing) {
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
		audioFrame.energy = audioFrame.energy * 0.85 + ((bassR + midsR + trebR) / 3) * 0.15;
		audioFrame.live = bassR + midsR + trebR > 0.02;

		bassHistory.push(bassR);
		if (bassHistory.length > 43) bassHistory.shift();
		const avg = bassHistory.reduce((s, v) => s + v, 0) / bassHistory.length;
		const now = performance.now();
		audioFrame.beat = false;
		if (bassR > avg * 1.32 && bassR > 0.22 && now - lastBeat > 190) {
			audioFrame.beat = true;
			audioFrame.beatStrength = Math.min(4, (bassR - avg) / (avg + 0.01));
			lastBeat = now;
			document.dispatchEvent(new CustomEvent('butterfly_fwoosh'));
		}
	};

	onMount(() => {
		// restore prefs
		try {
			showHelp = !localStorage.getItem(LEARNED_KEY);
			const savedAvatar = localStorage.getItem(AVATAR_KEY);
			if (savedAvatar) avatarParams = { ...DEFAULT_CUSTOM, ...JSON.parse(savedAvatar) };
			const savedName = localStorage.getItem(NAME_KEY);
			if (savedName) playerName = savedName;
		} catch {
			// no storage -- defaults are fine
		}

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		// Neutral tone mapping keeps monarch orange saturated even in bright daylight.
		renderer.toneMapping = THREE.NeutralToneMapping;
		renderer.toneMappingExposure = 1.0;
		container.appendChild(renderer.domElement);
		renderer.domElement.style.display = 'block';
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';

		const scene = new THREE.Scene();

		// IBL for wing sheen (KEEP)
		const pmrem = new THREE.PMREMGenerator(renderer);
		const roomEnv = new RoomEnvironment();
		const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
		scene.environment = envTex;
		scene.environmentIntensity = 0.5;

		// green daytime biome (sky, fog, sun+hemi, ground, grass, foliage)
		const biome: Biome = createBiome(scene);

		const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

		// local player: cartoony avatar + WASD/pointer-lock controller
		localAvatar = createAvatar($state.snapshot(avatarParams), playerName);
		controller = createController({
			domElement: renderer.domElement,
			camera,
			boundaryRadius: biome.boundaryRadius,
			groundY: biome.groundY,
			// jitter the spawn so multiple players don't stack on the exact spot
			spawn: new THREE.Vector3((Math.random() - 0.5) * 6, biome.groundY, 7 + (Math.random() - 0.5) * 6)
		});
		controller.player.add(localAvatar.group);
		scene.add(controller.player);

		// multiplayer: BroadcastChannel same-device now; PeerJS on demand
		const remotes = new RemoteAvatars(scene);
		net = new NetSession({
			name: playerName,
			custom: $state.snapshot(avatarParams),
			onStatus: (s) => (netStatus = s),
			onCount: (n) => (playerCount = n),
			onError: (m) => toast.error(m)
		});
		net.startLocal('field');

		// prefs are loaded and the avatar/net exist -- allow persist effects to run
		restored = true;

		// hard tab-close / refresh: say goodbye so peers don't keep a ghost of us
		const onPageHide = () => net?.dispose();
		window.addEventListener('pagehide', onPageHide);

		// drifting pollen (KEEP, recolored for daytime)
		const MOTES = 300;
		const motePos = new Float32Array(MOTES * 3);
		const moteSpd = new Float32Array(MOTES);
		for (let i = 0; i < MOTES; i++) {
			motePos[i * 3] = (Math.random() - 0.5) * 90;
			motePos[i * 3 + 1] = Math.random() * 16;
			motePos[i * 3 + 2] = (Math.random() - 0.5) * 90;
			moteSpd[i] = 0.15 + Math.random() * 0.5;
		}
		const moteGeo = new THREE.BufferGeometry();
		moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
		const moteMat = new THREE.PointsMaterial({
			color: 0xfff3c8,
			size: 0.1,
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		const motes = new THREE.Points(moteGeo, moteMat);
		motes.frustumCulled = false;
		scene.add(motes);

		// bloom (KEEP, retuned lower for daytime)
		let composer: EffectComposer | null = null;
		let bloom: UnrealBloomPass | null = null;
		try {
			composer = new EffectComposer(renderer);
			composer.addPass(new RenderPass(scene, camera));
			bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.5, 0.96);
			composer.addPass(bloom);
		} catch (e) {
			console.warn('bloom unavailable, direct render', e);
			composer = null;
		}

		// monarch flock (KEEP), parented to a group that lazily follows the player
		const flock = new Flock(N_BUTTERFLIES);
		const roots: THREE.Object3D[] = [];
		const mixers: THREE.AnimationMixer[] = [];
		const wingMats: THREE.MeshStandardMaterial[] = [];
		const flockGroup = new THREE.Group();
		scene.add(flockGroup);

		new GLTFLoader()
			.loadAsync('/but_dance/monarch.glb')
			.then((gltf) => {
				const flapClip = gltf.animations.find((a) => /flap/i.test(a.name)) ?? gltf.animations[0];
				gltf.scene.traverse((o) => {
					const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
					if (m && /wing/i.test(m.name)) {
						m.emissive = new THREE.Color(0xff7a2e);
						m.emissiveIntensity = 0;
						m.envMapIntensity = 0.85;
						if (!wingMats.includes(m)) wingMats.push(m);
					}
				});
				for (let i = 0; i < N_BUTTERFLIES; i++) {
					const root = skeletonClone(gltf.scene);
					root.scale.setScalar(MODEL_SCALE);
					const mixer = new THREE.AnimationMixer(root);
					const action = mixer.clipAction(flapClip);
					action.play();
					action.time = Math.random() * flapClip.duration;
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
		const flockTarget = new THREE.Vector3();
		let raf = 0;
		let shimmer = 0;

		const frame = () => {
			raf = requestAnimationFrame(frame);
			const dt = Math.min(clock.getDelta(), 1 / 30);
			const t = clock.elapsedTime;

			sampleAudio(dt); // 0 audio -> audioFrame
			net!.pump(); // 1 prune stale peers

			const st = controller!.update(dt); // 2 WASD + look -> avatar + camera
			if (st.view !== view) view = st.view;
			if (controller!.locked !== locked) locked = controller!.locked;
			localAvatar!.group.visible = st.view !== 'first';
			localAvatar!.update(dt, { speed: st.speed, moving: st.moving, running: st.running }); // 3

			remotes.update(dt, net!.sampleRemotes()); // 4 interpolated remotes

			flock.update(dt, t, audioFrame); // 5 choreography (UNCHANGED)

			// 6 place butterflies + lazy-follow the walker + shimmer + bloom
			const p = controller!.player.position;
			flockTarget.set(p.x, FLOCK_HEIGHT, p.z);
			flockGroup.position.lerp(flockTarget, 1 - Math.exp(-0.7 * dt));
			for (let i = 0; i < roots.length; i++) {
				const d = flock.dancers[i];
				roots[i].position.copy(d.pos);
				roots[i].quaternion.copy(d.quat);
				mixers[i].update(dt * d.flapRate);
			}
			if (roots.length && flock.formationName !== formationName) formationName = flock.formationName;
			const targetShimmer = audioFrame.treble * 0.5 + (audioFrame.beat ? 0.4 : 0);
			shimmer += (targetShimmer - shimmer) * (1 - Math.exp(-6 * dt));
			for (const m of wingMats) m.emissiveIntensity = 0.03 + shimmer * 0.12;
			if (bloom) bloom.strength = 0.1 + audioFrame.energy * 0.22 + (audioFrame.beat ? 0.08 : 0);

			// pollen drifts up + wraps, roughly around the player
			const mp = moteGeo.attributes.position.array as Float32Array;
			for (let i = 0; i < MOTES; i++) {
				mp[i * 3 + 1] += moteSpd[i] * dt;
				mp[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.12;
				if (mp[i * 3 + 1] > 16) {
					mp[i * 3 + 1] = 0;
					mp[i * 3] = p.x + (Math.random() - 0.5) * 90;
					mp[i * 3 + 2] = p.z + (Math.random() - 0.5) * 90;
				}
			}
			moteGeo.attributes.position.needsUpdate = true;

			biome.update(dt); // 7 wind + clouds

			net!.sendState({
				// 8 throttled ~12Hz
				x: p.x,
				y: p.y,
				z: p.z,
				yaw: st.yaw,
				speed: st.speed,
				moving: st.moving,
				running: st.running
			});

			if (composer) composer.render();
			else renderer.render(scene, camera); // 9 render
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
			window.removeEventListener('pagehide', onPageHide);
			ro.disconnect();

			controller?.dispose();
			net?.dispose();
			remotes.dispose();
			if (controller) scene.remove(controller.player);
			localAvatar?.dispose();
			biome.dispose();

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
				const mesh = o as THREE.Mesh & { isSprite?: boolean; isInstancedMesh?: boolean };
				// don't dispose the shared Sprite singleton geometry
				if (!mesh.isSprite) mesh.geometry?.dispose?.();
				if (mesh.isInstancedMesh) (mesh as unknown as THREE.InstancedMesh).dispose();
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
			envTex.dispose();
			roomEnv.dispose?.();
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

{#snippet colorField(label: string, key: keyof AvatarCustom)}
	<label class="flex items-center justify-between gap-2 text-sm text-slate-200">
		<span>{label}</span>
		<input type="color" class="h-7 w-12 rounded border border-slate-500 bg-transparent" bind:value={avatarParams[key] as string} />
	</label>
{/snippet}

<svelte:head>
	<title>Butterfly Field</title>
	<meta name="description" content="Walk a green field with friends while monarchs dance to da music" />
</svelte:head>

<audio bind:this={audioEl} src={track} preload="auto" onended={onEnded}></audio>

<div class="relative h-[86vh] w-full overflow-hidden bg-sky-300">
	<div bind:this={container} class="absolute inset-0"></div>

	{#if locked}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="size-2 rounded-full border border-white/80 bg-white/30"></div>
		</div>
	{/if}

	{#if loadingGlb}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="animate-pulse text-2xl text-white drop-shadow">Growing da field...</div>
		</div>
	{/if}
	{#if loadError}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="text-xl text-red-200">Couldn't load the butterfly model.</div>
		</div>
	{/if}

	<!-- top-left: title + toggles -->
	<div class="absolute top-4 left-4 flex flex-wrap items-center gap-2">
		<div class="text-2xl font-bold text-white drop-shadow-lg">Butterfly Field</div>
		<button
			aria-label="How dis works"
			title="How dis works"
			class="flex size-7 items-center justify-center rounded-full border border-white/60 text-white/90 backdrop-blur hover:border-white"
			onclick={() => (showHelp ? dismissHelp() : (showHelp = true))}
		>
			?
		</button>
		<button
			title="Customize your guy"
			class="rounded-full border border-white/60 bg-black/30 px-3 py-1 text-sm text-white backdrop-blur hover:border-white"
			class:bg-violet-600={showCustomize}
			onclick={() => (showCustomize = !showCustomize)}
		>
			Customize
		</button>
		<button
			title="Play with friends"
			class="rounded-full border border-white/60 bg-black/30 px-3 py-1 text-sm text-white backdrop-blur hover:border-white"
			class:bg-violet-600={showMultiplayer}
			onclick={() => (showMultiplayer = !showMultiplayer)}
		>
			Multiplayer
		</button>
	</div>

	<!-- top-right: formation + player count -->
	{#if !loadingGlb && !loadError}
		<div class="absolute top-4 right-4 flex items-center gap-2">
			<div
				class="rounded-full bg-black/40 px-3 py-1 text-sm text-white/90 backdrop-blur"
				title="The shape the flock is dancing in"
			>
				{dancing ? '♪ ' : ''}{formationName}
			</div>
			<div class="rounded-full bg-black/40 px-3 py-1 text-sm text-white/90 backdrop-blur" title="Players here">
				🧍 {playerCount}
			</div>
		</div>
	{/if}

	<!-- customize panel -->
	{#if showCustomize}
		<div class="absolute top-16 left-4 w-64 rounded-xl border border-white/30 bg-slate-900/90 p-4 backdrop-blur">
			<div class="mb-2 flex items-center justify-between">
				<div class="text-xs tracking-[0.3em] text-violet-300">YOUR GUY</div>
				<button aria-label="Close" class="text-slate-400 hover:text-white" onclick={() => (showCustomize = false)}>
					{@render icon('M6 18 18 6M6 6l12 12', 'size-4')}
				</button>
			</div>
			<label class="mb-2 block text-sm text-slate-200">
				<span class="mb-1 block">Name</span>
				<input
					type="text"
					class="w-full rounded border border-slate-500 bg-black/60 p-1.5 text-white"
					bind:value={playerName}
					maxlength="16"
					placeholder="Denny"
				/>
			</label>
			<div class="space-y-1.5">
				{@render colorField('Skin', 'skin')}
				{@render colorField('Hair / hat', 'hair')}
				{@render colorField('Shirt', 'shirt')}
				{@render colorField('Pants', 'pants')}
				{@render colorField('Shoes', 'shoes')}
			</div>
			<label class="mt-2 flex items-center justify-between gap-2 text-sm text-slate-200">
				<span>Headwear</span>
				<select class="rounded border border-slate-500 bg-black/60 p-1 text-white" bind:value={avatarParams.hairStyle}>
					{#each HAIR_STYLES as h (h)}
						<option value={h}>{h}</option>
					{/each}
				</select>
			</label>
			<label class="mt-2 block text-sm text-slate-200">
				<span class="mb-1 block">Height</span>
				<input type="range" class="w-full" min="0.85" max="1.2" step="0.01" bind:value={avatarParams.height} />
			</label>
			<div class="mt-2 flex gap-2">
				<button class="flex-1 rounded-full bg-violet-600 px-3 py-1 text-sm font-bold hover:bg-violet-500" onclick={randomizeAvatar}>
					Randomize
				</button>
				<div class="flex gap-1">
					{#each SKIN_TONES.slice(0, 4) as tone (tone)}
						<button
							aria-label="skin tone"
							class="size-6 rounded-full border border-white/40"
							style:background={tone}
							onclick={() => (avatarParams.skin = tone)}
						></button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- multiplayer panel -->
	{#if showMultiplayer}
		<div class="absolute top-16 right-4 w-72 rounded-xl border border-white/30 bg-slate-900/90 p-4 backdrop-blur">
			<div class="mb-2 flex items-center justify-between">
				<div class="text-xs tracking-[0.3em] text-violet-300">PLAY TOGETHER</div>
				<button aria-label="Close" class="text-slate-400 hover:text-white" onclick={() => (showMultiplayer = false)}>
					{@render icon('M6 18 18 6M6 6l12 12', 'size-4')}
				</button>
			</div>
			<p class="mb-3 text-xs text-slate-400">
				Same-device tabs already share this field automatically. To walk with someone on another device, share a
				room code &mdash; first one in hosts.
			</p>
			<label class="mb-2 block text-sm text-slate-200">
				<span class="mb-1 block">Name</span>
				<input type="text" class="w-full rounded border border-slate-500 bg-black/60 p-1.5 text-white" bind:value={playerName} maxlength="16" />
			</label>
			<label class="mb-2 block text-sm text-slate-200">
				<span class="mb-1 block">Room code</span>
				<div class="flex gap-1">
					<input
						type="text"
						class="w-full rounded border border-slate-500 bg-black/60 p-1.5 text-white"
						bind:value={roomCode}
						placeholder="field-7xq"
					/>
					<button aria-label="Random code" title="Random code" class="rounded border border-slate-500 px-2 text-white hover:border-white" onclick={rollRoom}>
						🎲
					</button>
				</div>
			</label>
			<div class="flex gap-2">
				{#if netStatus === 'hosting' || netStatus === 'joined'}
					<button class="flex-1 rounded-full bg-red-600 px-3 py-1 text-sm font-bold hover:bg-red-500" onclick={leaveRoom}>Leave room</button>
				{:else}
					<button
						class="flex-1 rounded-full bg-green-600 px-3 py-1 text-sm font-bold hover:bg-green-500 disabled:opacity-50"
						disabled={netStatus === 'connecting'}
						onclick={joinRoom}
					>
						Join / Host
					</button>
				{/if}
			</div>
			<div class="mt-2 text-xs" class:text-green-300={netStatus === 'hosting' || netStatus === 'joined'} class:text-red-300={netStatus === 'error'} class:text-slate-400={netStatus === 'local' || netStatus === 'connecting'}>
				{netLabel} &middot; {playerCount} here
			</div>
		</div>
	{/if}

	<!-- bottom control bar (music) -->
	<div class="absolute right-0 bottom-0 left-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-gradient-to-t from-black/70 to-transparent p-4">
		<label class="flex items-center gap-1" title="Which album to dance to">
			<span class="text-sm text-slate-100">Album</span>
			<select class="rounded border border-slate-500 bg-black/70 p-1.5 text-sm text-white" value={album} onchange={(e) => pickAlbum((e.currentTarget as HTMLSelectElement).value)}>
				{#each KEYS as k (k)}
					<option value={k}>{ALBUM_TITLES[k] ?? k}</option>
				{/each}
			</select>
		</label>

		<label class="flex items-center gap-1" title="Which track drives the dance">
			<span class="text-sm text-slate-100">Track</span>
			<select class="max-w-[40vw] rounded border border-slate-500 bg-black/70 p-1.5 text-sm text-white" value={index} onchange={(e) => (index = Number((e.currentTarget as HTMLSelectElement).value))}>
				{#each tracks as tr, i (tr)}
					<option value={i}>{formatTrack(tr)}</option>
				{/each}
			</select>
		</label>

		<button
			class="inline-flex items-center gap-2 rounded-full bg-yellow-500 px-5 py-2 font-bold text-black hover:bg-yellow-400"
			title={started ? (dancing ? 'Pause the music' : 'Resume the music') : 'Start the music'}
			onclick={togglePlay}
		>
			{#if dancing}
				{@render icon('M15.75 5.25v13.5m-7.5-13.5v13.5', 'size-5')}
				Pause
			{:else}
				{@render icon('M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z', 'size-5')}
				{started ? 'Play' : 'Play music'}
			{/if}
		</button>

		<button aria-label="Next track" title="Skip to the next track" class="rounded-full border border-slate-300 p-2 text-white hover:border-white" onclick={nextTrack}>
			{@render icon('M3 5.25 12 12l-9 6.75V5.25ZM21 5.25v13.5', 'size-4')}
		</button>

		<span class="ml-auto rounded-full bg-black/40 px-3 py-1 text-xs text-white/90 backdrop-blur">
			{view === 'first' ? '1st person' : '3rd person'} (V)
		</span>
	</div>

	<!-- controls hint -->
	<div class="pointer-events-none absolute bottom-20 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/45 px-4 py-1 text-xs text-white/90 backdrop-blur sm:block">
		WASD move &middot; Shift run &middot; Space jump &middot; click field to look (Esc for menus) &middot; V toggles view
	</div>

	<!-- first-visit tutorial -->
	{#if showHelp}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
			<div class="max-w-lg rounded-xl border border-violet-500/60 bg-slate-900 p-5">
				<div class="flex items-center justify-between">
					<div class="text-xs tracking-[0.3em] text-violet-300">HOW DIS WORKS</div>
					<button aria-label="Close tutorial" class="text-slate-400 hover:text-white" onclick={dismissHelp}>
						{@render icon('M6 18 18 6M6 6l12 12', 'size-5')}
					</button>
				</div>
				<ol class="mt-3 list-decimal space-y-2 pl-5 text-slate-300">
					<li><span class="font-bold text-white">Walk around.</span> WASD to move, Shift to run, Space to hop. Click the field to look with the mouse (Esc frees the cursor for the menus). Press <span class="font-bold text-white">V</span> to swap between 3rd- and 1st-person.</li>
					<li><span class="font-bold text-white">Make your guy.</span> Hit Customize to set colors, headwear, height and a name &mdash; it's saved for next time.</li>
					<li><span class="font-bold text-white">Bring friends.</span> Open Multiplayer: other browser tabs join automatically; share a room code to walk together across devices.</li>
					<li><span class="font-bold text-white">Turn on the music.</span> Pick an album + track and hit Play &mdash; a flock of hyper-real monarchs dances to the beat above the field.</li>
				</ol>
				<button class="mt-4 rounded-full bg-violet-600 px-4 py-1.5 font-bold hover:bg-violet-500" onclick={dismissHelp}>Let's go</button>
			</div>
		</div>
	{/if}
</div>

<div class="p-4">
	<a href="/" class="text-yellow-500 hover:underline">Denny, let's go hoooome.</a>
</div>
