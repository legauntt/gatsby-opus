const TRACK_STRACTOR = /^(\d{2}_)(.*)/;

/**
 *
 * @param value
 * @returns
 */
export const formatTime = (value: number) => {
	if (isNaN(value)) return '...';

	const minutes = Math.floor(value / 60);
	const seconds = Math.floor(value % 60);

	return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
};

export const formatTrack = (value: string) => {
	let niceTrack = value.split('/').slice(-1)[0].replace('.m4a', '').replace('.mp3', '');
	const matches = TRACK_STRACTOR.exec(niceTrack);

	if (matches?.length == 3) {
		niceTrack = matches[2];
	}

	return niceTrack.toUpperCase();
};
