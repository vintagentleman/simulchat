import { setImmediate } from 'node:timers/promises';

import { afterEach, expect, test, vi } from 'vitest';

import { openConnection } from '../src/app/connection.ts';
import { deriveLine, sealFrame } from '../src/lib/crypto.ts';
import type { Tone } from '../src/lib/presence.ts';
import type { View } from '../src/lib/tabs.ts';

class FakeSocket extends EventTarget {
	static OPEN = 1;
	static sockets: FakeSocket[] = [];
	readyState = FakeSocket.OPEN;
	binaryType = 'blob';
	constructor() {
		super();
		FakeSocket.sockets.push(this);
	}
	send() {}
	close() {
		this.readyState = 3;
	}
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	FakeSocket.sockets = [];
});

test('a frame that finishes opening after close changes nothing', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
	vi.stubGlobal('WebSocket', FakeSocket);
	const keys = await deriveLine(new Uint8Array(32));
	const views: View[] = [];
	const tones: Tone[] = [];
	const connection = openConnection({
		keys,
		clientId: 'c',
		text: '',
		mirror: '',
		resumed: false,
		onView: (view) => views.push(view),
		onTone: (tone) => tones.push(tone),
	});
	const [socket] = FakeSocket.sockets;
	const deliver = (data: string | ArrayBuffer) =>
		socket?.dispatchEvent(new MessageEvent('message', { data }));
	deliver('2');
	await vi.waitFor(() => expect(tones).toEqual(['join']));

	const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
	let opening: Promise<ArrayBuffer> | undefined;
	let viewsAtClose = 0;
	vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce((...args) => {
		connection.close();
		viewsAtClose = views.length;
		opening = decrypt(...args);
		return opening;
	});
	deliver((await sealFrame(keys.key, 'late')).buffer);
	await vi.waitFor(() => expect(opening).toBeDefined());
	await opening;
	await setImmediate();

	vi.advanceTimersByTime(120_000);
	expect(tones).toEqual(['join']);
	expect(views.length).toBe(viewsAtClose);
});
