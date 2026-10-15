import { randomBytes } from 'node:crypto';

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test as base } from '@playwright/test';

import { messages } from '../src/i18n.ts';

export const en = messages.en;

export const newLink = () => `/#${randomBytes(32).toString('base64url')}`;

export const test = base.extend<{
	forbidConsoleErrors: void;
	join: (link: string, before?: (page: Page) => Promise<void>) => Promise<Page>;
}>({
	forbidConsoleErrors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (e) => errors.push(String(e)));
			page.on('console', (m) => {
				if (m.type() === 'error') errors.push(m.text());
			});
			await use();
			expect(errors, 'no page or console errors').toEqual([]);
		},
		{ auto: true },
	],
	join: async ({ browser }, use) => {
		const contexts: BrowserContext[] = [];
		await use(async (link, before) => {
			const context = await browser.newContext();
			contexts.push(context);
			const page = await context.newPage();
			await before?.(page);
			await page.goto(link);
			return page;
		});
		for (const context of contexts) await context.close();
	},
});

export { expect };

export const mirrorOf = (page: Page) => () => page.locator('.mirror').textContent();
