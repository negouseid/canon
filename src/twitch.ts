import { RefreshingAuthProvider, exchangeCode, getTokenInfo, accessTokenIsExpired, refreshUserToken, type AccessToken } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';
import type { FastifyInstance } from 'fastify';
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Store } from './store.js';
import { handleCommand, chatText, isCanonCommand } from './commands.js';
import { createOAuthStates } from './oauth-state.js';

export function registerTwitch(app: FastifyInstance, store: Store, port: number) {
  const enabled = process.env.TWITCH_ENABLED === 'true';
  const clientId = process.env.TWITCH_CLIENT_ID || '';
  const clientSecret = process.env.TWITCH_CLIENT_SECRET || '';
  const channel = (process.env.TWITCH_CHANNEL || '').trim().toLowerCase();
  const expectedBot = (process.env.TWITCH_BOT_USERNAME || '').trim().toLowerCase();
  const redirectUri = process.env.TWITCH_OAUTH_REDIRECT_URI?.trim() || `http://localhost:${port}/auth/twitch/callback`;
  // Keep tokens inside the already-ignored data directory, separate from public assets.
  const tokenPath = resolve('data/twitch-bot-token.json');
  const states = createOAuthStates();
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
  auth.onRefreshFailure(() => {
    status.connected = status.authenticated = false;
    status.message = 'Bot authorization expired or was revoked. Authorize the bot again.';
    chat?.quit(); app.log.warn(status.message);
  });
  const scopes = ['chat:read', 'chat:edit'];
  // Twitch requires periodic token validation in addition to validation at startup.
  const validation = setInterval(() => {
    if (!enabled || !activeUserId || busy || shuttingDown) return;
    void (async () => {
      try {
        const token = await auth.getAccessTokenForUser(activeUserId!, scopes);
        if (!token) throw new Error('Missing bot token');
        const info = await getTokenInfo(token.accessToken, clientId);
        if (info.userId !== activeUserId || info.clientId !== clientId || !scopes.every(scope => info.scopes.includes(scope))) throw new Error('Invalid bot authorization');
      } catch {
        chat?.quit(); status.connected = status.authenticated = false;
        status.message = 'Periodic bot authorization check failed. Check connectivity or reauthorize from the panel.';
        app.log.warn(status.message);
      }
    })();
  }, 55 * 60_000);
  validation.unref();
  async function connect(token: AccessToken) {
    if (shuttingDown) return;
    // Validate identity before replacing a working bot's credentials or chat intent.
    const valid = accessTokenIsExpired(token)
      ? await refreshUserToken(clientId, clientSecret, token.refreshToken!) : token;
    const info = await getTokenInfo(valid.accessToken, clientId);
    if (info.clientId !== clientId || !info.userId || info.userName?.toLowerCase() !== expectedBot || !scopes.every(scope => info.scopes.includes(scope))) {
      throw new Error('Unexpected bot identity or scopes');
    }
    if (shuttingDown) return;
    save(valid);
    activeUserId = await auth.addUserForToken(valid, ['chat']);
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
    next.onMessageFailed(() => { status.message = 'Twitch rejected a reply. Check chat restrictions and bot permissions.'; });
    // Keep outbound traffic modest even during a busy demo; Twurple also rate-limits sends.
    const recent = new Map<string, number>();
    let lastReply = 0;
    next.onMessage((_room, user, text, message) => {
      if (chat !== next || !status.connected || !isCanonCommand(text)) return;
      const now = Date.now();
      const userId = message.userInfo.userId || user;
      if (now - (recent.get(userId) || 0) < 5000 || now - lastReply < 1500) return;
      if (recent.size >= 2000) for (const [key, at] of recent) if (now - at >= 5000) recent.delete(key);
      recent.set(userId, now); lastReply = now;
      try {
        const reply = handleCommand(store, text, user, message.id);
        if (reply) {
          // Log the same bounded response sent to chat; never log raw tokens or OAuth URLs.
          app.log.info({ reply: chatText(reply) }, 'Canon chat reply');
          void next.say(channel, chatText(reply)).catch(() => { status.message = 'Could not send reply. Check Twitch connection and chat restrictions.'; app.log.warn(status.message); });
        }
      } catch { app.log.warn('Could not process chat command; the server remains available.'); }
    });
    next.connect();
  }
  app.get('/api/twitch/status', async () => ({ ...status, botExpected: expectedBot }));
  app.get('/auth/twitch/bot', async (request, reply) => {
    if (!enabled || !configured) return reply.code(409).type('text/plain').send(status.message);
    if (busy) return reply.code(409).type('text/plain').send('Authorization is already being processed. Try again shortly.');
    // Use localhost consistently, so the browser-bound state cookie returns on callback.
    const target = new URL(redirectUri);
    if (target.protocol !== 'http:' || target.hostname !== 'localhost' || target.port !== String(port) || target.pathname !== '/auth/twitch/callback') {
      return reply.code(409).type('text/plain').send('Use http://localhost:' + port + '/auth/twitch/callback as TWITCH_OAUTH_REDIRECT_URI and register it in Twitch.');
    }
    if (request.headers.host !== target.host) return reply.redirect(`http://${target.host}/auth/twitch/bot`);
    const state = states.issue();
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(' '), state, force_verify: 'true' }).toString();
    reply.header('Set-Cookie', `canon_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/auth/twitch; Max-Age=600`);
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(url.toString());
  });
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/auth/twitch/callback', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
    const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('canon_oauth_state='))?.slice('canon_oauth_state='.length);
    reply.header('Set-Cookie', 'canon_oauth_state=; HttpOnly; SameSite=Lax; Path=/auth/twitch; Max-Age=0');
    if (!enabled || !configured || !states.consume(request.query.state || '', cookie)) return reply.code(400).type('text/plain').send('Authorization expired or state did not match. Start again from /panel.');
    if (request.query.error || !request.query.code) return reply.code(400).type('text/plain').send('Authorization was declined. You can retry from /panel.');
    if (busy) return reply.code(409).type('text/plain').send('Authorization in progress. Return to /panel.');
    busy = true;
    try {
      const token = await exchangeCode(clientId, clientSecret, request.query.code, redirectUri);
      await connect(token);
      return reply.redirect('/panel');
    } catch {
      status.message = 'Could not authorize bot. Verify app credentials, redirect URL, and that you signed in as TWITCH_BOT_USERNAME. Retry from /panel.';
      app.log.warn(status.message);
      return reply.code(400).type('text/plain').send(status.message);
    } finally { busy = false; }
  });
  app.addHook('onClose', async () => { shuttingDown = true; clearInterval(validation); chat?.quit(); });
  return {
    status,
    async start() {
      if (!enabled || !configured) return;
      try {
        let token: AccessToken;
        try { token = JSON.parse(readFileSync(tokenPath, 'utf8')); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
        if (!token || typeof token.accessToken !== 'string' || typeof token.refreshToken !== 'string' || !Array.isArray(token.scope) || typeof token.obtainmentTimestamp !== 'number' || (token.expiresIn !== null && typeof token.expiresIn !== 'number')) throw new Error('Invalid token file');
        busy = true;
        await connect(token);
      } catch {
        status.message = 'Saved bot authorization could not be loaded. Check credentials and authorize the bot again from /panel.';
        app.log.warn(status.message);
      } finally { busy = false; }
    }
  };
}
