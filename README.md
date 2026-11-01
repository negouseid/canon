# Canon

**Your channel remembers.** Canon turns Twitch inside jokes, nicknames, and memorable
moments into persistent, queryable channel lore. Viewers propose entries in chat or
spend Channel Points to canonize them. A transparent OBS overlay celebrates each new
entry, and the streamer keeps control through a local moderation panel.

## Run from a clean clone

Requires **Node.js 22.12+** and npm; tested locally with Node 24.

```sh
git clone https://github.com/negouseid/canon.git
cd canon
npm ci
cp .env.example .env
npm start
```

Open [the studio](http://127.0.0.1:3000/panel). You should see **8 canon entries**,
an empty pending queue, an overlay preview, and offline Twitch indicators. Click
**Fire test CANONIZED** to see the nine-second reveal. Local mode needs no Twitch
credentials, OpenAI key, or external database. Test reveals never modify stored lore.

`better-sqlite3` is native. If a prebuilt binary is unavailable, install Python 3 and
your platform's C++ build tools (macOS: `xcode-select --install`), then retry `npm ci`.

```sh
npm run build   # Typecheck
npm test        # Persistence, commands, OAuth, EventSub handlers, moderation, persona
npm run seed    # Idempotent: rerunning does not duplicate sample entries
```

The application uses port **3000** by default. This project's live development instance
uses **3001** to avoid a port conflict. Set `PORT=3001` in `.env` if needed, restart,
and use 3001 in every URL, including the Twitch redirect. `EADDRINUSE` means another
process already uses the selected port; stop the old Canon instance or choose a free port.

## Offline judge rehearsal

No Twitch or OpenAI key is needed. In the panel, expand **Offline command rehearsal**
under **Let chat write the first draft**. Run `!canon add Offline lore: Everything still works.`,
approve it in Pending, watch the reveal, then run `!canon Offline lore` in the rehearsal
input. Restart and query it again to verify persistence. These are clearly labeled
local commands, using the real handler; they do not send Twitch messages or spend points.

See the [failure-path audit](docs/RELIABILITY.md) for before/after behavior and tests.
The suite now has **19 tests**, including forced EventSub disconnection/re-subscription
and a complete offline child-process flow from `.env.example`. An intentional mock
HTTP 503 log during the test is expected.

If the database cannot open, the app starts a temporary seeded memory demo and shows a
warning: changes in that mode do **not** survive restart. Runtime write errors return
useful messages; last-known lore remains available. Twitch failures do not stop the
local studio. The overlay reconnects and continues its ticker while offline.

## Connect Twitch

### 1. Register the application

1. Enable two-factor authentication on the Twitch account registering the app.
2. Open the [Developer Console](https://dev.twitch.tv/console/apps) → **Register Your
   Application**. Choose a unique name, **Chat Bot** category, and **Confidential**
   client type if prompted.
3. Register this exact OAuth Redirect URL for the default port:
   `http://localhost:3000/auth/twitch/callback`.
   For port 3001, use `http://localhost:3001/auth/twitch/callback` instead.
   `localhost` and `127.0.0.1` are not interchangeable in the registered redirect.
4. Under **Manage**, copy the client ID and generate a client secret. Put them in
   **`.env`**, not `.env.example`. Never share your secret or token files.
5. Choose your broadcaster login and bot login. A separate bot account is recommended;
   the broadcaster account can also serve as the bot, including for manual command tests.

```dotenv
PORT=3000
TWITCH_ENABLED=true
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNEL=your_streamer_login
TWITCH_BOT_USERNAME=your_bot_login
```

Use login names without `@` or URLs. `TWITCH_BROADCASTER_ID` is optional: the app resolves
the numeric ID from the broadcaster token and checks an explicitly supplied ID.
Leave `TWITCH_OAUTH_REDIRECT_URI` blank unless explicitly setting the same local callback.

### 2. Create “Canonize this”

1. In Creator Dashboard, open **Viewer Rewards → Power-ups & Channel Points**.
2. Choose **Manage Rewards & Challenges → Add New Custom Reward**.
3. Set the title to **Canonize this**, exactly, and cost to **100** for the demo.
4. Description: `Make channel history! Enter term: definition, or type latest to canonize the newest proposal.`
5. Enable **Require viewer text**. Leave cooldowns/limits off for testing and leave
   **Skip reward requests queue** off. Save; ensure the reward is enabled and unpaused.
6. If Channel Points is missing, go to **Monetization → Setup** and complete creator
   tools onboarding. Twitch says activation can take up to 24 hours. A blank dashboard
   immediately after onboarding may need time or browser troubleshooting; it does not
   block authenticated chat or the local overlay.

`TWITCH_REWARD_TITLE` defaults to `Canonize this`; it must match your title exactly.

### 3. Authorize both roles

Restart with `npm start`, open `/panel`, and expand **Twitch connections & reward setup**.

| Role | Button | Sign in as | Requested scopes |
|---|---|---|---|
| Chat | Authorize bot account | `TWITCH_BOT_USERNAME` | `chat:read chat:edit` |
| Events | Authorize broadcaster | Owner of `TWITCH_CHANNEL` | `channel:read:redemptions channel:read:subscriptions` |

Both flows use the same registered callback but separate token files/providers, so
one role does not overwrite the other's permissions when accounts are shared.
The flow switches to `localhost` for its browser-bound state cookie. Start a fresh
attempt from the panel if it expires, is declined, or Twitch reports `redirect_mismatch`.
Canon rejects a token for the wrong app, wrong account, or missing scopes.

Wait for **Chat connected** and **Events ready**. Expanded event status should show:

- `channel.channel_points_custom_reward_redemption.add — enabled`
- `channel.subscribe — enabled`
- `channel.raid — enabled`

Incoming raids require no additional scope. EventSub uses **WebSocket transport** and
a user token; no public webhook URL or tunnel is required. Reward inspection should
report **Found and available**. Failed subscriptions display status without stopping
chat or the local studio. Reauthorize after permission changes or revoked tokens.

## Use Canon

| Input | Result |
|---|---|
| `!canon The Chair Council` | Look up saved lore, case-insensitively |
| `!canon add Moon cheese: The moon sponsors our snacks.` | Add a pending proposal |
| `!lore` | Return a random canonical entry |
| Reward text `latest` | Canonize the newest pending proposal |
| Reward text `Door boss: Every door is the final boss.` | Create canon directly |
| Panel **Approve & reveal** | Canonize a selected proposal and animate the overlay |
| Panel **Reject** | Remove a proposal from the queue, keeping it outside canon |

Chat commands work while the channel is offline. Send them through your channel's
regular chat input. **Reward text belongs in the Channel Points redemption flow**:
click the points balance, select **Canonize this**, and enter `latest`. Some Twitch
layouts then reuse the chat input for reward text; a successful redemption appears
as **Redeemed Canonize this**. `!canon latest` is just a lookup for a term named latest.

Keep the overlay or embedded preview open before redeeming. Expect a **CANONIZED**
reveal without the TEST label, followed by a successful `!canon Moon cheese` lookup.
The animation lasts nine seconds. Wait at least **five seconds** between commands
from the same account; the bot also has a 1.5-second global command cooldown.
Replies are plain text, prefixed `Canon:`, and capped at 450 characters.

Proposals remain hidden from canonical lookups until approved or redeemed. Terms may
contain up to 100 characters and definitions up to 1000. `latest` (or empty reward
input if your reward permits it) preserves the original proposal's author and source.
Other reward input must use `term: definition`.

Invalid redemptions and an empty pending queue leave canon unchanged. The connection
panel reports the reason; manually reject/refund unsuccessful requests in Twitch.
Canon does not automatically fulfill, cancel, or refund reward requests.

Subscriptions produce a welcome ticker message. Incoming raids produce a welcome
burst containing a random piece of channel lore. Neither creates a canonical entry.

## OBS and streamer controls

Add an OBS **Browser Source**:

- URL: `http://127.0.0.1:3000/overlay` (use 3001 if configured)
- Width: **1920**, height: **1080**
- Background: transparent; no custom CSS or remote assets required

`/overlay?preview` adds a dark rehearsal background. The canvas scales proportionally
in the panel and browser, keeping the preview aligned with the OBS composition.
The ticker rotates every 12 seconds; reveal bursts queue up to 20 waiting entries.
Long reveal text is visually truncated to fit; the full definition stays in SQLite
and the canon library. Reduced-motion preferences suppress reveal movement.

The panel includes live pending proposals, approve/reject controls, a searchable canon
library, overlay rehearsal, and expandable connection status. WebSocket updates keep
it live, with a 15-second polling fallback. A race between approval and redemption
returns a conflict and refreshes the queue rather than approving twice.

The persona editor saves up to 8000 characters in `VOICE_PATH` (default `voice.md`).
It indicates unsaved changes and prevents stale saves from overwriting newer edits.
**Reload saved version** replaces the editor's text; copy unsaved work first if needed.
**AI voice rewriting was deliberately skipped.** Persona editing is available for future
use, but it does not change replies in this release. No OpenAI key or API call is used.

## Persistence and reliability

SQLite lives at `DATABASE_PATH`, default `data/canon.sqlite`, and survives restarts.
Each entry stores term, definition, author, createdAt, votes, sourceEvent, and moderation
status. Votes are stored but no voting interaction is implemented. Rejected proposals
remain stored; the UI does not delete them. Eight fictional sample entries seed a new
demo; use `SEED_ON_START=false` with a fresh database path for an empty real channel.
Do not delete your real database to clear demo data.

Reward receipt IDs and lore changes commit in one SQLite transaction. Duplicate
redemptions cannot canonize another proposal, including after restart. Failed input
receipts are recorded too, preventing a late duplicate from claiming a newer proposal.
Twurple handles transport reconnects and message deduplication. Transient animations
are not replayed after restart or to clients connecting after the event; newly connected
overlays receive the current canon snapshot.

Tokens refresh automatically, validate at startup/every 55 minutes, and are saved with
owner-only permissions in ignored `data/twitch-bot-token.json` and
`data/twitch-broadcaster-token.json`. External auth work has a ten-second deadline and temporary network failures retry. OAuth state is browser-bound, single-use, and
expires after ten minutes. Callback query strings are not logged.

The server binds to loopback and accepts only local Host headers. Panel writes require
JSON, a panel-issued mutation token, and same-origin browser requests. Viewer text is
rendered as text. This is a **local streamer tool**, without remote-user authentication.
Back up SQLite with its backup API, or stop Canon before copying the database and WAL
sidecars. Credentials, tokens, and databases are excluded by `.gitignore`.

## Validation and build story

Verified with the real channel: authenticated command/reply, pending proposal,
Channel Points redemption, canonical lookup afterward, panel approval, and persistence
across restarts. Raid and subscription listeners were accepted by Twitch; their
handlers are tested, but real raid/subscription reactions have not been exercised yet.

Automated tests cover command routing, same-account commands, pending visibility,
duplicate events across restart, OAuth state/cookie boundaries, separate-role scopes,
moderation conflicts, write-request protections, and persona persistence/stale saves.
Browser QA checks approval/reveal, rejection, search, and persona saving against an
isolated database. `npm run build` typechecks; `npm test` runs the suite.

The Git history records small step-labeled commits for the scaffold, overlay, chat,
EventSub, streamer controls, and final demo preparation, including the same-account
command fix discovered during live testing. See [Devpost draft](docs/DEVPOST.md) for
the feature description and how Codex was used, and [demo shot list](docs/DEMO.md) for
a recording plan under three minutes. Capturing and submitting the video remain manual.

## Official references

- [Twitch app registration](https://dev.twitch.tv/docs/authentication/register-app/)
- [Twitch OAuth scopes](https://dev.twitch.tv/docs/authentication/scopes/)
- [EventSub types and authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Channel Points FAQ](https://help.twitch.tv/s/article/channel-points-faq?language=en_US)
- [Twurple WebSocket listener setup](https://twurple.js.org/docs/getting-data/eventsub/listener-setup.html)
