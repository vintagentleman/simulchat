import { t } from '../i18n.ts';
import { locale } from './store.ts';

// Resolve data-i18n / data-i18n-aria bindings under root. Dynamic text sets the
// binding rather than the text, so a language switch can re-run this in place.
export function applyI18n(root: DocumentFragment | Element) {
	for (const el of root.querySelectorAll('[data-i18n]')) {
		el.textContent = t(locale, (el as HTMLElement).dataset.i18n ?? '');
	}
	for (const el of root.querySelectorAll('[data-i18n-aria]')) {
		el.setAttribute('aria-label', t(locale, (el as HTMLElement).dataset.i18nAria ?? ''));
	}
}

export function cloneTemplate(id: string): DocumentFragment {
	const template = document.getElementById(id) as HTMLTemplateElement;
	const fragment = template.content.cloneNode(true) as DocumentFragment;
	applyI18n(fragment);
	return fragment;
}

export function slot(root: DocumentFragment | Element, selector: string) {
	return root.querySelector(selector) as HTMLElement;
}

export function bind(el: HTMLElement, key: string) {
	el.dataset.i18n = key;
	el.textContent = t(locale, key);
}
