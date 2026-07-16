/**
 * First/third-person character controller: WASD movement relative to where you
 * look, pointer-lock mouse look, run/jump, a soft circular world boundary, and
 * a smoothed third-person follow camera with a first-person toggle (V).
 *
 * Owns an empty `player` group (the page parents the local avatar to it) and the
 * camera. Movement/look state is exported each frame for the walk animation and
 * the netcode. Keys are ignored while the user is typing in a form field so the
 * customize / room inputs keep working.
 */
import * as THREE from 'three';

export interface MoveState {
	speed: number; // horizontal m/s
	moving: boolean;
	running: boolean;
	yaw: number;
	view: 'third' | 'first';
	pos: THREE.Vector3;
}

export interface Controller {
	player: THREE.Group;
	update(dt: number): MoveState;
	toggleView(): void;
	get locked(): boolean;
	dispose(): void;
}

const WALK = 4.2;
const RUN = 7.4;
const ACCEL = 40;
const GRAVITY = 24;
const JUMP_V = 7.6;
const EYE = 1.5;
const SENS = 0.0022;
const PITCH_MAX = Math.PI / 2 - 0.12;

function isTyping(): boolean {
	const el = document.activeElement as HTMLElement | null;
	if (!el) return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function createController(opts: {
	domElement: HTMLElement;
	camera: THREE.PerspectiveCamera;
	boundaryRadius: number;
	groundY?: number;
	spawn?: THREE.Vector3;
}): Controller {
	const { domElement, camera, boundaryRadius } = opts;
	const groundY = opts.groundY ?? 0;

	const player = new THREE.Group();
	player.position.copy(opts.spawn ?? new THREE.Vector3(0, groundY, 6));

	let yaw = 0; // yaw 0 -> forward is -Z, i.e. looking toward the field centre
	let pitch = -0.08;
	let vy = 0;
	let grounded = true;
	let prevSpace = false;
	let view: 'third' | 'first' = 'third';
	let locked = false;

	const keys = new Set<string>();
	const vel = new THREE.Vector3();
	const camPos = new THREE.Vector3();
	const camTarget = new THREE.Vector3();
	const desired = new THREE.Vector3();
	const forward = new THREE.Vector3();
	const right = new THREE.Vector3();
	const lookDir = new THREE.Vector3();
	const camLook = new THREE.Vector3();

	// ---- input wiring ----
	const onKeyDown = (e: KeyboardEvent) => {
		if (isTyping()) return;
		const k = e.key.toLowerCase();
		if (k === 'v') {
			if (!e.repeat) view = view === 'third' ? 'first' : 'third'; // ignore OS key-repeat
			return;
		}
		if (k === ' ') e.preventDefault();
		keys.add(k);
	};
	const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
	const onBlur = () => keys.clear(); // alt-tab while holding W must not stick
	const onMouseMove = (e: MouseEvent) => {
		if (!locked) return;
		yaw -= e.movementX * SENS;
		pitch = THREE.MathUtils.clamp(pitch - e.movementY * SENS, -PITCH_MAX, PITCH_MAX);
	};
	const onClick = () => {
		if (!locked && domElement.requestPointerLock) {
			const r = domElement.requestPointerLock() as unknown as Promise<void> | undefined;
			if (r && typeof r.catch === 'function') r.catch(() => {}); // rejects during re-lock cooldown
		}
	};
	const onLockChange = () => {
		locked = document.pointerLockElement === domElement;
	};

	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);
	window.addEventListener('blur', onBlur);
	window.addEventListener('mousemove', onMouseMove);
	domElement.addEventListener('click', onClick);
	document.addEventListener('pointerlockchange', onLockChange);

	const state: MoveState = {
		speed: 0,
		moving: false,
		running: false,
		yaw,
		view,
		pos: player.position
	};

	function update(dt: number): MoveState {
		// look basis on the XZ plane (yaw=0 -> -Z forward)
		forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
		right.set(forward.z, 0, -forward.x); // perpendicular, +right

		desired.set(0, 0, 0);
		if (keys.has('w')) desired.add(forward);
		if (keys.has('s')) desired.sub(forward);
		if (keys.has('d')) desired.add(right);
		if (keys.has('a')) desired.sub(right);
		const running = keys.has('shift');
		const wantSpeed = running ? RUN : WALK;

		let hspeed = 0;
		if (desired.lengthSq() > 1e-4) {
			desired.normalize().multiplyScalar(wantSpeed);
		}
		// accelerate horizontal velocity toward desired
		vel.x = THREE.MathUtils.damp(vel.x, desired.x, ACCEL / wantSpeed || ACCEL, dt);
		vel.z = THREE.MathUtils.damp(vel.z, desired.z, ACCEL / wantSpeed || ACCEL, dt);
		hspeed = Math.hypot(vel.x, vel.z);
		if (hspeed < 0.05) {
			vel.x = vel.z = 0;
			hspeed = 0;
		}

		// jump + gravity (rising-edge so holding Space doesn't auto-bounce on landing)
		const spaceDown = keys.has(' ');
		if (spaceDown && grounded && !prevSpace) {
			vy = JUMP_V;
			grounded = false;
		}
		prevSpace = spaceDown;
		vy -= GRAVITY * dt;

		player.position.x += vel.x * dt;
		player.position.z += vel.z * dt;
		player.position.y += vy * dt;
		if (player.position.y <= groundY) {
			player.position.y = groundY;
			vy = 0;
			grounded = true;
		}

		// soft circular boundary
		const r = Math.hypot(player.position.x, player.position.z);
		if (r > boundaryRadius) {
			const s = boundaryRadius / r;
			player.position.x *= s;
			player.position.z *= s;
		}

		// avatar faces the look yaw (its +Z front -> add PI)
		player.rotation.y = yaw + Math.PI;

		// ---- camera ----
		camTarget.set(player.position.x, player.position.y + EYE, player.position.z);
		const cp = Math.cos(pitch);
		lookDir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
		if (view === 'first') {
			camera.position.lerp(camTarget, 1 - Math.exp(-40 * dt));
			camera.lookAt(camLook.copy(camTarget).add(lookDir));
		} else {
			const dist = 4.4;
			camPos.copy(camTarget).addScaledVector(lookDir, -dist);
			camPos.y = Math.max(camPos.y, groundY + 0.6); // don't dive under ground
			camera.position.lerp(camPos, 1 - Math.exp(-14 * dt));
			camera.lookAt(camTarget);
		}

		state.speed = hspeed;
		state.moving = hspeed > 0.1;
		state.running = running && state.moving;
		state.yaw = yaw;
		state.view = view;
		return state;
	}

	function toggleView() {
		view = view === 'third' ? 'first' : 'third';
	}

	function dispose() {
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('keyup', onKeyUp);
		window.removeEventListener('blur', onBlur);
		window.removeEventListener('mousemove', onMouseMove);
		domElement.removeEventListener('click', onClick);
		document.removeEventListener('pointerlockchange', onLockChange);
		if (document.pointerLockElement === domElement) document.exitPointerLock();
	}

	return {
		player,
		update,
		toggleView,
		get locked() {
			return locked;
		},
		dispose
	};
}
