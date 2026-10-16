import { expect, test } from 'vitest';

import {
	applyFrame,
	encodeFrame,
	isResendRequest,
	resendRequest,
	spliceOf,
} from '../src/lib/frame.ts';

const LONG = 'привет, мир! '.repeat(10);

test('typing at the end keeps everything and inserts the letter', () => {
	expect(spliceOf('hello', 'hello!')).toEqual({ keep: 5, remove: 0, insert: '!' });
});

test('typing, deleting and replacing in the middle touch only that part', () => {
	expect(spliceOf('helo world', 'hello world')).toEqual({ keep: 3, remove: 0, insert: 'l' });
	expect(spliceOf('hello world', 'hell world')).toEqual({ keep: 4, remove: 1, insert: '' });
	expect(spliceOf('hello world', 'hello there')).toEqual({ keep: 6, remove: 5, insert: 'there' });
});

test('erasing keeps nothing and removes everything', () => {
	expect(spliceOf('hello', '')).toEqual({ keep: 0, remove: 5, insert: '' });
});

test('a boundary never falls inside an emoji', () => {
	expect(spliceOf('a😀', 'a😃')).toEqual({ keep: 1, remove: 2, insert: '😃' });
	expect(spliceOf('😀b', '😃b')).toEqual({ keep: 0, remove: 2, insert: '😃' });
	// 🈀 and 😀 share their low surrogate, so the common suffix would start mid-pair.
	expect(spliceOf('a🈀', 'a😀')).toEqual({ keep: 1, remove: 2, insert: '😀' });
});

test('frames rebuild the text on the other side', () => {
	const pairs = [
		['', 'привет'],
		[LONG, `${LONG}!`],
		['a😀b', 'a😃b'],
		[LONG, ''],
		['👋', `👋${LONG}`],
	];
	for (const [before, after] of pairs) {
		expect(applyFrame(before, encodeFrame(before, after))).toBe(after);
		expect(applyFrame('anything', encodeFrame(null, after))).toBe(after);
	}
});

test('the sender sends whichever frame is smaller', () => {
	expect(encodeFrame(LONG, `${LONG}!`)[0]).toBe(1);
	expect(encodeFrame(LONG, `${LONG}!`).length).toBe(9);
	// Unchanged, the field goes as an empty splice: the probe sent on a count of 2 and as heartbeat.
	expect(encodeFrame(LONG, LONG).length).toBe(8);
	expect(encodeFrame('hi', 'hi!')[0]).toBe(0);
	expect(encodeFrame(null, `${LONG}!`)[0]).toBe(0);
});

test('a request for the whole field is one byte, and no other frame looks like one', () => {
	expect(resendRequest()).toEqual(new Uint8Array([2]));
	expect(isResendRequest(resendRequest())).toBe(true);
	expect(isResendRequest(encodeFrame(null, ''))).toBe(false);
	expect(isResendRequest(encodeFrame(LONG, LONG))).toBe(false);
	expect(applyFrame(LONG, resendRequest())).toBeNull();
});

test('a splice for a different text, or one that does not fit, is ignored', () => {
	const splice = encodeFrame(LONG, `${LONG}!`);
	expect(applyFrame(`${LONG}?`, splice)).toBeNull();
	expect(applyFrame('', splice)).toBeNull();
	// Byte 5 starts the keep count, 130 as 0x82 0x01; 0xc8 0x01 makes it 200, past the text.
	const tooLong = splice.slice();
	tooLong[5] = 0xc8;
	expect(applyFrame(LONG, tooLong)).toBeNull();
});

test('truncated frames, unknown kinds and broken UTF-8 are ignored', () => {
	const splice = encodeFrame(LONG, `${LONG}!`);
	expect(applyFrame(LONG, splice.slice(0, 3))).toBeNull();
	expect(applyFrame(LONG, splice.slice(0, 6))).toBeNull();
	expect(applyFrame(LONG, new Uint8Array([2, 65]))).toBeNull();
	expect(applyFrame(LONG, new Uint8Array(0))).toBeNull();
	expect(applyFrame(LONG, new Uint8Array([0, 0xff]))).toBeNull();
});

test('a thousand random edits, emoji included, rebuild the text exactly', () => {
	const pieces = ['a', 'b', 'я', '😀', '😃', '🈀', ' ', '\n'];
	let seed = 1;
	const random = (n: number) => {
		seed = (seed * 48271) % 2147483647;
		return seed % n;
	};
	let text = '';
	for (let i = 0; i < 1000; i++) {
		// Edits work on code points, so the text itself never holds a broken pair.
		const points = Array.from(text);
		const at = random(points.length + 1);
		const cut = random(Math.min(3, points.length - at) + 1);
		const insert = Array.from({ length: random(4) }, () => pieces[random(pieces.length)]).join('');
		const next = [...points.slice(0, at), insert, ...points.slice(at + cut)].join('');
		expect(applyFrame(text, encodeFrame(text, next))).toBe(next);
		text = next;
	}
});
