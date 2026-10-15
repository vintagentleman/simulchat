import { t } from '../i18n.ts';
import type { LineKeys } from '../lib/crypto.ts';
import { deriveLine, openFrame, sealFrame } from '../lib/crypto.ts';
import { newClientId } from '../lib/fragment.ts';
import type { PresenceEvent, Status as PresenceStatus } from '../lib/presence.ts';
import { initialPresence, statusOf, step } from '../lib/presence.ts';
import { serialQueue } from '../lib/queue.ts';
import type { SendKey } from '../lib/send-key.ts';
import { isErase, readSendKey } from '../lib/send-key.ts';
import { throttle } from '../lib/throttle.ts';
import { bind, slot } from './dom.ts';
import { playTone, showPartnerDot } from './signal.ts';
import { app, locale, readStored, writeStored } from './store.ts';

const PING_MS = 10_000;
const PONG_TIMEOUT_MS = 30_000;
const THROTTLE_MS = 40;
const HEARTBEAT_MS = 15_000;
const BUSY = 4001;

type Status = PresenceStatus | 'busy';

const STATUS_KEYS: Record<Status, string> = {
	connecting: 'statusConnecting',
	waiting: 'statusWaiting',
	connected: 'statusConnected',
	left: 'statusLeft',
	busy: 'statusBusy',
};

export type Line = { leave(): void; relabel(): void };

// Runs the line view already rendered into #app until leave() is called.
export function enterLine(secret: Uint8Array<ArrayBuffer>): Line {
	const statusText = slot(app, '.status-text');
	const invite = slot(app, '.invite');
	const linkField = slot(app, '.invite-link') as HTMLInputElement;
	const copyButton = slot(app, '#copy-link');
	const shareButton = slot(app, '#share-link');
	const retryButton = slot(app, '#retry');
	const mirror = slot(app, '.mirror');
	const composer = slot(app, '#composer') as HTMLTextAreaElement;
	const eraseButton = slot(app, '#erase');
	const hint = slot(app, '.hint');

	const clientId = newClientId();
	let keys: LineKeys | null = null;
	let socket: WebSocket | null = null;
	let presence = initialPresence;
	let busy = false;
	let lastSent = 0;
	let attempt = 0;
	// When the oldest unanswered ping went out, or 0 while every ping is answered.
	let pingSent = 0;
	let left = false;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let sendKey: SendKey = readSendKey(readStored('send-key'));
	// Sealing and opening are asynchronous; the queues keep frames in order both ways.
	const outbound = serialQueue();
	const inbound = serialQueue();

	const render = () => {
		const status: Status = busy ? 'busy' : statusOf(presence);
		bind(statusText, STATUS_KEYS[status]);
		invite.hidden = status !== 'waiting' && status !== 'left';
		retryButton.hidden = status !== 'busy';
		const title = t(locale, 'appTitle');
		document.title = status === 'connected' ? `● ${title}` : title;
		showPartnerDot(presence.partner);
		if (!presence.partner) mirror.textContent = '';
	};

	const apply = (event: PresenceEvent) => {
		const result = step(presence, event, Date.now());
		presence = result.state;
		if (result.tone !== null) playTone(result.tone);
		render();
	};

	const sendField = () => {
		const text = composer.value;
		outbound.run(async () => {
			if (keys === null || presence.count !== 2 || socket?.readyState !== WebSocket.OPEN) return;
			const frame = await sealFrame(keys.key, text);
			if (presence.count === 2 && socket?.readyState === WebSocket.OPEN) {
				socket.send(frame);
				lastSent = Date.now();
			}
		});
	};
	const typed = throttle(sendField, THROTTLE_MS);

	const erase = () => {
		if (composer.value === '') return;
		composer.value = '';
		typed.cancel();
		sendField();
	};

	const receive = async (data: string | ArrayBuffer) => {
		if (typeof data !== 'string') {
			if (keys === null || presence.count !== 2) return;
			const text = await openFrame(keys.key, data);
			if (text === null || presence.count !== 2) return;
			apply({ type: 'frame' });
			mirror.textContent = text;
			return;
		}
		if (data === 'pong') {
			pingSent = 0;
			return;
		}
		attempt = 0;
		apply({ type: 'count', count: Number(data) });
		if (presence.count === 2) sendField();
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
		if (keys === null || left) return;
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
			if (ws === socket && !left) lost(event.code);
		});
	};

	// Not timed from the last pong: a hidden tab's timer may fire only once a minute.
	const pinger = setInterval(() => {
		apply({ type: 'tick' });
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
		if (presence.count === 2 && Date.now() - lastSent >= HEARTBEAT_MS) sendField();
	}, PING_MS);

	const renderSendKey = () => {
		for (const button of app.querySelectorAll<HTMLElement>('[data-send-key]')) {
			const active = button.dataset.sendKey === sendKey;
			button.classList.toggle('active', active);
			button.setAttribute('aria-pressed', String(active));
		}
		bind(hint, sendKey === 'enter' ? 'hintEnter' : 'hintCtrlEnter');
	};

	composer.addEventListener('input', () => typed.call());
	composer.addEventListener('keydown', (event) => {
		if (isErase(sendKey, event)) {
			event.preventDefault();
			erase();
		}
	});
	eraseButton.addEventListener('click', () => {
		erase();
		composer.focus();
	});
	for (const button of app.querySelectorAll<HTMLElement>('[data-send-key]')) {
		button.addEventListener('click', () => {
			sendKey = readSendKey(button.dataset.sendKey ?? null);
			writeStored('send-key', sendKey);
			renderSendKey();
		});
	}
	copyButton.addEventListener('click', () => {
		navigator.clipboard
			.writeText(location.href)
			.then(() => {
				bind(copyButton, 'copied');
				setTimeout(() => bind(copyButton, 'copyLink'), 1500);
			})
			.catch(() => linkField.select());
	});
	if (typeof navigator.share === 'function') {
		shareButton.hidden = false;
		shareButton.addEventListener('click', () => {
			// A dismissed share sheet rejects with AbortError; there is nothing to report.
			navigator.share({ url: location.href }).catch(() => {});
		});
	}
	retryButton.addEventListener('click', () => {
		attempt = 0;
		busy = false;
		render();
		connect();
	});

	linkField.value = location.href;
	renderSendKey();
	render();
	void deriveLine(secret).then((derived) => {
		keys = derived;
		connect();
	});

	return {
		leave() {
			left = true;
			outbound.stop();
			inbound.stop();
			clearInterval(pinger);
			clearTimeout(retryTimer);
			typed.cancel();
			socket?.close(1000);
			socket = null;
			document.title = t(locale, 'appTitle');
			showPartnerDot(false);
		},
		relabel() {
			render();
		},
	};
}
