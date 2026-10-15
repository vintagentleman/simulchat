# Simulchat

> Two people, one link, live typing and no history.

A chat with no send button. Two people open the same link, and each sees the other's input field exactly as it is being typed, keystroke by keystroke, hesitations and corrections included. Enter does not send anything: it erases your own field for the next thought, and your partner watches it go. Nothing is stored anywhere. It is closer to a phone call than to messaging, and seeing how the other person types is the point, not a leak.

The idea goes back to Unix `talk(1)`. The opaque relay and the secret carried in the link are borrowed from [unseen.fyi](https://github.com/meritt/unseen.fyi), which does far more.

## How it works

Starting a line draws 32 random bytes and puts them in the URL fragment, which browsers never send to a server. From that secret, each browser derives two values with HKDF-SHA256: a room id, which it uses to find the other person through the relay, and an AES-GCM key, which never leaves the browser. Every change to your field is sent as one encrypted frame holding the whole field, so a frame says "this is what my field contains now" and needs no ordering or history beyond the connection itself.

The relay is a Cloudflare Worker with one Durable Object per room. It pairs two connections by room id and forwards frames between them, without being able to read them. It stores nothing: the list of open connections is its entire state. A third person who opens a busy link is told so.

The client is TypeScript and plain HTML and CSS, built with Vite, with no framework and no runtime dependencies. The relay has none either.

## What the relay can and cannot see

- It cannot read what you type or learn the key. Cloudflare does see IP addresses, room ids, connection times, and the size and timing of every frame. Keystroke timing is the product, so it is visible by design.
- The link is the key. Anyone who has the link is a participant, and the key never changes, so anyone who records the traffic and later obtains the link can decrypt it. There is no forward secrecy and no way to verify the other person.
- The relay cannot forge or alter frames, but it could drop, delay, replay or reflect them.

## Limits of the free plan

The relay runs on Cloudflare's free plan, which allows 100,000 Durable Object requests a day and then refuses service until midnight UTC. It cannot bill, so abuse can take the demo offline but cannot cost money. Each frame a browser sends is one request. Rate limits per IP slow a flood down, and frames over 8 KiB are refused, but no limit can tell a fast typist from a patient script.

| From one IP                 | Daily quota gone in          |
| --------------------------- | ---------------------------- |
| Flooding, no frame limit    | under two minutes            |
| Flooding at the frame limit | about an hour                |
| Two people talking          | 7 to 8 hours of conversation |

These estimates count each message as one request. Cloudflare bills WebSocket messages at 20 to 1 on its paid plan, and it is not yet measured whether the free allowance counts them the same way; if it does, every figure grows twentyfold. A WAF rule on a custom domain, or the paid plan, would remove the outage.

## Development

Node 26 or later.

```bash
npm install
npm run dev:relay    # the relay on :8787, in its local environment
npm run dev          # the client on :5173
npm run check        # the gate: typecheck, lint, format check, unit tests, build
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright), against local relays
```

The end-to-end suite needs `npx playwright install chromium` once per machine. Commits follow [Conventional Commits](https://www.conventionalcommits.org), subject line only; enable the hook with `git config core.hooksPath .githooks`.

## License

[MIT](LICENSE) © 2026 Konstantin Sipunin.
