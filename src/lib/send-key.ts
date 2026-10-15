export type SendKey = 'enter' | 'ctrlEnter';

export type KeyPress = Pick<
	KeyboardEvent,
	'key' | 'keyCode' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'
>;

export function readSendKey(stored: string | null): SendKey {
	return stored === 'ctrlEnter' ? 'ctrlEnter' : 'enter';
}

// keyCode 229: Safari commits an IME composition with an Enter whose isComposing is false.
export function isErase(mode: SendKey, press: KeyPress): boolean {
	if (press.key !== 'Enter' || press.isComposing || press.keyCode === 229) return false;
	if (press.shiftKey || press.altKey) return false;
	const modifier = press.ctrlKey || press.metaKey;
	return mode === 'enter' ? !modifier : modifier;
}
