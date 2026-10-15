// Chrome wakes a long-hidden tab's timers once a minute, so liveness has to outlast a minute.
export const LIVE_MS = 75_000;
export const MAX_FRAME_BYTES = 8192;
const ROOM_PATH = /^\/([0-9a-f]{32})$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{22}$/;

export type Upgrade = {
	method: string;
	pathname: string;
	clientId: string | null;
	upgrade: string | null;
	origin: string | null;
};

export function upgradeRoom(request: Upgrade, allowed: readonly string[]): string | null {
	if (request.method !== 'GET' || request.upgrade?.toLowerCase() !== 'websocket') return null;
	if (request.origin === null || !allowed.includes(request.origin)) return null;
	if (request.clientId === null || !CLIENT_ID.test(request.clientId)) return null;
	return ROOM_PATH.exec(request.pathname)?.[1] ?? null;
}

export type Peer = { clientId: string; lastPing: number | null; joinedAt: number };

export function isLive(peer: Peer, now: number): boolean {
	return now - (peer.lastPing ?? peer.joinedAt) < LIVE_MS;
}

// The newcomer's own earlier socket goes even if live: that tab lost it in a network drop.
export function admit(
	peers: readonly Peer[],
	clientId: string,
	now: number,
): { evict: number[]; admit: boolean } {
	const evict = peers.flatMap((peer, i) =>
		isLive(peer, now) && peer.clientId !== clientId ? [] : [i],
	);
	return { evict, admit: peers.length - evict.length < 2 };
}

export function acceptsFrame(message: string | ArrayBuffer): boolean {
	return typeof message !== 'string' && message.byteLength <= MAX_FRAME_BYTES;
}
