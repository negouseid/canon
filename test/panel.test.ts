import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerPanel } from '../src/panel.js';
import { openStore } from '../src/store.js';
import type { LiveEvent } from '../src/events.js';

test('panel approves once, rejects safely, and requires same-origin mutation credentials', async () => {
  const store = openStore(':memory:');
  const app = Fastify(); const events: LiveEvent[] = [];
  registerPanel(app, store, event => events.push(event));
  try {
    const one = store.add({ term: '<img src=x>', definition: 'Plain text only.', author: 'viewer', sourceEvent: 'chat:one' })!;
    const two = store.add({ term: 'Rejected lore', definition: 'Not canon.', author: 'viewer2', sourceEvent: 'chat:two' })!;
    const snapshot = (await app.inject({ method: 'GET', url: '/api/panel' })).json();
    assert.equal(snapshot.pending.length, 2); assert.equal(snapshot.canon.length, 0);
    const url = '/api/panel/proposals/' + one.id + '/review';
    assert.equal((await app.inject({ method: 'POST', url, payload: { action: 'approve' } })).statusCode, 403);
    const headers = { 'x-canon-csrf': snapshot.csrf, host: 'localhost:3001' };
    assert.equal((await app.inject({ method: 'POST', url, headers: { ...headers, origin: 'https://example.com' }, payload: { action: 'approve' } })).statusCode, 403);
    assert.equal(store.list('pending').length, 2);
    const approved = await app.inject({ method: 'POST', url, headers, payload: { action: 'approve' } });
    assert.equal(approved.statusCode, 200); assert.equal(approved.json().entry.author, 'viewer');
    assert.deepEqual(events.map(event => event.type), ['canonized', 'snapshot', 'pending-changed']);
    assert.equal((await app.inject({ method: 'POST', url, headers, payload: { action: 'approve' } })).statusCode, 409);
    assert.equal(events.length, 3);
    assert.equal((await app.inject({ method: 'POST', url: '/api/panel/proposals/' + two.id + '/review', headers, payload: { action: 'reject' } })).statusCode, 200);
    assert.equal(store.query('Rejected lore'), undefined);
    assert.equal(events.length, 4); assert.equal(events[3].type, 'pending-changed');
    const final = (await app.inject({ method: 'GET', url: '/api/panel' })).json();
    assert.equal(final.pending.length, 0); assert.equal(final.canon.length, 1); assert.equal(final.rejectedCount, 1);
    assert.equal((await app.inject({ method: 'POST', url: '/api/panel/proposals/1/review', headers, payload: { action: 'delete' } })).statusCode, 400);
  } finally { await app.close(); store.close(); }
});

test('voice editor persists, rejects stale saves, and leaves the saved file intact on invalid input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-voice-')); const path = join(dir, 'voice.md');
  writeFileSync(path, 'Original voice.');
  const store = openStore(':memory:'); const app = Fastify();
  registerPanel(app, store, () => {}, path);
  try {
    const csrf = (await app.inject({ method: 'GET', url: '/api/panel' })).json().csrf;
    const headers = { 'x-canon-csrf': csrf };
    const voice = (await app.inject({ method: 'GET', url: '/api/panel/voice' })).json();
    const saved = await app.inject({ method: 'PUT', url: '/api/panel/voice', headers, payload: { text: 'Warm and dry.\nKeep lore factual.', revision: voice.revision } });
    assert.equal(saved.statusCode, 200); assert.equal(readFileSync(path, 'utf8'), 'Warm and dry.\nKeep lore factual.');
    assert.equal((await app.inject({ method: 'PUT', url: '/api/panel/voice', headers, payload: { text: 'Stale overwrite', revision: voice.revision } })).statusCode, 409);
    for (const text of ['', '  ', 'x'.repeat(8001), 'null\0character']) {
      assert.equal((await app.inject({ method: 'PUT', url: '/api/panel/voice', headers, payload: { text, revision: saved.json().revision } })).statusCode, 400);
    }
    assert.equal(readFileSync(path, 'utf8'), saved.json().text);
  } finally { await app.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});
