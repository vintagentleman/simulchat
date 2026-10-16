import type { Page } from '@playwright/test';

import { en, expect, JOIN, mirrorOf, newLink, recordTones, test, tonesOf } from './fixtures.ts';

const RELAY = /:8787\//;
const status = (page: Page) => page.locator('.status-text');

// A second tab in the same browser, which shares the first one's locks and channels.
async function twin(page: Page, link: string) {
	const other = await page.context().newPage();
	await other.goto(link);
	return other;
}

test('twin tabs share one connection and both sides of the conversation', async ({ join }) => {
	const link = newLink();
	let sockets = 0;
	const a1 = await join(link, (page) =>
		page.context().routeWebSocket(RELAY, (ws) => {
			sockets += 1;
			ws.connectToServer();
		}),
	);
	const b = await join(link);
	await expect(status(a1)).toHaveText(en.statusConnected);
	const a2 = await twin(a1, link);
	await expect(status(a2)).toHaveText(en.statusConnected);
	await a2.locator('#composer').pressSequentially('from the twin');
	await expect.poll(mirrorOf(b)).toBe('from the twin');
	await expect(a1.locator('#composer')).toHaveValue('from the twin');
	await b.locator('#composer').pressSequentially('hello both');
	await expect.poll(mirrorOf(a1)).toBe('hello both');
	await expect.poll(mirrorOf(a2)).toBe('hello both');
	expect(sockets).toBe(1);
});

test('closing the leading tab hands the line to its twin without a sound', async ({ join }) => {
	const link = newLink();
	const b = await join(link, recordTones);
	await b.locator('#composer').click();
	const a1 = await join(link);
	await expect.poll(tonesOf(b)).toEqual(JOIN);
	const a2 = await twin(a1, link);
	await expect(status(a2)).toHaveText(en.statusConnected);
	await a1.close();
	await a2.locator('#composer').pressSequentially('still here');
	await expect.poll(mirrorOf(b)).toBe('still here');
	await b.locator('#composer').pressSequentially('good');
	await expect.poll(mirrorOf(a2)).toBe('good');
	// Longer than the leave delay, so a leave would have been announced by now.
	await b.waitForTimeout(3_500);
	expect(await tonesOf(b)()).toEqual(JOIN);
	await expect(status(b)).toHaveText(en.statusConnected);
});

test('erase and Try again work from a follower', async ({ join }) => {
	const link = newLink();
	const b = await join(link);
	const c = await join(link);
	await expect(status(c)).toHaveText(en.statusConnected);
	const a1 = await join(link);
	await expect(status(a1)).toHaveText(en.statusBusy);
	const a2 = await twin(a1, link);
	await expect(status(a2)).toHaveText(en.statusBusy);
	await c.context().close();
	await expect(status(b)).toHaveText(en.statusLeft);
	await a2.click('#retry');
	await expect(status(a1)).toHaveText(en.statusConnected);
	await expect(status(a2)).toHaveText(en.statusConnected);
	await a2.locator('#composer').pressSequentially('abc');
	await expect.poll(mirrorOf(b)).toBe('abc');
	await a2.locator('#composer').press('Enter');
	await expect.poll(mirrorOf(b)).toBe('');
	await expect(a1.locator('#composer')).toHaveValue('');
});

test('a tone plays once, in the tab used last', async ({ join }) => {
	const link = newLink();
	const a1 = await join(link, (page) => recordTones(page.context()));
	const a2 = await twin(a1, link);
	await expect(status(a2)).toHaveText(en.statusWaiting);
	await a2.locator('#composer').click();
	await join(link);
	await expect.poll(tonesOf(a2)).toEqual(JOIN);
	expect(await tonesOf(a1)()).toEqual([]);
});

test('closing the twin used last passes the tones to the remaining tab', async ({ join }) => {
	const link = newLink();
	const a1 = await join(link, (page) => recordTones(page.context()));
	await a1.locator('#composer').click();
	const a2 = await twin(a1, link);
	await a2.locator('#composer').click();
	await a2.close();
	// When a tab closes, the browser focuses a neighbouring one.
	await a1.evaluate(() => window.dispatchEvent(new Event('focus')));
	await join(link);
	await expect.poll(tonesOf(a1)).toEqual(JOIN);
});

test('the other side reloading plays no tone', async ({ join }) => {
	const link = newLink();
	const a = await join(link, recordTones);
	await a.locator('#composer').click();
	const b = await join(link);
	await expect.poll(tonesOf(a)).toEqual(JOIN);
	await b.reload();
	await expect(status(b)).toHaveText(en.statusConnected);
	await a.waitForTimeout(3_500);
	expect(await tonesOf(a)()).toEqual(JOIN);
	await expect(status(a)).toHaveText(en.statusConnected);
});

test('leaving the line without closing the tab hands it to the twin', async ({ join }) => {
	const link = newLink();
	const b = await join(link);
	const a1 = await join(link);
	await expect(status(b)).toHaveText(en.statusConnected);
	const a2 = await twin(a1, link);
	await expect(status(a2)).toHaveText(en.statusConnected);
	await a1.evaluate(() => {
		location.hash = '';
	});
	await expect(a1.locator('#start')).toBeVisible();
	await a2.locator('#composer').pressSequentially('took over');
	await expect.poll(mirrorOf(b)).toBe('took over');
});

test('a reloaded twin catches up with both sides of the conversation', async ({ join }) => {
	const link = newLink();
	const b = await join(link);
	const a1 = await join(link);
	await expect(status(a1)).toHaveText(en.statusConnected);
	const a2 = await twin(a1, link);
	await a1.locator('#composer').pressSequentially('mine');
	await b.locator('#composer').pressSequentially('theirs');
	await expect.poll(mirrorOf(a2)).toBe('theirs');
	await a2.reload();
	await expect(a2.locator('#composer')).toHaveValue('mine');
	await expect.poll(mirrorOf(a2)).toBe('theirs');
	await expect(status(a2)).toHaveText(en.statusConnected);
});

test('with three tabs, closing the leader hands over to exactly one twin', async ({ join }) => {
	const link = newLink();
	let sockets = 0;
	const a1 = await join(link, (page) =>
		page.context().routeWebSocket(RELAY, (ws) => {
			sockets += 1;
			ws.connectToServer();
		}),
	);
	const b = await join(link);
	await expect(status(a1)).toHaveText(en.statusConnected);
	const a2 = await twin(a1, link);
	const a3 = await twin(a1, link);
	await expect(status(a3)).toHaveText(en.statusConnected);
	await a1.close();
	await a3.locator('#composer').pressSequentially('from three');
	await expect.poll(mirrorOf(b)).toBe('from three');
	await expect(a2.locator('#composer')).toHaveValue('from three');
	expect(sockets).toBe(2);
});

test('a twin taking over after the other side left still says they left', async ({ join }) => {
	const link = newLink();
	let sockets = 0;
	const a1 = await join(link, (page) =>
		page.context().routeWebSocket(RELAY, (ws) => {
			sockets += 1;
			ws.connectToServer();
		}),
	);
	const b = await join(link);
	await expect(status(a1)).toHaveText(en.statusConnected);
	const a2 = await twin(a1, link);
	await expect(status(a2)).toHaveText(en.statusConnected);
	await b.context().close();
	await expect(status(a2)).toHaveText(en.statusLeft, { timeout: 10_000 });
	await a1.close();
	await expect.poll(() => sockets).toBe(2);
	// Long enough for the relay's count to reach the new leader.
	await a2.waitForTimeout(500);
	await expect(status(a2)).toHaveText(en.statusLeft);
});
