import { t } from '../i18n.ts';
import type { LineKeys } from '../lib/crypto.ts';
import { deriveLine } from '../lib/crypto.ts';
import { newClientId } from '../lib/fragment.ts';
import type { Tone } from '../lib/presence.ts';
import type { SendKey } from '../lib/send-key.ts';
import { isErase, readSendKey } from '../lib/send-key.ts';
import type { TabMessage, View } from '../lib/tabs.ts';
import { lineName } from '../lib/tabs.ts';
import { throttle } from '../lib/throttle.ts';
import type { Connection } from './connection.ts';
import { openConnection } from './connection.ts';
import { bind, slot } from './dom.ts';
import { playTone, tonesArmed } from './signal.ts';
import { app, locale, readStored, writeStored } from './store.ts';

const THROTTLE_MS = 40;

const STATUS_KEYS: Record<View['status'], string> = {
	connecting: 'statusConnecting',
	waiting: 'statusWaiting',
	connected: 'statusConnected',
	left: 'statusLeft',
	busy: 'statusBusy',
};

export type Line = { leave(): void; relabel(): void };

// Runs the line view until leave(); the tab holding the line's lock also runs the relay connection.
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

	const tabId = newClientId();
	let clientId = newClientId();
	let view: View = { status: 'connecting', partner: false, seen: false, mirror: '' };
	let caughtUp = false;
	// A Start-button click has already armed this tab's audio, so it starts as the one used.
	let lastUsed: string | null = document.hasFocus() && tonesArmed() ? tabId : null;
	let connection: Connection | null = null;
	let channel: BroadcastChannel | null = null;
	let sendKey: SendKey = readSendKey(readStored('send-key'));
	const ended = new AbortController();

	const post = (message: TabMessage) => channel?.postMessage(message);

	const render = () => {
		bind(statusText, STATUS_KEYS[view.status]);
		invite.hidden = view.status !== 'waiting' && view.status !== 'left';
		retryButton.hidden = view.status !== 'busy';
		const title = t(locale, 'appTitle');
		document.title = view.status === 'connected' ? `● ${title}` : title;
		mirror.textContent = view.mirror;
	};

	const shareState = () => post({ type: 'state', clientId, text: composer.value, view });

	// The tab the person used last has had a gesture, so its audio is allowed; it alone plays.
	const sound = (tone: Tone) => {
		if (lastUsed === tabId) playTone(tone);
	};

	const share = (text: string) => {
		caughtUp = true;
		post({ type: 'text', text });
		connection?.send(text);
	};
	const typed = throttle(() => share(composer.value), THROTTLE_MS);

	const erase = () => {
		if (composer.value === '') return;
		composer.value = '';
		typed.cancel();
		share('');
	};

	const receive = (message: TabMessage) => {
		switch (message.type) {
			case 'hello':
				if (connection !== null) shareState();
				return;
			case 'state':
				if (connection !== null) return;
				clientId = message.clientId;
				view = message.view;
				// Text is taken only before this tab is typed in: states may lag behind its typing.
				if (!caughtUp) composer.value = message.text;
				caughtUp = true;
				render();
				return;
			case 'text':
				composer.value = message.text;
				connection?.send(message.text);
				return;
			case 'retry':
				connection?.retry();
				return;
			case 'used':
				lastUsed = message.tabId;
				return;
			case 'tone':
				sound(message.tone);
		}
	};

	const lead = (keys: LineKeys) =>
		new Promise<void>((release) => {
			if (ended.signal.aborted) {
				release();
				return;
			}
			ended.signal.addEventListener('abort', () => release());
			caughtUp = true;
			connection = openConnection({
				keys,
				clientId,
				text: composer.value,
				view,
				onView: (next) => {
					view = next;
					render();
					shareState();
				},
				onTone: (tone) => {
					post({ type: 'tone', tone });
					sound(tone);
				},
			});
		});

	const renderSendKey = () => {
		for (const button of app.querySelectorAll<HTMLElement>('[data-send-key]')) {
			const active = button.dataset.sendKey === sendKey;
			button.classList.toggle('active', active);
			button.setAttribute('aria-pressed', String(active));
		}
		bind(hint, sendKey === 'enter' ? 'hintEnter' : 'hintCtrlEnter');
	};

	const used = () => {
		lastUsed = tabId;
		post({ type: 'used', tabId });
	};
	document.addEventListener('pointerdown', used, { signal: ended.signal });
	document.addEventListener('keydown', used, { signal: ended.signal });
	// The browser focuses a neighbouring tab when one closes; an armed one takes over the tones.
	addEventListener(
		'focus',
		() => {
			if (tonesArmed()) used();
		},
		{ signal: ended.signal },
	);

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
		if (connection !== null) connection.retry();
		else post({ type: 'retry' });
	});

	linkField.value = location.href;
	renderSendKey();
	render();
	void deriveLine(secret).then((keys) => {
		if (ended.signal.aborted) return;
		const name = lineName(keys.roomId);
		channel = new BroadcastChannel(name);
		channel.addEventListener('message', (event: MessageEvent<TabMessage>) => receive(event.data));
		post({ type: 'hello' });
		if (lastUsed === tabId) post({ type: 'used', tabId });
		navigator.locks.request(name, { signal: ended.signal }, () => lead(keys)).catch(() => {});
	});

	return {
		leave() {
			ended.abort();
			typed.cancel();
			connection?.close();
			connection = null;
			channel?.close();
			channel = null;
			document.title = t(locale, 'appTitle');
		},
		relabel() {
			render();
		},
	};
}
