import { expect, test } from 'vitest';

import { deriveLine, openFrame, sealFrame } from '../src/lib/crypto.ts';

const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i);
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
// Sealed under the frame key derived from SECRET, with an all-zero IV.
const FIXED_FRAME = fromHex(
	'000000000000000000000000f83a1e8b14c4c22d3dd585a2038d0b34589e977009784cd1bb7c16b0c5314b751770',
);
const encoder = new TextEncoder();

test('the room id is a fixed function of the secret', async () => {
	expect((await deriveLine(SECRET)).roomId).toBe('a77e7bb69c835d67cb7ec6a38a4c5732');
});

test('the frame key is a fixed function of the secret', async () => {
	const { key } = await deriveLine(SECRET);
	const plain = await openFrame(key, FIXED_FRAME.buffer);
	expect(plain && new TextDecoder().decode(plain)).toBe('привет\nworld');
});

test('frames round-trip their plaintext', async () => {
	const { key } = await deriveLine(SECRET);
	for (const text of ['', 'hello', 'line one\nline two', 'привет 👋 שלום']) {
		const plain = encoder.encode(text);
		expect(await openFrame(key, (await sealFrame(key, plain)).buffer)).toEqual(plain);
	}
});

test('an empty plaintext seals to a 28-byte frame, with a fresh IV each time', async () => {
	const { key } = await deriveLine(SECRET);
	const a = await sealFrame(key, new Uint8Array(0));
	const b = await sealFrame(key, new Uint8Array(0));
	expect(a.byteLength).toBe(28);
	expect(a).not.toEqual(b);
});

test('tampered, truncated and foreign frames open to null', async () => {
	const { key } = await deriveLine(SECRET);
	const other = await deriveLine(SECRET.map((b) => b ^ 0xff));
	const frame = await sealFrame(key, encoder.encode('hello'));
	const tampered = frame.slice();
	tampered[tampered.length - 1] ^= 1;
	expect(await openFrame(key, tampered.buffer)).toBeNull();
	expect(await openFrame(key, frame.slice(0, 27).buffer)).toBeNull();
	expect(await openFrame(other.key, frame.buffer)).toBeNull();
	expect(await openFrame(key, new ArrayBuffer(0))).toBeNull();
});
