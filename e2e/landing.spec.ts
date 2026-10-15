import { en, expect, test } from './fixtures.ts';

test('starting a line opens a fresh link and waits for the other side', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.bad-link')).toBeHidden();
	await page.click('#start');
	await expect(page).toHaveURL(/#[A-Za-z0-9_-]{43}$/);
	await expect(page.locator('.status-text')).toHaveText(en.statusWaiting);
	await expect(page.locator('.invite-link')).toHaveValue(page.url());
});

test('a malformed link shows the landing with a notice', async ({ page }) => {
	await page.goto('/#not-a-line');
	await expect(page.locator('.bad-link')).toHaveText(en.badLink);
	await expect(page.locator('#start')).toBeVisible();
});

test('the title link leaves the line for the landing', async ({ page }) => {
	await page.goto('/');
	await page.click('#start');
	await expect(page.locator('.status-text')).toHaveText(en.statusWaiting);
	await page.click('.app-title a');
	await expect(page.locator('#start')).toBeVisible();
});
