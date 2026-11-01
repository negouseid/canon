import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { createEventHandlers, type LiveEvent } from '../src/events.js';

test('real redemption handler promotes latest, broadcasts once, and deduplicates after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-events-'));
  const path = join(dir, 'canon.sqlite');
  let store = openStore(path);
  const emitted: LiveEvent[] = [];
  const event = { id: 'redemption-1', rewardTitle: 'Canonize this', input: 'latest', userName: 'redeemer', status: 'unfulfilled' };
  try {
    store.add({ term: 'Old proposal', definition: 'Older.', author: 'first', sourceEvent: 'chat:1' });
    const proposal = store.add({ term: 'Moon cheese', definition: 'The moon sponsors snacks.', author: 'original-author', sourceEvent: 'chat:2' })!;
    let handler = createEventHandlers(store, 'Canonize this', message => emitted.push(message));
    assert.equal(handler.redemption({ ...event, rewardTitle: 'Other reward' }), undefined);
    assert.equal(handler.redemption({ ...event, status: 'canceled' }), undefined);
    const result = handler.redemption(event)!;
    assert.equal(result.kind, 'canonized');
    if (result.kind === 'canonized') {
      assert.equal(result.entry.id, proposal.id);
      assert.equal(result.entry.author, 'original-author');
      assert.equal(result.entry.sourceEvent, 'chat:2');
    }
    assert.deepEqual(emitted.map(item => item.type), ['canonized', 'snapshot', 'pending-changed']);
    store.close(); store = openStore(path);
    handler = createEventHandlers(store, 'Canonize this', message => emitted.push(message));
    assert.equal(handler.redemption(event)?.kind, 'duplicate');
    assert.equal(store.list().length, 1);
    assert.equal(store.list('pending').length, 1);
    assert.equal(emitted.length, 3);
    assert.equal(store.query('Moon cheese')?.definition, 'The moon sponsors snacks.');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('attached text creates canon; invalid or empty-queue redemptions cannot later promote new lore', () => {
  const store = openStore(':memory:');
  try {
    const events: LiveEvent[] = [];
    const handler = createEventHandlers(store, 'Canonize this', event => events.push(event));
    const event = { id: 'direct', rewardTitle: 'Canonize this', input: 'Door boss: The final boss: push.', userName: 'viewer', status: 'fulfilled' };
    assert.equal(handler.redemption(event)?.kind, 'canonized');
    assert.equal(store.query('door boss')?.sourceEvent, 'redemption:direct');
    assert.equal(store.query('door boss')?.author, 'viewer');
    for (const [id, input] of [['invalid', 'not formatted'], ['empty-queue', 'latest'], ['oversized', 'x'.repeat(101)+': definition']]) {
      assert.equal(handler.redemption({ ...event, id, input })?.kind, 'rejected');
    }
    store.add({ term: 'Pending', definition: 'Wait for approval.', author: 'author', sourceEvent: 'chat:new' });
    assert.equal(handler.redemption({ ...event, id: 'empty-queue', input: 'latest' })?.kind, 'duplicate');
    assert.equal(store.list('pending').length, 1);
    assert.equal(store.list().length, 1);
    assert.equal(events.length, 3);
    assert.equal(handler.redemption({ ...event, id: 'new-redemption', input: '' })?.kind, 'canonized');
  } finally { store.close(); }
});

test('subscription and raid handlers surface community messages without creating canon', () => {
  const store = openStore(':memory:');
  try {
    store.add({ term: 'Gravity patch', definition: 'Gravity was buffed.', author: 'demo', sourceEvent: 'seed:gravity' }, 'canon');
    const events: LiveEvent[] = [];
    const handler = createEventHandlers(store, 'Canonize this', event => events.push(event));
    handler.raid({ raidingBroadcasterDisplayName: 'RaidFriend', viewers: 42 });
    handler.subscription({ userDisplayName: 'NewFriend', isGift: false });
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'community');
    if (events[0].type === 'community') assert.match(events[0].text, /42 raiders from RaidFriend.*Gravity patch/);
    assert.equal(store.list().length, 1);
    assert.equal(store.list('pending').length, 0);
  } finally { store.close(); }
});
