// Leading and trailing edge: the first call fires at once, and calls inside the
// window collapse into one fire at its end. `fire` reads the latest state itself.
export function throttle(fire: () => void, ms: number) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending = false;
	const tick = () => {
		if (pending) {
			pending = false;
			fire();
			timer = setTimeout(tick, ms);
		} else {
			timer = null;
		}
	};
	return {
		call() {
			if (timer === null) {
				fire();
				timer = setTimeout(tick, ms);
			} else {
				pending = true;
			}
		},
		cancel() {
			if (timer !== null) clearTimeout(timer);
			timer = null;
			pending = false;
		},
	};
}
