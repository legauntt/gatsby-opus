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
	return value.split('/').slice(-1)[0];
};
