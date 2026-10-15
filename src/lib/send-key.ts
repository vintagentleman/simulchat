export type SendKey = 'enter' | 'ctrlEnter';

export type KeyPress = Pick<
	KeyboardEvent,
	'key' | 'keyCode' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'
>;

export function readSendKey(stored: string | null): SendKey {
	return stored === 'ctrlEnter' ? 'ctrlEnter' : 'enter';
}

// Whether a keydown erases the field; every other press is left to the browser.
// keyCode 229 catches the Enter that commits an IME composition in Safari, which
// reports isComposing as false.
export function isErase(mode: SendKey, press: KeyPress): boolean {
	if (press.key !== 'Enter' || press.isComposing || press.keyCode === 229) return false;
	if (press.shiftKey || press.altKey) return false;
	const modifier = press.ctrlKey || press.metaKey;
	return mode === 'enter' ? !modifier : modifier;
}
