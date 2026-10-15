import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { throttle } from '../src/lib/throttle.ts';

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

test('the first call fires at once', () => {
	const fire = vi.fn();
	throttle(fire, 40).call();
	expect(fire).toHaveBeenCalledTimes(1);
});

test('calls inside the window collapse into one trailing fire', () => {
	const fire = vi.fn();
	const t = throttle(fire, 40);
	t.call();
	t.call();
	t.call();
	expect(fire).toHaveBeenCalledTimes(1);
	vi.advanceTimersByTime(40);
	expect(fire).toHaveBeenCalledTimes(2);
	vi.advanceTimersByTime(40);
	expect(fire).toHaveBeenCalledTimes(2);
});

test('a call after a quiet window fires at once again', () => {
	const fire = vi.fn();
	const t = throttle(fire, 40);
	t.call();
	vi.advanceTimersByTime(80);
	t.call();
	expect(fire).toHaveBeenCalledTimes(2);
});

test('cancel drops the pending fire and reopens the leading edge', () => {
	const fire = vi.fn();
	const t = throttle(fire, 40);
	t.call();
	t.call();
	t.cancel();
	vi.advanceTimersByTime(100);
	expect(fire).toHaveBeenCalledTimes(1);
	t.call();
	expect(fire).toHaveBeenCalledTimes(2);
});
