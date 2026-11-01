import { EventSubWsListener } from '@twurple/eventsub-ws';
import type { ApiClient } from '@twurple/api';
import type { FastifyBaseLogger } from 'fastify';
import { permanentFailure, retryTask } from './reliability.js';
import type { createEventHandlers } from './events.js';

export const eventTypes = ['channel.channel_points_custom_reward_redemption.add', 'channel.subscribe', 'channel.raid'];
export interface EventStatus { connected: boolean; ready: boolean; subscriptions: Record<string, string>; message: string; lastEvent: string }
export function startEventSession(apiClient: ApiClient, userId: string, status: EventStatus,
  handlers: ReturnType<typeof createEventHandlers>, log: Pick<FastifyBaseLogger, 'info' | 'warn'>, retryBase = 2000) {
  const listener = new EventSubWsListener({ apiClient, logger: { minLevel: 'error' } });
  let stopped = false;
  const subscriptions = new Map<object, string>();
  const retries = new Map<object, ReturnType<typeof retryTask>>();
  function update() {
    status.ready = status.connected && eventTypes.every(type => status.subscriptions[type] === 'enabled');
    status.message = status.ready ? 'EventSub ready: listening for redemptions, subscriptions, and incoming raids.' : 'EventSub connecting or partially available. Local lore and overlay remain available.';
  }
  listener.onUserSocketConnect(() => {
    if (stopped) return;
    status.connected = true;
    // A transport connection precedes welcome/re-subscription. Do not reuse stale enabled flags.
    for (const type of eventTypes) status.subscriptions[type] = 'connecting';
    update();
  });
  listener.onUserSocketDisconnect(() => {
    if (stopped) return;
    status.connected = status.ready = false;
    for (const type of eventTypes) status.subscriptions[type] = 'reconnecting';
    for (const retry of retries.values()) retry.reset();
    status.message = 'EventSub disconnected. Reconnecting and restoring subscriptions; local mode remains available.';
  });
  listener.onSubscriptionCreateSuccess((subscription, remote) => {
    if (stopped || !status.connected) return;
    retries.get(subscription)?.reset(); status.subscriptions[remote.type] = 'enabled'; update();
    log.info({ eventType: remote.type }, 'EventSub subscription enabled');
  });
  listener.onSubscriptionCreateFailure((subscription, error) => {
    if (stopped) return;
    const type = subscriptions.get(subscription) || 'unknown';
    const permanent = permanentFailure(error);
    status.subscriptions[type] = permanent ? 'unavailable: check channel permissions and reauthorize' : 'retrying after temporary request failure';
    update(); log.warn({ eventType: type }, 'EventSub subscription unavailable; server remains running');
    if (!permanent && status.connected) retries.get(subscription)?.schedule();
  });
  listener.onRevoke((subscription) => {
    if (stopped) return;
    retries.get(subscription)?.reset(); status.subscriptions[subscriptions.get(subscription) || 'unknown'] = 'revoked: reauthorize broadcaster'; update();
  });
  function safely(handle: () => void) {
    if (stopped) return;
    try { handle(); } catch { status.lastEvent = 'Event processing failed. Check storage status; no successful canonization is claimed.'; log.warn(status.lastEvent); }
  }
  const redemption = listener.onChannelRedemptionAdd(userId, event => safely(() => {
    const result = handlers.redemption(event);
    if (!result || result.kind === 'duplicate') return;
    status.lastEvent = result.kind === 'canonized' ? `CANONIZED: ${result.entry.term}` : `Redemption not canonized: ${result.reason} Manually refund this redemption in Twitch if needed.`;
    log.info({ outcome: result.kind }, 'Canon redemption processed');
  }));
  const sub = listener.onChannelSubscription(userId, event => safely(() => { handlers.subscription(event); status.lastEvent = `Subscription: ${event.userDisplayName}`; }));
  const raid = listener.onChannelRaidTo(userId, event => safely(() => { handlers.raid(event); status.lastEvent = `Raid: ${event.raidingBroadcasterDisplayName} (${event.viewers})`; }));
  [redemption, sub, raid].forEach((subscription, index) => {
    subscriptions.set(subscription, eventTypes[index]);
    retries.set(subscription, retryTask(async () => { if (!stopped && status.connected) subscription.start(); }, retryBase));
  });
  listener.start();
  return { stop() { stopped = true; for (const retry of retries.values()) retry.dispose(); listener.stop(); } };
}
