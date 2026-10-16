import { writeStored } from './store.ts';

const KEY = 'theme';

// The user's pinned scheme, or null when following the system.
export function pinnedTheme(): 'light' | 'dark' | null {
	const { classList } = document.documentElement;
	if (classList.contains('theme-dark')) return 'dark';
	return classList.contains('theme-light') ? 'light' : null;
}

// What the pin toggle switches to: the pinned scheme, or the opposite of the
// system scheme when following it.
export function pinScheme(): 'light' | 'dark' {
	return pinnedTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
}

// null follows the system: no class, themed via `@media`. The `color-scheme`
// meta keeps the pre-paint canvas right.
export function applyTheme(theme: 'light' | 'dark' | null) {
	const root = document.documentElement;
	root.classList.toggle('theme-light', theme === 'light');
	root.classList.toggle('theme-dark', theme === 'dark');
	document
		.querySelector('meta[name="color-scheme"]')
		?.setAttribute('content', theme ?? 'light dark');
	writeStored(KEY, theme);
}
