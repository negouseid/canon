# Verification — November 1, 2026

The later [reliability pass](RELIABILITY.md) expands this baseline to 19 tests, including
forced EventSub reconnects and a full offline workflow. The results below describe the
original pre-pass release.

Environment: macOS, Node.js 24.22.1, npm 11.19.1.

A new local Git clone of release commit `8c26056` was created without the working
instance's `.env`, token files, database, or `node_modules`.

- `npm ci` installed the lockfile dependencies successfully.
- Copying `.env.example` to `.env` required no credential changes for local mode.
- `npm run build` passed TypeScript checking.
- `npm test` passed all **10 tests**.
- `PORT=3002 npm start` started the clean clone using the documented port override
  because the main development ports were already occupied.
- The clean clone reported eight seeded entries and Twitch disabled.
- A connected WebSocket received the initial eight-entry snapshot and a test CANONIZED
  event from the local test endpoint. No API keys were supplied.
- Browser inspection confirmed proportional overlay scaling and an animated test reveal.
- The primary instance restarted with ten stored canon entries, including Moon cheese
  and The Checkpoint Treaty, and reconnected authenticated chat and all three EventSub subscriptions.
- Tracked files were checked against configured private secret values; no matches were
  found. `.env.example` contains blank credential fields. Private configuration remains
  in ignored `.env` and token files remain in ignored `data/`.

Previously verified against Twitch: command/reply, proposal, real reward redemption,
canon lookup, and streamer approval. Real raid/subscription reactions remain untested;
the listeners are accepted by Twitch and their event handlers have automated coverage.

AI voice rewriting was omitted by request. Replies use stored plain text and never
require an OpenAI key. The persona editor persists text for future use.

The demo shot list and Devpost draft are prepared. Recording, uploading the repository
and video, and submitting the entry remain manual work.
