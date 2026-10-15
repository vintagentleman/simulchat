import { expect, test } from 'vitest';

import { messages, resolveLocale, t } from '../src/i18n.ts';

test('stored language wins; otherwise navigator prefix; default en', () => {
	expect(resolveLocale('ru-RU', 'en')).toBe('en');
	expect(resolveLocale('ru-RU', null)).toBe('ru');
	expect(resolveLocale('en-US', null)).toBe('en');
	expect(resolveLocale('de', null)).toBe('en');
	expect(resolveLocale(undefined, null)).toBe('en');
	expect(resolveLocale('de', 'xx')).toBe('en');
});

test('t falls back to the key when missing', () => {
	expect(t('en', 'nope')).toBe('nope');
});

test('dictionaries cover the same keys', () => {
	expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.ru).sort());
});
