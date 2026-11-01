# Canon — Your channel remembers

## Tagline
Every channel has lore. Canon makes it stick.

## Inspiration
A stream's best jokes rarely arrive with an explanation. Returning viewers remember
fragments; newcomers wonder what everyone is laughing at. We wanted shared channel
history to become something viewers can build together and carry into the next stream.
Instead of another game that attacks the streamer, Canon gives the streamer a useful
memory tool and gives chat a way to make history.

## What it does
Canon is a persistent lore keeper for a Twitch channel. Viewers propose running jokes,
nicknames, rulings, and memorable moments with `!canon add term: definition`. The
streamer reviews them in a local panel, or a viewer redeems the **Canonize this** Channel
Point reward to turn the newest proposal into canon. A redemption can also supply a
new term and definition directly.

The overlay celebrates that decision with an animated **CANONIZED** reveal. A rotating
ticker keeps existing lore visible between moments. `!canon term` answers questions
about approved lore, and `!lore` brings back a random piece of channel history. SQLite
keeps it across restarts, so the value grows across streams rather than disappearing
at the end of a session.

The streamer panel includes a live pending queue, approval/rejection controls,
searchable canon, overlay rehearsal, Twitch connection status, and an editable persona
file. Chat replies use reliable plain text; AI voice rewriting was intentionally omitted.

## How we built it
Node.js and TypeScript run a Fastify server with separate panel and transparent OBS
overlay routes. A local WebSocket pushes reveals and canon updates to the browser.
`better-sqlite3` stores lore and moderation state.

Twurple powers authenticated Twitch chat and EventSub over WebSocket. Bot OAuth
requests chat read/send access. Separate broadcaster OAuth requests redemption and
subscription access, with incoming raids supported too. No public webhook or tunnel
is needed. Subscription events produce a welcome ticker message; raid events welcome
new viewers with a piece of the channel's lore.

Reward receipt IDs and lore changes commit in one SQLite transaction. Duplicate reward
delivery cannot canonize a second proposal, including after a restart. Local demo mode
uses eight fictional sample entries and a test reveal button, requiring no API keys.

## How we used Codex
Codex served as our pair programmer throughout the build. We began with a written
brief specifying the product, Twitch requirements, stack, and demo-first sequence.
Codex proposed the plan and risks, then implemented small, step-labeled Git commits:

1. TypeScript scaffold, SQLite schema, repeatable seed data, and setup documentation.
2. Transparent overlay, animated reveal, lore ticker, and local WebSocket test flow.
3. Bot OAuth, authenticated chat, and command handlers.
4. Broadcaster OAuth and EventSub redemptions, subscriptions, and incoming raids.
5. Streamer moderation, canon search, and persona editing.
6. Final documentation, clean-clone verification, and demo preparation.

We handled Twitch account/app setup and authorizations, created the real reward, and
manually tested the channel interactions. Codex inspected local connection status and
browser UI, diagnosed a same-account bug that ignored the broadcaster's test commands,
and fixed it with a regression test. It also clarified Twitch's reward-text UI during
our first real redemption and confirmed that Moon cheese had become canonical.

Codex wrote automated checks for persistence, moderation boundaries, duplicate reward
handling, OAuth state/cookie protections, and conflicting persona saves. It exercised
the panel in a browser using an isolated test database, then checked the real instance
reconnected with its saved lore. The commit history makes that collaboration reviewable.

## Challenges
Twitch setup was the most unpredictable part: Channel Points appeared only after
creator onboarding, OAuth callbacks needed an exact port/hostname match, and the same
account was initially both streamer and bot. We kept the local overlay testable while
resolving setup and separated bot/broadcaster credentials to preserve both permission sets.

We also treated duplicate events as a product issue: spending points should make one
piece of lore canonical once. Durable receipts prevent replay from promoting the next
proposal by mistake.

## What we're proud of
We tested a real proposal-to-redemption-to-lookup flow on Twitch. Moon cheese became
channel canon and stayed stored after restart. The overlay, moderation panel, and chat
all use the same lore store. That persistence makes Canon useful beyond the demo.

## What we learned
The first visible demo beat made integration work easier to assess. Offline testing,
clear connection status, and small commits helped us separate Twitch setup problems
from application bugs. Working with Codex was most effective when we gave it concrete
behavior to build, then tested the result against an actual channel.

## What's next
Optional voice rewriting from the saved persona, richer moderation, and more ways to
surface lore for returning viewers. Real raid and subscription reactions still need
live-event testing; the listeners are enabled and their handlers have automated coverage.

## Built with
TypeScript, Node.js, Fastify, Twurple, Twitch OAuth, Twitch Chat, EventSub WebSocket,
better-sqlite3, SQLite, WebSocket, HTML, CSS, JavaScript, OBS Browser Source, and Codex.

## Submission fields to fill manually
- Public repository URL
- Recorded demo video URL
- Team/author details and any required event acknowledgments

Do not claim AI-generated voice replies or live raid/subscription verification in the
submission; those are not part of the verified demo.
