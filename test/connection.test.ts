import { setImmediate } from 'node:timers/promises';

import { afterEach, expect, test, vi } from 'vitest';

import { openConnection } from '../src/app/connection.ts';
import { deriveLine, openFrame, sealFrame } from '../src/lib/crypto.ts';
import { encodeFrame, isResendRequest, resendRequest } from '../src/lib/frame.ts';
import type { Tone } from '../src/lib/presence.ts';
import type { View } from '../src/lib/tabs.ts';

class FakeSocket extends EventTarget {
	static OPEN = 1;
	static sockets: FakeSocket[] = [];
	readyState = FakeSocket.OPEN;
	binaryType = 'blob';
	url: string;
	sent: (string | Uint8Array<ArrayBuffer>)[] = [];
	constructor(url: string) {
		super();
		this.url = url;
		FakeSocket.sockets.push(this);
	}
	send(data: string | Uint8Array<ArrayBuffer>) {
		this.sent.push(data);
	}
	close() {
		this.readyState = 3;
	}
}

const LONG = 'привет, мир! '.repeat(10);

const deliver = (socket: FakeSocket | undefined, data: string | ArrayBuffer) =>
	socket?.dispatchEvent(new MessageEvent('message', { data }));

const framesOf = (socket: FakeSocket | undefined) =>
	(socket?.sent ?? []).filter((data) => typeof data !== 'string');

// Lets time pass in ten-second steps, answering the pings on the way.
async function pass(socket: FakeSocket | undefined, ms: number) {
	for (let left = ms; left > 0; left -= 10_000) {
		await vi.advanceTimersByTimeAsync(Math.min(left, 10_000));
		deliver(socket, 'pong');
	}
}

async function start() {
	vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
	vi.stubGlobal('WebSocket', FakeSocket);
	const keys = await deriveLine(new Uint8Array(32));
	const views: View[] = [];
	const tones: Tone[] = [];
	const connection = openConnection({
		keys,
		clientId: 'c',
		text: '',
		view: { status: 'connecting', partner: false, seen: false, mirror: '' },
		onView: (view) => views.push(view),
		onTone: (tone) => tones.push(tone),
	});
	const seal = async (last: string | null, text: string) =>
		(await sealFrame(keys.key, encodeFrame(last, text))).buffer;
	return { keys, connection, views, tones, seal };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	FakeSocket.sockets = [];
});

test('a frame that finishes opening after close changes nothing', async () => {
	const { connection, views, tones, seal } = await start();
	const [socket] = FakeSocket.sockets;
	deliver(socket, '2');
	await vi.waitFor(() => expect(tones).toEqual(['join']));

	const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
	let opening: Promise<ArrayBuffer> | undefined;
	let viewsAtClose = 0;
	vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce((...args) => {
		connection.close();
		viewsAtClose = views.length;
		opening = decrypt(...args);
		return opening;
	});
	deliver(socket, await seal(null, 'late'));
	await vi.waitFor(() => expect(opening).toBeDefined());
	await opening;
	await setImmediate();

	vi.advanceTimersByTime(120_000);
	expect(tones).toEqual(['join']);
	expect(views.length).toBe(viewsAtClose);
});

test('typing sends only the change, and a count of 2 sends an empty splice', async () => {
	const { keys, connection } = await start();
	const [socket] = FakeSocket.sockets;
	const sent = (n: number) => vi.waitFor(() => expect(framesOf(socket)).toHaveLength(n));
	deliver(socket, '2');
	await sent(1);
	connection.send(LONG);
	await sent(2);
	connection.send(`${LONG}!`);
	await sent(3);
	deliver(socket, '2');
	await sent(4);
	const plains = await Promise.all(
		framesOf(socket).map((frame) => openFrame(keys.key, frame.buffer)),
	);
	expect(plains.map((plain) => plain?.[0])).toEqual([0, 0, 1, 1]);
	expect(plains[3]?.length).toBe(8);
});

test('a splice that does not apply asks once for the whole field, and a request gets it', async () => {
	const { keys, connection, seal } = await start();
	const [socket] = FakeSocket.sockets;
	const plains = () =>
		Promise.all(framesOf(socket).map((frame) => openFrame(keys.key, frame.buffer)));
	const requests = async () =>
		(await plains()).filter((plain) => plain !== null && isResendRequest(plain)).length;
	deliver(socket, '2');
	deliver(socket, await seal(null, LONG));
	const stale = await seal(`${LONG}?`, `${LONG}?!`);
	deliver(socket, stale);
	deliver(socket, stale);
	await vi.waitFor(async () => expect(await requests()).toBe(1));
	deliver(socket, await seal(null, LONG));
	deliver(socket, stale);
	await vi.waitFor(async () => expect(await requests()).toBe(2));
	connection.send(LONG);
	connection.send(`${LONG}!`);
	await vi.waitFor(() => expect(framesOf(socket)).toHaveLength(5));
	deliver(socket, (await sealFrame(keys.key, resendRequest())).buffer);
	await vi.waitFor(() => expect(framesOf(socket)).toHaveLength(6));
	const answer = (await plains())[5];
	expect(answer?.[0]).toBe(0);
	expect(new TextDecoder().decode(answer?.subarray(1))).toBe(`${LONG}!`);
	expect(await requests()).toBe(2);
});

test('a partner back from silence is mirrored by their next splice', async () => {
	const { views, tones, seal } = await start();
	const [socket] = FakeSocket.sockets;
	deliver(socket, '2');
	deliver(socket, await seal(null, LONG));
	await vi.waitFor(() => expect(views.at(-1)?.mirror).toBe(LONG));
	await pass(socket, 80_000);
	expect(tones).toEqual(['join', 'leave']);
	expect(views.at(-1)?.mirror).toBe('');
	deliver(socket, await seal(LONG, `${LONG}!`));
	await vi.waitFor(() => expect(views.at(-1)?.mirror).toBe(`${LONG}!`));
	expect(tones).toEqual(['join', 'leave', 'join']);
});

test('a splice that does not apply still shows the partner is there', async () => {
	const { views, tones, seal } = await start();
	const [socket] = FakeSocket.sockets;
	deliver(socket, '2');
	deliver(socket, await seal(null, LONG));
	await vi.waitFor(() => expect(views.at(-1)?.mirror).toBe(LONG));
	await pass(socket, 60_000);
	const rendered = views.length;
	deliver(socket, await seal(`${LONG}?`, `${LONG}?!`));
	await vi.waitFor(() => expect(views.length).toBeGreaterThan(rendered));
	await pass(socket, 30_000);
	expect(tones).toEqual(['join']);
	expect(views.at(-1)?.mirror).toBe(LONG);
});
