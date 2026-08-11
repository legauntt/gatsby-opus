/**
 * Basic survival layer for the walkabout: four 0-100 stats (health, water,
 * food, oxygen) plus the world features that feed them -- a pond you drink at
 * (and can foolishly swim in), berry bushes that regrow, a lean-to shelter,
 * and passing rainstorms that soak anyone caught outside.
 *
 * Split in two so the page stays thin:
 *  - tickStats(stats, dt, ctx): pure per-frame stat simulation. No THREE.
 *  - createSurvivalWorld(scene): builds the pond/shelter/bushes/rain meshes,
 *    owns storm timing + berry regrowth, and answers proximity queries.
 *
 * Everything is per-player and local-only: your hunger is not gossip the
 * netcode needs to carry.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------- stats ---
export interface SurvivalStats {
	health: number;
	water: number;
	food: number;
	oxygen: number;
}

export const freshStats = (): SurvivalStats => ({ health: 100, water: 90, food: 90, oxygen: 100 });

export interface TickCtx {
	running: boolean;
	swimming: boolean;
	sheltered: boolean;
	raining: boolean;
}

// All rates are per second on a 0-100 scale. Tuned so a chill session feels
// gentle pressure, not a timer: thirst bites first (~3.5 min), hunger later
// (~5.5 min), and a lungful lasts ~11s of swimming.
const WATER_DRAIN = 0.45;
const FOOD_DRAIN = 0.3;
const RUN_MULT = 1.6; // running burns through both faster
const OXY_DRAIN = 9;
const OXY_RECOVER = 30;
const HP_THIRST = 0.9;
const HP_HUNGER = 0.7;
const HP_CHOKE = 3;
const HP_COLD = 1.1; // soaked by rain with no shelter
const HP_REGEN = 1.2; // when fed, watered, and breathing easy
const SHELTER_REGEN_MULT = 2; // cozy under the lean-to
const RAIN_SIP = 1.6; // standing in rain: head back, mouth open

export const DRINK_AMOUNT = 45;
export const EAT_AMOUNT = 40;

export function tickStats(s: SurvivalStats, dt: number, c: TickCtx) {
	const mult = c.running ? RUN_MULT : 1;
	s.water = Math.max(0, s.water - WATER_DRAIN * mult * dt);
	s.food = Math.max(0, s.food - FOOD_DRAIN * mult * dt);
	s.oxygen = THREE.MathUtils.clamp(s.oxygen + (c.swimming ? -OXY_DRAIN : OXY_RECOVER) * dt, 0, 100);

	const soaked = c.raining && !c.sheltered && !c.swimming; // already wet in the pond
	if (soaked) s.water = Math.min(100, s.water + RAIN_SIP * dt);

	let dh = 0;
	if (s.water <= 0) dh -= HP_THIRST;
	if (s.food <= 0) dh -= HP_HUNGER;
	if (s.oxygen <= 0) dh -= HP_CHOKE;
	if (soaked) dh -= HP_COLD;
	if (dh === 0 && s.water > 25 && s.food > 25 && s.oxygen > 50) {
		dh = HP_REGEN * (c.sheltered ? SHELTER_REGEN_MULT : 1);
	}
	s.health = THREE.MathUtils.clamp(s.health + dh * dt, 0, 100);
}

// ---------------------------------------------------------------- world ---
export interface SurvivalWorld {
	/** Advance storms, rain particles, and berry regrowth. Always safe to call. */
	update(dt: number, playerPos: THREE.Vector3): void;
	dispose(): void;
	readonly raining: boolean;
	/** Deep water: oxygen drains here. */
	swimmingAt(x: number, z: number): boolean;
	/** Close enough to the pond to drink (includes the deep part -- gulp away). */
	canDrinkAt(x: number, z: number): boolean;
	shelteredAt(x: number, z: number): boolean;
	/** Index of a ripe berry bush in reach, or -1. */
	nearestRipeBush(x: number, z: number): number;
	/** Strip a bush's berries; they regrow after a while. */
	eatBush(i: number): void;
}

const POND = { x: -16, z: -12, rOuter: 8, rInner: 5 };
const DRINK_REACH = POND.rOuter + 1.7;
const SHELTER = { x: 13, z: 9, r: 3.4 };
const N_BUSH = 8;
const BERRIES_PER_BUSH = 12;
const BUSH_REACH = 2.4;
const BERRY_REGROW_S = 75;
const RAIN_N = 700;
const RAIN_BOX = 22; // half-extent of the rain volume around the player
const RAIN_TOP = 16;
const FOG_CLEAR = new THREE.Color('#cfe8f5');
const FOG_RAIN = new THREE.Color('#9eb3c4');

const dist2 = (x: number, z: number, cx: number, cz: number) => (x - cx) ** 2 + (z - cz) ** 2;

export function createSurvivalWorld(scene: THREE.Scene): SurvivalWorld {
	const group = new THREE.Group();
	scene.add(group);

	// ---- pond: shallow rim disc + darker deep disc, sitting on the grass ----
	const rimMat = new THREE.MeshStandardMaterial({
		color: 0x4f9fd8,
		roughness: 0.25,
		metalness: 0.05,
		transparent: true,
		opacity: 0.85
	});
	const rim = new THREE.Mesh(new THREE.CircleGeometry(POND.rOuter, 48), rimMat);
	rim.rotation.x = -Math.PI / 2;
	rim.position.set(POND.x, 0.06, POND.z);
	const deepMat = new THREE.MeshStandardMaterial({ color: 0x2c6da8, roughness: 0.2, metalness: 0.05 });
	const deep = new THREE.Mesh(new THREE.CircleGeometry(POND.rInner, 40), deepMat);
	deep.rotation.x = -Math.PI / 2;
	deep.position.set(POND.x, 0.07, POND.z);
	group.add(rim, deep);

	// ---- lean-to shelter: corner posts + slanted roof + dirt floor ----
	const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
	const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a6b3f, roughness: 1, flatShading: true });
	const floorMat = new THREE.MeshStandardMaterial({ color: 0x5c4a30, roughness: 1 });
	const postGeo = new THREE.CylinderGeometry(0.09, 0.12, 1, 6);
	const posts: [number, number, number][] = [
		[-1.9, 2.2, -1.5],
		[1.9, 2.2, -1.5],
		[-1.9, 1.2, 1.5],
		[1.9, 1.2, 1.5]
	];
	for (const [px, h, pz] of posts) {
		const post = new THREE.Mesh(postGeo, woodMat);
		post.scale.y = h;
		post.position.set(SHELTER.x + px, h / 2, SHELTER.z + pz);
		group.add(post);
	}
	const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 3.8), roofMat);
	roof.position.set(SHELTER.x, 1.7, SHELTER.z);
	roof.rotation.x = Math.atan2(1.0, 3.0); // pitched: tall edge at the back posts
	group.add(roof);
	const floor = new THREE.Mesh(new THREE.CircleGeometry(SHELTER.r - 0.6, 24), floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(SHELTER.x, 0.05, SHELTER.z);
	group.add(floor);

	// ---- berry bushes: instanced bushes + one instanced mesh of berries ----
	const bushPos: { x: number; z: number }[] = [];
	while (bushPos.length < N_BUSH) {
		const a = Math.random() * Math.PI * 2;
		const r = 8 + Math.random() * 22;
		const x = Math.cos(a) * r;
		const z = Math.sin(a) * r;
		if (dist2(x, z, POND.x, POND.z) < (POND.rOuter + 3) ** 2) continue;
		if (dist2(x, z, SHELTER.x, SHELTER.z) < (SHELTER.r + 3) ** 2) continue;
		if (bushPos.some((b) => dist2(x, z, b.x, b.z) < 36)) continue; // spread them out
		bushPos.push({ x, z });
	}
	const bushGeo = new THREE.IcosahedronGeometry(1.0, 1);
	const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f7a30, roughness: 1, flatShading: true });
	const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, N_BUSH);
	const berryGeo = new THREE.SphereGeometry(0.07, 8, 6);
	const berryMat = new THREE.MeshStandardMaterial({ color: 0xd63b4e, roughness: 0.5 });
	const berries = new THREE.InstancedMesh(berryGeo, berryMat, N_BUSH * BERRIES_PER_BUSH);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const berrySpots: THREE.Vector3[] = []; // world position per berry instance
	bushPos.forEach((b, i) => {
		m.compose(
			new THREE.Vector3(b.x, 0.55, b.z),
			q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6),
			new THREE.Vector3(1, 0.75, 1)
		);
		bushMesh.setMatrixAt(i, m);
		for (let bi = 0; bi < BERRIES_PER_BUSH; bi++) {
			// scatter berries over the bush's upper hemisphere
			const th = Math.random() * Math.PI * 2;
			const el = Math.random() * Math.PI * 0.45;
			const spot = new THREE.Vector3(
				b.x + Math.cos(th) * Math.cos(el) * 0.95,
				0.55 + Math.sin(el) * 0.72,
				b.z + Math.sin(th) * Math.cos(el) * 0.95
			);
			berrySpots.push(spot);
			m.compose(spot, q.identity(), new THREE.Vector3(1, 1, 1));
			berries.setMatrixAt(i * BERRIES_PER_BUSH + bi, m);
		}
	});
	bushMesh.instanceMatrix.needsUpdate = true;
	berries.instanceMatrix.needsUpdate = true;
	group.add(bushMesh, berries);

	const regrowAt = new Array<number>(N_BUSH).fill(0); // clock time when ripe again
	let clock = 0;
	const setBerriesVisible = (i: number, vis: boolean) => {
		const s = vis ? 1 : 0.0001; // scale-to-nothing beats juggling instance counts
		for (let bi = 0; bi < BERRIES_PER_BUSH; bi++) {
			m.compose(berrySpots[i * BERRIES_PER_BUSH + bi], q.identity(), new THREE.Vector3(s, s, s));
			berries.setMatrixAt(i * BERRIES_PER_BUSH + bi, m);
		}
		berries.instanceMatrix.needsUpdate = true;
	};

	// ---- rain: line-segment streaks recycled inside a box around the player ----
	const rainPos = new Float32Array(RAIN_N * 6);
	const rainSpd = new Float32Array(RAIN_N);
	for (let i = 0; i < RAIN_N; i++) {
		rainPos[i * 6] = rainPos[i * 6 + 3] = (Math.random() - 0.5) * RAIN_BOX * 2;
		rainPos[i * 6 + 1] = Math.random() * RAIN_TOP;
		rainPos[i * 6 + 4] = rainPos[i * 6 + 1] - 0.45;
		rainPos[i * 6 + 2] = rainPos[i * 6 + 5] = (Math.random() - 0.5) * RAIN_BOX * 2;
		rainSpd[i] = 18 + Math.random() * 8;
	}
	const rainGeo = new THREE.BufferGeometry();
	rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
	const rainMat = new THREE.LineBasicMaterial({ color: 0xbcd9ee, transparent: true, opacity: 0.4 });
	const rain = new THREE.LineSegments(rainGeo, rainMat);
	rain.frustumCulled = false;
	rain.visible = false;
	group.add(rain);

	// storm scheduler: long clear spells, shortish showers
	let raining = false;
	let stormTimer = 40 + Math.random() * 60; // first shower comes to you
	const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;

	function update(dt: number, playerPos: THREE.Vector3) {
		clock += dt;
		stormTimer -= dt;
		if (stormTimer <= 0) {
			raining = !raining;
			rain.visible = raining;
			stormTimer = raining ? 18 + Math.random() * 22 : 50 + Math.random() * 90;
		}

		if (raining) {
			rain.position.set(playerPos.x, 0, playerPos.z);
			for (let i = 0; i < RAIN_N; i++) {
				let y = rainPos[i * 6 + 1] - rainSpd[i] * dt;
				if (y < 0) {
					y = RAIN_TOP;
					rainPos[i * 6] = rainPos[i * 6 + 3] = (Math.random() - 0.5) * RAIN_BOX * 2;
					rainPos[i * 6 + 2] = rainPos[i * 6 + 5] = (Math.random() - 0.5) * RAIN_BOX * 2;
				}
				rainPos[i * 6 + 1] = y;
				rainPos[i * 6 + 4] = y - 0.45;
			}
			rainGeo.attributes.position.needsUpdate = true;
		}
		// mood shift: fog eases toward grey while it rains, back to clear after
		fog?.color.lerp(raining ? FOG_RAIN : FOG_CLEAR, 1 - Math.exp(-0.8 * dt));

		for (let i = 0; i < N_BUSH; i++) {
			if (regrowAt[i] > 0 && clock >= regrowAt[i]) {
				regrowAt[i] = 0;
				setBerriesVisible(i, true);
			}
		}
	}

	function dispose() {
		group.traverse((o) => {
			const mesh = o as THREE.Mesh & { isInstancedMesh?: boolean };
			mesh.geometry?.dispose?.();
			if (mesh.isInstancedMesh) (mesh as unknown as THREE.InstancedMesh).dispose();
			const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(mat)) mat.forEach((mm) => mm?.dispose());
			else mat?.dispose?.();
		});
		scene.remove(group);
		fog?.color.copy(FOG_CLEAR);
	}

	return {
		update,
		dispose,
		get raining() {
			return raining;
		},
		swimmingAt: (x, z) => dist2(x, z, POND.x, POND.z) < POND.rInner ** 2,
		canDrinkAt: (x, z) => dist2(x, z, POND.x, POND.z) < DRINK_REACH ** 2,
		shelteredAt: (x, z) => dist2(x, z, SHELTER.x, SHELTER.z) < SHELTER.r ** 2,
		nearestRipeBush(x, z) {
			let best = -1;
			let bestD = BUSH_REACH ** 2;
			for (let i = 0; i < N_BUSH; i++) {
				if (regrowAt[i] > 0) continue;
				const d = dist2(x, z, bushPos[i].x, bushPos[i].z);
				if (d < bestD) {
					bestD = d;
					best = i;
				}
			}
			return best;
		},
		eatBush(i) {
			if (i < 0 || i >= N_BUSH || regrowAt[i] > 0) return;
			regrowAt[i] = clock + BERRY_REGROW_S;
			setBerriesVisible(i, false);
		}
	};
}
