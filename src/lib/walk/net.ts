/**
 * Transport-agnostic multiplayer for the walkabout.
 *
 * Two transports, both feeding one peers map so you see everyone together:
 *  - BroadcastTransport: same-origin BroadcastChannel -> other tabs/windows on
 *    THIS machine. Always on. Zero infra.
 *  - PeerTransport: opt-in cross-device via PeerJS's free public broker. The
 *    room code deterministically names a HOST peer id; the first joiner claims
 *    it and relays a star mesh; later joiners connect to it as clients. PeerJS
 *    is dynamic-imported so it never touches SSR/bundle top level.
 *
 * State is dead simple: every ~12Hz tick each player broadcasts its full state
 * INCLUDING its avatar params + name, so there is no separate roster/hello sync
 * to get wrong. Remotes are rendered ~100ms in the past by interpolating a small
 * ring buffer, timestamped on RECEIPT so peer clock skew never matters.
 */
import type { AvatarCustom } from './avatar';

export type NetStatus = 'local' | 'connecting' | 'hosting' | 'joined' | 'error';

export interface PlayerSnapshot {
	x: number;
	y: number;
	z: number;
	yaw: number;
	speed: number;
	moving: boolean;
	running: boolean;
}

export interface RemoteState extends PlayerSnapshot {
	id: string;
	name: string;
	custom: AvatarCustom;
}

type StateMsg = {
	k: 'state';
	id: string;
	name: string;
	c: AvatarCustom;
	x: number;
	y: number;
	z: number;
	yaw: number;
	sp: number;
	mv: boolean;
	rn: boolean;
};
type ByeMsg = { k: 'bye'; id: string };
type Msg = StateMsg | ByeMsg;

interface Transport {
	send(m: Msg): void;
	onMessage(cb: (m: Msg) => void): void;
	close(): void;
}

const rid = () => Math.random().toString(36).slice(2, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'lobby';
const TICK_MS = 80; // ~12.5 Hz
const INTERP_MS = 100; // render remotes this far in the past
const STALE_MS = 5000;

// --------------------------------------------------------------------------- //
class BroadcastTransport implements Transport {
	private ch: BroadcastChannel;
	private cb: (m: Msg) => void = () => {};
	constructor(room: string) {
		this.ch = new BroadcastChannel('tct-field-' + slug(room));
		this.ch.onmessage = (e) => this.cb(e.data as Msg);
	}
	send(m: Msg) {
		try {
			this.ch.postMessage(m);
		} catch {
			/* channel closing */
		}
	}
	onMessage(cb: (m: Msg) => void) {
		this.cb = cb;
	}
	close() {
		this.ch.close();
	}
}

// PeerJS star topology. `Peer` is injected (dynamic-imported by the caller).
class PeerTransport implements Transport {
	private peer: import('peerjs').Peer | null = null;
	private isHost = false;
	private conns = new Map<string, import('peerjs').DataConnection>();
	private connId = new Map<import('peerjs').DataConnection, string>(); // conn -> logical player id
	private cb: (m: Msg) => void = () => {};

	private hostId: string;
	private closed = false;
	private attempts = 0;

	constructor(
		room: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private Peer: any,
		private onStatus: (s: NetStatus) => void
	) {
		this.hostId = 'tct-field-' + slug(room);
		this.becomeHost();
	}

	private becomeHost() {
		if (this.closed) return;
		this.isHost = false;
		this.onStatus('connecting');
		const peer = new this.Peer(this.hostId);
		this.peer = peer;
		peer.on('open', () => {
			this.isHost = true;
			this.attempts = 0;
			this.onStatus('hosting');
		});
		peer.on('connection', (conn: import('peerjs').DataConnection) => {
			conn.on('open', () => this.conns.set(conn.connectionId, conn));
			conn.on('data', (data: unknown) => this.hostRelay(conn, data as Msg));
			conn.on('close', () => this.dropConn(conn));
			conn.on('error', () => this.dropConn(conn));
		});
		// a signalling-socket blip: let PeerJS reconnect; established P2P links survive it
		peer.on('disconnected', () => {
			if (!this.closed) try { peer.reconnect(); } catch { /* already destroyed */ }
		});
		peer.on('error', (err: { type?: string }) => {
			if (this.closed) return;
			// only the id-claim race turns a would-be host into a client
			if (err?.type === 'unavailable-id' && !this.isHost) {
				peer.destroy();
				this.becomeClient();
			} else if (err?.type === 'network') {
				// recoverable; handled by 'disconnected'/reconnect -- do NOT tear down
			} else if (!this.isHost) {
				this.onStatus('error');
			}
		});
	}

	private becomeClient() {
		if (this.closed) return;
		this.isHost = false;
		this.onStatus('connecting');
		const peer = new this.Peer();
		this.peer = peer;
		peer.on('open', () => {
			const conn = peer.connect(this.hostId, { reliable: true });
			conn.on('open', () => {
				this.conns.set(conn.connectionId, conn);
				this.attempts = 0;
				this.onStatus('joined');
			});
			conn.on('data', (data: unknown) => this.cb(data as Msg));
			conn.on('close', () => this.reElect()); // host left -> try to take over
			conn.on('error', () => this.reElect());
		});
		peer.on('disconnected', () => {
			if (!this.closed) try { peer.reconnect(); } catch { /* already destroyed */ }
		});
		peer.on('error', (err: { type?: string }) => {
			if (this.closed) return;
			if (err?.type === 'peer-unavailable') this.reElect(); // host id is free now
			else if (err?.type !== 'network') this.onStatus('error');
		});
	}

	/** Host vanished: race (with jitter) to re-claim the deterministic host id. */
	private reElect() {
		if (this.closed) return;
		if (this.attempts++ > 6) {
			this.onStatus('error');
			return;
		}
		this.onStatus('connecting');
		try {
			this.peer?.destroy();
		} catch {
			/* already gone */
		}
		this.conns.clear();
		this.connId.clear();
		const delay = 150 + Math.random() * 500; // jitter so ex-clients don't collide
		setTimeout(() => {
			if (!this.closed) this.becomeHost();
		}, delay);
	}

	private hostRelay(from: import('peerjs').DataConnection, m: Msg) {
		if (m && 'id' in m) this.connId.set(from, m.id);
		this.cb(m); // host sees it
		for (const [, c] of this.conns) if (c !== from && c.open) c.send(m); // fan out
	}

	private dropConn(conn: import('peerjs').DataConnection) {
		this.conns.delete(conn.connectionId);
		const id = this.connId.get(conn);
		this.connId.delete(conn);
		if (id) {
			const bye: ByeMsg = { k: 'bye', id };
			this.cb(bye);
			for (const [, c] of this.conns) if (c.open) c.send(bye);
		}
	}

	send(m: Msg) {
		for (const [, c] of this.conns) if (c.open) c.send(m);
	}
	onMessage(cb: (m: Msg) => void) {
		this.cb = cb;
	}
	close() {
		this.closed = true;
		this.peer?.destroy();
		this.conns.clear();
	}
}

// --------------------------------------------------------------------------- //
interface PeerRec {
	id: string;
	name: string;
	custom: AvatarCustom;
	buf: { t: number; x: number; y: number; z: number; yaw: number; sp: number; mv: boolean; rn: boolean }[];
	last: number;
}

export interface NetSessionOpts {
	name: string;
	custom: AvatarCustom;
	onStatus?: (s: NetStatus) => void;
	onCount?: (n: number) => void;
	onError?: (msg: string) => void;
}

export class NetSession {
	readonly localId = rid();
	private name: string;
	private custom: AvatarCustom;
	private transports: Transport[] = [];
	private peerTransport: PeerTransport | null = null;
	private peers = new Map<string, PeerRec>();
	private lastSend = 0;
	private local: PlayerSnapshot = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, moving: false, running: false };
	private opts: NetSessionOpts;

	constructor(opts: NetSessionOpts) {
		this.opts = opts;
		this.name = opts.name;
		this.custom = opts.custom;
	}

	/** Same-device transport, always on. */
	startLocal(room = 'field') {
		const t = new BroadcastTransport(room);
		t.onMessage((m) => this.handle(m));
		this.transports.push(t);
	}

	/** Cross-device via PeerJS room code (dynamic-imports peerjs). */
	async joinRoom(code: string) {
		if (this.peerTransport) this.leaveRoom();
		try {
			const mod = await import('peerjs');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const Peer = (mod as any).default ?? (mod as any).Peer;
			const t = new PeerTransport(code, Peer, (s) => this.opts.onStatus?.(s));
			t.onMessage((m) => this.handle(m));
			this.transports.push(t);
			this.peerTransport = t;
		} catch (e) {
			console.error('peerjs load/join failed', e);
			this.opts.onError?.('Could not reach the multiplayer broker');
			this.opts.onStatus?.('error');
		}
	}

	leaveRoom() {
		if (!this.peerTransport) return;
		this.sendBye(this.peerTransport);
		this.peerTransport.close();
		this.transports = this.transports.filter((t) => t !== this.peerTransport);
		this.peerTransport = null;
		this.opts.onStatus?.('local');
	}

	setName(n: string) {
		this.name = n;
	}
	setParams(c: AvatarCustom) {
		this.custom = c;
	}
	setLocal(s: PlayerSnapshot) {
		this.local = s;
	}

	private handle(m: Msg) {
		if (!m || m.id === this.localId) return;
		if (m.k === 'bye') {
			if (this.peers.delete(m.id)) this.opts.onCount?.(this.peers.size + 1);
			return;
		}
		if (m.k !== 'state') return;
		const now = performance.now();
		let rec = this.peers.get(m.id);
		if (!rec) {
			rec = { id: m.id, name: m.name, custom: m.c, buf: [], last: now };
			this.peers.set(m.id, rec);
			this.opts.onCount?.(this.peers.size + 1);
		}
		rec.name = m.name;
		rec.custom = m.c;
		rec.last = now;
		rec.buf.push({ t: now, x: m.x, y: m.y, z: m.z, yaw: m.yaw, sp: m.sp, mv: m.mv, rn: m.rn });
		if (rec.buf.length > 8) rec.buf.shift();
	}

	/** Throttled outgoing tick. Call every frame with the current local snapshot. */
	sendState(s: PlayerSnapshot) {
		this.local = s;
		const now = performance.now();
		if (now - this.lastSend < TICK_MS) return;
		this.lastSend = now;
		const m: StateMsg = {
			k: 'state',
			id: this.localId,
			name: this.name,
			c: this.custom,
			x: s.x,
			y: s.y,
			z: s.z,
			yaw: s.yaw,
			sp: s.speed,
			mv: s.moving,
			rn: s.running
		};
		for (const t of this.transports) t.send(m);
	}

	private sendBye(t: Transport) {
		t.send({ k: 'bye', id: this.localId });
	}

	/** Prune stale peers; call each frame. */
	pump() {
		const now = performance.now();
		let changed = false;
		for (const [id, rec] of this.peers) {
			if (now - rec.last > STALE_MS) {
				this.peers.delete(id);
				changed = true;
			}
		}
		if (changed) this.opts.onCount?.(this.peers.size + 1);
	}

	/** Interpolated remote states, rendered ~INTERP_MS in the past. */
	sampleRemotes(): RemoteState[] {
		const target = performance.now() - INTERP_MS;
		const out: RemoteState[] = [];
		for (const rec of this.peers.values()) {
			const b = rec.buf;
			if (!b.length) continue;
			let s: (typeof b)[number];
			if (b.length === 1 || target <= b[0].t) {
				s = b[0];
			} else if (target >= b[b.length - 1].t) {
				s = b[b.length - 1];
			} else {
				let i = 0;
				while (i < b.length - 1 && b[i + 1].t < target) i++;
				const a = b[i];
				const c = b[i + 1];
				const f = (target - a.t) / Math.max(1, c.t - a.t);
				let dyaw = c.yaw - a.yaw;
				while (dyaw > Math.PI) dyaw -= Math.PI * 2;
				while (dyaw < -Math.PI) dyaw += Math.PI * 2;
				s = {
					t: target,
					x: a.x + (c.x - a.x) * f,
					y: a.y + (c.y - a.y) * f,
					z: a.z + (c.z - a.z) * f,
					yaw: a.yaw + dyaw * f,
					sp: a.sp + (c.sp - a.sp) * f,
					mv: c.mv,
					rn: c.rn
				};
			}
			out.push({
				id: rec.id,
				name: rec.name,
				custom: rec.custom,
				x: s.x,
				y: s.y,
				z: s.z,
				yaw: s.yaw,
				speed: s.sp,
				moving: s.mv,
				running: s.rn
			});
		}
		return out;
	}

	get count() {
		return this.peers.size + 1;
	}

	dispose() {
		for (const t of this.transports) {
			this.sendBye(t);
			t.close();
		}
		this.transports = [];
		this.peerTransport = null;
		this.peers.clear();
	}
}
