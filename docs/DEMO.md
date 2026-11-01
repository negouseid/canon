# Canon demo — target 2:40

## Before recording

- Start Canon with `npm start`; open the panel, your Twitch chat, and OBS.
- Confirm **Chat connected** and **Events ready**. Both OAuth flows should already be done.
- OBS Browser Source: your configured `/overlay` URL, 1920×1080, transparent background.
- Hide `.env`, developer-console secrets, token files, account setup, and unrelated tabs.
- Use a new demo term for each take so the pending queue and lookup are easy to follow.
- Prepare `!canon add The Snack Treaty: Every checkpoint is a legally protected snack break.`
  in chat, submit, and confirm it appears in Pending. Wait five seconds before another command.
- Keep the overlay open before redeeming. Use the actual **Canonize this** reward with
  text `latest`. Some Twitch layouts reuse the normal chat box while the reward is selected.
- Verify locally that the reward is available to the account doing the redemption.
  Use a separate viewer account if the owner cannot redeem through its current UI.
- Keep terminal output and the panel available for the persistence segment.

## Shot list and narration

| Time | Screen / action | Suggested narration |
|---|---|---|
| 0:00–0:09 | Open on the real CANONIZED reveal for The Snack Treaty. | “That joke just became channel history.” |
| 0:09–0:24 | Show the lore ticker and channel chat. | “Every Twitch channel has inside jokes. New viewers miss them, and returning viewers forget the details. Canon gives that shared memory a home.” |
| 0:24–0:49 | Show the chat proposal and the actual reward redemption that produced the opening reveal. Use a clearly edited replay if recorded before the opening shot. | “Chat proposes lore. A viewer spends Channel Points on ‘Canonize this.’ Canon receives the real redemption through Twitch EventSub and saves the entry.” |
| 0:49–1:09 | Send `!canon The Snack Treaty`; show the real bot reply. | “Anyone can ask what it means. This is authenticated Twitch chat backed by the same persistent lore store.” |
| 1:09–1:34 | Panel: show Pending, approve a second prepared proposal, and briefly show its reveal; search the library. | “The streamer keeps control. Review proposals, approve or reject them, and find any saved chapter in one place.” |
| 1:34–1:59 | Stop the server with Ctrl+C and run `npm start`. Show Events ready, then query the first term again. Cut the reconnect wait transparently if needed. | “The lore survives a restart. The next stream starts with the same history.” |
| 1:59–2:20 | Expand connections: show all three enabled subscriptions and reward status. | “EventSub uses WebSockets for Channel Points, subscriptions, and raids. Raid welcomes can introduce new viewers to the channel's lore.” |
| 2:20–2:35 | Briefly show step-labeled Git history, then return to overlay/panel. | “I used Codex as my pair programmer: plan, small commits, integration work, tests, and live debugging. Local rehearsal works without Twitch credentials or an AI key.” |
| 2:35–2:40 | End on the ticker and Canon name. | “Canon. Your channel remembers.” |

## Keep the claims precise

- The opening must use a real redemption. Do not present the TEST button as live Twitch input.
- The app has verified live chat and reward redemption. Enabled raid/subscription listeners
  do not prove a real raid/sub reaction was exercised. Label simulated footage if used.
- The persona editor is available, but this release uses plain-text replies, without AI rewriting.
- Persistence means the stored lore remains queryable. Animations do not replay after restart.
- Do not record OAuth login or spend time explaining setup in the submitted video.

## If recording stalls

If EventSub is disconnected, restore it before recording the live segment; do not silently
substitute the local test. For rehearsals, **Fire test CANONIZED** is safe and clearly
labeled TEST. If `latest` fails, check there is still a pending proposal—an earlier take
may already have canonized it. Handle any unsuccessful redemption refund in Twitch.

## Recording order

Capture the real proposal/redemption and reveal first, then the lookup, panel, restart,
and commit-history clips. Edit to open on the reveal, replay the cause with clear context,
and finish under three minutes. Export and submission remain your manual steps.
