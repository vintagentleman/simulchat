const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type LineKeys = { roomId: string; key: CryptoKey };

function hkdf(label: string): HkdfParams {
	return { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(label) };
}

export async function deriveLine(secret: Uint8Array<ArrayBuffer>): Promise<LineKeys> {
	const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, [
		'deriveBits',
		'deriveKey',
	]);
	const room = new Uint8Array(await crypto.subtle.deriveBits(hkdf('v1 room id'), material, 128));
	const key = await crypto.subtle.deriveKey(
		hkdf('v1 frame key'),
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
	return { roomId: Array.from(room, (b) => b.toString(16).padStart(2, '0')).join(''), key };
}

// Frame layout: 12-byte random IV, then the AES-GCM ciphertext and tag of the UTF-8 text.
export async function sealFrame(key: CryptoKey, text: string): Promise<Uint8Array<ArrayBuffer>> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
	const frame = new Uint8Array(IV_BYTES + sealed.byteLength);
	frame.set(iv);
	frame.set(new Uint8Array(sealed), IV_BYTES);
	return frame;
}

// Null for anything that is not a frame sealed under this key.
export async function openFrame(key: CryptoKey, frame: ArrayBuffer): Promise<string | null> {
	if (frame.byteLength < IV_BYTES + TAG_BYTES) return null;
	try {
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: frame.slice(0, IV_BYTES) },
			key,
			frame.slice(IV_BYTES),
		);
		return decoder.decode(plain);
	} catch {
		return null;
	}
}
