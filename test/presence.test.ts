import { expect, test } from 'vitest';

import type { Presence, PresenceEvent } from '../src/lib/presence.ts';
import {
	initialPresence,
	PARTNER_SILENCE_MS,
	RECONNECT_GRACE_MS,
	statusOf,
	step,
} from '../src/lib/presence.ts';

// Feeds events at the given times; returns the final state and every tone played.
function run(events: [number, PresenceEvent][], from: Presence = initialPresence) {
	let state = from;
	const tones: string[] = [];
	for (const [now, event] of events) {
		const result = step(state, event, now);
		state = result.state;
		if (result.tone !== null) tones.push(result.tone);
	}
	return { state, tones };
}

test('alone on the line: waiting, no tone', () => {
	const { state, tones } = run([[0, { type: 'count', count: 1 }]]);
	expect(statusOf(state)).toBe('waiting');
	expect(state.partner).toBe(false);
	expect(tones).toEqual([]);
});

test('the other side arrives, then leaves', () => {
	const { state, tones } = run([
		[0, { type: 'count', count: 1 }],
		[1_000, { type: 'count', count: 2 }],
		[2_000, { type: 'count', count: 1 }],
	]);
	expect(statusOf(state)).toBe('left');
	expect(tones).toEqual(['join', 'leave']);
});

test('a partner who goes silent is treated as gone, and comes back with their next frame', () => {
	const arrived = run([[0, { type: 'count', count: 2 }]]);
	const silent = run([[PARTNER_SILENCE_MS + 1, { type: 'tick' }]], arrived.state);
	expect(statusOf(silent.state)).toBe('left');
	expect(silent.tones).toEqual(['leave']);
	const back = run([[PARTNER_SILENCE_MS + 2, { type: 'frame' }]], silent.state);
	expect(statusOf(back.state)).toBe('connected');
	expect(back.tones).toEqual(['join']);
});

test('an idle partner whose heartbeats arrive stays connected', () => {
	const { state, tones } = run([
		[0, { type: 'count', count: 2 }],
		[15_000, { type: 'frame' }],
		[30_000, { type: 'frame' }],
		[60_000, { type: 'frame' }],
		[PARTNER_SILENCE_MS + 30_000, { type: 'tick' }],
	]);
	expect(statusOf(state)).toBe('connected');
	expect(tones).toEqual(['join']);
});

test('our own reconnect announces nothing while the partner reconnects too', () => {
	const { state, tones } = run([
		[0, { type: 'count', count: 2 }],
		[5_000, { type: 'dropped' }],
		[5_600, { type: 'count', count: 1 }],
	]);
	expect(statusOf(state)).toBe('connecting');
	expect(state.partner).toBe(true);
	const rejoined = run([[6_000, { type: 'count', count: 2 }]], state);
	expect(statusOf(rejoined.state)).toBe('connected');
	expect([...tones, ...rejoined.tones]).toEqual(['join']);
});

test('a partner who does not return within the grace period has left', () => {
	const { state, tones } = run([
		[0, { type: 'count', count: 2 }],
		[5_000, { type: 'dropped' }],
		[5_600, { type: 'count', count: 1 }],
		[5_000 + RECONNECT_GRACE_MS, { type: 'tick' }],
	]);
	expect(statusOf(state)).toBe('left');
	expect(state.partner).toBe(false);
	expect(tones).toEqual(['join', 'leave']);
});

test('grace running out while we are still offline plays no tone', () => {
	const { state, tones } = run([
		[0, { type: 'count', count: 2 }],
		[5_000, { type: 'dropped' }],
		[5_000 + RECONNECT_GRACE_MS, { type: 'tick' }],
	]);
	expect(statusOf(state)).toBe('connecting');
	expect(state.partner).toBe(false);
	expect(tones).toEqual(['join']);
});

test('dropping while alone starts no grace period', () => {
	const { state, tones } = run([
		[0, { type: 'count', count: 1 }],
		[1_000, { type: 'dropped' }],
		[1_600, { type: 'count', count: 1 }],
	]);
	expect(statusOf(state)).toBe('waiting');
	expect(tones).toEqual([]);
});
