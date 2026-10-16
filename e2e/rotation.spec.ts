import type { Page } from '@playwright/test';

import { en, expect, JOIN, mirrorOf, newLink, recordTones, test, tonesOf } from './fixtures.ts';

const RELAY = /:8787\//;

// Records every text the status line shows, in order.
async function recordStatuses(page: Page) {
	await page.addInitScript(() => {
		const statuses: string[] = [];
		Object.assign(window, { statuses });
		new MutationObserver(() => {
			const text = document.querySelector('.status-text')?.textContent ?? '';
			if (text !== '' && text !== statuses.at(-1)) statuses.push(text);
		}).observe(document, { subtree: true, childList: true, characterData: true });
	});
}

const statusesOf = (page: Page) =>
	page.evaluate(() => (window as unknown as { statuses: string[] }).statuses);

test('a long call carries on across fresh connections', async ({ join }) => {
	const link = newLink();
	const sockets = { a: 0, b: 0 };
	const a = await join(link, async (page) => {
		await page.context().routeWebSocket(RELAY, (ws) => {
			sockets.a += 1;
			ws.connectToServer();
		});
		await recordTones(page);
		await recordStatuses(page);
	});
	await a.locator('#composer').click();
	const b = await join(link, async (page) => {
		await page.context().routeWebSocket(RELAY, (ws) => {
			sockets.b += 1;
			ws.connectToServer();
		});
		await recordStatuses(page);
	});
	await expect.poll(tonesOf(a)).toEqual(JOIN);
	// Every fill replaces the whole field, about 4 KB each way, so each side moves 32 KB.
	for (let round = 0; round < 4; round++) {
		const text = (round % 2 === 0 ? 'я' : 'ю').repeat(2000);
		for (const [writer, reader] of [
			[a, b],
			[b, a],
		] as const) {
			await writer.locator('#composer').fill(text);
			await expect.poll(mirrorOf(reader)).toBe(text);
		}
	}
	expect(sockets.a).toBeGreaterThanOrEqual(2);
	expect(sockets.b).toBeGreaterThanOrEqual(2);
	// A rotation must cost little, or long fields on both sides make rotations set each other off.
	const settled = { ...sockets };
	await a.waitForTimeout(2_000);
	expect(sockets).toEqual(settled);
	expect(sockets.a).toBeLessThanOrEqual(6);
	expect(sockets.b).toBeLessThanOrEqual(6);
	for (const page of [a, b]) {
		const statuses = await statusesOf(page);
		expect(statuses.slice(statuses.indexOf(en.statusConnected))).toEqual([en.statusConnected]);
	}
	expect(await tonesOf(a)()).toEqual(JOIN);
});
