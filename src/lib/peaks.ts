/**
 * Audio decoding + waveform "peaks" utilities.
 *
 * Two layers:
 *  - getAudioBuffer(src): fetch + decode a whole file into an AudioBuffer,
 *    kept in a small LRU cache (decoded audio is BIG -- ~1MB/sec -- so we
 *    only hang on to the handful the editor is actively slicing).
 *  - getPeaks(src): the classic normalized 0..1 amplitude buckets for
 *    <Wavey>. Peaks are tiny, so those cache forever. This path does NOT
 *    retain the decoded buffer unless something else asked for it.
 *
 * Everything degrades gracefully to `null` (callers fall back to plain
 * bars / no-ops) if the browser can't decode or the fetch fails.
 */

const BUFFER_CACHE_MAX = 6;

const peaksCache = new Map<string, number[]>();
const bufferCache = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();

let audioCtx: AudioContext | null = null;

export const getCtx = (): AudioContext | null => {
	if (typeof window === 'undefined') return null;

	const AC =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AC) return null;

	if (!audioCtx) audioCtx = new AC();
	return audioCtx;
};

const decode = async (src: string): Promise<AudioBuffer | null> => {
	const pending = inflight.get(src);
	if (pending) return pending;

	const job = (async (): Promise<AudioBuffer | null> => {
		try {
			const ctx = getCtx();
			if (!ctx) return null;

			const res = await fetch(src);
			const raw = await res.arrayBuffer();
			return await ctx.decodeAudioData(raw);
		} catch (e) {
			console.error('Failed to decode audio', src, e);
			return null;
		} finally {
			inflight.delete(src);
		}
	})();

	inflight.set(src, job);
	return job;
};

/** Decode `src` and keep it warm in the LRU for slicing/mixing. */
export const getAudioBuffer = async (src: string): Promise<AudioBuffer | null> => {
	if (!src) return null;

	const cached = bufferCache.get(src);
	if (cached) {
		// LRU touch
		bufferCache.delete(src);
		bufferCache.set(src, cached);
		return cached;
	}

	const decoded = await decode(src);
	if (!decoded) return null;

	bufferCache.set(src, decoded);
	while (bufferCache.size > BUFFER_CACHE_MAX) {
		const oldest = bufferCache.keys().next().value;
		if (oldest === undefined) break;
		bufferCache.delete(oldest);
	}

	return decoded;
};

/**
 * RMS-bucket a window of a buffer's first channel into `buckets` raw values
 * (NOT normalized -- callers pick the reference max so zoomed windows keep
 * true relative loudness).
 */
export const bucketize = (
	buffer: AudioBuffer,
	buckets: number,
	fromSec = 0,
	toSec = Infinity
): number[] => {
	const channel = buffer.getChannelData(0);
	const from = Math.max(0, Math.floor(fromSec * buffer.sampleRate));
	const to = Math.min(channel.length, Math.ceil(toSec * buffer.sampleRate));

	const span = Math.max(0, to - from);
	const blockSize = Math.floor(span / buckets) || 1;

	const out: number[] = [];
	for (let i = 0; i < buckets; i++) {
		const start = from + i * blockSize;
		let sum = 0;
		for (let j = 0; j < blockSize; j++) {
			const v = channel[start + j] || 0;
			sum += v * v;
		}
		out.push(Math.sqrt(sum / blockSize));
	}

	return out;
};

export const getPeaks = async (src: string, buckets = 180): Promise<number[] | null> => {
	if (!src) return null;

	const cached = peaksCache.get(src);
	if (cached) return cached;

	// Reuse a warm buffer if the editor already decoded this track, but don't
	// force it into the LRU just to draw a little waveform.
	const decoded = bufferCache.get(src) ?? (await decode(src));
	if (!decoded) return null;

	const raw = bucketize(decoded, buckets);
	const max = Math.max(...raw);
	const normalized = max > 0 ? raw.map((v) => v / max) : raw;

	peaksCache.set(src, normalized);
	return normalized;
};
