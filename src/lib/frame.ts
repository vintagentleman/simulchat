const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const SNAPSHOT = 0;
const SPLICE = 1;
const RESEND = 2;

export type Splice = { keep: number; remove: number; insert: string };

// Tells a different base text apart; AES-GCM, not this, vouches for the frame.
function checksum(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
	return hash >>> 0;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// Never splits a surrogate pair, or the inserted text would not survive UTF-8.
export function spliceOf(base: string, next: string): Splice {
	const limit = Math.min(base.length, next.length);
	let keep = 0;
	while (keep < limit && base.charCodeAt(keep) === next.charCodeAt(keep)) keep++;
	if (keep > 0 && isHighSurrogate(base.charCodeAt(keep - 1))) keep--;
	let tail = 0;
	while (
		tail < limit - keep &&
		base.charCodeAt(base.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
	) {
		tail++;
	}
	if (tail > 0 && isLowSurrogate(next.charCodeAt(next.length - tail))) tail--;
	return { keep, remove: base.length - keep - tail, insert: next.slice(keep, next.length - tail) };
}

function varint(value: number): number[] {
	const bytes: number[] = [];
	for (; value >= 0x80; value >>>= 7) bytes.push((value & 0x7f) | 0x80);
	bytes.push(value);
	return bytes;
}

function readVarint(frame: Uint8Array, cursor: { at: number }): number {
	let value = 0;
	for (let shift = 0; shift < 28; shift += 7) {
		if (cursor.at >= frame.length) throw new RangeError('truncated varint');
		const byte = frame[cursor.at++];
		value |= (byte & 0x7f) << shift;
		if (byte < 0x80) return value;
	}
	throw new RangeError('varint too long');
}

function withHead(head: number[], text: string): Uint8Array<ArrayBuffer> {
	const body = encoder.encode(text);
	const frame = new Uint8Array(head.length + body.length);
	frame.set(head);
	frame.set(body, head.length);
	return frame;
}

export function encodeFrame(last: string | null, text: string): Uint8Array<ArrayBuffer> {
	const whole = withHead([SNAPSHOT], text);
	if (last === null) return whole;
	const { keep, remove, insert } = spliceOf(last, text);
	const sum = checksum(last);
	const head = [SPLICE, sum >>> 24, (sum >>> 16) & 0xff, (sum >>> 8) & 0xff, sum & 0xff];
	const edit = withHead([...head, ...varint(keep), ...varint(remove)], insert);
	return edit.length < whole.length ? edit : whole;
}

export const resendRequest = (): Uint8Array<ArrayBuffer> => new Uint8Array([RESEND]);

export const isResendRequest = (frame: Uint8Array) => frame.length === 1 && frame[0] === RESEND;

// Null when the frame is malformed or was made for a different text than the mirror.
export function applyFrame(mirror: string, frame: Uint8Array): string | null {
	try {
		if (frame[0] === SNAPSHOT) return decoder.decode(frame.subarray(1));
		if (frame[0] !== SPLICE) return null;
		const sum = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(1);
		const cursor = { at: 5 };
		const keep = readVarint(frame, cursor);
		const remove = readVarint(frame, cursor);
		if (keep + remove > mirror.length || sum !== checksum(mirror)) return null;
		const insert = decoder.decode(frame.subarray(cursor.at));
		return mirror.slice(0, keep) + insert + mirror.slice(keep + remove);
	} catch {
		return null;
	}
}
