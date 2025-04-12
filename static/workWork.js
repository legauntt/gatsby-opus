console.log('I laugh in the face of danger, rekekekeke');

let lastTick = null;
let tick = 0;

setInterval(() => {
	const diff = Date.now() - lastTick;
	tick++;

	if (lastTick) {
		postMessage({ diff, tick });
	} else {
		postMessage({ started: true });
	}

	lastTick = Date.now();
}, 1000);

self.onmessage = (e) => {
	console.log('Got a message', e);
};
