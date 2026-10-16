// A hidden tab's timers fire once a minute, so its heartbeat can be nearly that late.
export const PARTNER_SILENCE_MS = 75_000;
export const RECONNECT_GRACE_MS = 15_000;
export const LEAVE_DELAY_MS = 3_000;

export type Status = 'connecting' | 'waiting' | 'connected' | 'left';

export type PresenceEvent =
	{ type: 'count'; count: number } | { type: 'frame' } | { type: 'tick' } | { type: 'dropped' };

export type Presence = {
	online: boolean;
	count: number;
	partner: boolean;
	seen: boolean;
	lastFrame: number;
	graceUntil: number;
	leavingAt: number;
};

export const initialPresence: Presence = {
	online: false,
	count: 0,
	partner: false,
	seen: false,
	lastFrame: 0,
	graceUntil: 0,
	leavingAt: 0,
};

// A tab taking over the line after another tab keeps what that tab knew of the other side.
export function resumedPresence(known: { partner: boolean; seen: boolean }, now: number): Presence {
	if (!known.partner) return { ...initialPresence, seen: known.seen };
	return { ...initialPresence, partner: true, seen: true, graceUntil: now + RECONNECT_GRACE_MS };
}

export type Tone = 'join' | 'leave';

export function step(
	state: Presence,
	event: PresenceEvent,
	now: number,
): { state: Presence; tone: Tone | null } {
	switch (event.type) {
		case 'dropped':
			// If the other side was here, the same drop may have hit them: hold judgement for a while.
			return {
				state: {
					...state,
					online: false,
					count: 0,
					leavingAt: 0,
					graceUntil: state.partner ? now + RECONNECT_GRACE_MS : state.graceUntil,
				},
				tone: null,
			};
		case 'count': {
			const next = { ...state, online: true, count: event.count };
			if (event.count === 2) {
				return {
					state: {
						...next,
						partner: true,
						seen: true,
						lastFrame: now,
						graceUntil: 0,
						leavingAt: 0,
					},
					tone: state.partner ? null : 'join',
				};
			}
			if (now < state.graceUntil) return { state: next, tone: null };
			// They may only be reloading or switching tabs: wait before announcing a leave.
			if (state.partner && state.online) {
				return {
					state: { ...next, leavingAt: state.leavingAt || now + LEAVE_DELAY_MS },
					tone: null,
				};
			}
			return { state: { ...next, partner: false }, tone: state.partner ? 'leave' : null };
		}
		case 'frame':
			if (state.count === 2 && !state.partner) {
				return { state: { ...state, partner: true, lastFrame: now }, tone: 'join' };
			}
			return { state: { ...state, lastFrame: now }, tone: null };
		case 'tick': {
			if (state.graceUntil !== 0 && now >= state.graceUntil) {
				const gone = state.count !== 2;
				return {
					state: { ...state, graceUntil: 0, partner: gone ? false : state.partner },
					tone: gone && state.online && state.partner ? 'leave' : null,
				};
			}
			if (state.leavingAt !== 0 && now >= state.leavingAt) {
				return { state: { ...state, leavingAt: 0, partner: false }, tone: 'leave' };
			}
			if (state.partner && state.count === 2 && now - state.lastFrame > PARTNER_SILENCE_MS) {
				return { state: { ...state, partner: false }, tone: 'leave' };
			}
			return { state, tone: null };
		}
	}
}

export function nextDeadline(state: Presence): number | null {
	const silence = state.partner && state.count === 2 ? state.lastFrame + PARTNER_SILENCE_MS + 1 : 0;
	const pending = [state.graceUntil, state.leavingAt, silence].filter((at) => at !== 0);
	return pending.length === 0 ? null : Math.min(...pending);
}

export function statusOf(state: Presence): Status {
	if (!state.online) return 'connecting';
	if (state.graceUntil !== 0 && state.count !== 2) return 'connecting';
	if (state.partner) return 'connected';
	return state.seen ? 'left' : 'waiting';
}
