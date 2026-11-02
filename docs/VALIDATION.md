# Verification — November 1, 2026

## Live Twitch and native Chrome verification — November 2, 2026

- Confirmed real UI capture, draft editing, save-as-proposal, panel approval, and
  overlay reveal using a labeled local rehearsal message (The Snack Parliament).
- With user authorization, posted a labeled demo message in `neverstreaminggoo`.
  It appeared in Catch this moment as actual Twitch chat, without a LOCAL REHEARSAL
  badge; Canon's own bot reply was excluded from the recent-chat list.
- Sent `!canon add The Snack Charter: Every snack break needs approval from the Chair Council.`
  in Twitch and observed Canon's real pending-proposal reply.
- Redeemed the existing Canonize this Channel Points reward with `latest`.
  EventSub canonized The Snack Charter; totals changed from 11/1 to 12/2.
  A subsequent `!canon The Snack Charter` returned the saved definition in Twitch.
- A second authorized reward take submitted The Buffering Baron directly as
  `term: definition`; captured its actual EventSub-driven CANONIZED reveal and
  the live 13 total / 3 this session counters. Neither reveal was a test event.
- Saved actual Twitch/panel/overlay screenshots for the revised narrated demo.
  The video uses cropped real screen captures and edited cuts, not a claim of one
  continuous recording. Narration remains the user-supplied ElevenLabs audio.
- This follow-up resolves the visual-verification limitation recorded below.
  No application code changed after the 29-test passing capture implementation.


## Catch this moment: chat capture and viewer-aware idle

- `npm run build && npm test` passed: **29 tests**, zero failures.
- Recent chat is capped at 50 messages/10 minutes, deduplicated in memory, cleared on
  close/restart, and never persisted as a transcript. The saved lore fields alone persist.
- Fake-clock tests verify expiry, bounded memory, bot-reply exclusion, duplicate
  suppression, coalesced notifications, timer cleanup, and ordinary chat resetting idle.
- Panel integration tests verify CSRF/Origin/content-type checks, schemas, 1–5 real
  source messages, invalid/expired sources, idempotent capture, pending-only save,
  approval/reveal, and the existing canon counts.
- A process test uses the actual server and WebSocket: chat pushes a generic
  `chat-changed` signal without raw text; edited lore persists across restart while
  recent chat vanishes and session counts reset. No new keys or scopes are needed.
- The actual panel JavaScript runs in a controlled DOM test: source text is never
  inserted as HTML; live refresh and failed saves preserve edits; changing sources
  preserves the draft; selecting/drafting never saves or increments counts.
- TypeScript build, JavaScript syntax, and diff whitespace checks pass.
- Native browser control was unavailable (`native pipe path unavailable`), so this
  pass does **not** claim visual browser verification or a fresh UI screenshot.
- Automatic lore suggestions, lore-mention cards, and AI drafting remain future work.


## Live canon counts

- `npm run build && npm test` passed: **24 tests**, zero failures.
- Shared in-memory session state connects EventSub redemption and panel approval;
  lifetime totals come directly from canonical store entries. Snapshots carry both.
- Tests exercise redemption, duplicate delivery, pending proposals, panel approval,
  repeat approval, rejection, starter seeding/reseeding, and restart. Only successful
  redemption/approval increments the session count; restart resets it while preserving lore.
- Overlay resilience tests reject malformed, negative, fractional and unsafe count
  values while preserving usable snapshots and the last valid display.
- Browser verification on an isolated offline database: proposal kept 8/0;
  approval immediately showed 9/1 in both panel and overlay with CANONIZED visible.
  The quiet ticker labels remain separate from the reveal card at 1920×1080 scaling.
  No count animation was added; existing reduced-motion behavior remains intact.
- Counts measure canonical entries only; no analytics, rankings, or viewer tracking.


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
