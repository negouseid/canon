# Canon

Your channel remembers. A persistent Twitch lore keeper built for Codex x TwitchCon.

## Current build: step 3 of 7

Working: TypeScript server, SQLite canon/pending storage, eight fictional sample entries,
transparent overlay, rotating ticker, reconnecting WebSocket, and local demo studio.
Authenticated Twitch chat and bot OAuth are implemented. Live connection requires your app credentials and bot authorization. EventSub and voice rewriting are next; panel moderation arrives in step 5.

## Try the overlay

Open `/panel`, then click **Fire test CANONIZED**. The embedded preview and all open
`/overlay` browser sources show a nine-second animated sample reveal labeled TEST.
Tests do not add or promote database entries. Multiple reveals queue in order (up to
20 waiting); the ticker rotates every 12 seconds. The overlay reconnects automatically.

In OBS add a Browser Source: `http://127.0.0.1:3000/overlay`, width **1920**, height
**1080**. The overlay background is transparent. `/overlay?preview` adds a dark preview
background for browser rehearsal. Open the overlay before triggering a test; transient
reveals are not replayed to clients connecting later.

## Clean-clone setup

Requires Node.js 22.12+ and npm (Node 24 recommended). better-sqlite3 uses a native
module; if a prebuilt binary is unavailable, install Python 3 and your platform's C++
build tools (macOS: `xcode-select --install`). Run commands in the repository directory.

```sh
npm ci
cp .env.example .env
npm start
```

Open http://127.0.0.1:3000 for the demo studio.
http://127.0.0.1:3000/api/canon returns eight sample entries.
http://127.0.0.1:3000/health reports `ok: true`, `canonCount: 8`, and `stage: 3`.
No Twitch or OpenAI credentials are required for this step.

```sh
npm run build
npm test
npm run seed
```

`build` typechecks. `test` checks persistence, moderation boundaries, and duplicate
source-event handling. `seed` can run repeatedly without adding duplicate samples.
Stop and restart `npm start`: lore remains in `data/canon.sqlite`.
Set `SEED_ON_START=false` and use a fresh `DATABASE_PATH` for an empty real channel.
Never delete your real database to clear demo data. Back up the database with SQLite's
backup API or stop the app before copying the database and any WAL sidecar files.

## Twitch setup before step 3

1. Choose your broadcaster account and a dedicated bot account. Enable Twitch 2FA.
2. Visit https://dev.twitch.tv/console/apps and register an application, category
   Chat Bot. Use `http://localhost:3000/auth/twitch/callback` as the OAuth redirect URL.
   The callback is now implemented. If using port 3001, register
   `http://localhost:3001/auth/twitch/callback` instead (or add it as a second redirect).
3. Put the client ID and generated client secret in `.env`. Never commit credentials.
4. Authorize the **bot account** with your app for `chat:read chat:edit` for
   Twurple's authenticated IRC chat client. These are distinct from EventSub chat scopes
   (`user:read:chat user:write:chat`), which are not used by this planned chat transport.
   Use the panel’s **Authorize bot account** link for the authorization-code flow and token storage. Do not paste
   tokens into chat or use an unrelated app's token generator.
5. Authorize the **broadcaster account** with the same application for
   `channel:read:redemptions channel:read:subscriptions`. Incoming `channel.raid`
   subscriptions do not require an additional scope. EventSub WebSocket uses a user
   access token; it does not need a public webhook endpoint.
6. Set `TWITCH_CHANNEL` to the channel login and `TWITCH_BROADCASTER_ID` to its numeric
   user ID (step 3 will resolve/verify this through the API). Bot and broadcaster token
   fields are separate because permissions belong to the user who authorized them.
7. Confirm your channel has Channel Points access. In Creator Dashboard → Viewer
   Rewards → Channel Points → Manage Rewards & Challenges, add a custom reward titled
   **Canonize this**. Choose an affordable demo cost, enable viewer text input as required,
   and leave the reward enabled and unpaused. Reward title must match
   `TWITCH_REWARD_TITLE` exactly. If Channel Points are unavailable, you can test locally
   but cannot demonstrate the required live redemption until an eligible channel is used.
8. Authorize the bot now using the instructions below. Broadcaster OAuth arrives in step 4. After step 4,
   redeem the reward with `term: definition` and verify the overlay reacts. The same
   step will define how plain text and the latest pending proposal are handled.

Read-only redemption scope is enough to receive events. Programmatically fulfilling or
canceling redemptions would require manage scope and API-created reward ownership;
that is outside the MVP. Manually manage reward fulfillment in Twitch.

Official references:
- [App registration](https://dev.twitch.tv/docs/authentication/register-app/)
- [OAuth scopes](https://dev.twitch.tv/docs/authentication/scopes/)
- [EventSub subscription types and required authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Twurple WebSocket listener setup](https://twurple.js.org/docs/getting-data/eventsub/listener-setup.html)

## Build sequence and demo

1. Scaffold + SQLite + seeds (complete).
2. Transparent 1920×1080 `/overlay`, WebSocket updates, local test reveal (complete).
3. Authenticated chat: `!canon term`, `!canon add term: definition`, `!lore` (implemented; authorize your bot to verify live).
4. EventSub WebSocket: Canonize this reward, subscriptions, incoming raids.
5. Local `/panel`: approve/reject, browse canon, edit `voice.md`.
6. Optional OpenAI rewriting with timeout and plain-text fallback.
7. Animation polish, complete clean-clone instructions, Devpost text, <3-minute shot list.

The server binds to 127.0.0.1 and only accepts localhost/127.0.0.1 Host headers for local OBS use. HOST is reserved and does not override this. Panel authentication must be
implemented before any remote exposure. The eventual OBS Browser Source will be
`http://127.0.0.1:3000/overlay`, width 1920, height 1080, transparent background.

The final demo will open on a live CANONIZED reveal, show the actual redemption,
query the lore in chat, restart to prove persistence, and close on the panel.

## Connect authenticated chat (step 3)

Channel Points activation does not block this step. First create a separate bot
account and register your confidential Twitch application as described above.

1. Edit **`.env`** (not `.env.example`). Set these values:

   ```dotenv
   PORT=3001
   TWITCH_ENABLED=true
   TWITCH_CLIENT_ID=your_application_client_id
   TWITCH_CLIENT_SECRET=your_application_client_secret
   TWITCH_CHANNEL=your_streamer_login
   TWITCH_BOT_USERNAME=your_bot_login
   ```

2. In the Twitch Developer Console → your app → Manage, register
   `http://localhost:3001/auth/twitch/callback` exactly. The callback derives from PORT;
   `TWITCH_OAUTH_REDIRECT_URI` can explicitly set this same local URL if needed.
3. Stop your old server with Ctrl+C, then run **`npm start`**. Do not run two servers
   on the same port. Open `http://127.0.0.1:3001/panel`.
4. Click **Authorize bot account**. The flow switches to localhost for its browser-bound
   cookie. Sign in as the bot (switch Twitch accounts if needed), confirm that the
   requested permissions are read/send chat, and authorize. Canon rejects the wrong
   account and verifies the token belongs to your app.
5. Return to the panel. Wait for **Connected as your_bot in #your_channel**.
   `/health` now reports `twitchConnected: true`; `/api/twitch/status` gives the current
   connection status without exposing credentials.
6. In your channel chat, send these from your main account, at least five seconds apart:

   ```text
   !canon The Chair Council
   !canon add Moon cheese: The moon sponsors our snacks.
   !lore
   ```

   Expect a stored definition, a pending proposal acknowledgement, and random lore.
   `!canon Moon cheese` must report no canon until the proposal is approved. Proposals
   persist across restarts and remain hidden from canonical query/list responses.
   Panel moderation and pending browsing arrive in step 5.

Replies appear in both the server console and Twitch chat, prefixed `Canon:` and
limited to 450 characters. Commands have a five-second per-user cooldown and a
1.5-second global cooldown; commands during cooldown are ignored. Normal conversation and Canon-prefixed replies are ignored. Commands sent manually
from the bot account are accepted, including when broadcaster and bot share one account. Twurple also applies outbound rate limits.
If chat is follower/subscriber restricted, adjust your test channel settings yourself
or grant the bot the appropriate access. Moderator status is not required for normal
unrestricted chat.

OAuth state is single-use, browser-bound, and valid for ten minutes. Tokens are written
with owner-only file permissions to ignored `data/twitch-bot-token.json`; refreshed
tokens are saved automatically. Authorization is validated at startup and every 55 minutes. Do not share that file. Existing `.env` token fields
are reserved for future import support; the bot currently uses the OAuth token file.
On invalid credentials, revoked tokens, or connection problems, the panel shows a
status message and the local overlay remains usable. Reauthorize from the panel when
needed. OAuth callback query strings are not logged.

Live Twitch verification still requires authorization by the bot account owner;
unit tests verify command storage and OAuth state boundaries without contacting Twitch.
