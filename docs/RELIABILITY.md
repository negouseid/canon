# Reliability pass — November 1, 2026

Canon remains a plain-text application: AI voice rewriting was skipped by request.
The reliability work does not reintroduce an OpenAI dependency.

## Failure-path audit

| Failure path | Behavior before this pass | Current fallback / change |
|---|---|---|
| Missing `OPENAI_API_KEY`, even with a legacy voice flag | No OpenAI call; replies already plain text | Retained. `/health` explicitly reports `voiceMode: plain-text`; offline end-to-end test runs without a key. |
| Twitch disabled or app credentials missing | Local studio and seeded lore worked; connection setup prompted | Retained and tested. Offline command rehearsal now uses the real command handler, without sending Twitch messages. |
| Saved bot or broadcaster token missing | Catch/read path left role disconnected; prompted authorization | Retained, regression-tested with Twitch enabled. Local commands, moderation, and overlay still work. |
| Saved token file is malformed or has the wrong structure | Catch prevented startup failure; validation was duplicated and incomplete | Shared strict parser rejects invalid token fields. Per-role status requests reauthorization; other surfaces stay running. |
| Access token expired or invalid, but refresh token valid | Only time-expired tokens were explicitly refreshed before identity validation | Invalid access tokens now also attempt refresh, then validate app/account/scopes. Recovery is unit-tested with fake auth responses. |
| Refresh token revoked, wrong app/account, or missing scopes | Generic failure status / reauthorization | Permanent failures are distinguished from transport failures. No retry storm; require authorization for that role. Never expose tokens in status. |
| Twitch auth/token API hangs or network is offline | No app-level deadline; periodic validation could stop a working role permanently | Ten-second deadlines bound awaited auth work. Temporary startup/validation failures retry with capped exponential backoff while local lore/overlay remain available. A timeout bounds the caller; an underlying auth SDK request may finish later. |
| Token save fails | OAuth/connect could fail despite valid authorization; refresh failure was caught | Local mode remains usable, and file errors are caught per role. Reauthorization/file-permission message replaces process failure. Tokens are never written into tracked files. |
| EventSub socket drops after connection | Twurple reconnected, but readiness could reuse old enabled flags | Readiness clears on disconnect and raw reconnect. All three subscriptions must be acknowledged again. Real Twurple/local mock test forces a drop and verifies re-subscription plus a new redemption. |
| Subscription API temporarily fails (503/429/network) | Status showed failed; no application-level retry | Bounded exponential retry per subscription after SDK retries; permanent permission failures await reauthorization. Test forces four 503 responses before recovery. |
| Initial EventSub attempts exhaust or a socket never gets welcome | SDK initial retry limit could leave a role disconnected | Thirty-second connection supervisor restarts the authenticated session when disconnected/stuck awaiting welcome. Chat and local mode are independent. |
| EventSub permission revoked | Revocation shown in status | Retained. Cancel queued subscription retry; show reauthorization state. Do not claim all events are ready. |
| Reward missing, disabled, or inspection fails | Advisory reward status; exact title filter | Retained. Inspector requests have a deadline; failure does not block the remaining app or subscription setup. |
| Wrong reward, canceled or duplicate redemption | Ignored / durable receipt prevented replay | Retained and regression-tested, including restart. Neither duplicate canon nor extra reveal is created. |
| Malformed reward text / no pending entry for `latest` | No canon change; receipt and refund reminder | Retained; control characters also rejected. Failure receipt cannot later consume a newer proposal. |
| SQLite file/directory missing on first run | Auto-created directory/schema and idempotent seeds | Retained and tested on a nested missing path, then restart: exactly eight sample entries. |
| SQLite corrupt, inaccessible, or cannot seed | Could throw before HTTP startup | Seeded in-memory demo fallback. Original files are left in place; panel and `/health` clearly say nonpersistent mode. |
| SQLite becomes locked/full/unwritable mid-session | Chat catch silently dropped the response; HTTP returned a generic error; WS snapshot could throw | One-second SQLite busy timeout. Write failure becomes a useful chat response / HTTP 503. Reads fall back to last-known cached lore when needed. No fake successful persistence. Lock/recovery regression test covers the bounded error and successful later write. |
| `!canon` with no match | Friendly no-match/proposal instructions | Retained; exercised in offline end-to-end flow. No LLM/network request and no reveal. |
| Malformed `!canon add` (colon/term/definition/length) | Usage or length response | Retained and expanded for control characters; clear 100/1000-character limits. No proposal inserted for invalid syntax. |
| Empty canon / `!lore` / local test reveal | Friendly empty-history reply / HTTP 409 | Retained. Empty state is expected when seeding is explicitly disabled. No exception or stuck button. |
| Bot reply rejected/disconnected | Send rejection caught | Retained; status describes chat restriction/connection failure. Lookup/proposal storage remains independent. |
| Overlay socket drops or becomes half-open | Browser reconnect backoff existed; no heartbeat/watchdog | Application heartbeats, server ping/pong cleanup, browser 35-second silence watchdog, and reconnect. Last lore and ticker continue locally while disconnected. |
| Overlay receives invalid JSON/null/malformed event | Invalid JSON caught; malformed objects could throw inside rendering | Shared validated message parser ignores invalid data before queuing/rendering. Actual overlay script is tested through malformed frames, a reveal, disconnect, ticker rotation, and reconnect. |
| Slow/dead overlay client or failed send | Synchronous sends and snapshots could throw; buffers unbounded | Per-client send/error handling; slow clients over 1 MB buffered are disconnected; healthy clients continue. Heartbeats reap dead connections. |
| Panel API unavailable / hung request | Some fetches could wait indefinitely | Eight-second fetch deadlines; status/error text and `finally` re-enable actions. WebSocket reconnect plus polling refreshes data when the server returns. |
| Stale/double moderation / stale persona save | Conflict responses and refresh; atomic persona rename | Retained and tested. Rejection does not reveal lore. Failed persona reads/writes leave saved text intact and show a message. |
| Shutdown after a real EventSub event | SDK's ten-minute dedup housekeeping timer could keep Node alive | SIGINT/SIGTERM close application resources, then exit intentionally. No process-wide uncaught-error suppression is used. The transport test only unrefs that SDK maintenance timer so test cleanup can finish. |
| Invalid port / occupied port | Invalid port threw before startup; occupied port was caught | Invalid numeric setting falls back to 3000 with a message. Occupied ports produce a controlled startup error; choose a free port as documented. The app cannot serve on a port another process owns. |

## Verification

`npm run build` and `npm test` pass. There are **19 tests**, including:

- Actual Twurple WebSocket transport against a local EventSub/Helix mock: repeated 503,
  abrupt disconnect, three restored subscriptions, then a canonized redemption.
- Separate child processes for missing and malformed Twitch token files.
- Complete offline child-process flow from `.env.example`: missing database, seeding,
  no-match/malformed commands, proposal, approval, WebSocket reveal, lookup, restart.
- Corrupt database preservation and nonpersistent fallback; runtime write-lock recovery.
- Invalid-access-token refresh, wrong-account rejection, and request deadline.
- Actual browser overlay script executed with controlled sockets/timers, not a duplicate
  implementation: malformed input, animation completion, offline ticker, reconnect/watchdog.

The expected “Injected outage” HTTP 503 log during `npm test` is part of the recovery test.
It is not a production credential or an unhandled test error.

## Offline judge walkthrough

```sh
git clone https://github.com/negouseid/canon.git
cd canon
npm ci
cp .env.example .env
npm start
```

Use the printed URL (default `http://127.0.0.1:3000/panel`). If occupied, set a free
`PORT` in `.env` or run `PORT=3002 npm start`.

1. Confirm eight seeded entries. Twitch indicators are offline by design.
2. Under **Let chat write the first draft**, expand **Offline command rehearsal**.
3. Run `!canon add Offline lore: Everything still works.`. It appears in Pending.
4. Click **Approve & reveal**. See CANONIZED and the new library entry.
5. Run `!canon Offline lore` in the local rehearsal input. See the saved definition.
6. Restart the server and repeat the lookup. The entry remains.
7. Try an unknown term and `!canon add Missing colon`; both return helpful text.

This is a labeled local rehearsal using the same handler and storage, not a simulated
claim of Twitch integration. The real Twitch flow still needs the user's app/account
authorizations, and was verified separately on the live channel before this pass.

## Practical limits

Dependencies must first install successfully on a supported Node platform. No app can
promise to survive OS termination, missing native binaries, exhausted memory, or a
machine-wide failure. A port conflict needs a free port. Temporary memory fallback is
not durable storage; the warning is deliberate. EventSub recovery tests do not backfill
Twitch events lost during an outage, or substitute for a real raid/subscription demo.
