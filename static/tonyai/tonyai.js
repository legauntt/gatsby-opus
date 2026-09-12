(() => {
	'use strict';
	const byId = (id) => document.getElementById(id);
	const audio = byId('audio');
	const rows = [...document.querySelectorAll('.track')];
	const buttons = rows.map((row) => row.querySelector('[data-play]'));
	const status = byId('status');
	const shuffleButtons = [...document.querySelectorAll('[data-shuffle]')];
	const canvas = byId('waveform');
	const context = canvas.getContext('2d');
	let tracks = [];
	let visible = [];
	let queue = [];
	let orderedQueue = [];
	let shuffle = false;
	let current = null;
	let request = 0;
	let autoAdvance = true;

	function shuffled(items) {
		const result = [...items];
		for (let i = result.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[result[i], result[j]] = [result[j], result[i]];
		}
		return result;
	}
	function toggleShuffle() {
		shuffle = !shuffle;
		const index = queue.findIndex((track) => track.id === current?.id);
		if (index >= 0) {
			// Keep the current song and the order used by Previous.
			const played = queue.slice(0, index + 1);
			const upcoming = queue.slice(index + 1);
			const ids = new Set(upcoming.map((track) => track.id));
			queue = [
				...played,
				...(shuffle ? shuffled(upcoming) : orderedQueue.filter((track) => ids.has(track.id)))
			];
		}
		for (const button of shuffleButtons) button.setAttribute('aria-pressed', String(shuffle));
		message(
			shuffle
				? 'Shuffle on. Upcoming tracks will play in random order.'
				: 'Shuffle off. Upcoming tracks will follow the collection order.'
		);
		playbackState();
	}
	function time(seconds) {
		const value = Math.max(0, Math.floor(seconds || 0));
		return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
	}
	function message(text, error = false) {
		status.textContent = text;
		status.classList.toggle('error', error);
	}
	function duration() {
		return Number.isFinite(audio.duration) ? audio.duration : current?.duration || 0;
	}
	function draw() {
		if (!current || !context) return;
		const { width, height } = canvas.getBoundingClientRect();
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		context.scale(ratio, ratio);
		const progress = audio.currentTime / (duration() || 1);
		const count = Math.max(1, Math.min(current.waveform.length, Math.floor(width / 4)));
		for (let i = 0; i < count; i++) {
			const value = current.waveform[Math.floor((i * current.waveform.length) / count)];
			const bar = Math.max(2, (value / 100) * (height - 4));
			context.fillStyle = i / count < progress ? '#deee9b' : '#5c7055';
			context.fillRect(
				(i * width) / count,
				(height - bar) / 2,
				Math.max(1, width / count - 2),
				bar
			);
		}
	}
	function progress() {
		byId('elapsed').textContent = time(audio.currentTime);
		byId('duration').textContent = time(duration());
		byId('seek').max = String(duration() || 1);
		byId('seek').value = String(audio.currentTime);
		byId('seek').setAttribute(
			'aria-valuetext',
			`${time(audio.currentTime)} of ${time(duration())}`
		);
		draw();
	}
	function playbackState() {
		const playing = current && !audio.paused;
		byId('toggle').setAttribute('aria-label', playing ? 'Pause' : 'Play');
		byId('toggle').firstElementChild.textContent = playing ? 'Ⅱ' : '▶';
		for (const button of buttons) {
			const active = button.dataset.play === current?.id;
			const track = tracks.find((item) => item.id === button.dataset.play);
			button.closest('.track').classList.toggle('current', active);
			button.setAttribute('aria-pressed', String(Boolean(active && playing)));
			button.setAttribute(
				'aria-label',
				`${active && playing ? 'Pause' : 'Play'} ${track?.title || ''}`
			);
			button.querySelector('.track-play-symbol').textContent = active && playing ? 'Ⅱ' : '▶';
		}
		const index = queue.findIndex((track) => track.id === current?.id);
		byId('previous').disabled = index <= 0;
		byId('next').disabled = index < 0 || index >= queue.length - 1;
		if ('mediaSession' in navigator)
			navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
	}
	async function resume() {
		const token = ++request;
		try {
			if (audio.error) audio.load();
			await audio.play();
			if (token === request) message(`Playing ${current.title}.`);
		} catch (error) {
			if (token !== request || error.name === 'AbortError') return;
			message('Playback could not start. Press play to retry, or use the MP3 download.', true);
		}
		playbackState();
	}
	function pause() {
		request++;
		audio.pause();
		if (current) message(`Paused ${current.title}.`);
	}
	function select(track, newQueue = null) {
		if (!track) return;
		request++;
		audio.pause();
		current = track;
		if (newQueue) {
			orderedQueue = [...newQueue];
			queue = shuffle
				? [track, ...shuffled(newQueue.filter((item) => item.id !== track.id))]
				: [...newQueue];
		}
		byId('player').hidden = false;
		document.body.classList.add('has-player');
		byId('now-title').textContent = track.title;
		byId('now-title').title = track.title;
		audio.src = track.url;
		audio.load();
		message(`Loading ${track.title}…`);
		progress();
		playbackState();
		if ('mediaSession' in navigator && 'MediaMetadata' in window) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: track.title,
				artist: 'Tony C',
				album: 'Tony / AI'
			});
		}
		void resume();
	}
	function move(offset) {
		const index = queue.findIndex((track) => track.id === current?.id);
		if (index >= 0) select(queue[index + offset]);
	}
	function filter() {
		const query = byId('search').value.trim().toLocaleLowerCase();
		visible = tracks.filter((track) => track.title.toLocaleLowerCase().includes(query));
		const sort = byId('sort').value;
		if (sort === 'title') visible.sort((a, b) => a.title.localeCompare(b.title));
		if (sort === 'duration') visible.sort((a, b) => b.duration - a.duration);
		const ids = new Set(visible.map((track) => track.id));
		for (const row of rows) row.hidden = !ids.has(row.dataset.id);
		visible.forEach((track, index) => {
			const row = rows.find((item) => item.dataset.id === track.id);
			row.querySelector('.track-number').textContent = String(index + 1).padStart(2, '0');
			byId('tracks').append(row);
		});
		byId('results-count').textContent =
			`${visible.length} ${visible.length === 1 ? 'track' : 'tracks'}`;
		byId('empty').hidden = visible.length > 0;
		byId('play-all').disabled = visible.length === 0;
	}
	for (const button of buttons)
		button.addEventListener('click', () => {
			if (button.dataset.play === current?.id) {
				if (audio.paused) void resume();
				else pause();
			} else
				select(
					tracks.find((track) => track.id === button.dataset.play),
					visible
				);
		});
	byId('toggle').addEventListener('click', () => (audio.paused ? void resume() : pause()));
	byId('previous').addEventListener('click', () => move(-1));
	byId('next').addEventListener('click', () => move(1));
	byId('play-all').addEventListener('click', () => {
		const first = shuffle ? Math.floor(Math.random() * visible.length) : 0;
		select(visible[first], visible);
	});
	for (const button of shuffleButtons) button.addEventListener('click', toggleShuffle);
	byId('search').addEventListener('input', filter);
	byId('sort').addEventListener('change', filter);
	byId('clear-search').addEventListener('click', () => {
		byId('search').value = '';
		filter();
		byId('search').focus();
	});
	byId('seek').addEventListener('input', (event) => {
		if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value);
		progress();
	});
	audio.volume = Number(byId('volume').value);
	byId('volume').addEventListener('input', (event) => {
		audio.volume = Number(event.target.value);
	});
	byId('repeat').addEventListener('click', () => {
		autoAdvance = !autoAdvance;
		byId('repeat').setAttribute('aria-pressed', String(autoAdvance));
		message(
			autoAdvance
				? 'The next track will play automatically.'
				: 'Playback will stop after this track.'
		);
	});
	audio.addEventListener('play', playbackState);
	audio.addEventListener('pause', playbackState);
	audio.addEventListener('timeupdate', progress);
	audio.addEventListener('loadedmetadata', progress);
	audio.addEventListener('ended', () => {
		playbackState();
		if (autoAdvance && queue.findIndex((track) => track.id === current?.id) < queue.length - 1)
			move(1);
		else message('Finished playing. Choose another track to keep listening.');
	});
	audio.addEventListener('error', () => {
		if (current)
			message('This track could not load. Press play to retry, or use the MP3 download.', true);
		playbackState();
	});
	window.addEventListener('resize', draw);
	if ('mediaSession' in navigator) {
		for (const [action, handler] of Object.entries({
			play: resume,
			pause,
			previoustrack: () => move(-1),
			nexttrack: () => move(1)
		})) {
			try {
				navigator.mediaSession.setActionHandler(action, handler);
			} catch {
				/* Some browsers support only basic playback actions. */
			}
		}
	}
	fetch('/tonyai/catalog.json')
		.then((response) => {
			if (!response.ok) throw new Error('Catalog unavailable');
			return response.json();
		})
		.then((catalog) => {
			if (
				catalog.tracks.length !== rows.length ||
				catalog.tracks.some((track) => !rows.some((row) => row.dataset.id === track.id))
			)
				throw new Error('Catalog mismatch');
			tracks = catalog.tracks;
			for (const element of [...buttons, byId('search'), byId('sort'), byId('shuffle-collection')])
				element.disabled = false;
			filter();
		})
		.catch(() =>
			message(
				'The player could not load. Refresh to retry. All MP3 downloads are available above.',
				true
			)
		);
})();
