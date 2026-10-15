import type { Status, Tone } from './presence.ts';

export type View = { status: Status | 'busy'; partner: boolean; mirror: string };

export type TabMessage =
	| { type: 'hello' }
	| { type: 'state'; clientId: string; text: string; view: View }
	| { type: 'text'; text: string }
	| { type: 'retry' }
	| { type: 'used'; tabId: string }
	| { type: 'tone'; tone: Tone };

// Named after the room id, never the secret: every page of the origin can see these names.
export function lineName(roomId: string): string {
	return `simulchat:${roomId}`;
}
