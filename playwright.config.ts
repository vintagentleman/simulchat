import { defineConfig } from '@playwright/test';

const reuse = !process.env.CI;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4173',
		colorScheme: 'light',
		viewport: { width: 400, height: 900 },
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
	webServer: [
		{
			command: 'pnpm preview --port 4173 --strictPort',
			url: 'http://localhost:4173',
			reuseExistingServer: reuse,
		},
		// The relay answers plain requests with 404, so readiness is judged by the port.
		{
			command: 'pnpm exec wrangler dev --env local --port 8787',
			port: 8787,
			reuseExistingServer: reuse,
		},
		// Tiny rate limits, used only by the limiter tests.
		{
			command: 'pnpm exec wrangler dev --env limits --port 8788',
			port: 8788,
			reuseExistingServer: reuse,
		},
	],
});
