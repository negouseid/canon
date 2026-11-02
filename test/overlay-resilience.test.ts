import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('actual overlay script ignores malformed messages, keeps ticker running offline, and reconnects', () => {
  let now = 0, nextTimer = 0;
  const timers = new Map<number, { at: number; callback: () => void; interval: number }>();
  const setTimer = (callback: () => void, delay: number, interval = 0) => { const id = ++nextTimer; timers.set(id, { at: now + delay, callback, interval }); return id; };
  const advance = (milliseconds: number) => { const target = now + milliseconds; for (;;) { const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; now = due[1].at; timers.delete(due[0]); if (due[1].interval) timers.set(due[0], { ...due[1], at: now + due[1].interval }); due[1].callback(); } now = target; };
  const nodes = new Map<string, any>();
  const node = (id: string) => { if (!nodes.has(id)) nodes.set(id, { textContent: '', className: '', style: {}, offsetWidth: 1, classList: { add() {}, remove() {} }, setAttribute() {}, append(...values: unknown[]) { this.children = values; }, replaceChildren() {} }); return nodes.get(id); };
  const sockets: any[] = [];
  class Socket { onopen?: () => void; onclose?: () => void; onmessage?: (event: { data: string }) => void; closed = false; constructor() { sockets.push(this); } close() { if (!this.closed) { this.closed = true; this.onclose?.(); } } }
  const context = {
    document: { getElementById: node, querySelector: node, body: node('body'), createElement: node, createTextNode: (text: string) => text },
    location: { search: '?preview', protocol: 'http:', host: 'localhost:3000' }, URLSearchParams,
    innerWidth: 1920, innerHeight: 1080, addEventListener() {}, WebSocket: Socket,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback: () => void, delay: number) => setTimer(callback, delay),
    setInterval: (callback: () => void, delay: number) => setTimer(callback, delay, delay),
    clearInterval: (id: number) => timers.delete(id)
  };
  const shared = readFileSync('public/live-message.js', 'utf8');
  const html = readFileSync('public/overlay.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(shared + '\n' + script, context);
  const first = sockets[0]; first.onopen();
  for (const data of ['not json', 'null', '{"type":"snapshot","entries":null}', '{"type":"canonized","entry":null}']) assert.doesNotThrow(() => first.onmessage({ data }));
  const entry = { term: 'Safe lore', definition: 'The overlay keeps going.', author: 'viewer' };
  first.onmessage({ data: JSON.stringify({ type: 'snapshot', entries: [null, entry] }) });
  first.onmessage({ data: JSON.stringify({ type: 'community', kind: 'lore', text: 'Remember this? Safe lore' }) });
  assert.equal(node('lore').textContent, 'Remember this? Safe lore');
  first.onmessage({ data: JSON.stringify({ type: 'canonized', entry }) });
  assert.equal(node('lore').textContent, 'Remember this? Safe lore');
  assert.equal(node('term').textContent, 'Safe lore'); assert.equal(node('reveal').className, 'reveal active');
  advance(10_000); assert.equal(node('reveal').className, 'reveal');
  first.close(); advance(1000); assert.equal(sockets.length, 2);
  advance(12_000); assert.ok(node('lore').children.length > 0);
  const second = sockets[1]; second.onopen(); advance(40_000);
  assert.ok(second.closed); assert.ok(sockets.length >= 3);
});
