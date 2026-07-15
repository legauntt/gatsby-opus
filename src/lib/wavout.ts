import { buildSegments, type MixSlice } from '$lib/decks.svelte';
import { getAudioBuffer } from '$lib/peaks';

const RATE = 44100;

/**
 * Bounce da mix: render every slice (x its loops) back-to-back through an
 * OfflineAudioContext and hand back a 16-bit stereo WAV blob. Returns null
 * when there's nothing renderable.
 */
export const renderMixToWav = async (slices: MixSlice[]): Promise<Blob | null> => {
	const srcs = [...new Set(slices.map((s) => s.audioFile).filter(Boolean))];
	const decoded = await Promise.all(srcs.map((src) => getAudioBuffer(src)));

	const buffers = new Map<string, AudioBuffer>();
	const durations = new Map<string, number>();
	srcs.forEach((src, i) => {
		const buf = decoded[i];
		if (buf) {
			buffers.set(src, buf);
			durations.set(src, buf.duration);
		}
	});

	const { segments, total } = buildSegments(slices, durations);
	if (!segments.length || total <= 0) return null;

	const off = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);

	for (const seg of segments) {
		const buffer = buffers.get(seg.src);
		if (!buffer) continue;

		const node = off.createBufferSource();
		node.buffer = buffer;
		node.connect(off.destination);
		node.start(seg.when, seg.offset, seg.duration);
	}

	const rendered = await off.startRendering();
	return encodeWav(rendered);
};

const encodeWav = (buffer: AudioBuffer): Blob => {
	const channels = Math.min(2, buffer.numberOfChannels);
	const frames = buffer.length;
	const dataSize = frames * channels * 2;

	const out = new ArrayBuffer(44 + dataSize);
	const view = new DataView(out);

	const writeStr = (offset: number, s: string) => {
		for (let i = 0; i < s.length; i++) {
			view.setUint8(offset + i, s.charCodeAt(i));
		}
	};

	writeStr(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeStr(8, 'WAVE');
	writeStr(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channels, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, 16, true);
	writeStr(36, 'data');
	view.setUint32(40, dataSize, true);

	const chans: Float32Array[] = [];
	for (let c = 0; c < channels; c++) {
		chans.push(buffer.getChannelData(c));
	}

	let o = 44;
	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < channels; c++) {
			const v = Math.max(-1, Math.min(1, chans[c][i]));
			view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
			o += 2;
		}
	}

	return new Blob([out], { type: 'audio/wav' });
};

export const downloadBlob = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
};
