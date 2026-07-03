import { TREASURE_TROVE } from '$lib/cetlist';

export const ALBUM_ART: { [key: string]: string } = {
	DEMON: '/lar/marquee.png',
	BONUS: '/lar/20.png',
	SEVEN: '/lar/seven.png',
	CLICES: '/lar/but.webp'
};

export const ALBUM_TITLES: { [key: string]: string } = {
	DEMON: 'Demonophonic Blues',
	BONUS: 'Bonus',
	SEVEN: 'Seven',
	CLICES: 'Clices'
};

const STASH_KEY = 'tct_jukebawx';

/**
 * Da beeg global player. One audio element (rendered by <Jukebawx> in the
 * layout) plays whole albums and keeps going while you wander the site.
 *
 * This is only the sane path -- the per-track chaos layering in glosky is
 * untouched and remains as insane as ever.
 */
class Jukebawx {
	album: string = $state('');
	index: number = $state(0);
	paused: boolean = $state(true);
	currentTime: number = $state(0);
	duration: number = $state(NaN);

	/** One-shot seek applied once the <audio> has metadata (session restore). */
	pendingSeek: number | null = null;

	queue: string[] = $derived(TREASURE_TROVE[this.album] ?? []);
	track: string = $derived(this.queue[this.index] ?? '');

	playAlbum(album: string) {
		this.playTrack(album, 0);
	}

	/** Play one track, with the rest of its album queued behind it. */
	playTrack(album: string, index: number) {
		if (!TREASURE_TROVE[album]?.[index]) {
			return;
		}

		this.album = album;
		this.index = index;
		this.pendingSeek = null;
		this.currentTime = 0;
		this.paused = false;
	}

	next() {
		if (!this.track) {
			return;
		}

		if (this.index + 1 >= this.queue.length) {
			// Album's over. Park at the top of the last track, keep the bar around.
			this.paused = true;
			this.currentTime = 0;
			return;
		}

		this.index++;
		this.currentTime = 0;

		// Auto-advance must un-pause: the element fires 'pause' right before
		// 'ended', which flips our bound state back to paused.
		this.paused = false;
	}

	prev() {
		if (!this.track) {
			return;
		}

		// Restart the track unless we're within its first few seconds.
		if (this.currentTime > 3 || this.index === 0) {
			this.currentTime = 0;
			return;
		}

		this.index--;
		this.currentTime = 0;
	}

	togglePause() {
		if (this.track) {
			this.paused = !this.paused;
		}
	}

	seek(newTime: number) {
		this.currentTime = newTime;
	}

	stop() {
		this.paused = true;
		this.album = '';
		this.index = 0;
		this.currentTime = 0;
		this.duration = NaN;
		this.pendingSeek = null;

		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(STASH_KEY);
		}
	}

	/** Remember what's playing so a reload can pick up where you left off. */
	stash() {
		if (typeof localStorage === 'undefined' || !this.track) {
			return;
		}

		localStorage.setItem(
			STASH_KEY,
			JSON.stringify({
				album: this.album,
				index: this.index,
				time: Math.floor(this.currentTime)
			})
		);
	}

	/** Restore a stashed session, paused (autoplay policies say no anyway). */
	unstash() {
		if (typeof localStorage === 'undefined') {
			return;
		}

		try {
			const raw = localStorage.getItem(STASH_KEY);
			if (!raw) {
				return;
			}

			const { album, index, time } = JSON.parse(raw);
			if (!TREASURE_TROVE[album]?.[index]) {
				return;
			}

			this.album = album;
			this.index = index;
			this.pendingSeek = typeof time === 'number' && time > 0 ? time : null;
			this.paused = true;
		} catch (e) {
			console.error('Failed to unstash da jukebawx', e);
		}
	}
}

export const jukebawx = new Jukebawx();
