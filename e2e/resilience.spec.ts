import type { WebSocketRoute } from '@playwright/test';

import { en, expect, mirrorOf, newLink, test } from './fixtures.ts';

const RELAY = /:8787\//;

test('a connection that dies without closing reconnects and resyncs', async ({ join }) => {
	const link = newLink();
	const routes: WebSocketRoute[] = [];
	const a = await join(link, (page) =>
		page.routeWebSocket(RELAY, (ws) => {
			ws.connectToServer();
			// A close handler stops Playwright forwarding the page's close to the relay.
			ws.onClose(() => {});
			routes.push(ws);
		}),
	);
	const b = await join(link);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('before');
	await expect.poll(mirrorOf(b)).toBe('before');
	await routes[0].close({ code: 4000 });
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	expect(routes).toHaveLength(2);
	await a.locator('#composer').pressSequentially(' after');
	await expect.poll(mirrorOf(b)).toBe('before after');
});

test('a connection that stops answering pings is abandoned and replaced', async ({ join }) => {
	const link = newLink();
	let dropPongs = false;
	let sockets = 0;
	const a = await join(link, async (page) => {
		await page.clock.install();
		await page.routeWebSocket(RELAY, (ws) => {
			sockets += 1;
			const server = ws.connectToServer();
			ws.onMessage((message) => server.send(message));
			server.onMessage((message) => {
				if (!(dropPongs && message === 'pong')) ws.send(message);
			});
		});
	});
	const b = await join(link);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	dropPongs = true;
	// Silence counts from the first unanswered ping, one 10-second tick in.
	await a.clock.runFor(51_000);
	dropPongs = false;
	await a.clock.runFor(1_000);
	await expect.poll(() => sockets).toBe(2);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('alive');
	await expect.poll(mirrorOf(b)).toBe('alive');
});

test('a hidden tab’s throttled timers keep a healthy call', async ({ join }) => {
	const link = newLink();
	let sockets = 0;
	let pongs = 0;
	const a = await join(link, async (page) => {
		await page.clock.install();
		await page.routeWebSocket(RELAY, (ws) => {
			sockets += 1;
			const server = ws.connectToServer();
			ws.onMessage((message) => server.send(message));
			server.onMessage((message) => {
				if (message === 'pong') pongs += 1;
				ws.send(message);
			});
		});
	});
	const b = await join(link);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	// The opening ping must be answered first, or the jump makes it look 60 seconds old.
	await expect.poll(() => pongs).toBeGreaterThan(0);
	// Chrome wakes a long-hidden tab's timers once a minute: one jump, one firing.
	await a.clock.fastForward(60_000);
	await a.waitForTimeout(1_000);
	expect(sockets).toBe(1);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('still here');
	await expect.poll(mirrorOf(b)).toBe('still here');
});

test('typing fast and erasing at once leaves the partner’s mirror empty', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('the quick brown fox jumps over the lazy dog');
	await a.locator('#composer').press('Enter');
	await expect.poll(mirrorOf(b)).toBe('');
	// A frame overtaken by the erase would land after it; give one the time to.
	await b.waitForTimeout(300);
	expect(await mirrorOf(b)()).toBe('');
});

test('a busy caller gets in with Try again once a slot frees', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	const c = await join(link);
	await expect(c.locator('.status-text')).toHaveText(en.statusBusy);
	await a.context().close();
	await expect(b.locator('.status-text')).toHaveText(en.statusLeft);
	await c.click('#retry');
	await expect(c.locator('.status-text')).toHaveText(en.statusConnected);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
});
