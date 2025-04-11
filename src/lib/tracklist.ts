export const TRACKLIST = [
	'01_whoir.m4a',
	'02_glosky.m4a',
	'03_dabez.m4a',
	'04_balls.m4a',
	'05_nchain.m4a',
	'06_someday.m4a',
	'07_made.m4a',
	'08_road.m4a',
	'09_novipain.m4a',
	'10_gravity.m4a',
	'11_medusa.m4a',
	'12_rounds.m4a',
	'13_party.m4a',

	'bonus_2bad2die.m4a',
	'bonus_all-down.m4a',
	'bonus_camaro.m4a',
	'bonus_hooodin.m4a',
	'bonus_lawn-time.m4a',
	'bonus_poncho.m4a',
	'bonus_whale.m4a'
].map((trackName) => {
	if (trackName.startsWith('bonus_')) {
		return `/bonus/${trackName}`;
	} else {
		return `/dvdp/${trackName}`;
	}
});

export const SLOW_C = [
	'ambience.mp3',
	'dreams.mp3',
	'moody.mp3',
	'pullin_doublexl.mp3',
	'pullin_large.mp3',
	'strawng.mp3',
	'woah.mp3'
].map((trackName) => `/butts/${trackName}`);
