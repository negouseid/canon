# Canon

**Your channel remembers.** Canon turns Twitch inside jokes, nicknames, and memorable
moments into persistent, queryable channel lore. Viewers propose entries in chat or
spend Channel Points to canonize them. A transparent OBS overlay celebrates each new
entry, and the streamer keeps control through a local moderation panel.

## Prerequisites and repository access

- **Git** ([installer](https://git-scm.com/downloads)) and **Node.js 24** with npm
  ([installer](https://nodejs.org/en/download)). Node 22.12+ is supported; Node 24 is
  the version tested for this build. Open a new terminal after installation.
- A current browser. OBS Studio is optional for local testing; install it from
  [obsproject.com](https://obsproject.com/download) to test Browser Sources.
- Internet for cloning and installing dependencies. After installation, local demo
  mode works without internet, Twitch credentials, or an OpenAI key.
- Keep the terminal/server and OBS on the **same computer**. `127.0.0.1` means the
  computer opening the URL; this build is not a public-hosted or LAN-access service.

Check installation:

```sh
git --version
node --version
npm --version
```

**This repository is private by the owner's choice.** A judge must receive and accept
an invitation before cloning. Owner: repository **Settings → Collaborators** (or
**Collaborators and teams / Manage access**) → **Add people**, enter the judge's exact
GitHub username, and send the invitation. Judge: sign in to that GitHub account,
accept the invitation from GitHub notifications/email, and confirm you can open
[negouseid/canon](https://github.com/negouseid/canon). A private-repository 404 or
`Repository not found` can mean access is missing, rather than a broken URL.

If Git is not authenticated, install the optional [GitHub CLI](https://cli.github.com/),
then run:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

Complete the browser login using the **invited account**. This avoids manually creating
or pasting a GitHub token. Existing authenticated Git/SSH setups can be used instead.
A normal GitHub account password is not a Git HTTPS password.
[GitHub invitation instructions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository).

## First run: no credentials needed

Clone and install (Terminal, PowerShell, or Git Bash):

```sh
git clone https://github.com/negouseid/canon.git
cd canon
npm ci --include=dev
```

Copy the example configuration **once**, before editing your own `.env`:

macOS/Linux Terminal or Git Bash:

```sh
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Leave the copied values unchanged for the offline demo. Edit **`.env`**, not
`.env.example`, when connecting Twitch. On Windows, make sure the filename is `.env`,
not `.env.txt`. Do not copy the example over a configured file on subsequent starts.

The single start command, run inside the `canon` directory, is:

```sh
npm start
```

Keep that terminal open. Open [the studio](http://127.0.0.1:3000/panel). Expect
**8 canon entries**, an empty pending queue, an overlay preview, and offline Twitch
indicators. Click **Fire test CANONIZED** for the nine-second reveal; it changes no
stored lore. `/health` should report `ok: true`, `canonCount: 8`,
`storage.persistent: true`, and `voiceMode: plain-text` on the first run.

Stop with **Ctrl+C**. Run `npm start` again to restart; no reseeding or OAuth is
needed each time. Do not start a second copy on the same port.

`better-sqlite3` is native. If `npm ci` fails to install/build it, first confirm Node 24
and rerun `npm ci --include=dev`. If a prebuilt binary is unavailable for your platform,
install Python 3 and your OS C++ build tools: macOS `xcode-select --install`; Windows
Visual Studio Build Tools with **Desktop development with C++**; Linux a C++ compiler
and make/build toolchain. Then rerun installation. No system SQLite installation is needed.
`--include=dev` ensures the TypeScript runtime and validation tools are present, even
when a machine has `NODE_ENV=production` set.

Optional checks:

```sh
npm run build
npm test
npm run seed
```

The application uses port **3000** by default; this project's configured live instance
uses **3001**. If the terminal reports `EADDRINUSE`, stop your earlier Canon process or
edit `PORT=3002` in `.env`, then run `npm start`. Use that port in the panel, overlay,
OBS settings, and Twitch redirect. For example:

| Setting | Default | Example free-port override |
|---|---|---|
| `.env` | `PORT=3000` | `PORT=3002` |
| Panel | `http://127.0.0.1:3000/panel` | `http://127.0.0.1:3002/panel` |
| Overlay | `http://127.0.0.1:3000/overlay` | `http://127.0.0.1:3002/overlay` |
| Twitch registered redirect | `http://localhost:3000/auth/twitch/callback` | `http://localhost:3002/auth/twitch/callback` |

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

### 1. Create accounts and register the application

Local judging needs none of these values. For a **real Twitch test**, use your own
channel and app; do not ask for or copy the developer's private credentials.

1. Sign in to your broadcaster account. Your channel login is the final segment of
   `https://www.twitch.tv/YOUR_LOGIN` (not its display name with spaces).
2. A separate bot is recommended: create a second ordinary Twitch account using
   **Sign Up** at twitch.tv, verify its email, and note its login. For a quicker test,
   you can use your broadcaster account as the bot; set both login variables to it.
3. Enable 2FA for the account registering the application: Twitch **Settings →
   Security and Privacy → Two-Factor Authentication**. Verify its email if Twitch asks.
4. Open the [Developer Console](https://dev.twitch.tv/console/apps), sign in, then
   **Applications → Register Your Application**. Choose a unique app name, category
   **Chat Bot**, and client type **Confidential** if prompted. The app name is a label,
   not your bot account's username.
5. Add the exact **OAuth Redirect URL** `http://localhost:3000/auth/twitch/callback`.
   If PORT differs, substitute it here. Save the URL (click **Add** where shown), then
   create/save the app. Do not use `/panel`, HTTPS, a trailing slash, or `127.0.0.1`
   for this registered callback. It must match Canon's generated redirect exactly.
6. Open the app's **Manage** page. Copy **Client ID**. Click **New Secret** / generate
   secret, then copy **Client Secret** into `.env`. Generating another secret invalidates
   the old one, so update `.env` and restart if you regenerate it.
7. In `.env`, set these six values, replacing the example labels with your own values:

```dotenv
PORT=3000
TWITCH_ENABLED=true
TWITCH_CLIENT_ID=your_application_client_id
TWITCH_CLIENT_SECRET=your_application_client_secret
TWITCH_CHANNEL=your_streamer_login
TWITCH_BOT_USERNAME=your_bot_login
```

### Where every environment value comes from

| Key | Required for | Source / what to enter |
|---|---|---|
| `PORT` | All modes | Pick a free local port; default `3000`. Match all URLs to it. |
| `DATABASE_PATH` | All modes | Keep `./data/canon.sqlite`; Canon creates it and its directory. No database credentials. |
| `SEED_ON_START` | Demo | Keep `true` for eight sample entries. `false` skips samples in a fresh database. |
| `TWITCH_ENABLED` | Live Twitch | Change `false` to `true` after app/account setup; restart. |
| `TWITCH_CLIENT_ID` | Live Twitch | Your registered Twitch app's Manage page → Client ID. |
| `TWITCH_CLIENT_SECRET` | Live Twitch | Same page → New Secret. Private; save only in `.env`. |
| `TWITCH_CHANNEL` | Live Twitch | Broadcaster login from their channel URL, without `@` or URL prefix. |
| `TWITCH_BOT_USERNAME` | Live chat | Login of the Twitch account that will send bot replies. May equal the channel login. |
| `TWITCH_BROADCASTER_ID` | Optional | **Leave blank.** Canon obtains it from broadcaster OAuth; no ID lookup website needed. |
| `TWITCH_REWARD_TITLE` | Live rewards | Keep `Canonize this`, exactly matching the reward you create below. No reward ID required. |
| `TWITCH_OAUTH_REDIRECT_URI` | Optional | **Leave blank.** Canon derives `http://localhost:PORT/auth/twitch/callback`. If set, use that exact URL. |
| `VOICE_PATH` | Persona editor | Keep `./voice.md`; that file is included. No AI key required. |

**There is no bot-token field to fill.** Canon obtains access and refresh tokens in the
browser OAuth flow below, saves them in ignored local files, and refreshes them. Do not
use an unrelated token-generator site or paste tokens into the console, README, or chat.
OAuth scopes are requested by Canon's buttons; you do not enter them in app registration.
`OPENAI_API_KEY` is not needed: this release intentionally uses plain-text replies.

### 2. Create “Canonize this”

1. On the broadcaster account, open **Creator Dashboard** from the avatar menu, then **Viewer Rewards → Power-ups & Channel Points**.
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

After editing `.env`, stop the old server with Ctrl+C, run **`npm start`**, open
`http://127.0.0.1:3000/panel` (your chosen port), and expand
**Twitch connections & reward setup**. Complete OAuth in your regular browser, not OBS.

First choose **Authorize bot account**, sign in as `TWITCH_BOT_USERNAME`, approve chat
access, and wait for Chat connected. Then choose **Authorize broadcaster**, sign in as
`TWITCH_CHANNEL`, approve event access, and wait for Events ready. If both roles share
one account, complete both flows anyway. If Twitch is signed in as the wrong account,
sign out/switch accounts or use a separate browser profile before authorizing. Keep
each OAuth attempt in one browser/profile so its state cookie returns to Canon.

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

## OBS: add both routes

Start Canon first and keep it running. OBS must run on the same computer. Neither
source needs a separate server command, a local HTML file, or your Twitch stream key.
Authenticate Twitch in your regular browser; OBS reads the already-connected server.

### `/overlay`: live transparent Browser Source

1. Open OBS Studio, select your scene, then **Sources → + → Browser**.
2. Create a source named **Canon Overlay**. Leave **Local file** unchecked.
3. Set URL to `http://127.0.0.1:3000/overlay` (replace the port if changed).
4. Set width **1920**, height **1080**, and FPS **30** if the field is shown. The app
   supplies transparency; the default transparent Browser Source CSS is suitable.
5. Leave **Shutdown source when not visible** and **Refresh browser when scene becomes
   active** unchecked for the rehearsal, so it stays connected between scene changes.
6. Click OK. Put Canon Overlay above your game/video source in the Sources list.
   On a 1920×1080 scene, use **Transform → Fit to Screen** if necessary. A smaller
   scene can fit the source proportionally.
7. Open `/panel` in your browser and click **Fire test CANONIZED**. Expect a TEST-labeled
   reveal for nine seconds and a lore ticker near the bottom. An otherwise empty,
   transparent canvas between alerts is expected. Do not use `/overlay?preview` for
   the live transparent source; its dark background is only for rehearsal.

### `/panel`: Browser Source for a demo/control scene

1. Create a separate OBS scene named **Canon Studio Demo** if you want to show the
   control panel in the recording.
2. Add **Sources → + → Browser**, name it **Canon Panel**, leave Local file unchecked,
   and enter `http://127.0.0.1:3000/panel` (your configured port).
3. Set width **1440**, height **1080**, then Fit to Screen as appropriate. The panel
   is an opaque page intended to fill a demo scene, rather than layer over gameplay.
4. For this panel source, replace Custom CSS with the following so OBS does not
   override the panel background or disable scrolling:

   ```css
   body { margin: 0; background: #11151b; overflow: auto; }
   ```

5. Click OK. Right-click the **Canon Panel** source → **Interact** to click buttons,
   enter commands, edit the persona, and scroll. Clicking the OBS preview alone does
   not interact with the webpage. Use the normal browser for OAuth logins.
6. Confirm the same canon count and queue as your browser panel. Approve a local test
   proposal; the panel preview and connected Canon Overlay source should both react.
   Keep this scene out of your live broadcast unless you intend to show moderation controls.

For streamer controls that stay off the scene, optionally use **Docks → Custom Browser
Docks** (older layouts: View → Docks), name **Canon**, and the `/panel` URL. A dock is
operator UI, not a video source. If that menu is unavailable in your OBS/platform build,
keep the panel in your normal browser; Browser Source support is what the demo requires.

OBS property and platform details: [official Browser Source guide](https://obsproject.com/kb/browser-source)
and [obs-browser platform support](https://github.com/obsproject/obs-browser).

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

## First-run troubleshooting

| Symptom | What to do |
|---|---|
| GitHub 404 / Repository not found | Accept the repo invitation using the invited account, authenticate Git, then clone. Owner must know your GitHub username to invite you. |
| `git`, `node`, or `npm` not found | Install the prerequisite, reopen the terminal, and rerun the version checks. |
| PowerShell blocks npm.ps1 | Use Command Prompt/Git Bash, or invoke `npm.cmd` instead of `npm` in PowerShell. |
| `tsx` not found | In the repo directory run `npm ci --include=dev`; do not omit dev dependencies. |
| Can't find package.json | Run commands inside the cloned `canon` directory. |
| Panel URL doesn't open | Keep `npm start` running; read its printed port. If EADDRINUSE, choose another PORT in `.env` and restart. |
| Twitch stays in local mode | Edit `.env`, set TWITCH_ENABLED=true, fill the required values, and restart. Make sure it isn't `.env.txt`. |
| OAuth `redirect_mismatch` | In your Twitch app, add/save `http://localhost:YOUR_PORT/auth/twitch/callback` exactly. Start a new authorization from the panel; do not reuse the failed callback URL. |
| OAuth expired/state error | Retry from the panel in one browser profile. Private windows don't share the state cookie with other windows. |
| Wrong-account authorization | Sign in as the bot for bot OAuth and channel owner for broadcaster OAuth. Verify the two login values in `.env`. |
| Channel Points missing/blank | Complete creator-tools onboarding; allow activation time. Use the local rehearsal or authenticated chat in the meantime. |
| Reward shows only its title/prompt and the usual message box | Some Twitch layouts reuse that box for the selected reward. With the reward selected, type `latest` (no !canon) and submit. Confirm “Redeemed Canonize this” in chat and CANONIZED in the panel. |
| Bot doesn't answer | Confirm Chat connected; use the configured channel's Chat tab and wait five seconds between commands. No live stream is needed for command tests. |
| `latest` says no canon | `!canon latest` is a lookup. Use `latest` as reward text; first ensure a pending proposal exists. |
| OBS has no Browser source option | Install a current official OBS build that includes Browser Source support. The optional browser-dock menu may vary by platform. |
| OBS source blank/frozen | Check the URL in your browser, the port, source visibility and dimensions. Refresh its cache in OBS if stale. Keep Canon running; the overlay reconnects. |
| Panel controls don't click in OBS | Right-click source → Interact, or use a normal browser/dock. |
| Temporary-memory warning | The configured DB is unavailable; the demo still works but is not durable. Use a writable DATABASE_PATH and restart before demonstrating persistence. |

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

The [first-time judge walkthrough audit](docs/JUDGE-WALKTHROUGH.md) lists the onboarding
gaps fixed, the fresh-clone simulation, and which OBS/Twitch steps were verified versus
which still require the judge’s own accounts or installed software.

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
