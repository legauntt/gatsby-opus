/**
 * Decode an audio file into a small array of normalized amplitude "peaks"
 * (0..1) so <Wavey> can draw an actual waveform instead of a flat bar.
 *
 * Results are cached per src, and concurrent requests for the same src share
 * a single decode. Everything degrades gracefully to `null` (Wavey falls back
 * to the plain bar) if the browser can't decode or the fetch fails.
 */

const peaksCache = new Map<string, number[]>();
const inflight = new Map<string, Promise<number[] | null>>();

let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
	if (typeof window === 'undefined') return null;

	const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AC) return null;

	if (!audioCtx) audioCtx = new AC();
	return audioCtx;
};

export const getPeaks = (src: string, buckets = 180): Promise<number[] | null> => {
	if (!src) return Promise.resolve(null);

	const cached = peaksCache.get(src);
	if (cached) return Promise.resolve(cached);

	const pending = inflight.get(src);
	if (pending) return pending;

	const job = (async (): Promise<number[] | null> => {
		try {
			const ctx = getCtx();
			if (!ctx) return null;

			const res = await fetch(src);
			const raw = await res.arrayBuffer();
			const decoded = await ctx.decodeAudioData(raw);

			const channel = decoded.getChannelData(0);
			const blockSize = Math.floor(channel.length / buckets) || 1;

			const out: number[] = [];
			let max = 0;

			for (let i = 0; i < buckets; i++) {
				const start = i * blockSize;
				let sum = 0;
				for (let j = 0; j < blockSize; j++) {
					const v = channel[start + j] || 0;
					sum += v * v;
				}
				const rms = Math.sqrt(sum / blockSize);
				out.push(rms);
				if (rms > max) max = rms;
			}

			const normalized = max > 0 ? out.map((v) => v / max) : out;
			peaksCache.set(src, normalized);
			return normalized;
		} catch (e) {
			console.error('Failed to compute waveform peaks', e);
			return null;
		} finally {
			inflight.delete(src);
		}
	})();

	inflight.set(src, job);
	return job;
};
