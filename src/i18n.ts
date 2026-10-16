export type Locale = 'en' | 'ru';

export const messages: Record<Locale, Record<string, string>> = {
	en: {
		appTitle: 'Simulchat',
		tagline: 'Live typing, no history',
		intro:
			'Two people, one link. You see each other type as it happens. Nothing is kept: Enter wipes your input clean for the next thought.',
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
		hintEnter: 'Enter erases, Shift+Enter starts a new line.',
		hintCtrlEnter: 'Ctrl+Enter or ⌘+Enter erases, Enter starts a new line.',
		theme: 'Theme',
		themeSystem: 'System theme',
		themeLight: 'Light theme',
		themeDark: 'Dark theme',
	},
	ru: {
		appTitle: 'Simulchat',
		tagline: 'Живое общение без истории',
		intro:
			'Двое человек, одна ссылка. Каждый видит, как печатает другой. Истории нет: Enter очищает форму ввода для следующей мысли.',
		start: 'Открыть канал',
		badLink: 'Не удалось прочитать ссылку. Откройте новый канал ниже.',
		statusConnecting: 'Подключение…',
		statusWaiting: 'Ждём собеседника. Поделитесь этой ссылкой:',
		statusConnected: 'На связи.',
		statusLeft: 'Собеседник вышел. Вернуться можно по той же ссылке:',
		statusBusy: 'Канал занят: на нём уже двое человек.',
		retry: 'Попробовать снова',
		linkLabel: 'Ссылка на этот канал',
		copyLink: 'Копировать ссылку',
		copied: 'Скопировано!',
		shareLink: 'Поделиться',
		them: 'Собеседник',
		you: 'Вы',
		erase: 'Стереть',
		eraseKey: 'Клавиша стирания',
		hintEnter: 'Enter стирает, Shift+Enter начинает новую строку.',
		hintCtrlEnter: 'Ctrl+Enter или ⌘+Enter стирает, Enter начинает новую строку.',
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
