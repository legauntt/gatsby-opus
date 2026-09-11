const opera = document.querySelector('#opera');
const status = document.querySelector('#player-status');
const passages = document.querySelector('.passages');
const buttons = [...passages.querySelectorAll('button')];
let request = 0;

function ready() {
	if (opera.readyState >= 1) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => finish(new Error('Audio loading timed out')), 25000);
		const loaded = () => finish();
		const failed = () => finish(new Error('Audio could not be loaded'));
		function finish(error) {
			clearTimeout(timer);
			opera.removeEventListener('loadedmetadata', loaded);
			opera.removeEventListener('error', failed);
			if (error) reject(error);
			else resolve();
		}
		opera.addEventListener('loadedmetadata', loaded);
		opera.addEventListener('error', failed);
		opera.preload = 'auto';
		if (opera.networkState !== 2 || opera.error) opera.load();
	});
}

for (const button of buttons) {
	button.addEventListener('click', async () => {
		const current = ++request;
		status.textContent = `Opening ${button.dataset.label.toLowerCase()}…`;
		try {
			await ready();
			if (current !== request) return;
			opera.currentTime = Math.min(Number(button.dataset.start), opera.duration);
			await opera.play();
			if (current === request) status.textContent = `Playing: ${button.dataset.label}.`;
		} catch {
			if (current === request) {
				status.textContent = 'Press play in the audio controls, or use the MP3 download below.';
			}
		}
	});
}
opera.addEventListener('timeupdate', () => {
	const active = [...buttons]
		.reverse()
		.find((button) => opera.currentTime >= Number(button.dataset.start));
	for (const button of buttons) {
		if (button === active) button.setAttribute('aria-current', 'true');
		else button.removeAttribute('aria-current');
	}
});
opera.addEventListener('ended', () => {
	status.textContent = 'Curtain down. Play it again, or keep a copy below.';
});
opera.addEventListener('play', () => {
	status.textContent = 'Playing the performance.';
});
opera.addEventListener('pause', () => {
	if (!opera.ended) status.textContent = 'Paused. Press play to continue.';
});
opera.addEventListener('error', () => {
	status.textContent = 'Playback could not load. Try the MP3 download below.';
});
passages.hidden = false;
