# First-time judge walkthrough audit — November 1, 2026

## Gaps found and fixed in README

| Sticking point in the earlier README | Fix |
|---|---|
| An unaffiliated judge cannot clone a private repository | Explicit invitation/acceptance prerequisite, owner menu path, invited-account check, and optional browser-based GitHub CLI authentication. Repository stays private by the owner's instruction. |
| Git/npm/OBS assumed to be installed | Prerequisite installer links, version checks, optional OBS status, native-module toolchain guidance. |
| `cp` does not work in ordinary Windows PowerShell | Separate Copy-Item command; shared clone/install/start commands. |
| TypeScript runner could be omitted under NODE_ENV=production | Install command uses `npm ci --include=dev`. |
| A newcomer may edit the example or save `.env.txt` | Exact filename, edit `.env` only, don't recopy over private settings, restart after changes. |
| Every environment value was not individually explained | All 12 `.env.example` keys now have source/default/required-role guidance. Optional numeric broadcaster ID and redirect are explicitly blank. |
| “Bot token” may send a judge to a third-party generator | State that no token field is needed. Canon obtains and stores access/refresh tokens through its own OAuth button. |
| Bot identity/app label/account ownership could be confused | Explain ordinary bot account creation, channel login from URL, same-account alternative, and distinct app label. |
| Scopes could be mistaken for dev-console fields | Exact per-role scope table and ordered bot/broadcaster browser authorization. Explicitly state that buttons request scopes. |
| Redirect mismatch / port change was easy to miss | Complete URL table and exact hostname/path/port matching; start a fresh OAuth attempt after correction. |
| Reward creation/activation needed clearer ownership/input instructions | Broadcaster menu path, exact title/cost/text requirements, onboarding fallback, and selected-reward/chat-input explanation. |
| OBS overlay instructions stopped at URL/dimensions | Sources + Browser click path, Local file off, visibility/reload options, layering, transparency, test action and expected result. |
| No `/panel` OBS source instructions | Separate demo scene, panel Browser Source, CSS preserving background/scrolling, Interact instructions, plus optional off-stream dock. |
| Localhost could be opened on another computer | State server, browser source, and OBS run on the same computer; local-only binding is intentional. |
| First-run expected output/start/stop unclear | Single `npm start` command, terminal lifetime, Ctrl+C, first-run count/health, restart behavior, and a symptom→fix table. |

## Actual simulation

1. Cloned the updated repository from GitHub into a new local directory using the
   existing authorized Git account. No `.env`, token files, database, or node_modules
   were copied from the configured live instance.
2. Ran `npm ci --include=dev` (using only a local download cache to avoid redundant
   package downloads), then copied `.env.example` to `.env`.
3. `npm run build` and all **19 tests** passed.
4. Ran `npm start` with untouched defaults. Port 3000 was already occupied on this
   machine. Following the README's port-conflict instructions, changed only PORT
   in `.env` to 3002 and reran the same `npm start` command. No code edits were needed.
5. Browser showed eight seeded entries, empty Pending, offline Twitch indicators,
   saved default persona, and connected local overlay preview.
6. Followed the exact README rehearsal: submitted `!canon add Offline lore: Everything still works.`,
   approved it, saw CANONIZED in the panel preview and the standalone `/overlay` page,
   and queried `!canon Offline lore` successfully.
7. Checked the standalone overlay's rendered DOM: transparent body, logical canvas
   1920px × 1080px. `/panel`, `/overlay`, and supporting scripts returned HTTP 200.
8. Stopped with Ctrl+C and restarted using `npm start`. Canon count stayed nine and
   the same query returned the saved definition. No API credentials were supplied.
9. Checked all 12 example environment keys against the updated README; each is explained.

## Scope and remaining manual prerequisites

- **GitHub access:** testing used an authorized owner account, not a new judge account.
  Owner must obtain each judge's GitHub username, send the invitation, and have the
  judge accept it. No invitations were guessed or sent; the repo remains private.
- **OBS:** OBS is not installed on this machine. Browser-source URL/rendering checks
  passed, and property names/defaults were verified against the official OBS Browser
  Source guide. Actual OBS source creation, Interact, and capture were not clicked through.
- **Twitch:** app registration, scopes, reward setup, and account-selection instructions
  were checked against official documentation and Canon's implementation. The existing
  live instance already has a verified authenticated chat/redemption flow. This audit
  did not create another Twitch account/app/reward or repeat creator onboarding.
- **Platform:** installation/runtime simulation was on macOS with Node 24.22.1 and npm
  11.19.1. PowerShell and other OS instructions are documented; they were not executed here.

Official references: [Twitch app registration](https://dev.twitch.tv/docs/authentication/register-app/),
[Twitch scopes](https://dev.twitch.tv/docs/authentication/scopes/),
[OBS Browser Source properties](https://obsproject.com/kb/browser-source),
[GitHub repository invitations](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository),
[GitHub CLI browser login](https://cli.github.com/manual/gh_auth_login).
