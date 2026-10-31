# Canon

Your channel remembers. A persistent Twitch lore keeper built for Codex x TwitchCon.

## Current build: step 1 of 7

Working: TypeScript server, SQLite canon/pending storage, eight fictional sample entries,
idempotent seeding, and restart-persistence tests. Twitch, overlay, panel, and voice rewriting
are planned next; configuration flags for them are placeholders at this stage.

## Clean-clone setup

Requires Node.js 22.12+ and npm (Node 24 recommended). better-sqlite3 uses a native
module; if a prebuilt binary is unavailable, install Python 3 and your platform's C++
build tools (macOS: `xcode-select --install`). Run commands in the repository directory.

```sh
npm ci
cp .env.example .env
npm start
```

Open http://127.0.0.1:3000 for the scaffold landing page.
http://127.0.0.1:3000/api/canon returns eight sample entries.
http://127.0.0.1:3000/health reports `ok: true`, `canonCount: 8`, and `stage: 1`.
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
   The callback handler will be implemented with authenticated chat in step 3;
   it does not exist in the step 1 scaffold.
3. Put the client ID and generated client secret in `.env`. Never commit credentials.
4. Authorize the **bot account** with your app for `chat:read chat:edit` for
   Twurple's authenticated IRC chat client. These are distinct from EventSub chat scopes
   (`user:read:chat user:write:chat`), which are not used by this planned chat transport.
   Step 3 will provide the authorization-code flow and token storage. Do not paste
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
8. After step 3 implements OAuth, complete both account authorizations. After step 4,
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

1. Scaffold + SQLite + seeds (current).
2. Transparent 1920×1080 `/overlay`, WebSocket updates, local test reveal.
3. Authenticated chat: `!canon term`, `!canon add term: definition`, `!lore`.
4. EventSub WebSocket: Canonize this reward, subscriptions, incoming raids.
5. Local `/panel`: approve/reject, browse canon, edit `voice.md`.
6. Optional OpenAI rewriting with timeout and plain-text fallback.
7. Animation polish, complete clean-clone instructions, Devpost text, <3-minute shot list.

Keep the server bound to loopback for local OBS use. Panel authentication must be
implemented before any remote exposure. The eventual OBS Browser Source will be
`http://127.0.0.1:3000/overlay`, width 1920, height 1080, transparent background.

The final demo will open on a live CANONIZED reveal, show the actual redemption,
query the lore in chat, restart to prove persistence, and close on the panel.
