import 'dotenv/config';
import Fastify, { LogController } from 'fastify';
import { readFileSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { openStore } from './store.js';
import { seed } from './seed.js';
import { registerTwitch } from './twitch.js';
import type { Publish } from './events.js';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const store = openStore(process.env.DATABASE_PATH || './data/canon.sqlite');
if (process.env.SEED_ON_START !== 'false') seed(store);
// OAuth callback query strings contain authorization codes: do not log request URLs.
const app = Fastify({ logger: true, logController: new LogController({ disableRequestLogging: true }) });
app.addHook('onRequest', async (request, reply) => {
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  if (!allowedHosts.has(request.headers.host || '')) return reply.code(403).send({ error: 'Local access only' });
  reply.header('Referrer-Policy', 'no-referrer');
});
const ws = new WebSocketServer({ noServer: true });
const publish: Publish = event => {
  const message = JSON.stringify(event);
  for (const client of ws.clients) if (client.readyState === WebSocket.OPEN) client.send(message);
};
const twitch = registerTwitch(app, store, port, publish);
app.server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (request.url !== '/ws' || ![`localhost:${port}`, `127.0.0.1:${port}`].includes(host || '') || origin !== `http://${host}`) {
    socket.destroy(); return;
  }
  ws.handleUpgrade(request, socket, head, client => ws.emit('connection', client, request));
});
ws.on('connection', client => {
  client.on('error', error => app.log.warn(error));
  client.send(JSON.stringify({ type: 'snapshot', entries: store.list() }));
});
app.get('/health', async () => ({ ok: true, canonCount: store.list().length, stage: 4, twitchConnected: twitch.status.connected, eventsubReady: twitch.eventsub.ready }));
app.get('/api/canon', async () => store.list());
app.get('/', async (_, reply) => reply.redirect('/panel'));
for (const page of ['overlay', 'panel']) {
  const html = readFileSync(new URL(`../public/${page}.html`, import.meta.url), 'utf8');
  app.get('/' + page, async (_, reply) => reply.type('text/html').send(html));
}
app.post('/api/test-canonized', { config: {}, bodyLimit: 1024 }, async (request, reply) => {
  // Browser JSON requests require a same-origin preflight; verify Origin when present too.
  if (!request.headers['content-type']?.startsWith('application/json')) return reply.code(415).send({ error: 'Use application/json' });
  if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return reply.code(403).send({ error: 'Origin rejected' });
  const entry = store.random();
  if (!entry) return reply.code(409).send({ error: 'No canon entries. Run npm run seed first.' });
  const message = JSON.stringify({ type: 'canonized', entry, test: true });
  let clients = 0;
  for (const client of ws.clients) if (client.readyState === WebSocket.OPEN) { client.send(message); clients++; }
  return { entry, clients };
});
app.addHook('preClose', async () => { for (const client of ws.clients) client.terminate(); ws.close(); });
app.addHook('onClose', async () => { store.close(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
try {
  await app.listen({ port, host: '127.0.0.1' });
  void twitch.start();
}
catch (error) { app.log.error(error); await app.close(); process.exitCode = 1; }
