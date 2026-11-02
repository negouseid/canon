import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('actual panel script renders chat as text, keeps edited drafts across live refresh/failure/reselection, and saves only on submit', async () => {
  const nodes = new Map<string, any>();
  function element(tag: string) {
    return { tag, value: '', textContent: '', hidden: false, disabled: false, checked: false, className: '', children: [] as any[],
      setAttribute() {}, focus() {}, append(...items: any[]) { this.children.push(...items); }, replaceChildren(...items: any[]) { this.children = items; },
      set innerHTML(_value: string) { throw Error('Chat must render as plain text'); } };
  }
  const node = (id: string) => { if (!nodes.has(id)) nodes.set(id, element('div')); return nodes.get(id); };
  let messages = [{ id: 'one', author: 'viewer', text: '<img src=x onerror=alert(1)> The chair rules.', local: true }];
  let submissions: any[] = [], pending: any[] = [], failSave = true;
  const sockets: any[] = [];
  class Socket { onmessage?: (event: { data: string }) => void; constructor() { sockets.push(this); } }
  const response = (data: any, ok = true) => ({ ok, json: async () => data });
  const context = {
    document: { getElementById: node, createElement: element, createTextNode: (text: string) => ({ textContent: text }) },
    window: { addEventListener() {} }, location: { protocol: 'http:', host: 'localhost:3002', origin: 'http://localhost:3002' },
    WebSocket: Socket, AbortSignal, setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; },
    fetch: async (path: string, options: any) => {
      if (path === '/api/panel/chat') return response({ messages });
      if (path === '/api/panel') return response({ csrf: 'token', pending, canon: [], rejectedCount: 0, counts: { total: 0, session: 0 } });
      if (path === '/api/panel/voice') return response({ text: 'Voice', revision: 'revision' });
      if (path === '/api/twitch/status') return response({ eventsub: { subscriptions: {} } });
      if (path === '/api/panel/chat/capture') {
        assert.equal(options.headers['X-Canon-CSRF'], 'token');
        const body = JSON.parse(options.body); submissions.push(body);
        if (failSave) return response({ error: 'Storage temporarily unavailable. Retry.' }, false);
        const entry = { ...body, id: 1, author: 'Streamer (chat capture)', createdAt: '2026-11-02' }; pending = [entry];
        return response({ entry });
      }
      throw Error('Unexpected request: ' + path);
    }
  };
  runInNewContext(readFileSync('public/live-message.js', 'utf8') + '\n' + readFileSync('public/panel.js', 'utf8'), context);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  await flush();
  assert.equal(node('chatList').children.length, 1);
  const firstRow = node('chatList').children[0];
  assert.equal(firstRow.children[1].children[1].textContent, messages[0].text);
  assert.match(firstRow.children[1].children[0].textContent, /LOCAL REHEARSAL/);
  firstRow.children[0].checked = true; firstRow.children[0].onchange();
  node('draftChat').onclick(); assert.equal(node('captureForm').hidden, false);
  assert.equal(node('captureDefinition').value, messages[0].text);
  node('captureTerm').value = 'Chair Council'; node('captureDefinition').value = 'The chair holds the deciding vote.';
  messages = [...messages, { id: 'two', author: 'viewer2', text: 'Second vote for snacks.', local: false }];
  sockets[0].onmessage({ data: '{"type":"chat-changed"}' }); await flush();
  assert.equal(node('captureTerm').value, 'Chair Council'); assert.equal(node('captureDefinition').value, 'The chair holds the deciding vote.');
  assert.equal(submissions.length, 0); // Selecting and drafting do not save.
  await node('captureForm').onsubmit({ preventDefault() {} });
  assert.match(node('chatCaptureMessage').textContent, /Storage temporarily unavailable/);
  assert.equal(node('captureForm').hidden, false); assert.equal(node('captureDefinition').value, 'The chair holds the deciding vote.');
  node('reselectChatCapture').onclick();
  const newRow = node('chatList').children[0]; newRow.children[0].checked = true; newRow.children[0].onchange();
  node('draftChat').onclick(); assert.equal(node('captureDefinition').value, 'The chair holds the deciding vote.');
  assert.equal(node('captureTerm').value, 'Chair Council');
  failSave = false; await node('captureForm').onsubmit({ preventDefault() {} }); await flush();
  assert.deepEqual(submissions[1], { messageIds: ['two'], term: 'Chair Council', definition: 'The chair holds the deciding vote.' });
  assert.equal(node('captureForm').hidden, true); assert.equal(node('captureDefinition').value, '');
  assert.match(node('chatCaptureMessage').textContent, /pending proposal/);
  assert.equal(pending.length, 1); assert.equal(node('canonTotals').textContent, '0 total canon · 0 canonized this session');
});
