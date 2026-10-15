import js from '@eslint/js';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: { ...globals.browser },
		},
	},
	{
		files: ['test/**/*.ts', 'playwright.config.ts'],
		languageOptions: { globals: { ...globals.node } },
	},
	{
		files: ['e2e/**/*.ts'],
		languageOptions: { globals: { ...globals.node, ...globals.browser } },
	},
	{
		plugins: { 'simple-import-sort': simpleImportSort },
		rules: {
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
		},
	},
	{ ignores: ['dist/', '.wrangler/', 'worker-configuration.d.ts'] },
];
