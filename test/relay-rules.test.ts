import { expect, test } from 'vitest';

import { deriveLine, sealFrame } from '../src/lib/crypto.ts';
import { encodeFrame } from '../src/lib/frame.ts';
import type { Upgrade } from '../worker/rules.ts';
import {
	acceptsFrame,
	addressBlock,
	admit,
	isLive,
	LIVE_MS,
	MAX_FRAME_BYTES,
	upgradeRoom,
} from '../worker/rules.ts';

const ROOM = 'a77e7bb69c835d67cb7ec6a38a4c5732';
const CLIENT = 'AAECAwQFBgcICQoLDA0ODw';
const ORIGINS = ['https://example.github.io'];
const REQUEST: Upgrade = {
	method: 'GET',
	pathname: `/${ROOM}`,
	clientId: CLIENT,
	upgrade: 'websocket',
	origin: ORIGINS[0],
};
const room = (overrides: Partial<Upgrade> = {}) =>
	upgradeRoom({ ...REQUEST, ...overrides }, ORIGINS);

test('a well-formed upgrade yields its room id', () => {
	expect(room()).toBe(ROOM);
	expect(room({ upgrade: 'WebSocket' })).toBe(ROOM);
});

test('anything else is refused', () => {
	expect(room({ method: 'POST' })).toBeNull();
	expect(room({ upgrade: null })).toBeNull();
	expect(room({ origin: null })).toBeNull();
	expect(room({ origin: 'https://evil.example' })).toBeNull();
	expect(room({ clientId: null })).toBeNull();
	expect(room({ clientId: 'short' })).toBeNull();
	expect(room({ clientId: `${CLIENT.slice(1)}=` })).toBeNull();
	expect(room({ pathname: '/' })).toBeNull();
	expect(room({ pathname: `/${ROOM.toUpperCase()}` })).toBeNull();
	expect(room({ pathname: `/${ROOM}0` })).toBeNull();
	expect(room({ pathname: `/${ROOM}/x` })).toBeNull();
});

test('liveness: a recent ping, or a recent join without a ping yet', () => {
	const now = 1_000_000;
	expect(isLive({ clientId: 'a', lastPing: now - LIVE_MS + 1, joinedAt: 0 }, now)).toBe(true);
	expect(isLive({ clientId: 'a', lastPing: now - LIVE_MS, joinedAt: now }, now)).toBe(false);
	expect(isLive({ clientId: 'a', lastPing: null, joinedAt: now - 1 }, now)).toBe(true);
	expect(isLive({ clientId: 'a', lastPing: null, joinedAt: now - LIVE_MS }, now)).toBe(false);
});

test('a tab pinging once a minute, as a long-hidden tab does, stays live', () => {
	const now = 1_000_000;
	expect(isLive({ clientId: 'a', lastPing: now - 61_000, joinedAt: 0 }, now)).toBe(true);
});

test('admission: two live peers make the line busy; dead peers are evicted to make room', () => {
	const now = 1_000_000;
	const live = (clientId: string) => ({ clientId, lastPing: now, joinedAt: now });
	const dead = (clientId: string) => ({ clientId, lastPing: now - LIVE_MS, joinedAt: 0 });
	expect(admit([], 'c', now)).toEqual({ evict: [], admit: true });
	expect(admit([live('a')], 'c', now)).toEqual({ evict: [], admit: true });
	expect(admit([live('a'), live('b')], 'c', now)).toEqual({ evict: [], admit: false });
	expect(admit([live('a'), dead('b')], 'c', now)).toEqual({ evict: [1], admit: true });
	expect(admit([dead('a'), dead('b')], 'c', now)).toEqual({ evict: [0, 1], admit: true });
});

test('admission: a reconnecting tab replaces its own earlier socket, however recent', () => {
	const now = 1_000_000;
	const peers = [
		{ clientId: 'a', lastPing: now, joinedAt: now },
		{ clientId: 'b', lastPing: now, joinedAt: now },
	];
	expect(admit(peers, 'b', now)).toEqual({ evict: [1], admit: true });
});

test('frames: binary up to the cap passes; text and oversized frames do not', () => {
	expect(acceptsFrame(new ArrayBuffer(28))).toBe(true);
	expect(acceptsFrame(new ArrayBuffer(MAX_FRAME_BYTES))).toBe(true);
	expect(acceptsFrame(new ArrayBuffer(MAX_FRAME_BYTES + 1))).toBe(false);
	expect(acceptsFrame('hello')).toBe(false);
});

test('a full field of the widest characters still fits the relay’s frame cap', async () => {
	const { key } = await deriveLine(new Uint8Array(32));
	// 2,000 code units of a 3-byte UTF-8 character: the composer's worst case.
	const frame = await sealFrame(key, encodeFrame(null, '中'.repeat(2000)));
	expect(frame.byteLength).toBeLessThanOrEqual(MAX_FRAME_BYTES);
});

test('rate limits key an IPv6 client by its /64, however the address is written', () => {
	expect(addressBlock('2001:db8:1:2::1')).toBe('2001:db8:1:2');
	expect(addressBlock('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2');
	expect(addressBlock('2001:db8::1:2:3:4')).toBe('2001:db8:0:0');
	expect(addressBlock('2001:db8:0:0:1::')).toBe('2001:db8:0:0');
	expect(addressBlock('::1')).toBe('0:0:0:0');
	expect(addressBlock('2001:db8:1:3::1')).not.toBe(addressBlock('2001:db8:1:2::1'));
});

test('rate limits key IPv4, IPv4-mapped and unknown clients by the whole address', () => {
	expect(addressBlock('203.0.113.7')).toBe('203.0.113.7');
	expect(addressBlock('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7');
	expect(addressBlock('unknown')).toBe('unknown');
});
