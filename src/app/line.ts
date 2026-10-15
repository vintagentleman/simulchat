import { t } from '../i18n.ts';
import type { LineKeys } from '../lib/crypto.ts';
import { deriveLine, openFrame, sealFrame } from '../lib/crypto.ts';
import { newClientId } from '../lib/fragment.ts';
import type { SendKey } from '../lib/send-key.ts';
import { isErase, readSendKey } from '../lib/send-key.ts';
import { throttle } from '../lib/throttle.ts';
import { bind, slot } from './dom.ts';
import { app, locale, readStored, writeStored } from './store.ts';

const PING_MS = 10_000;
const PONG_TIMEOUT_MS = 30_000;
const THROTTLE_MS = 40;
const BUSY = 4001;

type Status = 'connecting' | 'waiting' | 'connected' | 'left' | 'busy';

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
	let status: Status = 'connecting';
	let partner = false;
	let hadPartner = false;
	let attempt = 0;
	// When the oldest unanswered ping went out, or 0 while every ping is answered.
	let pingSent = 0;
	let left = false;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let sendKey: SendKey = readSendKey(readStored('send-key'));
	// Sealing and opening are asynchronous; chaining keeps frames in order both ways.
	let outbound: Promise<void> = Promise.resolve();
	let inbound: Promise<void> = Promise.resolve();

	const setStatus = (next: Status) => {
		status = next;
		bind(statusText, STATUS_KEYS[next]);
		invite.hidden = next !== 'waiting' && next !== 'left';
		retryButton.hidden = next !== 'busy';
		const title = t(locale, 'appTitle');
		document.title = next === 'connected' ? `● ${title}` : title;
	};

	const sendField = () => {
		const text = composer.value;
		outbound = outbound.then(async () => {
			if (keys === null || !partner || socket?.readyState !== WebSocket.OPEN) return;
			const frame = await sealFrame(keys.key, text);
			if (partner && socket?.readyState === WebSocket.OPEN) socket.send(frame);
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
			if (keys === null || !partner) return;
			const text = await openFrame(keys.key, data);
			if (text !== null && partner) mirror.textContent = text;
			return;
		}
		if (data === 'pong') {
			pingSent = 0;
			return;
		}
		attempt = 0;
		partner = data === '2';
		if (partner) {
			hadPartner = true;
			setStatus('connected');
			sendField();
		} else {
			mirror.textContent = '';
			setStatus(hadPartner ? 'left' : 'waiting');
		}
	};

	const lost = (code: number) => {
		socket = null;
		partner = false;
		mirror.textContent = '';
		if (code === BUSY) {
			setStatus('busy');
			return;
		}
		setStatus('connecting');
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
			if (ws === socket) inbound = inbound.then(() => receive(event.data));
		});
		ws.addEventListener('close', (event) => {
			if (ws === socket && !left) lost(event.code);
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
		} else {
			ping(ws);
		}
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
		setStatus('connecting');
		connect();
	});

	linkField.value = location.href;
	renderSendKey();
	setStatus('connecting');
	void deriveLine(secret).then((derived) => {
		keys = derived;
		connect();
	});

	return {
		leave() {
			left = true;
			clearInterval(pinger);
			clearTimeout(retryTimer);
			typed.cancel();
			socket?.close(1000);
			socket = null;
			document.title = t(locale, 'appTitle');
		},
		relabel() {
			setStatus(status);
		},
	};
}
