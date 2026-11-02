import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerPanel } from '../src/panel.js';
import { openStore } from '../src/store.js';
import { createEventHandlers, type LiveEvent } from '../src/events.js';
import { createCanonCounts } from '../src/canon-counts.js';

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

test('starter pack seeds an empty store once, reports counts, publishes snapshot, and enforces mutation security', async () => {
  const store = openStore(':memory:'); const app = Fastify(); const events: LiveEvent[] = [];
  registerPanel(app, store, event => events.push(event));
  try {
    const csrf = (await app.inject({ method: 'GET', url: '/api/panel' })).json().csrf;
    const url = '/api/panel/seed-starter';
    const headers = { 'x-canon-csrf': csrf, host: 'localhost:3001' };
    for (const rejectedHeaders of [{}, { 'x-canon-csrf': 'invalid' }, { ...headers, origin: 'https://example.com' }]) {
      assert.equal((await app.inject({ method: 'POST', url, headers: rejectedHeaders, payload: {} })).statusCode, 403);
    }
    assert.equal(store.list().length, 0); assert.equal(events.length, 0);
    assert.equal((await app.inject({ method: 'POST', url, headers, payload: 'text' })).statusCode, 415);
    assert.equal((await app.inject({ method: 'POST', url, headers, payload: { unexpected: true } })).statusCode, 400);
    const first = await app.inject({ method: 'POST', url, headers, payload: {} });
    assert.equal(first.statusCode, 200); assert.deepEqual(first.json(), { added: 8, alreadyPresent: 0 });
    assert.equal(store.list().length, 8); assert.equal(store.list('pending').length, 0);
    assert.deepEqual(store.list().map(entry => entry.sourceEvent).sort(), Array.from({ length: 8 }, (_, index) => 'seed:v1:' + index));
    assert.equal(events[0].type, 'snapshot');
    if (events[0].type === 'snapshot') assert.equal(events[0].entries.length, 8);
    const second = await app.inject({ method: 'POST', url, headers, payload: {} });
    assert.equal(second.statusCode, 200); assert.deepEqual(second.json(), { added: 0, alreadyPresent: 8 });
    assert.equal(store.list().length, 8); assert.equal(events.length, 2);
    assert.ok(events.every(event => event.type === 'snapshot')); // No fake canonization burst.
  } finally { await app.close(); store.close(); }
});

test('shared live counts track redemption and approval, exclude seeds/rejections/duplicates, and read lifetime from store', async () => {
  const store = openStore(':memory:'); const app = Fastify(); const events: LiveEvent[] = [];
  const counts = createCanonCounts(store); const publish = (event: LiveEvent) => { events.push(event); };
  registerPanel(app, store, publish, undefined, undefined, () => {}, counts);
  const handlers = createEventHandlers(store, 'Canonize this', publish, counts);
  try {
    const initial = (await app.inject({ method: 'GET', url: '/api/panel' })).json();
    assert.deepEqual(initial.counts, { total: 0, session: 0 });
    const headers = { 'x-canon-csrf': initial.csrf };
    await app.inject({ method: 'POST', url: '/api/panel/seed-starter', headers, payload: {} });
    assert.deepEqual(counts.read(), { total: 8, session: 0 });
    const redemption = { id: 'count:redemption', rewardTitle: 'Canonize this', input: 'Moon cheese: Our snack sponsor.', userName: 'viewer', status: 'unfulfilled' };
    assert.equal(handlers.redemption(redemption)?.kind, 'canonized');
    assert.deepEqual(counts.read(), { total: 9, session: 1 });
    const redemptionPush = events.slice(-3);
    assert.equal(redemptionPush[0].type, 'canonized');
    assert.equal(redemptionPush[1].type, 'snapshot');
    if (redemptionPush[1].type === 'snapshot') assert.deepEqual(redemptionPush[1].counts, { total: 9, session: 1 });
    assert.equal(handlers.redemption(redemption)?.kind, 'duplicate');
    assert.deepEqual(counts.read(), { total: 9, session: 1 });
    const pending = store.add({ term: 'Door boss', definition: 'Push.', author: 'viewer', sourceEvent: 'count:proposal' })!;
    assert.deepEqual(counts.read(), { total: 9, session: 1 });
    const url = '/api/panel/proposals/' + pending.id + '/review';
    assert.equal((await app.inject({ method: 'POST', url, headers, payload: { action: 'approve' } })).statusCode, 200);
    assert.deepEqual(counts.read(), { total: 10, session: 2 });
    assert.equal((await app.inject({ method: 'POST', url, headers, payload: { action: 'approve' } })).statusCode, 409);
    const rejected = store.add({ term: 'Not canon', definition: 'Rejected.', author: 'viewer', sourceEvent: 'count:rejected' })!;
    await app.inject({ method: 'POST', url: '/api/panel/proposals/' + rejected.id + '/review', headers, payload: { action: 'reject' } });
    await app.inject({ method: 'POST', url: '/api/panel/seed-starter', headers, payload: {} });
    const final = (await app.inject({ method: 'GET', url: '/api/panel' })).json();
    assert.deepEqual(final.counts, { total: store.list().length, session: 2 });
    const snapshot = events[events.length - 1];
    assert.equal(snapshot.type, 'snapshot');
    if (snapshot.type === 'snapshot') assert.deepEqual(snapshot.counts, final.counts);
    assert.deepEqual(createCanonCounts(store).read(), { total: 10, session: 0 });
  } finally { await app.close(); store.close(); }
});

test('chat capture uses real recent sources, stays pending until approved, deduplicates retries, and enforces panel security', async () => {
  const { createChatCapture } = await import('../src/chat-capture.js');
  let now = 0, activity = 0;
  const chat = createChatCapture(() => activity++, () => {}, { now: () => now, later: setTimeout, cancel: clearTimeout });
  const store = openStore(':memory:'); const app = Fastify(); const events: LiveEvent[] = [];
  const counts = createCanonCounts(store);
  registerPanel(app, store, event => events.push(event), undefined, undefined, () => activity++, counts, chat);
  try {
    const csrf = (await app.inject({ method: 'GET', url: '/api/panel' })).json().csrf;
    const headers = { 'x-canon-csrf': csrf, host: 'localhost:3001' };
    const rehearsal = '/api/panel/chat/rehearse', capture = '/api/panel/chat/capture';
    const sample = { author: 'Viewer_1', text: '<img src=x> The chair is in charge.' };
    for (const url of [rehearsal, capture]) {
      const payload = url === rehearsal ? sample : { messageIds: ['no'], term: 'Chair Council', definition: 'The chair rules.' };
      for (const rejected of [{}, { 'x-canon-csrf': 'wrong' }, { ...headers, origin: 'https://example.com' }]) {
        assert.equal((await app.inject({ method: 'POST', url, headers: rejected, payload })).statusCode, 403);
      }
      assert.equal((await app.inject({ method: 'POST', url, headers, payload: 'plain text' })).statusCode, 415);
    }
    assert.equal((await app.inject({ method: 'POST', url: rehearsal, headers, payload: sample })).statusCode, 200);
    assert.equal(activity, 1);
    const recent = await app.inject({ method: 'GET', url: '/api/panel/chat' });
    assert.equal(recent.headers['cache-control'], 'no-store');
    const messages = recent.json().messages; assert.equal(messages.length, 1); assert.equal(messages[0].local, true); assert.equal(messages[0].text, sample.text);
    const payload = { messageIds: [messages[0].id], term: 'Chair Council', definition: 'The empty chair has final say.' };
    for (const invalid of [{ ...payload, messageIds: [] }, { ...payload, messageIds: [messages[0].id, messages[0].id] },
      { ...payload, messageIds: Array.from({ length: 6 }, (_, i) => String(i)) }, { ...payload, term: '   ' },
      { ...payload, definition: 'bad\nline' }, { ...payload, definition: 'x'.repeat(1001) }]) {
      assert.equal((await app.inject({ method: 'POST', url: capture, headers, payload: invalid })).statusCode, 400);
    }
    assert.equal((await app.inject({ method: 'POST', url: capture, headers, payload: { ...payload, messageIds: ['invented'] } })).statusCode, 409);
    const saved = await app.inject({ method: 'POST', url: capture, headers, payload });
    assert.equal(saved.statusCode, 200); assert.equal(saved.json().entry.author, 'Streamer (chat capture)');
    assert.equal(store.list('pending').length, 1); assert.deepEqual(counts.read(), { total: 0, session: 0 });
    assert.deepEqual(events, [{ type: 'pending-changed' }]); // No raw chat or premature reveal.
    assert.equal((await app.inject({ method: 'POST', url: capture, headers, payload })).statusCode, 409);
    assert.equal(store.list('pending').length, 1);
    const id = saved.json().entry.id;
    assert.equal((await app.inject({ method: 'POST', url: '/api/panel/proposals/' + id + '/review', headers, payload: { action: 'approve' } })).statusCode, 200);
    assert.deepEqual(counts.read(), { total: 1, session: 1 }); assert.equal(events[1].type, 'canonized');
    assert.equal(store.query('Chair Council')?.definition, payload.definition);
    now = 600_000;
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/panel/chat' })).json().messages, []);
    assert.equal((await app.inject({ method: 'POST', url: capture, headers, payload })).statusCode, 409);
    assert.ok(store.list()[0].sourceEvent.startsWith('capture:v1:'));
    assert.equal(store.list()[0].sourceEvent.includes(sample.text), false);
  } finally { await app.close(); store.close(); }
});
