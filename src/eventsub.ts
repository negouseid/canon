import { ApiClient } from '@twurple/api';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { RefreshingAuthProvider, getTokenInfo, accessTokenIsExpired, refreshUserToken, type AccessToken } from '@twurple/auth';
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
import { createEventHandlers, type Publish } from './events.js';

export function registerEventSub(app: FastifyInstance, store: Store, publish: Publish) {
  const clientId = process.env.TWITCH_CLIENT_ID || '', clientSecret = process.env.TWITCH_CLIENT_SECRET || '';
  const channel = (process.env.TWITCH_CHANNEL || '').trim().toLowerCase();
  const rewardTitle = process.env.TWITCH_REWARD_TITLE || 'Canonize this';
  const enabled = process.env.TWITCH_ENABLED === 'true';
  const scopes = ['channel:read:redemptions', 'channel:read:subscriptions'];
  const status = {
    connected: false, authorized: false, ready: false, broadcaster: '', rewardTitle,
    reward: 'Not checked', subscriptions: {} as Record<string, string>, lastEvent: '',
    message: enabled ? 'Authorize the broadcaster to receive reward, subscription, and raid events.' : 'Local mode. Enable Twitch to connect EventSub.'
  };
  const auth = new RefreshingAuthProvider({ clientId, clientSecret });
  const handlers = createEventHandlers(store, rewardTitle, publish);
  let listener: EventSubWsListener | undefined;
  let userId: string | undefined;
  let closing = false;
  const tokenPath = 'data/twitch-broadcaster-token.json';
  function save(token: AccessToken) {
    mkdirSync('data', { recursive: true, mode: 0o700 });
    writeFileSync(tokenPath + '.tmp', JSON.stringify(token, null, 2), { mode: 0o600 });
    chmodSync(tokenPath + '.tmp', 0o600); renameSync(tokenPath + '.tmp', tokenPath);
  }
  function unavailable(message: string) {
    status.connected = status.ready = status.authorized = false;
    listener?.stop(); status.message = message; app.log.warn(message);
  }
  auth.onRefresh((id, token) => {
    if (id !== userId) return;
    try { save(token); } catch { status.message = 'Could not save refreshed broadcaster token. Check data directory permissions.'; app.log.warn(status.message); }
  });
  auth.onRefreshFailure(() => unavailable('Broadcaster authorization expired or was revoked. Authorize the broadcaster again.'));
  const required = ['channel.channel_points_custom_reward_redemption.add', 'channel.subscribe', 'channel.raid'];
  function updateReady() {
    status.ready = status.connected && required.every(type => status.subscriptions[type] === 'enabled');
    status.message = status.ready ? 'EventSub ready: listening for redemptions, subscriptions, and incoming raids.' : 'EventSub connecting or partially available. Check subscription status below.';
  }
  async function connect(token: AccessToken) {
    const valid = accessTokenIsExpired(token) ? await refreshUserToken(clientId, clientSecret, token.refreshToken!) : token;
    const info = await getTokenInfo(valid.accessToken, clientId);
    if (!info.userId || info.clientId !== clientId || info.userName?.toLowerCase() !== channel || !scopes.every(scope => info.scopes.includes(scope))) throw new Error('Wrong broadcaster or scopes');
    const configuredId = process.env.TWITCH_BROADCASTER_ID?.trim();
    if (configuredId && configuredId !== info.userId) throw new Error('Broadcaster ID does not match channel');
    if (closing) return;
    save(valid);
    userId = await auth.addUserForToken(valid);
    listener?.stop();
    const apiClient = new ApiClient({ authProvider: auth, logger: { minLevel: 'error' } });
    status.broadcaster = info.userName!; status.authorized = true; status.connected = status.ready = false;
    status.subscriptions = Object.fromEntries(required.map(type => [type, 'connecting']));
    status.message = 'Connecting broadcaster EventSub WebSocket…';
    // Reward inspection is advisory; all reward notifications are still filtered by exact title.
    try {
      const rewards = await apiClient.channelPoints.getCustomRewards(userId);
      const reward = rewards.find(item => item.title === rewardTitle);
      status.reward = !reward ? `Reward “${rewardTitle}” not found. Create it in Twitch.` : !reward.isEnabled || reward.isPaused || !reward.isInStock ? 'Found, but disabled, paused, or unavailable. Enable it in Twitch.' : 'Found and available';
    } catch { status.reward = 'Could not inspect rewards. Check channel eligibility and redemption permissions; event subscription results are below.'; }
    if (closing) return;
    const next = new EventSubWsListener({ apiClient, logger: { minLevel: 'error' } });
    listener = next;
    next.onUserSocketConnect(() => { if (listener !== next) return; status.connected = true; updateReady(); });
    next.onUserSocketDisconnect(() => { if (listener !== next) return; status.connected = status.ready = false; status.message = 'EventSub disconnected. Twurple will reconnect and restore subscriptions.'; });
    next.onSubscriptionCreateSuccess((_subscription, apiSubscription) => {
      if (listener !== next) return;
      status.subscriptions[apiSubscription.type] = 'enabled'; updateReady();
      app.log.info({ eventType: apiSubscription.type }, 'EventSub subscription enabled');
    });
    const subscriptionTypes = new Map<object, string>();
    next.onSubscriptionCreateFailure((subscription, error) => {
      if (listener !== next) return;
      const type = subscriptionTypes.get(subscription) || 'unknown';
      const code = (error as Error & { statusCode?: number }).statusCode;
      status.subscriptions[type] = `failed${code ? ` (HTTP ${code})` : ''}: check channel eligibility/permissions and reauthorize`;
      updateReady(); app.log.warn({ eventType: type, httpStatus: code }, 'EventSub subscription failed');
    });
    next.onRevoke((subscription, reason) => {
      if (listener !== next) return;
      status.subscriptions[subscriptionTypes.get(subscription) || 'unknown'] = `revoked: ${reason}`;
      updateReady();
    });
    function safely(handle: () => void) {
      if (listener !== next || closing) return;
      try { handle(); } catch { status.lastEvent = 'Could not process an event; no partial database changes were saved.'; app.log.warn(status.lastEvent); }
    }
    const redemption = next.onChannelRedemptionAdd(userId, event => safely(() => {
      const result = handlers.redemption(event);
      if (!result || result.kind === 'duplicate') return;
      status.lastEvent = result.kind === 'canonized' ? `CANONIZED: ${result.entry.term}` : `Redemption not canonized: ${result.reason} Manually refund this redemption in Twitch if needed.`;
      app.log.info({ outcome: result.kind, redemptionId: event.id }, 'Canon redemption processed');
    }));
    const sub = next.onChannelSubscription(userId, event => safely(() => { handlers.subscription(event); status.lastEvent = `Subscription: ${event.userDisplayName}`; }));
    const raid = next.onChannelRaidTo(userId, event => safely(() => { handlers.raid(event); status.lastEvent = `Raid: ${event.raidingBroadcasterDisplayName} (${event.viewers})`; }));
    subscriptionTypes.set(redemption, required[0]); subscriptionTypes.set(sub, required[1]); subscriptionTypes.set(raid, required[2]);
    next.start();
  }
  const validation = setInterval(() => {
    if (!userId || !status.authorized || closing) return;
    void (async () => {
      try {
        const token = await auth.getAccessTokenForUser(userId!, scopes);
        if (!token) throw new Error('Missing token');
        const info = await getTokenInfo(token.accessToken, clientId);
        if (info.userId !== userId || info.clientId !== clientId || !scopes.every(scope => info.scopes.includes(scope))) throw new Error('Invalid token');
      } catch { unavailable('Broadcaster token validation failed. Check connectivity and reauthorize from the panel.'); }
    })();
  }, 55 * 60_000); validation.unref();
  app.addHook('onClose', async () => { closing = true; clearInterval(validation); listener?.stop(); });
  return {
    status, scopes, connect,
    async start() {
      if (!enabled || !clientId || !clientSecret || !channel) return;
      try {
        let token: AccessToken;
        try { token = JSON.parse(readFileSync(tokenPath, 'utf8')); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
        if (!token || typeof token.accessToken !== 'string' || typeof token.refreshToken !== 'string' || !Array.isArray(token.scope) || typeof token.obtainmentTimestamp !== 'number' || (token.expiresIn !== null && typeof token.expiresIn !== 'number')) throw new Error('Invalid token file');
        await connect(token);
      } catch { unavailable('Saved broadcaster authorization could not be loaded. Authorize the broadcaster from the panel.'); }
    }
  };
}
