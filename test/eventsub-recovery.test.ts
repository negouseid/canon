import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocketServer, type WebSocket } from 'ws';
import { ApiClient } from '@twurple/api';
import { RefreshingAuthProvider } from '@twurple/auth';
import { startEventSession, eventTypes } from '../src/eventsub-session.js';
import { createEventHandlers } from '../src/events.js';
import { openStore } from '../src/store.js';

const waitUntil = async (check: () => boolean, limit = 10_000) => {
  const end = Date.now() + limit;
  while (!check()) { if (Date.now() > end) throw Error('Recovery condition timed out'); await new Promise(resolve => setTimeout(resolve, 20)); }
};
test('real Twurple transport reconnects, re-subscribes all three types, retries a failed request, and delivers lore afterward', { timeout: 20_000 }, async t => {
  // Twurple's ten-minute dedup cleanup timer otherwise outlives listener.stop().
  // Unref only that maintenance timer; transport/retry clocks remain real.
  const originalTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
    const timer = originalTimeout(callback, delay, ...args); if (delay === 600_000) timer.unref(); return timer;
  });
  let requests = 0, sessions = 0, failedRequests = 0;
  const enabled: Array<{ id: string; type: string; session: string }> = [];
  const server = createServer(async (req, res) => {
    res.setHeader('ratelimit-limit', '800'); res.setHeader('ratelimit-remaining', '700'); res.setHeader('ratelimit-reset', String(Math.ceil(Date.now()/1000)+1));
    if (req.method === 'POST' && req.url === '/eventsub/subscriptions') {
      let body = ''; for await (const part of req) body += part;
      const data = JSON.parse(body); requests++;
      if (failedRequests < 4 && data.type === 'channel.subscribe') {
        failedRequests++; res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Service Unavailable', status: 503, message: 'Injected outage' })); return;
      }
      const id = 'sub-' + requests;
      enabled.push({ id, type: data.type, session: data.transport.session_id });
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id, status: 'enabled', type: data.type, version: '1', condition: data.condition, transport: data.transport, created_at: new Date().toISOString(), cost: 0 }], total: enabled.length, total_cost: 0, max_total_cost: 100 }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":[]}');
  });
  const sockets = new WebSocketServer({ server, path: '/ws' });
  let active: WebSocket;
  sockets.on('connection', socket => {
    active = socket; sessions++;
    socket.send(JSON.stringify({ metadata: { message_id: 'welcome-' + sessions, message_type: 'session_welcome', message_timestamp: new Date().toISOString() }, payload: { session: { id: 'session-' + sessions, status: 'connected', keepalive_timeout_seconds: 0, reconnect_url: null, connected_at: new Date().toISOString() } } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const auth = new RefreshingAuthProvider({ clientId: 'test-app', clientSecret: 'test-secret' });
  auth.addUser('123', { accessToken: 'fake-local-token', refreshToken: 'fake-local-refresh', scope: ['channel:read:redemptions', 'channel:read:subscriptions'], expiresIn: 3600, obtainmentTimestamp: Date.now() });
  const api = new ApiClient({ authProvider: auth, mockServerPort: port, logger: { minLevel: 'error' } });
  const store = openStore(':memory:');
  const readiness: boolean[] = [];
  const status = new Proxy({ connected: false, ready: false, subscriptions: {} as Record<string, string>, message: '', lastEvent: '' }, { set(target, key, value) { if (key === 'ready') readiness.push(value); return Reflect.set(target, key, value); } });
  const published: string[] = [];
  const session = startEventSession(api, '123', status, createEventHandlers(store, 'Canonize this', event => published.push(event.type)), { info() {}, warn() {} } as never, 30);
  try {
    await waitUntil(() => status.ready);
    assert.equal(failedRequests, 4); assert.ok(requests >= 7);
    assert.deepEqual(Object.keys(status.subscriptions).sort(), [...eventTypes].sort());
    const beforeDrop = readiness.length;
    active!.terminate();
    await waitUntil(() => sessions >= 2 && status.ready);
    assert.ok(readiness.slice(beforeDrop).includes(false));
    for (const type of eventTypes) assert.ok(enabled.some(sub => sub.session === 'session-2' && sub.type === type));
    const redemption = enabled.find(sub => sub.session === 'session-2' && sub.type === eventTypes[0])!;
    active!.send(JSON.stringify({ metadata: { message_id: 'new-lore', message_type: 'notification', message_timestamp: new Date().toISOString() }, payload: {
      subscription: { id: redemption.id, type: redemption.type, version: '1', status: 'enabled' },
      event: { id: 'recovered-redemption', broadcaster_user_id: '123', broadcaster_user_login: 'streamer', broadcaster_user_name: 'Streamer', user_id: '456', user_login: 'viewer', user_name: 'Viewer', user_input: 'Recovered lore: Still here after a disconnect.', status: 'unfulfilled', reward: { id: 'reward', title: 'Canonize this', cost: 100, prompt: '' }, redeemed_at: new Date().toISOString() }
    } }));
    await waitUntil(() => store.query('Recovered lore') !== undefined);
    assert.equal(store.query('Recovered lore')?.definition, 'Still here after a disconnect.');
    assert.ok(published.includes('canonized'));
  } finally {
    session.stop(); for (const socket of sockets.clients) socket.terminate(); sockets.close();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});
