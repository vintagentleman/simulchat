import { expect, test } from './fixtures.ts';

const url = '/';

test.describe('theme toggle', () => {
	test('default follows system with no pin class', async ({ page }) => {
		await page.goto(url);
		await expect(page.locator('html')).not.toHaveClass(/theme-(light|dark)/);
		await expect(page.locator('button.theme[data-theme-choice="system"]')).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});

	test('pin represents dark, the opposite of the light system', async ({ page }) => {
		await page.goto(url);
		await expect(page.locator('button.theme-pin')).toHaveClass(/pin-dark/);
	});

	test('pinning dark syncs class, aria, storage, and meta', async ({ page }) => {
		await page.goto(url);
		await page.click('button.theme-pin');
		await expect(page.locator('html')).toHaveClass(/theme-dark/);
		await expect(page.locator('button.theme-pin')).toHaveAttribute('aria-pressed', 'true');
		expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
		await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
	});

	test('pinned dark recolours the surface despite the light system', async ({ page }) => {
		await page.goto(url);
		const lightBg = await page.$eval('.page', (el) => getComputedStyle(el).backgroundColor);
		await page.click('button.theme-pin');
		const pinnedBg = await page.$eval('.page', (el) => getComputedStyle(el).backgroundColor);
		expect(pinnedBg).not.toBe(lightBg);
	});

	test('pin shows only the moon when representing dark', async ({ page }) => {
		await page.goto(url);
		const icons = await page.$eval('.theme-pin', (el) => {
			const sun = el.querySelector('.i-sun');
			const moon = el.querySelector('.i-moon');
			return {
				present: sun !== null && moon !== null,
				sunHidden: sun !== null && getComputedStyle(sun).display === 'none',
				moonShown: moon !== null && getComputedStyle(moon).display !== 'none',
			};
		});
		expect(icons).toEqual({ present: true, sunHidden: true, moonShown: true });
	});

	test('pinned dark survives reload via the blocking head script (no FOUC)', async ({ page }) => {
		await page.goto(url);
		await page.click('button.theme-pin');
		await page.reload();
		await expect(page.locator('html')).toHaveClass(/theme-dark/);
		await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
	});

	test('back to system clears the pin class and storage', async ({ page }) => {
		await page.goto(url);
		await page.click('button.theme-pin');
		await page.click('button.theme[data-theme-choice="system"]');
		await expect(page.locator('html')).not.toHaveClass(/theme-(light|dark)/);
		expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
	});
});
