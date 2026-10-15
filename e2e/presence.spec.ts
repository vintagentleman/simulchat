import type { Page, WebSocketRoute } from '@playwright/test';

import { en, expect, JOIN, LEAVE, newLink, recordTones, test, tonesOf } from './fixtures.ts';

const RELAY = /:8787\//;

test('the tab icon shows a dot while the other side is there', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const icon = a.locator('link[rel="icon"]');
	await expect(icon).toHaveAttribute('href', /^data:image\/svg\+xml/);
	await expect(icon).not.toHaveAttribute('href', /circle/);
	const b = await join(link);
	await expect(icon).toHaveAttribute('href', /circle/);
	await b.context().close();
	await expect(icon).not.toHaveAttribute('href', /circle/);
});

test('a rising tone when the other side joins, a falling one when they leave', async ({ join }) => {
	const link = newLink();
	const a = await join(link, recordTones);
	await a.locator('#composer').click();
	const b = await join(link);
	await expect.poll(tonesOf(a)).toEqual(JOIN);
	await b.context().close();
	await expect.poll(tonesOf(a)).toEqual([...JOIN, ...LEAVE]);
});

test('a line started with the Start button plays the join tone without another click', async ({
	join,
}) => {
	const a = await join('/', recordTones);
	await a.click('#start');
	await expect(a.locator('.status-text')).toHaveText(en.statusWaiting);
	await join(`/${new URL(a.url()).hash}`);
	await expect.poll(tonesOf(a)).toEqual(JOIN);
});

test('a partner whose connection silently dies is shown as gone', async ({ join }) => {
	const link = newLink();
	const a = await join(link, (page) => page.clock.install());
	// b connects, then nothing passes in either direction and its close never reaches the relay.
	await join(link, (page) =>
		page.routeWebSocket(RELAY, (ws) => {
			const server = ws.connectToServer();
			ws.onMessage(() => {});
			server.onMessage(() => {});
			ws.onClose(() => {});
		}),
	);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	// Ten-second steps, so a's own pings are answered in between.
	for (let i = 0; i < 9; i++) {
		await a.clock.runFor(10_000);
		await a.waitForTimeout(100);
	}
	await expect(a.locator('.status-text')).toHaveText(en.statusLeft);
	await expect(a.locator('link[rel="icon"]')).not.toHaveAttribute('href', /circle/);
});

test('an idle partner stays connected through their heartbeats', async ({ join }) => {
	const link = newLink();
	const a = await join(link, (page) => page.clock.install());
	const b = await join(link, (page) => page.clock.install());
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	for (let i = 0; i < 9; i++) {
		await Promise.all([a.clock.runFor(10_000), b.clock.runFor(10_000)]);
		await a.waitForTimeout(100);
	}
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
});

test('a relay restart that drops both sides plays no tone', async ({ join }) => {
	const link = newLink();
	const sockets: { page: WebSocketRoute; server: WebSocketRoute }[] = [];
	// Closes are staged by hand below, so neither side forwards them.
	const capture = (page: Page) =>
		page.routeWebSocket(RELAY, (ws) => {
			const server = ws.connectToServer();
			ws.onClose(() => {});
			server.onClose(() => {});
			sockets.push({ page: ws, server });
		});
	const a = await join(link, async (page) => {
		await recordTones(page);
		await capture(page);
	});
	await a.locator('#composer').click();
	let bSockets = 0;
	const b = await join(link, (page) =>
		page.routeWebSocket(RELAY, (ws) => {
			bSockets += 1;
			// b's first reconnect fails, so a is always first back on the restarted line.
			if (bSockets === 2) {
				void ws.close();
				return;
			}
			const server = ws.connectToServer();
			ws.onClose(() => {});
			server.onClose(() => {});
			sockets.push({ page: ws, server });
		}),
	);
	await expect.poll(tonesOf(a)).toEqual(JOIN);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	// A restart drops every page's socket and the relay forgets them, with no count sent between.
	const before = [...sockets];
	await Promise.all(before.map(({ page }) => page.close({ code: 1001 })));
	await Promise.all(before.map(({ server }) => server.close()));
	await expect.poll(() => sockets.length).toBe(4);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.waitForTimeout(300);
	expect(await tonesOf(a)()).toEqual(JOIN);
});
