import { expect, test } from 'vitest';

import type { KeyPress } from '../src/lib/send-key.ts';
import { isErase, readSendKey } from '../src/lib/send-key.ts';

const press = (overrides: Partial<KeyPress> = {}): KeyPress => ({
	key: 'Enter',
	keyCode: 13,
	shiftKey: false,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	isComposing: false,
	...overrides,
});

test('enter mode: plain Enter erases; Shift, Ctrl, Cmd and Alt variants do not', () => {
	expect(isErase('enter', press())).toBe(true);
	expect(isErase('enter', press({ shiftKey: true }))).toBe(false);
	expect(isErase('enter', press({ ctrlKey: true }))).toBe(false);
	expect(isErase('enter', press({ metaKey: true }))).toBe(false);
	expect(isErase('enter', press({ altKey: true }))).toBe(false);
});

test('ctrlEnter mode: Ctrl+Enter and Cmd+Enter erase; plain and Shift variants do not', () => {
	expect(isErase('ctrlEnter', press({ ctrlKey: true }))).toBe(true);
	expect(isErase('ctrlEnter', press({ metaKey: true }))).toBe(true);
	expect(isErase('ctrlEnter', press())).toBe(false);
	expect(isErase('ctrlEnter', press({ shiftKey: true }))).toBe(false);
	expect(isErase('ctrlEnter', press({ ctrlKey: true, shiftKey: true }))).toBe(false);
});

test('composition never erases, including Safari’s keyCode 229 commit', () => {
	expect(isErase('enter', press({ isComposing: true }))).toBe(false);
	expect(isErase('enter', press({ keyCode: 229 }))).toBe(false);
	expect(isErase('ctrlEnter', press({ ctrlKey: true, isComposing: true }))).toBe(false);
});

test('other keys never erase', () => {
	expect(isErase('enter', press({ key: 'a', keyCode: 65 }))).toBe(false);
});

test('the stored preference defaults to enter', () => {
	expect(readSendKey('ctrlEnter')).toBe('ctrlEnter');
	expect(readSendKey('enter')).toBe('enter');
	expect(readSendKey(null)).toBe('enter');
	expect(readSendKey('nonsense')).toBe('enter');
});
