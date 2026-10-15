import { afterEach, expect, test, vi } from 'vitest';

import { serialQueue } from '../src/lib/queue.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

test('tasks run one at a time, in order', async () => {
	const log: string[] = [];
	let release = () => {};
	const gate = new Promise<void>((resolve) => (release = resolve));
	const queue = serialQueue();
	queue.run(async () => {
		await gate;
		log.push('first');
	});
	queue.run(() => {
		log.push('second');
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(log).toEqual([]);
	release();
	await vi.waitFor(() => expect(log).toEqual(['first', 'second']));
});

test('a failed task is logged and the queue carries on', async () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
	const log: string[] = [];
	const queue = serialQueue();
	queue.run(async () => {
		throw new Error('boom');
	});
	queue.run(() => {
		log.push('after');
	});
	await vi.waitFor(() => expect(log).toEqual(['after']));
	expect(logged).toHaveBeenCalledTimes(1);
});

test('after stop, tasks still waiting are dropped', async () => {
	const log: string[] = [];
	let release = () => {};
	const gate = new Promise<void>((resolve) => (release = resolve));
	const queue = serialQueue();
	queue.run(async () => {
		await gate;
		log.push('in flight');
	});
	queue.run(() => {
		log.push('waiting');
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	queue.stop();
	release();
	await vi.waitFor(() => expect(log).toEqual(['in flight']));
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(log).toEqual(['in flight']);
});
