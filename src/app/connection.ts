import type { LineKeys } from '../lib/crypto.ts';
import { openFrame, sealFrame } from '../lib/crypto.ts';
import type { Presence, PresenceEvent, Tone } from '../lib/presence.ts';
import { initialPresence, nextDeadline, resumedPresence, statusOf, step } from '../lib/presence.ts';
import { serialQueue } from '../lib/queue.ts';
import type { View } from '../lib/tabs.ts';

const PING_MS = 10_000;
const PONG_TIMEOUT_MS = 30_000;
const HEARTBEAT_MS = 15_000;
const BUSY = 4001;

export type Connection = {
	send(text: string): void;
	retry(): void;
	close(): void;
};

// The relay socket of the tab that leads the line.
export function openConnection(options: {
	keys: LineKeys;
	clientId: string;
	text: string;
	mirror: string;
	resumed: boolean;
	onView: (view: View) => void;
	onTone: (tone: Tone) => void;
}): Connection {
	const { keys, clientId } = options;
	let text = options.text;
	let mirror = options.mirror;
	let presence: Presence = options.resumed ? resumedPresence(Date.now()) : initialPresence;
	let socket: WebSocket | null = null;
	let busy = false;
	let closed = false;
	let attempt = 0;
	let lastSent = 0;
	// When the oldest unanswered ping went out, or 0 while every ping is answered.
	let pingSent = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
	// Sealing and opening are asynchronous; the queues keep frames in order both ways.
	const outbound = serialQueue();
	const inbound = serialQueue();

	const render = () => {
		if (!presence.partner) mirror = '';
		options.onView({
			status: busy ? 'busy' : statusOf(presence),
			partner: presence.partner,
			mirror,
		});
	};

	const apply = (event: PresenceEvent) => {
		// A frame still being opened when the line is left would otherwise re-arm the deadline.
		if (closed) return;
		const result = step(presence, event, Date.now());
		presence = result.state;
		if (result.tone !== null) options.onTone(result.tone);
		clearTimeout(deadlineTimer);
		const deadline = nextDeadline(presence);
		if (deadline !== null) {
			deadlineTimer = setTimeout(() => apply({ type: 'tick' }), Math.max(0, deadline - Date.now()));
		}
		render();
	};

	const sendCurrent = () => {
		const snapshot = text;
		outbound.run(async () => {
			if (presence.count !== 2 || socket?.readyState !== WebSocket.OPEN) return;
			const frame = await sealFrame(keys.key, snapshot);
			if (presence.count === 2 && socket?.readyState === WebSocket.OPEN) {
				socket.send(frame);
				lastSent = Date.now();
			}
		});
	};

	const receive = async (data: string | ArrayBuffer) => {
		if (typeof data !== 'string') {
			if (presence.count !== 2) return;
			const opened = await openFrame(keys.key, data);
			if (opened === null || presence.count !== 2) return;
			mirror = opened;
			apply({ type: 'frame' });
			return;
		}
		if (data === 'pong') {
			pingSent = 0;
			return;
		}
		attempt = 0;
		apply({ type: 'count', count: Number(data) });
		if (presence.count === 2) sendCurrent();
	};

	const lost = (code: number) => {
		socket = null;
		if (code === BUSY) {
			busy = true;
			render();
			return;
		}
		apply({ type: 'dropped' });
		retryTimer = setTimeout(connect, Math.min(500 * 2 ** attempt, 8000));
		attempt += 1;
	};

	const ping = (ws: WebSocket) => {
		if (pingSent === 0) pingSent = Date.now();
		ws.send('ping');
	};

	const connect = () => {
		if (closed) return;
		const ws = new WebSocket(`${import.meta.env.VITE_RELAY_URL}/${keys.roomId}?c=${clientId}`);
		ws.binaryType = 'arraybuffer';
		socket = ws;
		ws.addEventListener('open', () => {
			pingSent = 0;
			ping(ws);
		});
		ws.addEventListener('message', (event: MessageEvent<string | ArrayBuffer>) => {
			if (ws === socket) inbound.run(() => receive(event.data));
		});
		ws.addEventListener('close', (event) => {
			if (ws === socket && !closed) lost(event.code);
		});
	};

	// Not timed from the last pong: a hidden tab's timer may fire only once a minute.
	const pinger = setInterval(() => {
		const ws = socket;
		if (ws?.readyState !== WebSocket.OPEN) return;
		if (pingSent !== 0 && Date.now() - pingSent > PONG_TIMEOUT_MS) {
			// A dead connection may never finish closing; stop waiting for it.
			lost(1006);
			ws.close();
			return;
		}
		ping(ws);
		// Frames are snapshots, so resending the field is a heartbeat that changes nothing.
		if (presence.count === 2 && Date.now() - lastSent >= HEARTBEAT_MS) sendCurrent();
	}, PING_MS);

	render();
	connect();

	return {
		send(next) {
			text = next;
			sendCurrent();
		},
		retry() {
			attempt = 0;
			busy = false;
			render();
			connect();
		},
		close() {
			closed = true;
			outbound.stop();
			inbound.stop();
			clearInterval(pinger);
			clearTimeout(retryTimer);
			clearTimeout(deadlineTimer);
			socket?.close(1000);
			socket = null;
		},
	};
}
