/**
 * Lazy, reactive track durations for the album page. Reading
 * trackDuration(src) kicks off a metadata-only fetch the first time and
 * returns undefined until the browser reports back; the $state cache makes
 * any template that read it re-render when the number lands.
 */

const cache: { [src: string]: number } = $state({});
const inflight = new Set<string>();

export const trackDuration = (src: string): number | undefined => {
	if (!src || typeof document === 'undefined') {
		return undefined;
	}

	if (cache[src] == null && !inflight.has(src)) {
		inflight.add(src);

		const probe = new Audio();
		probe.preload = 'metadata';

		probe.addEventListener('loadedmetadata', () => {
			cache[src] = probe.duration;
		});

		probe.addEventListener('error', () => {
			cache[src] = NaN;
		});

		probe.src = src;
	}

	return cache[src];
};
