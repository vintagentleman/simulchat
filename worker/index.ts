import type { Peer } from './rules.ts';
import { acceptsFrame, admit, upgradeRoom } from './rules.ts';

type Attachment = { ip: string; clientId: string; joinedAt: number; closedByRelay?: true };

const OPEN = 1;

function clientIp(request: Request): string {
	return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const room = upgradeRoom(
			{
				method: request.method,
				pathname: url.pathname,
				clientId: url.searchParams.get('c'),
				upgrade: request.headers.get('Upgrade'),
				origin: request.headers.get('Origin'),
			},
			env.ALLOWED_ORIGINS,
		);
		if (room === null) return new Response(null, { status: 404 });
		const { success } = await env.UPGRADES.limit({ key: clientIp(request) });
		if (!success) return new Response(null, { status: 429 });
		return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
	},
} satisfies ExportedHandler<Env>;

// No fields: hibernation discards memory, so the accepted sockets are the line's whole state.
export class Room {
	ctx: DurableObjectState;
	env: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		this.ctx = ctx;
		this.env = env;
		// Answered by the runtime without waking the object; it timestamps each socket's last ping.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	// Sockets the server has closed linger in getWebSockets() until the close completes.
	open(): WebSocket[] {
		return this.ctx.getWebSockets('line').filter((ws) => ws.readyState === OPEN);
	}

	peer(ws: WebSocket): Peer {
		const { clientId, joinedAt } = ws.deserializeAttachment() as Attachment;
		const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
		return { clientId, lastPing, joinedAt };
	}

	announce(peers: WebSocket[]) {
		for (const ws of peers) ws.send(String(peers.length));
	}

	// The relay announces a socket it closes itself at once, so its departure is not announced again.
	close(ws: WebSocket, code: number, reason: string) {
		const attachment = ws.deserializeAttachment() as Attachment;
		ws.serializeAttachment({ ...attachment, closedByRelay: true } satisfies Attachment);
		ws.close(code, reason);
	}

	drop(ws: WebSocket, code: number, reason: string) {
		this.close(ws, code, reason);
		this.announce(this.open());
	}

	async fetch(request: Request): Promise<Response> {
		const now = Date.now();
		// The Worker has already validated the client id.
		const clientId = new URL(request.url).searchParams.get('c') as string;
		const sockets = this.open();
		const verdict = admit(
			sockets.map((ws) => this.peer(ws)),
			clientId,
			now,
		);
		for (const i of verdict.evict) this.close(sockets[i], 1001, 'replaced');
		const [client, server] = Object.values(new WebSocketPair());
		if (!verdict.admit) {
			// Accepted, then closed: a close code needs a finished handshake; accept() logs it lost.
			this.ctx.acceptWebSocket(server, ['busy']);
			server.close(4001, 'busy');
			return new Response(null, { status: 101, webSocket: client });
		}
		const attachment: Attachment = { ip: clientIp(request), clientId, joinedAt: now };
		server.serializeAttachment(attachment);
		this.ctx.acceptWebSocket(server, ['line']);
		this.announce(this.open());
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		// A busy socket still delivers frames until its close completes; it is not on the line.
		if (!this.ctx.getTags(ws).includes('line')) return;
		if (!acceptsFrame(message)) {
			this.drop(ws, 1008, 'frame');
			return;
		}
		// Forward before the asynchronous limit check, or a later frame could overtake this one.
		for (const peer of this.open()) if (peer !== ws) peer.send(message);
		const { ip } = ws.deserializeAttachment() as Attachment;
		const { success } = await this.env.FRAMES.limit({ key: ip });
		if (!success) this.drop(ws, 1008, 'rate');
	}

	webSocketClose(ws: WebSocket) {
		this.leave(ws);
	}

	webSocketError(ws: WebSocket) {
		this.leave(ws);
	}

	leave(ws: WebSocket) {
		if (!this.ctx.getTags(ws).includes('line')) return;
		if ((ws.deserializeAttachment() as Attachment).closedByRelay) return;
		this.announce(this.open().filter((peer) => peer !== ws));
	}
}
