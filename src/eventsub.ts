import { ApiClient } from '@twurple/api';
import { RefreshingAuthProvider, getTokenInfo, type AccessToken } from '@twurple/auth';
import { mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
import { createEventHandlers, type Publish } from './events.js';
import { startEventSession, eventTypes } from './eventsub-session.js';
import { ConfigurationError, deadline, permanentFailure, readToken, retryTask, validateToken } from './reliability.js';

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
  let listener: ReturnType<typeof startEventSession> | undefined;
  let userId: string | undefined;
  let closing = false;
  let connecting = false;
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
  auth.onRefreshFailure((_id, error) => { if (permanentFailure(error)) unavailable('Broadcaster authorization expired or was revoked. Authorize again.'); else { status.message = 'Token refresh temporarily unavailable; retrying.'; recovery.schedule(); } });
  const recovery = retryTask(async () => { await startSaved(); });
  async function connect(token: AccessToken) {
    if (closing || connecting) return;
    connecting = true;
    try {
    const validated = await validateToken(token, clientId, clientSecret, channel, scopes);
    const valid = validated.token, info = validated.info;
    const configuredId = process.env.TWITCH_BROADCASTER_ID?.trim();
    if (configuredId && configuredId !== info.userId) throw new ConfigurationError('Broadcaster ID does not match channel');
    if (closing) return;
    save(valid);
    userId = info.userId!;
    auth.addUser(userId, valid);
    listener?.stop();
    const apiClient = new ApiClient({ authProvider: auth, logger: { minLevel: 'error' }, fetchOptions: { get signal() { return AbortSignal.timeout(10_000); } } as object });
    status.broadcaster = info.userName!; status.authorized = true; status.connected = status.ready = false;
    status.subscriptions = Object.fromEntries(eventTypes.map(type => [type, 'connecting']));
    status.message = 'Connecting broadcaster EventSub WebSocket…';
    // Reward inspection is advisory; all reward notifications are still filtered by exact title.
    try {
      const rewards = await deadline(apiClient.channelPoints.getCustomRewards(userId));
      const reward = rewards.find(item => item.title === rewardTitle);
      status.reward = !reward ? `Reward “${rewardTitle}” not found. Create it in Twitch.` : !reward.isEnabled || reward.isPaused || !reward.isInStock ? 'Found, but disabled, paused, or unavailable. Enable it in Twitch.' : 'Found and available';
    } catch { status.reward = 'Could not inspect rewards. Check channel eligibility and redemption permissions; event subscription results are below.'; }
    if (closing) return;
    listener = startEventSession(apiClient, userId, status, handlers, app.log);
    recovery.reset();
    } finally { connecting = false; }
  }
  // Recover even if the SDK exhausts its initial socket attempts or never receives welcome.
  const connectionWatch = setInterval(() => {
    const waitingForWelcome = Object.values(status.subscriptions).every(value => value === 'connecting' || value === 'reconnecting');
    if (!closing && !connecting && status.authorized && (!status.connected || (!status.ready && waitingForWelcome))) recovery.schedule();
  }, 30_000); connectionWatch.unref();
  const validation = setInterval(() => {
    if (!userId || !status.authorized || closing) return;
    void (async () => {
      try {
        const token = await deadline(auth.getAccessTokenForUser(userId!, scopes));
        if (!token) throw new Error('Missing token');
        const info = await deadline(getTokenInfo(token.accessToken, clientId));
        if (info.userId !== userId || info.clientId !== clientId || !scopes.every(scope => info.scopes.includes(scope))) throw new ConfigurationError('Invalid token');
      } catch (error) { if (permanentFailure(error)) unavailable('Broadcaster authorization invalid. Reauthorize from the panel.'); else { status.message = 'Twitch validation temporarily unreachable. Retrying; local mode remains available.'; recovery.schedule(); } }
    })();
  }, 55 * 60_000); validation.unref();
  app.addHook('onClose', async () => { closing = true; clearInterval(validation); clearInterval(connectionWatch); recovery.dispose(); listener?.stop(); });
  async function startSaved() {
    if (closing || !enabled || !clientId || !clientSecret || !channel) return;
    try {
      const token = readToken(tokenPath);
      await connect(token);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      if (permanentFailure(error)) unavailable('Saved broadcaster authorization is invalid or unreadable. Authorize the broadcaster from the panel.');
      else { status.message = 'Twitch temporarily unreachable. Retrying broadcaster connection; local mode remains available.'; recovery.schedule(); }
    }
  }
  return { status, scopes, connect, start: startSaved };
}
