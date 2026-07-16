/**
 * Cartoony, customizable humanoid avatar built procedurally from primitives.
 *
 * Customization is pure params (colors / styles / height), so a remote player is
 * just a small JSON blob -- no per-player model to load or sync. A procedural
 * walk cycle swings the limbs by DISTANCE travelled (so it matches speed), with
 * an idle breathing bob. Toon materials give the deliberately cartoony read that
 * plays off the photoreal monarchs.
 */
import * as THREE from 'three';

export interface AvatarCustom {
	skin: string;
	hair: string;
	hairStyle: 'none' | 'short' | 'cap' | 'beanie' | 'tophat';
	shirt: string;
	pants: string;
	shoes: string;
	height: number; // scale multiplier, ~0.85..1.2
}

export const DEFAULT_CUSTOM: AvatarCustom = {
	skin: '#f1c39a',
	hair: '#5a3a22',
	hairStyle: 'short',
	shirt: '#3b82f6',
	pants: '#374151',
	shoes: '#7c2d12',
	height: 1.0
};

export const SKIN_TONES = ['#f6d5b5', '#f1c39a', '#d9a066', '#a86b3c', '#7a4a24', '#4a2f1a'];
export const HAIR_STYLES: AvatarCustom['hairStyle'][] = ['none', 'short', 'cap', 'beanie', 'tophat'];
const PALETTE = [
	'#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
	'#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e',
	'#ffffff', '#94a3b8', '#334155', '#111827'
];

export function randomCustom(): AvatarCustom {
	const pick = <T>(a: T[], i: number) => a[i % a.length];
	// index math instead of Math.random so callers can vary by a seed if wanted
	const r = () => Math.floor(Math.random() * 997);
	return {
		skin: pick(SKIN_TONES, r()),
		hair: pick(PALETTE, r()),
		hairStyle: pick(HAIR_STYLES, r()),
		shirt: pick(PALETTE, r()),
		pants: pick(PALETTE, r()),
		shoes: pick(PALETTE, r()),
		height: 0.9 + Math.random() * 0.25
	};
}

export interface Avatar {
	group: THREE.Group;
	update(dt: number, m: { speed: number; moving: boolean; running?: boolean }): void;
	applyCustom(c: AvatarCustom): void;
	setName(name: string): void;
	setNameVisible(v: boolean): void;
	dispose(): void;
}

// Per-instance geometries (a handful; kept off the module scope so the page's
// generic scene.traverse dispose on unmount can't free geometry other avatars
// or a later mount still need).
function makeGeoms() {
	return {
		torso: new THREE.CapsuleGeometry(0.24, 0.34, 6, 14),
		pelvis: new THREE.CapsuleGeometry(0.22, 0.12, 4, 12),
		head: new THREE.SphereGeometry(0.28, 24, 20),
		eye: new THREE.SphereGeometry(0.045, 10, 8),
		limb: new THREE.CapsuleGeometry(0.075, 0.34, 4, 10),
		hand: new THREE.SphereGeometry(0.085, 10, 8),
		shoe: new THREE.CapsuleGeometry(0.09, 0.14, 4, 8),
		capCrown: new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
		capBill: new THREE.BoxGeometry(0.34, 0.04, 0.22),
		beanie: new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
		topCyl: new THREE.CylinderGeometry(0.2, 0.2, 0.34, 18),
		topBrim: new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20)
	};
}

function toon(color: string): THREE.MeshToonMaterial {
	return new THREE.MeshToonMaterial({ color: new THREE.Color(color) });
}

function makeNameSprite(): { sprite: THREE.Sprite; draw: (name: string) => void } {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 64;
	const ctx = canvas.getContext('2d')!;
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
	const sprite = new THREE.Sprite(mat);
	sprite.scale.set(1.4, 0.35, 1);
	const draw = (name: string) => {
		ctx.clearRect(0, 0, 256, 64);
		ctx.font = 'bold 34px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const label = (name || 'player').slice(0, 16);
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'rgba(0,0,0,0.75)';
		ctx.strokeText(label, 128, 34);
		ctx.fillStyle = '#ffffff';
		ctx.fillText(label, 128, 34);
		tex.needsUpdate = true;
	};
	return { sprite, draw };
}

export function createAvatar(initial: AvatarCustom = DEFAULT_CUSTOM, name = 'player'): Avatar {
	const group = new THREE.Group();
	const scaleRoot = new THREE.Group(); // height scaling lives here
	group.add(scaleRoot);
	const G = makeGeoms();

	const mats = {
		skin: toon(initial.skin),
		hair: toon(initial.hair),
		shirt: toon(initial.shirt),
		pants: toon(initial.pants),
		shoes: toon(initial.shoes),
		eye: new THREE.MeshBasicMaterial({ color: 0x1a1a22 })
	};

	// ---- body ----
	const pelvis = new THREE.Mesh(G.pelvis, mats.pants);
	pelvis.position.y = 0.62;
	const torso = new THREE.Mesh(G.torso, mats.shirt);
	torso.position.y = 0.92;

	const headPivot = new THREE.Group();
	headPivot.position.y = 1.18;
	const head = new THREE.Mesh(G.head, mats.skin);
	headPivot.add(head);
	for (const sx of [-1, 1]) {
		const eye = new THREE.Mesh(G.eye, mats.eye);
		eye.position.set(0.1 * sx, 0.03, 0.24);
		headPivot.add(eye);
	}
	let headwear: THREE.Group | null = null;

	// arms: pivot at shoulder, limb hangs down
	function makeArm(sx: number) {
		const pivot = new THREE.Group();
		pivot.position.set(0.29 * sx, 1.06, 0);
		const upper = new THREE.Mesh(G.limb, mats.shirt);
		upper.position.y = -0.2;
		const hand = new THREE.Mesh(G.hand, mats.skin);
		hand.position.y = -0.42;
		pivot.add(upper, hand);
		return pivot;
	}
	function makeLeg(sx: number) {
		const pivot = new THREE.Group();
		pivot.position.set(0.12 * sx, 0.62, 0);
		const upper = new THREE.Mesh(G.limb, mats.pants);
		upper.position.y = -0.22;
		const shoe = new THREE.Mesh(G.shoe, mats.shoes);
		shoe.position.set(0, -0.46, 0.05);
		shoe.rotation.x = Math.PI / 2;
		pivot.add(upper, shoe);
		return pivot;
	}
	const armL = makeArm(-1);
	const armR = makeArm(1);
	const legL = makeLeg(-1);
	const legR = makeLeg(1);

	scaleRoot.add(pelvis, torso, headPivot, armL, armR, legL, legR);

	// ---- name tag ----
	const { sprite, draw } = makeNameSprite();
	draw(name);
	sprite.position.y = 1.75;
	group.add(sprite);

	// ---- customization ----
	function buildHeadwear(c: AvatarCustom) {
		if (headwear) {
			headPivot.remove(headwear); // meshes reuse shared G geoms + mats.hair; nothing to free
			headwear = null;
		}
		if (c.hairStyle === 'none') return;
		const g = new THREE.Group();
		if (c.hairStyle === 'short') {
			g.add(new THREE.Mesh(G.capCrown, mats.hair));
		} else if (c.hairStyle === 'cap') {
			g.add(new THREE.Mesh(G.capCrown, mats.hair));
			const bill = new THREE.Mesh(G.capBill, mats.hair);
			bill.position.set(0, 0.02, 0.22);
			g.add(bill);
		} else if (c.hairStyle === 'beanie') {
			g.add(new THREE.Mesh(G.beanie, mats.hair));
		} else if (c.hairStyle === 'tophat') {
			const cyl = new THREE.Mesh(G.topCyl, mats.hair);
			cyl.position.y = 0.28;
			const brim = new THREE.Mesh(G.topBrim, mats.hair);
			brim.position.y = 0.12;
			g.add(cyl, brim);
		}
		headwear = g;
		headPivot.add(g);
	}

	function applyCustom(c: AvatarCustom) {
		mats.skin.color.set(c.skin);
		mats.hair.color.set(c.hair);
		mats.shirt.color.set(c.shirt);
		mats.pants.color.set(c.pants);
		mats.shoes.color.set(c.shoes);
		scaleRoot.scale.setScalar(c.height);
		sprite.position.y = 1.75 * c.height;
		buildHeadwear(c);
	}
	applyCustom(initial);

	// ---- walk cycle ----
	let phase = 0;
	let bob = 0;
	function update(dt: number, m: { speed: number; moving: boolean; running?: boolean }) {
		// advance the cycle by distance travelled so stride matches speed
		phase += m.speed * dt * 2.6;
		const amp = m.moving ? Math.min(1, m.speed / 3) * (m.running ? 1.15 : 0.85) : 0;
		const s = Math.sin(phase);
		legL.rotation.x = s * amp;
		legR.rotation.x = -s * amp;
		armL.rotation.x = -s * amp * 0.9;
		armR.rotation.x = s * amp * 0.9;
		// bob + breathing
		bob += dt;
		const vbob = m.moving ? Math.abs(Math.sin(phase)) * 0.04 * amp : Math.sin(bob * 1.6) * 0.012;
		torso.position.y = 0.92 + vbob;
		headPivot.position.y = 1.18 + vbob;
		// lean into a run
		scaleRoot.rotation.x = m.moving ? -0.06 * amp - (m.running ? 0.06 : 0) : 0;
	}

	function setName(n: string) {
		draw(n);
	}
	function setNameVisible(v: boolean) {
		sprite.visible = v;
	}

	function dispose() {
		group.traverse((o) => {
			const mesh = o as THREE.Mesh;
			const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(mat)) mat.forEach((mm) => mm?.dispose());
			else mat?.dispose?.();
		});
		(sprite.material as THREE.SpriteMaterial).map?.dispose();
		(sprite.material as THREE.SpriteMaterial).dispose();
		for (const geo of Object.values(G)) geo.dispose();
	}

	return { group, update, applyCustom, setName, setNameVisible, dispose };
}
