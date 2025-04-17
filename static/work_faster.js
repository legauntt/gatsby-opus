console.log('Wooooooooah');

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
}, 100);

self.onmessage = (e) => {
	console.log('Got a message', e);
};
