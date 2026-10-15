import { randomBytes } from 'node:crypto';

import { expect, test } from '@playwright/test';

const ORIGIN = 'http://localhost:4173';
const room = () => randomBytes(16).toString('hex');
const clientId = () => randomBytes(16).toString('base64url');

// Node's WebSocket client, so the tests can set Origin and send what no page would.
function connect(port: number, path: string, origin = ORIGIN, client = clientId()) {
	const ws = new WebSocket(`ws://localhost:${port}/${path}?c=${client}`, {
		headers: { Origin: origin },
	});
	ws.binaryType = 'arraybuffer';
	const received: (string | number)[] = [];
	ws.addEventListener('message', (event) => {
		received.push(typeof event.data === 'string' ? event.data : event.data.byteLength);
	});
	const opened = new Promise<boolean>((resolve) => {
		ws.addEventListener('open', () => resolve(true));
		ws.addEventListener('error', () => resolve(false));
	});
	const closed = new Promise<number>((resolve) => {
		ws.addEventListener('close', (event) => resolve(event.code));
	});
	return { ws, received, opened, closed };
}

test.describe('relay rules', () => {
	test('a foreign Origin is refused', async () => {
		expect(await connect(8787, room(), 'https://evil.example').opened).toBe(false);
	});

	test('a malformed room path is refused', async () => {
		expect(await connect(8787, 'not-a-room').opened).toBe(false);
	});

	test('a malformed client id is refused', async () => {
		expect(await connect(8787, room(), ORIGIN, 'short').opened).toBe(false);
	});

	test('a reconnect with the same client id replaces the earlier socket', async () => {
		const id = room();
		const a = connect(8787, id);
		await a.opened;
		const b = connect(8787, id, ORIGIN, 'BBBBBBBBBBBBBBBBBBBBBB');
		await b.opened;
		const again = connect(8787, id, ORIGIN, 'BBBBBBBBBBBBBBBBBBBBBB');
		expect(await again.opened).toBe(true);
		expect(await b.closed).toBe(1001);
		await expect.poll(() => again.received).toContain('2');
		a.ws.close();
		again.ws.close();
	});

	test('partners get counts and each other’s frames; pings get pongs', async () => {
		const id = room();
		const a = connect(8787, id);
		await a.opened;
		const b = connect(8787, id);
		await b.opened;
		await expect.poll(() => a.received).toContain('2');
		a.ws.send(new Uint8Array(28));
		await expect.poll(() => b.received).toContain(28);
		a.ws.send('ping');
		await expect.poll(() => a.received).toContain('pong');
		expect(b.received).not.toContain('ping');
		a.ws.close();
		b.ws.close();
	});

	test('a busy caller’s frames never reach the line', async () => {
		const id = room();
		const a = connect(8787, id);
		await a.opened;
		const b = connect(8787, id);
		await b.opened;
		await expect.poll(() => a.received).toContain('2');
		const c = connect(8787, id);
		// Must go out before the busy close completes, or the test proves nothing.
		c.ws.addEventListener('open', () => c.ws.send(new Uint8Array(28)));
		expect(await c.closed).toBe(4001);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(a.received).not.toContain(28);
		expect(b.received).not.toContain(28);
		a.ws.close();
		b.ws.close();
	});

	test('a text frame closes the sender with 1008', async () => {
		const a = connect(8787, room());
		await a.opened;
		a.ws.send('hello');
		expect(await a.closed).toBe(1008);
	});

	test('an oversized frame closes the sender with 1008', async () => {
		const a = connect(8787, room());
		await a.opened;
		a.ws.send(new Uint8Array(8193));
		expect(await a.closed).toBe(1008);
	});
});

// The limits environment allows 3 upgrades and 5 frames per 10 seconds per IP.
test.describe('rate limits', () => {
	test.describe.configure({ mode: 'serial' });

	test('a frame flood closes the sender with 1008', async () => {
		const a = connect(8788, room());
		expect(await a.opened).toBe(true);
		for (let i = 0; i < 10; i++) a.ws.send(new Uint8Array(28));
		expect(await a.closed).toBe(1008);
	});

	test('an upgrade flood is refused', async () => {
		const results: boolean[] = [];
		for (let i = 0; i < 4; i++) {
			const s = connect(8788, room());
			results.push(await s.opened);
			s.ws.close();
		}
		expect(results.at(-1)).toBe(false);
	});
});
