/**
 * Choreography for da butterfly dance.
 *
 * Two layers, kept strictly apart (this is the whole trick):
 *   - The DIRECTOR moves *targets*: a library of parametric formations, each a
 *     pure function P(slot u, time t) -> world position. Formations morph into
 *     one another and cycle on the music's structure.
 *   - The PHYSICS moves *butterflies*: each dancer is softly pulled to its slot
 *     with a spring-damper, plus boid separation + wander, so motion always
 *     looks alive even when the target field is rigid geometry.
 *
 * Audio (bass / mids / treble + beat flux, extracted in +page.svelte) drives
 * behavioural parameters -- never positions directly -- so the flock *responds*
 * with the lag and overshoot of a living swarm instead of keyframe-snapping.
 *
 * Units are "wingspans" (~1). The GLB is authored in meters (~0.1 wide), so the
 * page scales each clone up; formation radii here are in wingspans.
 */
import * as THREE from 'three';

export interface Dancer {
	pos: THREE.Vector3;
	vel: THREE.Vector3;
	u: number; // slot parameter 0..1
	seed: number;
	flapRate: number; // Hz-ish, feeds mixer.update(dt * flapRate)
	flapRateMul: number; // per-individual natural flap frequency (breaks sync)
	burst: number; // transient flap multiplier from beats, decays
	quat: THREE.Quaternion;
	bank: number;
	wanderGain: number; // per-individual wander strength (no two drift alike)
	scale: number; // per-individual size (page multiplies MODEL_SCALE by this)
}

export interface AudioFrame {
	bass: number; // 0..1 adaptive
	mids: number;
	treble: number;
	energy: number;
	beat: boolean;
	beatStrength: number; // z-score-ish
	live: boolean; // audio actually playing (vs idle drift)
}

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// --------------------------------------------------------------------------- //
// Formation library: P(u, t) -> Vector3 (writes into `out`)
// --------------------------------------------------------------------------- //
export type Formation = (u: number, t: number, out: THREE.Vector3) => THREE.Vector3;

export const FORMATIONS: { name: string; fn: Formation }[] = [
	{
		name: 'Orbit Ring',
		fn: (u, t, out) => {
			const a = TAU * u + t * 0.25;
			const r = 5.0 + Math.sin(u * TAU * 2 + t) * 0.5;
			return out.set(Math.cos(a) * r, Math.sin(u * TAU * 3 + t * 0.6) * 1.6, Math.sin(a) * r);
		}
	},
	{
		name: 'Rising Helix',
		fn: (u, t, out) => {
			const turns = 3;
			const a = TAU * (u * turns + t * 0.15);
			const r = 3.6 + 0.6 * Math.sin(TAU * u * 3 + t);
			return out.set(Math.cos(a) * r, 11 * (u - 0.5) + Math.sin(t * 0.3) * 0.8, Math.sin(a) * r);
		}
	},
	{
		name: 'Double Helix',
		fn: (u, t, out) => {
			const strand = Math.round(u * 40) % 2;
			const turns = 3;
			const a = TAU * (u * turns + t * 0.2) + strand * Math.PI;
			const r = 3.2;
			return out.set(Math.cos(a) * r, 10 * (u - 0.5), Math.sin(a) * r);
		}
	},
	{
		name: 'Lissajous Ribbon',
		fn: (u, t, out) => {
			const A = 6,
				B = 3.2,
				C = 5;
			return out.set(
				A * Math.sin(3 * t * 0.35 + TAU * u),
				B * Math.sin(2 * t * 0.35 + TAU * u * 2) + 0.5,
				C * Math.sin(1 * t * 0.35 + TAU * u * 3)
			);
		}
	},
	{
		name: 'Figure Eight',
		fn: (u, t, out) => {
			const s = TAU * (u + t * 0.08);
			const A = 6.5,
				B = 3.4;
			return out.set(A * Math.sin(s), B * Math.sin(s) * Math.cos(s) * 0.8 + 0.5, B * Math.sin(s) * Math.cos(s));
		}
	},
	{
		name: 'Migration V',
		fn: (u, t, out) => {
			// slot index reconstructed from u; alternate sides, rank back
			const i = Math.round(u * 40);
			const side = i % 2 ? 1 : -1;
			const rank = Math.floor(i / 2);
			const lead = new THREE.Vector3(Math.sin(t * 0.3) * 5, Math.sin(t * 0.5) * 1.5, Math.cos(t * 0.3) * 5);
			return out.set(
				lead.x + side * rank * 0.9,
				lead.y - rank * 0.18,
				lead.z - rank * 0.7 - Math.abs(side) * 0.2
			);
		}
	},
	{
		name: 'Sphere Swarm',
		fn: (u, t, out) => {
			// fibonacci sphere, slowly rotating
			const i = Math.round(u * 40);
			const n = 41;
			const y = 1 - (i / (n - 1)) * 2;
			const rad = Math.sqrt(Math.max(0, 1 - y * y));
			const golden = Math.PI * (3 - Math.sqrt(5));
			const th = golden * i + t * 0.3;
			return out.set(Math.cos(th) * rad * 5, y * 5, Math.sin(th) * rad * 5);
		}
	},
	{
		name: 'Heart',
		fn: (u, t, out) => {
			// a parametric heart in XY, gently breathing, slight z scatter by slot
			const a = TAU * u;
			const s = 0.32 * (1 + 0.06 * Math.sin(t * 1.5));
			const x = 16 * Math.pow(Math.sin(a), 3);
			const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
			const z = Math.sin(u * TAU * 5 + t) * 1.2;
			return out.set(x * s, y * s + 1.5, z);
		}
	}
];

// --------------------------------------------------------------------------- //
// Flock director + physics
// --------------------------------------------------------------------------- //
export class Flock {
	dancers: Dancer[] = [];
	formA = 0;
	formB = 1;
	morph = 0; // 0 -> showing formA, 1 -> showing formB
	morphing = false;
	sinceSwitch = 0;
	centroid = new THREE.Vector3();
	spread = 5;
	swirlSign = 1;

	private _tA = new THREE.Vector3();
	private _tB = new THREE.Vector3();
	private _target = new THREE.Vector3();
	private _tmp = new THREE.Vector3();
	private _sep = new THREE.Vector3();
	private _acc = new THREE.Vector3();
	private _fwd = new THREE.Vector3();
	private _q = new THREE.Quaternion();
	private _m = new THREE.Matrix4();

	constructor(n: number) {
		for (let i = 0; i < n; i++) {
			const u = i / n;
			this.dancers.push({
				pos: new THREE.Vector3(
					(Math.random() - 0.5) * 14,
					(Math.random() - 0.5) * 8,
					(Math.random() - 0.5) * 14
				),
				vel: new THREE.Vector3(),
				u,
				seed: Math.random() * 1000,
				flapRate: 4 + Math.random() * 4,
				flapRateMul: 0.82 + Math.random() * 0.42, // ~0.82..1.24x
				burst: 0,
				quat: new THREE.Quaternion(),
				bank: 0,
				wanderGain: 0.7 + Math.random() * 0.7, // ~0.7..1.4x
				scale: 0.78 + Math.random() * 0.5 // ~0.78..1.28x
			});
		}
	}

	get formationName() {
		return this.morph < 0.5 ? FORMATIONS[this.formA].name : FORMATIONS[this.formB].name;
	}

	nextFormation() {
		if (this.morphing) return;
		this.formA = this.formB;
		this.formB = (this.formB + 1 + Math.floor(Math.random() * (FORMATIONS.length - 1))) % FORMATIONS.length;
		this.morph = 0;
		this.morphing = true;
		this.sinceSwitch = 0;
		this.swirlSign *= -1;
	}

	/** Advance the whole flock one step. Returns nothing; mutates dancers. */
	update(dt: number, t: number, audio: AudioFrame) {
		// ---- director: morph + cycle formations on the music ----
		this.sinceSwitch += dt;
		if (this.morphing) {
			this.morph = Math.min(1, this.morph + dt / 2.2); // ~2.2s crossfade
			if (this.morph >= 1) this.morphing = false;
		}
		// switch on a strong beat (min gap) or on a long timeout
		const wantSwitch =
			(audio.live && audio.beat && audio.beatStrength > 1.6 && this.sinceSwitch > 6) ||
			this.sinceSwitch > (audio.live ? 15 : 26);
		if (wantSwitch) this.nextFormation();

		const fnA = FORMATIONS[this.formA].fn;
		const fnB = FORMATIONS[this.formB].fn;

		// audio-shaped gains
		const idle = audio.live ? 0 : 1;
		const kP = 2.4 * (1 + 0.5 * audio.energy) * (1 - 0.55 * idle); // looser when idle
		const kD = 1.9;
		const wander = 0.5 * (1 + audio.mids * 1.5) + 0.35 * idle;
		const vmax = (audio.live ? 5 + audio.energy * 7 : 2.6) * 1.0;
		const sep = 1.7;
		const beatKick = audio.beat ? audio.beatStrength : 0;

		this.centroid.set(0, 0, 0);
		let maxd = 0;

		for (const d of this.dancers) {
			// formation target (morph A->B), plus a global swirl bias for life
			fnA(d.u, t, this._tA);
			fnB(d.u, t, this._tB);
			this._target.copy(this._tA).lerp(this._tB, this.morph);

			// PD spring toward slot
			this._acc.copy(this._target).sub(d.pos).multiplyScalar(kP);
			this._acc.addScaledVector(d.vel, -kD);

			// boid separation (O(n^2), n is small)
			this._sep.set(0, 0, 0);
			for (const o of this.dancers) {
				if (o === d) continue;
				const dx = d.pos.x - o.pos.x;
				const dy = d.pos.y - o.pos.y;
				const dz = d.pos.z - o.pos.z;
				const d2 = dx * dx + dy * dy + dz * dz;
				if (d2 < 2.2 && d2 > 1e-4) {
					const inv = 1 / Math.sqrt(d2);
					this._sep.x += dx * inv * inv;
					this._sep.y += dy * inv * inv;
					this._sep.z += dz * inv * inv;
				}
			}
			this._acc.addScaledVector(this._sep, sep);

			// wander (cheap curl-ish noise via layered sines on seed); the per-
			// individual rate + gain give every dancer its own drifting "gait"
			const w = t * (0.45 + 0.3 * (d.seed % 1)) + d.seed;
			this._tmp.set(Math.sin(w * 1.1) + Math.sin(w * 2.3) * 0.5, Math.cos(w * 0.9) * 0.7, Math.sin(w * 1.7 + 2) + Math.cos(w * 0.6));
			this._acc.addScaledVector(this._tmp, wander * d.wanderGain);

			// swirl tangent around Y for a touch of vortex
			this._tmp.set(-d.pos.z, 0, d.pos.x).normalize().multiplyScalar(this.swirlSign * (0.6 + audio.mids * 2.0));
			this._acc.add(this._tmp);

			// beat bloom: radial impulse outward from centroid feel (use pos dir)
			if (beatKick > 0) {
				this._tmp.copy(d.pos).setLength(1).multiplyScalar(beatKick * 1.6);
				this._tmp.y += beatKick * 0.6;
				this._acc.add(this._tmp);
				d.burst = Math.max(d.burst, 0.6 + beatKick * 0.25);
			}

			// clamp accel so motion stays insectile
			if (this._acc.lengthSq() > 26 * 26) this._acc.setLength(26);

			// integrate
			d.vel.addScaledVector(this._acc, dt);
			const sp = d.vel.length();
			const vmin = audio.live ? 1.2 : 0.4;
			if (sp > vmax) d.vel.setLength(vmax);
			else if (sp < vmin && sp > 1e-3) d.vel.setLength(vmin);
			d.pos.addScaledVector(d.vel, dt);

			// ---- orientation: face velocity + bank from lateral accel ----
			if (d.vel.lengthSq() > 1e-4) {
				this._fwd.copy(d.vel).normalize();
				// bank: how much accel is lateral to travel
				const lat = this._tmp.copy(this._acc).sub(this._fwd.clone().multiplyScalar(this._acc.dot(this._fwd)));
				const latMag = lat.dot(this._tmp.copy(this._fwd).cross(UP)) * -1;
				const targetBank = THREE.MathUtils.clamp(latMag * 0.06, -1.0, 1.0);
				d.bank += (targetBank - d.bank) * (1 - Math.exp(-5 * dt));
				// build look quaternion (model's +Y is "up out of the wings",
				// travel should point the body forward -> see page for axis fix)
				this._m.lookAt(this._tmp.set(0, 0, 0), this._fwd, UP);
				this._q.setFromRotationMatrix(this._m);
				// roll about forward axis for the bank
				const roll = new THREE.Quaternion().setFromAxisAngle(this._fwd, d.bank);
				this._q.premultiply(roll);
				d.quat.slerp(this._q, 1 - Math.exp(-7 * dt));
			}

			// ---- wings: speed + treble drive flap; beats burst it ----
			const speedN = Math.min(1, sp / (vmax + 1e-3));
			d.burst = Math.max(0, d.burst - dt * 2.2);
			d.flapRate = THREE.MathUtils.clamp(
				5 * d.flapRateMul * (0.55 + 0.8 * speedN) * (1 + 0.7 * audio.treble) * (1 + d.burst),
				audio.live ? 2.5 : 1.4,
				14
			);

			this.centroid.add(d.pos);
			const dc = d.pos.length();
			if (dc > maxd) maxd = dc;
		}

		this.centroid.multiplyScalar(1 / this.dancers.length);
		this.spread += (Math.max(3, maxd) - this.spread) * (1 - Math.exp(-2 * dt));
	}
}
