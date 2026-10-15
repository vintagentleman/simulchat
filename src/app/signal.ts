import type { Tone } from '../lib/presence.ts';

const GLYPH =
	'<rect x="4" y="7" width="24" height="7" rx="2" fill="#8b8f96"/><rect x="4" y="18" width="24" height="7" rx="2" fill="#8b8f96"/>';
const DOT = '<circle cx="25" cy="7" r="6" fill="#e8683c"/>';

function iconHref(dot: boolean) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${GLYPH}${dot ? DOT : ''}</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function showPartnerDot(on: boolean) {
	let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
	if (link === null) {
		link = document.createElement('link');
		link.rel = 'icon';
		document.head.append(link);
	}
	const href = iconHref(on);
	if (link.href !== href) link.href = href;
}

let audio: AudioContext | null = null;

// Browsers allow sound only after a gesture, so the context is created on the first one.
export function armTones() {
	const arm = () => {
		audio ??= new AudioContext();
	};
	addEventListener('pointerdown', arm, { once: true });
	addEventListener('keydown', arm, { once: true });
}

export function playTone(tone: Tone) {
	const context = audio;
	if (context === null) return;
	const notes = tone === 'join' ? [660, 880] : [880, 660];
	notes.forEach((frequency, i) => {
		const at = context.currentTime + i * 0.12;
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = 'sine';
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(0, at);
		gain.gain.linearRampToValueAtTime(0.08, at + 0.01);
		gain.gain.linearRampToValueAtTime(0, at + 0.1);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(at);
		oscillator.stop(at + 0.11);
	});
}
