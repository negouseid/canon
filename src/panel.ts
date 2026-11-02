import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Store } from './store.js';
import type { Publish } from './events.js';
import { handleCommand, isCanonCommand } from './commands.js';
import { seed } from './seed.js';
import { createCanonCounts } from './canon-counts.js';

export function registerPanel(app: FastifyInstance, store: Store, publish: Publish, voicePath = resolve(process.env.VOICE_PATH || './voice.md'), storage?: { mode: string; persistent: boolean; available: boolean; warning: string }, onActivity: () => void = () => {}, counts = createCanonCounts(store)) {
  const csrf = randomBytes(32).toString('hex');
  const revision = (text: string) => createHash('sha256').update(text).digest('hex');
  function readVoice() {
    const text = existsSync(voicePath) ? readFileSync(voicePath, 'utf8') : '';
    return { text, revision: revision(text) };
  }
  async function mutation(request: FastifyRequest, reply: FastifyReply) {
    if (!request.headers['content-type']?.startsWith('application/json')) return reply.code(415).send({ error: 'Use application/json.' });
    if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return reply.code(403).send({ error: 'Origin rejected.' });
    if (request.headers['x-canon-csrf'] !== csrf) return reply.code(403).send({ error: 'Refresh the panel before trying again.' });
  }
  app.get('/api/panel', async (_, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { csrf, pending: store.list('pending'), canon: store.list(), rejectedCount: store.list('rejected').length, storage, counts: counts.read() };
  });
  app.post<{ Params: { id: string }; Body: { action: 'approve' | 'reject' } }>('/api/panel/proposals/:id/review', {
    preHandler: mutation, bodyLimit: 1024,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[1-9][0-9]*$' } } },
      body: { type: 'object', additionalProperties: false, required: ['action'], properties: { action: { type: 'string', enum: ['approve', 'reject'] } } }
    }
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id)) return reply.code(400).send({ error: 'Invalid proposal ID.' });
    const approved = request.body.action === 'approve';
    const entry = store.review(id, approved ? 'canon' : 'rejected');
    if (!entry) return reply.code(409).send({ error: 'This proposal was already reviewed or canonized. The queue has been refreshed.' });
    if (approved) {
      counts.recordCanonization();
      publish({ type: 'canonized', entry });
      publish(counts.snapshot());
    }
    publish({ type: 'pending-changed' });
    return { entry };
  });
  app.post<{ Body: { command: string } }>('/api/panel/rehearse', {
    preHandler: mutation, bodyLimit: 8000,
    schema: { body: { type: 'object', required: ['command'], additionalProperties: false, properties: { command: { type: 'string', minLength: 1, maxLength: 1500 } } } }
  }, async (request, reply) => {
    if (isCanonCommand(request.body.command)) onActivity();
    const response = handleCommand(store, request.body.command, 'Demo viewer', 'demo:' + randomUUID(), () => publish({ type: 'pending-changed' }));
    if (!response) return reply.code(400).send({ error: 'Use !canon term, !canon add term: definition, or !lore.' });
    return { reply: 'Canon: ' + response, local: true };
  });
  app.post('/api/panel/seed-starter', {
    preHandler: mutation, bodyLimit: 1024,
    schema: { body: { type: 'object', additionalProperties: false, maxProperties: 0 } }
  }, async () => {
    const result = seed(store);
    publish(counts.snapshot());
    return result;
  });
  app.get('/api/panel/voice', async (_, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return readVoice(); }
    catch { return reply.code(500).send({ error: 'Could not read the voice persona. Check VOICE_PATH and file permissions.' }); }
  });
  app.put<{ Body: { text: string; revision: string } }>('/api/panel/voice', {
    preHandler: mutation, bodyLimit: 36_000,
    schema: { body: { type: 'object', additionalProperties: false, required: ['text', 'revision'], properties: {
      text: { type: 'string', minLength: 1, maxLength: 8000 }, revision: { type: 'string', pattern: '^[a-f0-9]{64}$' }
    } } }
  }, async (request, reply) => {
    const { text, revision: expected } = request.body;
    if (!text.trim() || text.includes('\0')) return reply.code(400).send({ error: 'Enter a voice persona without null characters.' });
    const temporary = voicePath + '.' + randomBytes(6).toString('hex') + '.tmp';
    try {
      if (readVoice().revision !== expected) return reply.code(409).send({ error: 'The voice persona changed in another tab or editor. Reload the saved version before saving.' });
      writeFileSync(temporary, text, { mode: 0o600 });
      renameSync(temporary, voicePath);
      return { text, revision: revision(text) };
    } catch {
      return reply.code(500).send({ error: 'Could not save the voice persona. Check VOICE_PATH and file permissions.' });
    } finally { try { unlinkSync(temporary); } catch { /* file renamed or never created */ } }
  });
}
