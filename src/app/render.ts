import { t } from '../i18n.ts';
import { cloneTemplate, slot } from './dom.ts';
import { app, locale } from './store.ts';
import { pinnedTheme, pinScheme } from './theme.ts';

function topbarFragment() {
	const fragment = cloneTemplate('tpl-topbar');
	for (const button of fragment.querySelectorAll('button.lang')) {
		const lang = (button as HTMLElement).dataset.lang;
		button.classList.toggle('active', locale === lang);
		button.setAttribute('aria-pressed', String(locale === lang));
	}
	const pinned = pinnedTheme();
	const pin = pinScheme();
	for (const button of fragment.querySelectorAll('button.theme')) {
		const active =
			(button as HTMLElement).dataset.themeChoice === 'system' ? pinned === null : pinned !== null;
		button.classList.toggle('active', active);
		button.setAttribute('aria-pressed', String(active));
	}
	const pinButton = fragment.querySelector('button.theme[data-theme-choice="pin"]');
	if (pinButton !== null) {
		pinButton.classList.toggle('pin-light', pin === 'light');
		pinButton.classList.toggle('pin-dark', pin === 'dark');
		pinButton.setAttribute('aria-label', t(locale, pin === 'light' ? 'themeLight' : 'themeDark'));
	}
	return fragment;
}

export function refreshTopbar() {
	app.querySelector('.topbar')?.replaceWith(topbarFragment());
}

export function renderLanding(badLink: boolean) {
	const page = cloneTemplate('tpl-landing');
	slot(page, '.bad-link').hidden = !badLink;
	app.replaceChildren(topbarFragment(), page);
}

export function renderLine() {
	app.replaceChildren(topbarFragment(), cloneTemplate('tpl-line'));
}
