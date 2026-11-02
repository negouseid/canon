# Verification — November 1, 2026

## Feature 2: starter lore pack — both features verified

- Final `npm run build && npm test` passed: **23 tests**, zero failures. Every existing
  test remains passing, including the forced EventSub recovery and offline workflow.
- The panel endpoint uses the existing mutation preHandler, a 1024-byte body limit,
  and empty-object schema. Tests reject missing/invalid CSRF, cross-origin requests,
  incorrect content type, and unexpected body properties before any entries are added.
- Both startup and the panel call the one shared `seed()` function/list. An empty
  store returns `{ added: 8, alreadyPresent: 0 }`; a second seed returns
  `{ added: 0, alreadyPresent: 8 }`, still using `seed:v1:<index>` source keys.
- A snapshot (not a fake canonization) is published after each successful seed.
- Browser QA used a separate database with SEED_ON_START=false and Twitch disabled:
  first screen had zero entries; Seed starter lore filled the library/ticker immediately;
  a second click reported zero added, eight already present, and still eight entries.
- With IDLE_LORE_SECONDS=5, Remember this? callbacks appeared in the ticker. A TEST
  CANONIZED card displayed independently while the lore ticker continued.
- Live-hub transport and live-message.js were reused unchanged. No analytics, scoring,
  generated lore, voice rewriting, or Twitch chat spam was added.
- For an empty recording take, use a new demo DATABASE_PATH, PORT=3002 (or another
  free port), TWITCH_ENABLED=false, SEED_ON_START=false, IDLE_LORE_SECONDS=5, then
  `npm start`. Main channel data was not changed by browser QA.

## Feature 1: auto-lore on idle

- `npm run build && npm test` passed: **22 tests**, including every existing test.
- Injected-clock tests use no wall-clock sleeps. They verify one lore callback after
  the gap, reset on commands/canonizations/community events and auto-drops, zero mode,
  interval unref/cleanup, and full-gap retry spacing for empty/failing stores.
- The existing overlay script test now verifies `community / lore` reaches the ticker
  while a CANONIZED card reveals independently. The hub and browser message parser are
  reused without changing their transport behavior.
- `IDLE_LORE_SECONDS` defaults to 180, is documented in `.env.example`/README, and
  accepts 0 to disable. The timer starts only after the server listens and stops on close.
- Actual chat command activity is recorded before cooldown filtering; offline command
  rehearsal also resets the same timer. No Twitch message, analytics, or scoring is added.


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
