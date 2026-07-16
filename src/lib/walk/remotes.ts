/**
 * Turns NetSession's interpolated RemoteState[] into on-screen avatars: spawns a
 * cartoony Avatar per remote id, applies customization changes, drives the walk
 * animation from interpolated speed, and disposes avatars when players leave.
 */
import * as THREE from 'three';
import { createAvatar, type Avatar, type AvatarCustom } from './avatar';
import type { RemoteState } from './net';

interface Remote {
	avatar: Avatar;
	customKey: string;
}

const key = (c: AvatarCustom) => `${c.skin}|${c.hair}|${c.hairStyle}|${c.shirt}|${c.pants}|${c.shoes}|${c.height}`;

export class RemoteAvatars {
	private map = new Map<string, Remote>();
	constructor(private scene: THREE.Scene) {}

	update(dt: number, states: RemoteState[]) {
		const seen = new Set<string>();
		for (const s of states) {
			seen.add(s.id);
			let r = this.map.get(s.id);
			if (!r) {
				const avatar = createAvatar(s.custom, s.name);
				this.scene.add(avatar.group);
				r = { avatar, customKey: key(s.custom) };
				this.map.set(s.id, r);
			}
			const k = key(s.custom);
			if (k !== r.customKey) {
				r.avatar.applyCustom(s.custom);
				r.customKey = k;
			}
			r.avatar.setName(s.name);
			r.avatar.group.position.set(s.x, s.y, s.z);
			r.avatar.group.rotation.y = s.yaw + Math.PI;
			r.avatar.update(dt, { speed: s.speed, moving: s.moving, running: s.running });
		}
		// remove avatars whose players are gone
		for (const [id, r] of this.map) {
			if (!seen.has(id)) {
				this.scene.remove(r.avatar.group);
				r.avatar.dispose();
				this.map.delete(id);
			}
		}
	}

	dispose() {
		for (const [, r] of this.map) {
			this.scene.remove(r.avatar.group);
			r.avatar.dispose();
		}
		this.map.clear();
	}
}
