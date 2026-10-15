import { expect, test } from 'vitest';

import type { Presence, PresenceEvent } from '../src/lib/presence.ts';
import {
	initialPresence,
	LEAVE_DELAY_MS,
	nextDeadline,
	PARTNER_SILENCE_MS,
	RECONNECT_GRACE_MS,
	resumedPresence,
	statusOf,
	step,
} from '../src/lib/presence.ts';

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

test('the other side arrives, then leaves once the leave delay runs out', () => {
	const { state, tones } = run([
		[0, { type: 'count', count: 1 }],
		[1_000, { type: 'count', count: 2 }],
		[2_000, { type: 'count', count: 1 }],
		[2_000 + LEAVE_DELAY_MS, { type: 'tick' }],
	]);
	expect(statusOf(state)).toBe('left');
	expect(tones).toEqual(['join', 'leave']);
});

test('a leave the other side takes back within the delay is never shown', () => {
	const leaving = run([
		[0, { type: 'count', count: 2 }],
		[1_000, { type: 'count', count: 1 }],
	]);
	expect(statusOf(leaving.state)).toBe('connected');
	expect(leaving.state.partner).toBe(true);
	const back = run([[2_000, { type: 'count', count: 2 }]], leaving.state);
	expect(statusOf(back.state)).toBe('connected');
	expect([...leaving.tones, ...back.tones]).toEqual(['join']);
	expect(back.state.leavingAt).toBe(0);
});

test('the next deadline is the earliest pending one, or none', () => {
	expect(nextDeadline(initialPresence)).toBeNull();
	const connected = run([[0, { type: 'count', count: 2 }]]).state;
	expect(nextDeadline(connected)).toBe(PARTNER_SILENCE_MS + 1);
	const leaving = run([[1_000, { type: 'count', count: 1 }]], connected).state;
	expect(nextDeadline(leaving)).toBe(1_000 + LEAVE_DELAY_MS);
	const dropped = run([[2_000, { type: 'dropped' }]], connected).state;
	expect(nextDeadline(dropped)).toBe(2_000 + RECONNECT_GRACE_MS);
});

test('a tab taking over the line resumes quietly when the other side was present', () => {
	const resumed = resumedPresence(0);
	expect(statusOf(resumed)).toBe('connecting');
	expect(resumed.partner).toBe(true);
	const { state, tones } = run([[500, { type: 'count', count: 2 }]], resumed);
	expect(statusOf(state)).toBe('connected');
	expect(tones).toEqual([]);
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
