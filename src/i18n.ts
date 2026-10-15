export type Locale = 'en' | 'ru';

// English is the master. The Russian values are Konstantin's to write; until then
// they repeat the English, apart from the theme strings carried over from psychodynamometer.
export const messages: Record<Locale, Record<string, string>> = {
	en: {
		appTitle: 'Simulchat',
		tagline: 'Live typing, no history',
		intro:
			'Two people, one link. You see each other type as it happens, and nothing is kept: erasing wipes your side clean for the next thought.',
		start: 'Start a line',
		badLink: 'This link could not be read. Start a new line below.',
		statusConnecting: 'Connecting…',
		statusWaiting: 'Waiting for the other side. Send them this link:',
		statusConnected: 'Connected.',
		statusLeft: 'The other side left. They can come back through the same link:',
		statusBusy: 'This line is busy: two people are already on it.',
		retry: 'Try again',
		linkLabel: 'Link to this line',
		copyLink: 'Copy link',
		copied: 'Copied!',
		shareLink: 'Share',
		them: 'Them',
		you: 'You',
		erase: 'Erase',
		eraseKey: 'Erase key',
		hintEnter: 'Enter erases. Shift+Enter starts a new line.',
		hintCtrlEnter: 'Ctrl+Enter or ⌘+Enter erases. Enter starts a new line.',
		theme: 'Theme',
		themeSystem: 'System theme',
		themeLight: 'Light theme',
		themeDark: 'Dark theme',
	},
	ru: {
		appTitle: 'Simulchat',
		tagline: 'Live typing, no history',
		intro:
			'Two people, one link. You see each other type as it happens, and nothing is kept: erasing wipes your side clean for the next thought.',
		start: 'Start a line',
		badLink: 'This link could not be read. Start a new line below.',
		statusConnecting: 'Connecting…',
		statusWaiting: 'Waiting for the other side. Send them this link:',
		statusConnected: 'Connected.',
		statusLeft: 'The other side left. They can come back through the same link:',
		statusBusy: 'This line is busy: two people are already on it.',
		retry: 'Try again',
		linkLabel: 'Link to this line',
		copyLink: 'Copy link',
		copied: 'Copied!',
		shareLink: 'Share',
		them: 'Them',
		you: 'You',
		erase: 'Erase',
		eraseKey: 'Erase key',
		hintEnter: 'Enter erases. Shift+Enter starts a new line.',
		hintCtrlEnter: 'Ctrl+Enter or ⌘+Enter erases. Enter starts a new line.',
		theme: 'Тема',
		themeSystem: 'Системная тема',
		themeLight: 'Светлая тема',
		themeDark: 'Тёмная тема',
	},
};

// Stored choice wins; otherwise the browser language; default English.
export function resolveLocale(navLang: string | null | undefined, stored: string | null): Locale {
	if (stored === 'en' || stored === 'ru') return stored;
	return (navLang ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function t(locale: Locale, key: string): string {
	return messages[locale][key] ?? messages.en[key] ?? key;
}
