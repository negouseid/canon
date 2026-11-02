import { RefreshingAuthProvider, exchangeCode, getTokenInfo, type AccessToken } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';
import type { FastifyInstance } from 'fastify';
import { mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Store } from './store.js';
import type { ChatCapture } from './chat-capture.js';
import { createCanonCounts } from './canon-counts.js';
import { handleCommand, chatText, isCanonCommand } from './commands.js';
import { createOAuthStates } from './oauth-state.js';
import { registerEventSub } from './eventsub.js';
import type { Publish } from './events.js';
import { ConfigurationError, deadline, permanentFailure, readToken, retryTask, validateToken } from './reliability.js';

export function registerTwitch(app: FastifyInstance, store: Store, port: number, publish: Publish, onActivity: () => void = () => {}, counts = createCanonCounts(store), chatCapture?: ChatCapture) {
  const enabled = process.env.TWITCH_ENABLED === 'true';
  const clientId = process.env.TWITCH_CLIENT_ID || '';
  const clientSecret = process.env.TWITCH_CLIENT_SECRET || '';
  const channel = (process.env.TWITCH_CHANNEL || '').trim().toLowerCase();
  const expectedBot = (process.env.TWITCH_BOT_USERNAME || '').trim().toLowerCase();
  const redirectUri = process.env.TWITCH_OAUTH_REDIRECT_URI?.trim() || `http://localhost:${port}/auth/twitch/callback`;
  // Keep tokens inside the already-ignored data directory, separate from public assets.
  const tokenPath = resolve('data/twitch-bot-token.json');
  const states = createOAuthStates();
  const broadcasterStates = createOAuthStates();
  const eventsub = registerEventSub(app, store, publish, counts);
  const configured = Boolean(clientId && clientSecret && /^[a-z0-9_]{1,25}$/.test(channel) && /^[a-z0-9_]{1,25}$/.test(expectedBot));
  const status = { enabled, configured, connected: false, authenticated: false, bot: '', channel,
    message: !enabled ? 'Local mode. Set TWITCH_ENABLED=true to connect chat.' : !configured ? 'Set client ID, client secret, channel, and TWITCH_BOT_USERNAME in .env, then restart.' : 'Authorize your bot account to connect chat.',
    redirectUri };
  let chat: ChatClient | undefined;
  let activeUserId: string | undefined;
  let busy = false;
  let shuttingDown = false;
  const auth = new RefreshingAuthProvider({ clientId, clientSecret });
  const save = (token: AccessToken) => {
    mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });
    writeFileSync(tokenPath + '.tmp', JSON.stringify(token, null, 2), { mode: 0o600 });
    chmodSync(tokenPath + '.tmp', 0o600);
    renameSync(tokenPath + '.tmp', tokenPath);
  };
  auth.onRefresh((userId, token) => {
    if (userId !== activeUserId) return;
    try { save(token); } catch { status.message = 'Could not save refreshed token. Check data directory permissions.'; app.log.warn(status.message); }
  });
  const recovery = retryTask(async () => { await startSaved(); });
  auth.onRefreshFailure((_id, error) => {
    if (permanentFailure(error)) {
      status.connected = status.authenticated = false;
      status.message = 'Bot authorization expired or was revoked. Authorize the bot again.';
      chat?.quit();
    } else { status.message = 'Token refresh temporarily unavailable; retrying while local mode stays available.'; recovery.schedule(); }
    app.log.warn(status.message);
  });
  const scopes = ['chat:read', 'chat:edit'];
  // Twitch requires periodic token validation in addition to validation at startup.
  const validation = setInterval(() => {
    if (!enabled || !activeUserId || busy || shuttingDown) return;
    void (async () => {
      try {
        const token = await deadline(auth.getAccessTokenForUser(activeUserId!, scopes));
        if (!token) throw new Error('Missing bot token');
        const info = await deadline(getTokenInfo(token.accessToken, clientId));
        if (info.userId !== activeUserId || info.clientId !== clientId || !scopes.every(scope => info.scopes.includes(scope))) throw new ConfigurationError('Invalid bot authorization');
      } catch (error) {
        if (permanentFailure(error)) { chat?.quit(); status.connected = status.authenticated = false; status.message = 'Bot authorization invalid. Reauthorize from the panel.'; }
        else { status.message = 'Twitch validation temporarily unreachable. Retrying; local mode remains available.'; recovery.schedule(); }
        app.log.warn(status.message);
      }
    })();
  }, 55 * 60_000);
  validation.unref();
  async function connect(token: AccessToken) {
    if (shuttingDown) return;
    const validated = await validateToken(token, clientId, clientSecret, expectedBot, scopes);
    const valid = validated.token, info = validated.info;
    if (shuttingDown) return;
    save(valid);
    activeUserId = info.userId!;
    auth.addUser(activeUserId, valid, ['chat']);
    recovery.reset();
    chat?.quit();
    status.bot = info.userName!;
    status.connected = status.authenticated = false;
    status.message = 'Connecting authenticated bot to Twitch…';
    const next = new ChatClient({ authProvider: auth, channels: [channel], logger: { minLevel: 'error' } });
    chat = next;
    next.onAuthenticationSuccess(() => {
      if (chat !== next) return;
      status.authenticated = true; status.message = 'Authenticated. Joining channel…';
    });
    next.onJoin((joined, user) => {
      if (chat !== next || joined.replace(/^#/, '').toLowerCase() !== channel || user.toLowerCase() !== expectedBot) return;
      status.connected = true; status.message = `Connected as ${expectedBot} in #${channel}.`;
      app.log.info(status.message);
    });
    next.onDisconnect(() => {
      if (chat !== next) return;
      status.connected = status.authenticated = false;
      status.message = 'Chat disconnected. Twurple will attempt reconnection.';
    });
    next.onAuthenticationFailure(() => {
      if (chat !== next) return;
      status.connected = status.authenticated = false;
      status.message = 'Chat authentication failed. Authorize the bot again.';
    });
    next.onJoinFailure(() => {
      if (chat !== next) return;
      status.connected = false; status.message = 'Could not join chat. Check the channel login and bot access.';
    });
    next.onMessageFailed(() => { if (chat !== next) return; status.message = 'Twitch rejected a reply. Check chat restrictions and bot permissions.'; });
    // Keep outbound traffic modest even during a busy demo; Twurple also rate-limits sends.
    const recent = new Map<string, number>();
    let lastReply = 0;
    next.onMessage((_room, user, text, message) => {
      if (chat !== next || !status.connected) return;
      chatCapture?.add({ id: 'twitch:' + message.id, author: user, text, ownBot: user.toLowerCase() === expectedBot && text.startsWith('Canon:') });
      if (!isCanonCommand(text)) return;
      onActivity(); // Commands count as activity even when reply cooldown suppresses them.
      const now = Date.now();
      const userId = message.userInfo.userId || user;
      if (now - (recent.get(userId) || 0) < 5000 || now - lastReply < 1500) return;
      if (recent.size >= 2000) for (const [key, at] of recent) if (now - at >= 5000) recent.delete(key);
      recent.set(userId, now); lastReply = now;
      try {
        const reply = handleCommand(store, text, user, message.id, () => publish({ type: 'pending-changed' }));
        if (reply) {
          // Log the same bounded response sent to chat; never log raw tokens or OAuth URLs.
          app.log.info({ reply: chatText(reply) }, 'Canon chat reply');
          void next.say(channel, chatText(reply)).catch(() => { status.message = 'Could not send reply. Check Twitch connection and chat restrictions.'; app.log.warn(status.message); });
        }
      } catch { app.log.warn('Could not process chat command; the server remains available.'); void next.say(channel, 'Canon: Storage is temporarily unavailable. Please retry; the overlay remains available.').catch(() => {}); }
    });
    next.connect();
  }
  app.get('/api/twitch/status', async () => ({ ...status, botExpected: expectedBot, eventsub: eventsub.status }));
  for (const role of ['bot', 'broadcaster'] as const) app.get('/auth/twitch/' + role, async (request, reply) => {
    if (!enabled || !configured) return reply.code(409).type('text/plain').send(status.message);
    if (busy) return reply.code(409).type('text/plain').send('Authorization is already being processed. Try again shortly.');
    // Use localhost consistently, so the browser-bound state cookie returns on callback.
    let target: URL;
    try { target = new URL(redirectUri); } catch { return reply.code(409).type('text/plain').send('Invalid redirect URL. Use http://localhost:' + port + '/auth/twitch/callback.'); }
    if (target.protocol !== 'http:' || target.hostname !== 'localhost' || target.port !== String(port) || target.pathname !== '/auth/twitch/callback') {
      return reply.code(409).type('text/plain').send('Use http://localhost:' + port + '/auth/twitch/callback as TWITCH_OAUTH_REDIRECT_URI and register it in Twitch.');
    }
    if (request.headers.host !== target.host) return reply.redirect(`http://${target.host}/auth/twitch/${role}`);
    const state = (role === 'bot' ? states : broadcasterStates).issue();
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: (role === 'bot' ? scopes : eventsub.scopes).join(' '), state, force_verify: 'true' }).toString();
    reply.header('Set-Cookie', `canon_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/auth/twitch; Max-Age=600`);
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(url.toString());
  });
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/auth/twitch/callback', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
    const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('canon_oauth_state='))?.slice('canon_oauth_state='.length);
    reply.header('Set-Cookie', 'canon_oauth_state=; HttpOnly; SameSite=Lax; Path=/auth/twitch; Max-Age=0');
    const state = request.query.state || '';
    const role = broadcasterStates.consume(state, cookie) ? 'broadcaster' : states.consume(state, cookie) ? 'bot' : undefined;
    if (!enabled || !configured || !role) return reply.code(400).type('text/plain').send('Authorization expired or state did not match. Start again from /panel.');
    if (request.query.error || !request.query.code) return reply.code(400).type('text/plain').send('Authorization was declined. You can retry from /panel.');
    if (busy) return reply.code(409).type('text/plain').send('Authorization in progress. Return to /panel.');
    busy = true;
    try {
      const token = await deadline(exchangeCode(clientId, clientSecret, request.query.code, redirectUri));
      if (role === 'broadcaster') await eventsub.connect(token);
      else await connect(token);
      return reply.redirect('/panel');
    } catch {
      const message = role === 'broadcaster' ? 'Could not authorize broadcaster. Sign in as TWITCH_CHANNEL and grant redemption/subscription permissions. Check app credentials and optional broadcaster ID.' : 'Could not authorize bot. Verify app credentials, redirect URL, and that you signed in as TWITCH_BOT_USERNAME. Retry from /panel.';
      if (role === 'broadcaster') eventsub.status.message = message; else status.message = message;
      app.log.warn(message);
      return reply.code(400).type('text/plain').send(message);
    } finally { busy = false; }
  });
  app.addHook('onClose', async () => { shuttingDown = true; clearInterval(validation); recovery.dispose(); chat?.quit(); });
  async function startSaved() {
    if (shuttingDown || !enabled || !configured || busy) return;
    try {
      const token = readToken(tokenPath);
      busy = true;
      await connect(token);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      if (permanentFailure(error)) status.message = 'Saved bot authorization is invalid or unreadable. Authorize the bot again from /panel.';
      else { status.message = 'Twitch temporarily unreachable. Retrying bot connection; local mode remains available.'; recovery.schedule(); }
      app.log.warn(status.message);
    } finally { busy = false; }
  }
  return {
    status, eventsub: eventsub.status,
    async start() {
      if (!enabled || !configured) return;
      void eventsub.start().catch(() => app.log.warn('Broadcaster startup failed; local mode remains available.'));
      await startSaved();
    }
  };
}
