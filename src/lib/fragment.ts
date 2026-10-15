export const SECRET_BYTES = 32;

export function toBase64url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
	let binary: string;
	try {
		binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
	} catch {
		return null;
	}
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function newSecret(): string {
	return toBase64url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

// Names one tab's connection to the relay, so its reconnect can replace it.
export function newClientId(): string {
	return toBase64url(crypto.getRandomValues(new Uint8Array(16)));
}

// Only the canonical spelling of 32 bytes passes: 43 characters that re-encode to themselves.
export function parseFragment(hash: string): Uint8Array<ArrayBuffer> | null {
	const text = hash.startsWith('#') ? hash.slice(1) : hash;
	if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return null;
	const bytes = fromBase64url(text);
	if (bytes === null || bytes.length !== SECRET_BYTES || toBase64url(bytes) !== text) return null;
	return bytes;
}
