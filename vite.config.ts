import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	base: './',
	css: {
		transformer: 'lightningcss',
		lightningcss: { targets: browserslistToTargets(browserslist()) },
	},
	build: {
		target: 'baseline-widely-available',
		cssMinify: 'lightningcss',
	},
	// Unit tests only; e2e/*.spec.ts is Playwright's, run via `playwright test`.
	test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
