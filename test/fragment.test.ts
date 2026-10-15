import { expect, test } from 'vitest';

import { newClientId, newSecret, parseFragment, toBase64url } from '../src/lib/fragment.ts';

const VALID = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

test('a canonical 43-character fragment decodes to 32 bytes, with or without the hash', () => {
	const expected = Uint8Array.from({ length: 32 }, (_, i) => i);
	expect(parseFragment(`#${VALID}`)).toEqual(expected);
	expect(parseFragment(VALID)).toEqual(expected);
});

test('wrong lengths, alphabets and padding are rejected', () => {
	expect(parseFragment('')).toBeNull();
	expect(parseFragment('#')).toBeNull();
	expect(parseFragment(`#${VALID.slice(1)}`)).toBeNull();
	expect(parseFragment(`#${VALID}A`)).toBeNull();
	expect(parseFragment(`#${VALID.slice(0, -1)}+`)).toBeNull();
	expect(parseFragment(`#${VALID.slice(0, -1)}=`)).toBeNull();
	expect(parseFragment('#d=AgBQCg1FdXJvcGUvTW9zY293')).toBeNull();
});

test('a non-canonical spelling of the same bytes is rejected', () => {
	// The last character carries two spare bits; 'h' sets one of them.
	expect(parseFragment(`#${VALID.slice(0, -1)}h`)).toBeNull();
});

test('new secrets are canonical, distinct and parse back', () => {
	const a = newSecret();
	const b = newSecret();
	expect(a).toHaveLength(43);
	expect(a).not.toBe(b);
	const bytes = parseFragment(a);
	expect(bytes).not.toBeNull();
	expect(toBase64url(bytes as Uint8Array)).toBe(a);
});

test('client ids are 22 base64url characters and distinct', () => {
	const a = newClientId();
	expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
	expect(a).not.toBe(newClientId());
});
