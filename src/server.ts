import 'dotenv/config';
import Fastify, { LogController } from 'fastify';
import { readFileSync } from 'node:fs';
import { createRuntimeStore, StorageUnavailable } from './runtime-store.js';
import { createLiveHub } from './live-hub.js';
import { registerTwitch } from './twitch.js';
import { registerPanel } from './panel.js';
import { createIdleLore, idleLoreSeconds } from './idle-lore.js';
import type { LiveEvent } from './events.js';
const requestedPort = Number(process.env.PORT || 3000);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) { console.error('PORT is invalid; using 3000.'); }
const port = Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535 ? requestedPort : 3000;
const runtime = createRuntimeStore(process.env.DATABASE_PATH || './data/canon.sqlite', process.env.SEED_ON_START !== 'false');
const { store } = runtime;
// OAuth callback query strings contain authorization codes: do not log request URLs.
const app = Fastify({ logger: true, logController: new LogController({ disableRequestLogging: true }) });
app.addHook('onRequest', async (request, reply) => {
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  if (!allowedHosts.has(request.headers.host || '')) return reply.code(403).send({ error: 'Local access only' });
  reply.header('Referrer-Policy', 'no-referrer');
});
const hub = createLiveHub(app.server, store, port, app.log);
const idle = createIdleLore(store, hub.publish, idleLoreSeconds(process.env.IDLE_LORE_SECONDS));
const publish = (event: LiveEvent) => { idle.observe(event); return hub.publish(event); };
app.addHook('onClose', async () => { idle.stop(); });
const twitch = registerTwitch(app, store, port, publish, idle.activity);
registerPanel(app, store, publish, undefined, runtime.status, idle.activity);
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof StorageUnavailable) return reply.code(503).send({ error: error.message });
  return reply.send(error);
});
app.get('/health', async () => ({ ok: true, canonCount: store.list().length, stage: 7, twitchConnected: twitch.status.connected, eventsubReady: twitch.eventsub.ready, storage: runtime.status, voiceMode: 'plain-text' }));
app.get('/api/canon', async () => store.list());
app.get('/', async (_, reply) => reply.redirect('/panel'));
for (const page of ['overlay', 'panel']) {
  const html = readFileSync(new URL(`../public/${page}.html`, import.meta.url), 'utf8');
  app.get('/' + page, async (_, reply) => reply.type('text/html').send(html));
}
for (const script of ['panel.js', 'live-message.js']) {
  const body = readFileSync(new URL('../public/' + script, import.meta.url), 'utf8');
  app.get('/' + script, async (_, reply) => reply.type('application/javascript').send(body));
}
app.post('/api/test-canonized', { config: {}, bodyLimit: 1024 }, async (request, reply) => {
  // Browser JSON requests require a same-origin preflight; verify Origin when present too.
  if (!request.headers['content-type']?.startsWith('application/json')) return reply.code(415).send({ error: 'Use application/json' });
  if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return reply.code(403).send({ error: 'Origin rejected' });
  const entry = store.random();
  if (!entry) return reply.code(409).send({ error: 'No canon entries. Run npm run seed first.' });
  const clients = publish({ type: 'canonized', entry, test: true });
  return { entry, clients };
});
app.addHook('preClose', async () => { hub.close(); });
app.addHook('onClose', async () => { store.close(); });
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  if (stopping) return;
  stopping = true;
  // Intentional shutdown: finish application cleanup, then release SDK housekeeping timers.
  void app.close().then(() => process.exit(0), () => process.exit(1));
});
try {
  await app.listen({ port, host: '127.0.0.1' });
  idle.start();
  if (runtime.status.warning) app.log.warn(runtime.status.warning);
  void twitch.start().catch(() => app.log.warn('Twitch startup failed; local mode remains available.'));
}
catch (error) { app.log.error(error); await app.close(); process.exitCode = 1; }
