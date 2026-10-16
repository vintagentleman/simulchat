import type { Tone } from '../lib/presence.ts';

let audio: AudioContext | null = null;

export function tonesArmed(): boolean {
	return audio !== null;
}

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
