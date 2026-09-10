const allAudio = [...document.querySelectorAll('audio')];
function quiet(except) {
	allAudio.forEach((a) => {
		if (a !== except) a.pause();
	});
}
document.querySelectorAll('.pair').forEach((card) => {
	const aa = card.querySelector('[data-version=A]'),
		bb = card.querySelector('[data-version=B]'),
		seek = card.querySelector('.seek');
	let active = aa;
	const feedback = document.createElement('p');
	feedback.className = 'note';
	feedback.setAttribute('role', 'status');
	feedback.hidden = true;
	card.append(feedback);
	card.querySelectorAll('[data-play]').forEach(
		(button) =>
			(button.onclick = () => {
				feedback.hidden = true;
				const next = button.dataset.play === 'A' ? aa : bb;
				const t = active.currentTime || +seek.value;
				quiet(next);
				active = next;
				next.currentTime = t;
				const playing = next.play();
				if (playing)
					playing.catch((error) => {
						if (error.name !== 'AbortError') {
							feedback.textContent = 'Playback failed. Use the download links above.';
							feedback.hidden = false;
						}
					});
				card
					.querySelectorAll('[data-play]')
					.forEach((b) => b.classList.toggle('active', b === button));
			})
	);
	card.querySelector('[data-stop]').onclick = () => {
		aa.pause();
		bb.pause();
	};
	seek.oninput = () => {
		aa.currentTime = +seek.value;
		bb.currentTime = +seek.value;
	};
	[aa, bb].forEach(
		(a) =>
			(a.ontimeupdate = () => {
				if (a === active) seek.value = a.currentTime;
			})
	);
	const key = 'troofs-v6-pair-' + card.dataset.pair;
	const paint = (v) =>
		card
			.querySelectorAll('[data-vote]')
			.forEach((b) => b.classList.toggle('selected', b.dataset.vote === v));
	try {
		paint(localStorage.getItem(key));
	} catch {
		// Voting remains available when browser storage is disabled.
	}
	card.querySelectorAll('[data-vote]').forEach(
		(b) =>
			(b.onclick = () => {
				paint(b.dataset.vote);
				try {
					localStorage.setItem(key, b.dataset.vote);
				} catch {
					// Keep the visible vote even when it cannot be saved.
				}
			})
	);
});
document
	.querySelectorAll('audio[controls]')
	.forEach((a) => a.addEventListener('play', () => quiet(a)));
