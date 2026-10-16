import '../style.css';

import { applyI18n } from './app/dom.ts';
import type { Line } from './app/line.ts';
import { enterLine } from './app/line.ts';
import { refreshTopbar, renderLanding, renderLine } from './app/render.ts';
import { armTones } from './app/signal.ts';
import { app, locale, setLocale, writeStored } from './app/store.ts';
import { applyTheme, pinnedTheme, pinScheme } from './app/theme.ts';
import { t } from './i18n.ts';
import { newSecret, parseFragment } from './lib/fragment.ts';

let line: Line | null = null;

function route() {
	line?.leave();
	line = null;
	const secret = parseFragment(location.hash);
	if (secret === null) {
		renderLanding(location.hash !== '');
		document.title = t(locale, 'appTitle');
		return;
	}
	renderLine();
	line = enterLine(secret);
}

// Delegated on #app, which render replaces the children of but never #app itself.
app.addEventListener('click', (event) => {
	const target = event.target as HTMLElement;

	const langButton = target.closest<HTMLElement>('button.lang');
	if (langButton !== null) {
		const lang = langButton.dataset.lang;
		if (lang !== 'en' && lang !== 'ru') return;
		setLocale(lang);
		writeStored('lang', lang);
		document.documentElement.lang = lang;
		refreshTopbar();
		applyI18n(app);
		line?.relabel();
		return;
	}

	const themeButton = target.closest<HTMLElement>('button.theme');
	if (themeButton !== null) {
		applyTheme(themeButton.dataset.themeChoice === 'system' ? null : pinScheme());
		refreshTopbar();
		return;
	}

	if (target.closest('#start') !== null) {
		location.hash = newSecret();
	}
});

document.documentElement.lang = locale;
window.addEventListener('hashchange', route);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
	if (pinnedTheme() === null) refreshTopbar();
});
armTones();
route();
