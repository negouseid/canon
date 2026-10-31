import 'dotenv/config';
import Fastify from 'fastify';
import { openStore } from './store.js';
import { seed } from './seed.js';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const store = openStore(process.env.DATABASE_PATH || './data/canon.sqlite');
if (process.env.SEED_ON_START !== 'false') seed(store);
const app = Fastify({ logger: true });
app.get('/health', async () => ({ ok: true, canonCount: store.list().length, stage: 1, twitchConnected: false }));
app.get('/api/canon', async () => store.list());
app.get('/', async (_, reply) => reply.type('text/html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Canon</title><body style="background:#101018;color:#f5f1e8;font-family:system-ui;padding:4rem"><h1>Canon</h1><p>Your channel remembers.</p><p>Step 1 scaffold is running. Overlay and panel arrive in the next steps.</p><a style="color:#b4a0ff" href="/api/canon">Browse seeded canon JSON</a></body></html>`));
app.addHook('onClose', async () => { store.close(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
try { await app.listen({ port, host: process.env.HOST || '127.0.0.1' }); }
catch (error) { app.log.error(error); await app.close(); process.exitCode = 1; }
