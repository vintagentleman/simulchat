// A failed task is logged and the queue carries on; after stop(), tasks still waiting are dropped.
export function serialQueue() {
	let tail: Promise<void> = Promise.resolve();
	let stopped = false;
	return {
		run(task: () => Promise<void> | void) {
			tail = tail
				.then(() => (stopped ? undefined : task()))
				.catch((error: unknown) => console.error(error));
		},
		stop() {
			stopped = true;
		},
	};
}
