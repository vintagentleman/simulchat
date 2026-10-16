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

const shut = (socket: FakeSocket | undefined, code: number) =>
	socket?.dispatchEvent(Object.assign(new Event('close'), { code }));

// About 11.6 KB of frames from the other side: past the rotation budget.
async function spendBudget(
	socket: FakeSocket | undefined,
	seal: (last: string | null, text: string) => Promise<ArrayBuffer>,
) {
	const big = await seal(null, 'x'.repeat(1000));
	for (let i = 0; i < 11; i++) deliver(socket, big);
}

const connectedSince = (views: View[]) =>
	views.slice(views.findIndex((view) => view.status === 'connected'));

test('at the byte budget a second socket opens for the same line and takes over on its count', async () => {
	const { views, tones, seal } = await start();
	const [first] = FakeSocket.sockets;
	deliver(first, '2');
	await vi.waitFor(() => expect(tones).toEqual(['join']));
	await spendBudget(first, seal);
	expect(FakeSocket.sockets).toHaveLength(2);
	const second = FakeSocket.sockets[1];
	expect(second?.url).toBe(first?.url);
	deliver(second, '2');
	expect(first?.readyState).toBe(3);
	deliver(first, await seal(null, 'late'));
	deliver(second, await seal(null, 'new'));
	await vi.waitFor(() => expect(views.at(-1)?.mirror).toBe('new'));
	expect(views.map((view) => view.mirror)).not.toContain('late');
	expect(connectedSince(views).every((view) => view.status === 'connected')).toBe(true);
	expect(tones).toEqual(['join']);
});

test('the old socket closing with 1001 first also hands the line over', async () => {
	const { views, tones, seal } = await start();
	const [first] = FakeSocket.sockets;
	deliver(first, '2');
	await vi.waitFor(() => expect(tones).toEqual(['join']));
	await spendBudget(first, seal);
	const second = FakeSocket.sockets[1];
	shut(first, 1001);
	deliver(second, '2');
	deliver(second, await seal(null, 'after'));
	await vi.waitFor(() => expect(views.at(-1)?.mirror).toBe('after'));
	expect(connectedSince(views).every((view) => view.status === 'connected')).toBe(true);
	expect(tones).toEqual(['join']);
});

test('a second socket that fails leaves the current one in use, and the next try waits 5 s', async () => {
	const { views, tones, seal } = await start();
	const [first] = FakeSocket.sockets;
	deliver(first, '2');
	await vi.waitFor(() => expect(tones).toEqual(['join']));
	await spendBudget(first, seal);
	shut(FakeSocket.sockets[1], 1006);
	const big = await seal(null, 'x'.repeat(1000));
	deliver(first, big);
	expect(FakeSocket.sockets).toHaveLength(2);
	vi.advanceTimersByTime(5_000);
	deliver(first, big);
	expect(FakeSocket.sockets).toHaveLength(3);
	deliver(first, await seal(null, 'still'));
	await vi.waitFor(() => expect(views.at(-1)?.mirror).toBe('still'));
	expect(connectedSince(views).every((view) => view.status === 'connected')).toBe(true);
	expect(tones).toEqual(['join']);
});

test('a pong timeout while a second socket is pending drops both and reconnects', async () => {
	const { tones, seal } = await start();
	const [first] = FakeSocket.sockets;
	deliver(first, '2');
	await vi.waitFor(() => expect(tones).toEqual(['join']));
	await spendBudget(first, seal);
	expect(FakeSocket.sockets).toHaveLength(2);
	await vi.advanceTimersByTimeAsync(50_000);
	expect(FakeSocket.sockets.map((socket) => socket.readyState)).toEqual([3, 3]);
	await vi.advanceTimersByTimeAsync(1_000);
	expect(FakeSocket.sockets.map((socket) => socket.readyState)).toEqual([3, 3, 1]);
});

test('leaving the line during a rotation closes both sockets', async () => {
	const { connection, tones, seal } = await start();
	const [first] = FakeSocket.sockets;
	deliver(first, '2');
	await vi.waitFor(() => expect(tones).toEqual(['join']));
	await spendBudget(first, seal);
	connection.close();
	expect(FakeSocket.sockets.map((socket) => socket.readyState)).toEqual([3, 3]);
});

test('rotating while alone keeps the status and plays no tone', async () => {
	const { views, tones } = await start();
	const [first] = FakeSocket.sockets;
	deliver(first, '1');
	await vi.waitFor(() => expect(views.at(-1)?.status).toBe('waiting'));
	// Pings and pongs alone: about 68 bytes every ten seconds.
	for (let i = 0; i < 200 && FakeSocket.sockets.length < 2; i++) {
		await vi.advanceTimersByTimeAsync(10_000);
		deliver(first, 'pong');
	}
	expect(FakeSocket.sockets).toHaveLength(2);
	deliver(FakeSocket.sockets[1], '1');
	await vi.waitFor(() => expect(first?.readyState).toBe(3));
	expect(views.slice(1).every((view) => view.status === 'waiting')).toBe(true);
	expect(tones).toEqual([]);
});
