/**
 * Green-meadow biome for the walkabout: flat walkable ground, a sea of
 * instanced wind-swayed grass (animated entirely in the vertex shader -- no
 * per-frame CPU), scattered trees/bushes/flowers/rocks, a bright daytime sky
 * dome, fog, and daylight lighting. The monarch flock dances above it.
 *
 * createBiome(scene) mutates the scene (background, fog, lights, geometry) and
 * returns a small handle the page drives + disposes.
 */
import * as THREE from 'three';

export interface Biome {
	group: THREE.Group;
	update(dt: number): void;
	dispose(): void;
	boundaryRadius: number;
	groundY: number;
}

const BOUNDARY = 55; // player clamp radius
const GROUND = 420; // ground plane size

function bladeGeometry(): THREE.BufferGeometry {
	// a tapered, slightly curved blade, 4 vertical segments (so wind bends smoothly)
	const segs = 4;
	const h = 0.62;
	const pos: number[] = [];
	const idx: number[] = [];
	for (let i = 0; i <= segs; i++) {
		const t = i / segs;
		const y = t * h;
		const hw = THREE.MathUtils.lerp(0.032, 0.004, t);
		const curve = t * t * 0.05;
		pos.push(-hw, y, curve, hw, y, curve);
	}
	for (let i = 0; i < segs; i++) {
		const a = i * 2;
		idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

function groundTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 512;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#4f7d34';
	ctx.fillRect(0, 0, 512, 512);
	// patchy green mottle
	const greens = ['#5a8c3c', '#456f2c', '#5f9440', '#3f6528', '#6a9c48'];
	for (let i = 0; i < 2600; i++) {
		ctx.fillStyle = greens[(Math.random() * greens.length) | 0];
		ctx.globalAlpha = 0.25 + Math.random() * 0.35;
		const x = Math.random() * 512;
		const y = Math.random() * 512;
		const r = 3 + Math.random() * 22;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.repeat.set(60, 60);
	tex.anisotropy = 8;
	return tex;
}

function skyDome(): THREE.Mesh {
	const uniforms = {
		top: { value: new THREE.Color('#3f83d6') },
		bottom: { value: new THREE.Color('#cfe8f5') },
		offset: { value: 12 },
		expo: { value: 0.7 }
	};
	const mat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		uniforms,
		vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
		fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float expo;
			void main(){ float h = normalize(vP + vec3(0.0,offset,0.0)).y; float t = pow(max(h,0.0), expo); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }`
	});
	const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
	dome.frustumCulled = false;
	return dome;
}

// deterministic-ish scatter helper
function scatterXZ(n: number, rMin: number, rMax: number, cb: (x: number, z: number, i: number) => void) {
	for (let i = 0; i < n; i++) {
		const a = Math.random() * Math.PI * 2;
		const r = Math.sqrt(rMin * rMin + Math.random() * (rMax * rMax - rMin * rMin));
		cb(Math.cos(a) * r, Math.sin(a) * r, i);
	}
}

export function createBiome(scene: THREE.Scene): Biome {
	const group = new THREE.Group();
	scene.add(group);

	// sky + fog
	const dome = skyDome();
	group.add(dome);
	scene.background = null;
	scene.fog = new THREE.Fog(new THREE.Color('#cfe8f5'), 60, 190);

	// lighting: warm sun + sky/ground hemisphere
	const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
	sun.position.set(40, 70, 30);
	const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x5a7a3a, 0.75);
	group.add(sun, hemi);

	// ground
	const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1.0, metalness: 0 });
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = false;
	group.add(ground);

	// ---- grass: one InstancedMesh, wind entirely in the vertex shader ----
	const windUniform = { value: 0 };
	const GRASS = 16000;
	const bladeGeo = bladeGeometry();
	const grassMat = new THREE.MeshStandardMaterial({ color: 0x5f9440, roughness: 1, side: THREE.DoubleSide });
	grassMat.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = windUniform;
		shader.vertexShader =
			'uniform float uTime;\n' +
			shader.vertexShader.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
				vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
				float hf = clamp(position.y / 0.62, 0.0, 1.0);
				hf = hf * hf;
				float ph = uTime * 1.6 + wp.x * 0.35 + wp.z * 0.35;
				transformed.x += sin(ph) * 0.14 * hf;
				transformed.z += cos(ph * 0.8) * 0.09 * hf;`
			);
	};
	const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS);
	grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRASS * 3), 3);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const s = new THREE.Vector3();
	const p = new THREE.Vector3();
	const col = new THREE.Color();
	let gi = 0;
	scatterXZ(GRASS, 0.5, BOUNDARY + 6, (x, z) => {
		p.set(x, 0, z);
		q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
		const sc = 0.7 + Math.random() * 0.9;
		s.set(sc, sc * (0.8 + Math.random() * 0.6), sc);
		m.compose(p, q, s);
		grass.setMatrixAt(gi, m);
		col.setHSL(0.28 + Math.random() * 0.07, 0.5 + Math.random() * 0.2, 0.32 + Math.random() * 0.12);
		grass.setColorAt(gi, col);
		gi++;
	});
	grass.instanceMatrix.needsUpdate = true;
	if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
	grass.frustumCulled = false;
	group.add(grass);

	// ---- flowers: tiny bright instanced dots among the grass ----
	const flowerGeo = new THREE.SphereGeometry(0.07, 8, 6);
	const flowerMat = new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: false });
	const FLOWERS = 500;
	const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FLOWERS);
	flowers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLOWERS * 3), 3);
	const fcols = ['#f6e05e', '#f687b3', '#fc8181', '#c3dafe', '#faf089', '#ffffff'];
	let fi = 0;
	scatterXZ(FLOWERS, 1, BOUNDARY, (x, z) => {
		p.set(x, 0.32 + Math.random() * 0.2, z);
		s.setScalar(0.7 + Math.random() * 0.8);
		m.compose(p, q.identity(), s);
		flowers.setMatrixAt(fi, m);
		col.set(fcols[(Math.random() * fcols.length) | 0]);
		flowers.setColorAt(fi, col);
		fi++;
	});
	flowers.instanceMatrix.needsUpdate = true;
	if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
	group.add(flowers);

	// ---- trees: instanced trunks + instanced foliage blobs, ringing the field ----
	const NTREE = 46;
	const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 8);
	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
	const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, NTREE);
	const foliageGeo = new THREE.IcosahedronGeometry(1.7, 1);
	const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3e7a34, roughness: 1, flatShading: true });
	const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, NTREE * 3);
	foliage.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NTREE * 3 * 3), 3);
	let ti = 0;
	let foi = 0;
	scatterXZ(NTREE, BOUNDARY - 6, BOUNDARY + 22, (x, z) => {
		const th = 2.6 + Math.random() * 1.8;
		p.set(x, th / 2, z);
		s.set(1, th / 3.2, 1);
		m.compose(p, q.identity(), s);
		trunks.setMatrixAt(ti++, m);
		const blobs = 2 + ((Math.random() * 2) | 0);
		for (let b = 0; b < blobs; b++) {
			p.set(x + (Math.random() - 0.5) * 1.6, th + 0.4 + b * 0.9 + Math.random() * 0.4, z + (Math.random() - 0.5) * 1.6);
			const fs = 1.1 + Math.random() * 0.9;
			s.setScalar(fs);
			m.compose(p, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), s);
			foliage.setMatrixAt(foi, m);
			col.setHSL(0.29, 0.5, 0.24 + Math.random() * 0.1);
			foliage.setColorAt(foi, col);
			foi++;
		}
	});
	// fill any unused foliage instances offscreen
	for (; foi < NTREE * 3; foi++) {
		m.compose(p.set(0, -1000, 0), q.identity(), s.setScalar(0.001));
		foliage.setMatrixAt(foi, m);
	}
	trunks.count = ti;
	trunks.instanceMatrix.needsUpdate = true;
	foliage.instanceMatrix.needsUpdate = true;
	if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
	group.add(trunks, foliage);

	// ---- bushes + rocks ----
	const bushGeo = new THREE.IcosahedronGeometry(0.9, 1);
	const bushMat = new THREE.MeshStandardMaterial({ color: 0x4a8038, roughness: 1, flatShading: true });
	const NBUSH = 60;
	const bushes = new THREE.InstancedMesh(bushGeo, bushMat, NBUSH);
	let bi = 0;
	scatterXZ(NBUSH, 4, BOUNDARY - 2, (x, z) => {
		p.set(x, 0.5 + Math.random() * 0.2, z);
		s.set(0.8 + Math.random() * 0.9, 0.6 + Math.random() * 0.5, 0.8 + Math.random() * 0.9);
		m.compose(p, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), s);
		bushes.setMatrixAt(bi++, m);
	});
	bushes.instanceMatrix.needsUpdate = true;
	group.add(bushes);

	const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
	const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 1, flatShading: true });
	const NROCK = 26;
	const rocks = new THREE.InstancedMesh(rockGeo, rockMat, NROCK);
	let ri = 0;
	scatterXZ(NROCK, 6, BOUNDARY, (x, z) => {
		p.set(x, 0.15 + Math.random() * 0.2, z);
		s.setScalar(0.5 + Math.random() * 1.1);
		m.compose(p, q.setFromAxisAngle(new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6), s);
		rocks.setMatrixAt(ri++, m);
	});
	rocks.instanceMatrix.needsUpdate = true;
	group.add(rocks);

	// ---- clouds: a few drifting billboards ----
	const cloudTex = (() => {
		const c = document.createElement('canvas');
		c.width = c.height = 128;
		const ctx = c.getContext('2d')!;
		const grd = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
		grd.addColorStop(0, 'rgba(255,255,255,0.95)');
		grd.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = grd;
		ctx.fillRect(0, 0, 128, 128);
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		return t;
	})();
	const clouds: THREE.Sprite[] = [];
	for (let i = 0; i < 14; i++) {
		const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85 }));
		sp.position.set((Math.random() - 0.5) * 260, 45 + Math.random() * 35, (Math.random() - 0.5) * 260);
		const sc = 20 + Math.random() * 28;
		sp.scale.set(sc, sc * 0.6, 1);
		clouds.push(sp);
		group.add(sp);
	}

	function update(dt: number) {
		windUniform.value += dt;
		for (const c of clouds) {
			c.position.x += dt * 0.6;
			if (c.position.x > 150) c.position.x = -150;
		}
	}

	function dispose() {
		group.traverse((o) => {
			const mesh = o as THREE.Mesh & { isInstancedMesh?: boolean; isSprite?: boolean };
			// Sprites (clouds) reuse THREE's module-level singleton geometry -- never
			// dispose it or every future Sprite in the app breaks.
			if (!mesh.isSprite) mesh.geometry?.dispose?.();
			if (mesh.isInstancedMesh) (mesh as unknown as THREE.InstancedMesh).dispose(); // frees instanceMatrix/Color
			const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(mat)) mat.forEach((mm) => mm?.dispose());
			else mat?.dispose?.();
		});
		(groundMat.map as THREE.Texture)?.dispose();
		cloudTex.dispose();
		scene.remove(group);
		scene.fog = null;
	}

	return { group, update, dispose, boundaryRadius: BOUNDARY, groundY: 0 };
}
