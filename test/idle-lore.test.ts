import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdleLore, idleLoreSeconds, type IdleClock } from '../src/idle-lore.js';
import { openStore } from '../src/store.js';
import type { LiveEvent } from '../src/events.js';

function fakeClock() {
  let now = 0, callback: (() => void) | undefined, unrefs = 0, cancels = 0;
  const timer = { unref() { unrefs++; } } as ReturnType<typeof setInterval>;
  const clock: IdleClock = { now: () => now, every(fn) { callback = fn; return timer; }, cancel() { callback = undefined; cancels++; } };
  return { clock, advance(ms: number) { now += ms; callback?.(); }, unrefs: () => unrefs, cancels: () => cancels };
}
test('idle emits one lore community message, spaces drops, and stops its unref timer', () => {
  const store = openStore(':memory:'); const time = fakeClock(); const events: LiveEvent[] = [];
  store.add({ term: 'Moon cheese', definition: 'The moon sponsors snacks.', author: 'viewer', sourceEvent: 'test:idle' }, 'canon');
  const idle = createIdleLore(store, event => events.push(event), 10, time.clock);
  try {
    time.advance(50_000); assert.equal(events.length, 0); // Not started until server is up.
    idle.start(); idle.start(); assert.equal(time.unrefs(), 1);
    time.advance(9999); assert.equal(events.length, 0);
    time.advance(1); assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: 'community', kind: 'lore', text: 'Remember this? Moon cheese — The moon sponsors snacks.' });
    time.advance(9999); assert.equal(events.length, 1);
    time.advance(1); assert.equal(events.length, 2); // Drop itself starts the next gap.
    idle.stop(); time.advance(30_000); assert.equal(events.length, 2); assert.equal(time.cancels(), 1);
  } finally { idle.stop(); store.close(); }
});
test('commands and canonization/community events reset idle; snapshots and heartbeats do not', () => {
  const store = openStore(':memory:'); const time = fakeClock(); const events: LiveEvent[] = [];
  const entry = store.add({ term: 'Door', definition: 'Push.', author: 'viewer', sourceEvent: 'test:activity' }, 'canon')!;
  const idle = createIdleLore(store, event => events.push(event), 10, time.clock);
  try {
    idle.start(); time.advance(9000); idle.activity(); time.advance(9000); assert.equal(events.length, 0);
    for (const event of [
      { type: 'canonized', entry }, { type: 'community', kind: 'raid', text: 'Welcome' },
      { type: 'community', kind: 'subscription', text: 'Subscribed' }, { type: 'community', kind: 'lore', text: 'Lore' }
    ] as LiveEvent[]) { idle.observe(event); time.advance(9000); assert.equal(events.length, 0); }
    idle.observe({ type: 'heartbeat' }); idle.observe({ type: 'snapshot', entries: [entry] });
    time.advance(1000); assert.equal(events.length, 1);
  } finally { idle.stop(); store.close(); }
});
test('empty/failing stores emit nothing and are not polled in a hot idle loop; zero disables', () => {
  const time = fakeClock(); let reads = 0; const events: LiveEvent[] = [];
  const idle = createIdleLore({ random() { reads++; if (reads > 1) throw Error('storage unavailable'); return undefined; } }, event => events.push(event), 10, time.clock);
  idle.start(); time.advance(10_000); assert.equal(reads, 1);
  for (let i = 0; i < 9; i++) time.advance(1000);
  assert.equal(reads, 1); time.advance(1000); assert.equal(reads, 2); assert.equal(events.length, 0); idle.stop();
  const disabledTime = fakeClock(); const disabled = createIdleLore({ random() { throw Error('must not read'); } }, () => assert.fail('must not publish'), 0, disabledTime.clock);
  disabled.start(); disabledTime.advance(1_000_000); assert.equal(disabledTime.unrefs(), 0); disabled.stop();
  assert.equal(idleLoreSeconds(undefined), 180); assert.equal(idleLoreSeconds('0'), 0); assert.equal(idleLoreSeconds('5'), 5);
  assert.equal(idleLoreSeconds('-1'), 180); assert.equal(idleLoreSeconds('bad'), 180);
});
