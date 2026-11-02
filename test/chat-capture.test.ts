import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatCapture, type ChatClock } from '../src/chat-capture.js';
import { createIdleLore, type IdleClock } from '../src/idle-lore.js';

function fakeTime() {
  let now = 0, callback: (() => void) | undefined;
  let unrefs = 0, canceled = 0;
  const timer = { unref() { unrefs++; } } as ReturnType<typeof setTimeout>;
  const clock: ChatClock = { now: () => now, later(fn) { callback = fn; return timer; }, cancel() { canceled++; callback = undefined; } };
  return { clock, advance(ms: number) { now += ms; }, flush() { const fn = callback; callback = undefined; fn?.(); }, unrefs: () => unrefs, canceled: () => canceled };
}
test('recent chat is bounded, expires, ignores own bot/duplicates, and coalesces notifications without source text', () => {
  const time = fakeTime(); let activity = 0, changes = 0;
  const chat = createChatCapture(() => activity++, () => changes++, time.clock);
  const message = { id: 'one', author: 'viewer', text: '<script>plain text</script>' };
  assert.equal(chat.add({ ...message, ownBot: true }), undefined);
  assert.equal(activity, 0);
  assert.equal(chat.add(message)?.text, message.text);
  assert.equal(chat.add(message), undefined);
  for (let i = 0; i < 60; i++) chat.add({ ...message, id: 'message:' + i });
  assert.equal(chat.list().length, 50); assert.equal(activity, 61); assert.equal(changes, 0); assert.equal(time.unrefs(), 1);
  time.flush(); assert.equal(changes, 1);
  const copy = chat.list(); copy[0].text = 'tampered'; assert.notEqual(chat.list()[0].text, 'tampered');
  for (const text of ['', '   ', 'x'.repeat(501), 'line\nbreak', '\0']) assert.equal(chat.add({ ...message, id: text, text }), undefined);
  time.advance(600_000); assert.deepEqual(chat.list(), []);
  chat.add({ ...message, id: 'last', local: true }); assert.equal(chat.list()[0].local, true);
  chat.close(); assert.deepEqual(chat.list(), []); assert.equal(time.canceled(), 1); time.flush(); assert.equal(changes, 1);
  assert.deepEqual(createChatCapture().list(), []); // New server has no old chat.
});
test('ordinary viewer chat postpones idle lore; Canon bot replies and duplicate deliveries do not', () => {
  const time = fakeTime(); let idleTick: (() => void) | undefined, published = 0;
  const timer = { unref() {} } as ReturnType<typeof setInterval>;
  const idleClock: IdleClock = { now: time.clock.now, every(fn) { idleTick = fn; return timer; }, cancel() { idleTick = undefined; } };
  const idle = createIdleLore({ random: () => ({ id: 1, term: 'Chair', definition: 'In charge.', author: 'viewer', createdAt: '', votes: 0, sourceEvent: 'test', status: 'canon' }) }, () => published++, 10, idleClock);
  const chat = createChatCapture(idle.activity, () => {}, time.clock);
  idle.start(); time.advance(9000);
  chat.add({ id: 'ordinary', author: 'viewer', text: 'That chair has opinions.' });
  time.advance(9000); idleTick?.(); assert.equal(published, 0);
  chat.add({ id: 'bot', author: 'Canon', text: 'Canon: Chair.', ownBot: true });
  chat.add({ id: 'ordinary', author: 'viewer', text: 'That chair has opinions.' });
  time.advance(1000); idleTick?.(); assert.equal(published, 1);
  chat.close(); idle.stop();
});
