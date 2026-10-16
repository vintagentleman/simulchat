import { defineConfig } from 'vitest/config';

export default defineConfig({
	base: './',
	css: { transformer: 'lightningcss' },
	// Unit tests only; e2e/*.spec.ts is Playwright's, run via `playwright test`.
	test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
