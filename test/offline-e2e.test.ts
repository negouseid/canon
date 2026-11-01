import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startFixture } from './process-fixture.js';

test('fresh env-example offline flow: seed, malformed/no-match commands, propose, approve, reveal, query, restart', { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-offline-'));
  writeFileSync(join(dir, '.env'), readFileSync('.env.example'));
  let fixture = await startFixture(dir); let socket: WebSocket | undefined;
  try {
    const health = await (await fetch(fixture.base + '/health')).json();
    assert.equal(health.canonCount, 8); assert.equal(health.twitchConnected, false); assert.equal(health.voiceMode, 'plain-text'); assert.equal(health.storage.persistent, true);
    const data = await (await fetch(fixture.base + '/api/panel')).json();
    const headers = { 'content-type': 'application/json', 'x-canon-csrf': data.csrf, origin: fixture.base };
    const command = async (text: string) => (await fetch(fixture.base + '/api/panel/rehearse', { method: 'POST', headers, body: JSON.stringify({ command: text }) })).json();
    assert.match((await command('!canon Unknown Thing')).reply, /No canon/);
    assert.match((await command('!canon add Missing colon')).reply, /term: definition/);
    assert.match((await command('!canon add : ')).reply, /term: definition/);
    assert.match((await command('!canon add '+ 'x'.repeat(101)+': oversized')).reply, /up to 100/);
    assert.match((await command('!canon add Offline lore: Everything still works.')).reply, /Proposed/);
    const pending = (await (await fetch(fixture.base + '/api/panel')).json()).pending;
    assert.equal(pending.length, 1);
    assert.match((await command('!canon Offline lore')).reply, /No canon/);
    socket = new WebSocket(fixture.base.replace('http:', 'ws:') + '/ws', { origin: fixture.base });
    await once(socket, 'open');
    const reveal = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('No reveal')), 3000);
      socket!.on('message', data => { const event = JSON.parse(String(data)); if (event.type === 'canonized') { clearTimeout(timer); resolve(event); } });
    });
    const reviewed = await fetch(fixture.base + '/api/panel/proposals/' + pending[0].id + '/review', { method: 'POST', headers, body: '{"action":"approve"}' });
    assert.equal(reviewed.status, 200); assert.equal((await reveal).entry.term, 'Offline lore');
    assert.match((await command('!canon Offline lore')).reply, /Everything still works/);
    socket.close(); await fixture.stop();
    fixture = await startFixture(dir);
    assert.equal((await (await fetch(fixture.base + '/health')).json()).canonCount, 9);
    const restarted = await (await fetch(fixture.base + '/api/canon')).json();
    assert.ok(restarted.some((entry: { term: string }) => entry.term === 'Offline lore'));
    assert.equal(fixture.output().includes('UnhandledPromiseRejection'), false);
  } finally { socket?.terminate(); await fixture.stop(); rmSync(dir, { recursive: true, force: true }); }
});

for (const mode of ['missing', 'malformed'] as const) test('enabled Twitch with ' + mode + ' token files leaves the process and offline demo usable', { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-auth-fault-'));
  if (mode === 'malformed') { mkdirSync(join(dir, 'data')); for (const role of ['bot', 'broadcaster']) writeFileSync(join(dir, 'data', 'twitch-' + role + '-token.json'), '{bad json'); }
  const fixture = await startFixture(dir, { TWITCH_ENABLED: 'true', TWITCH_CLIENT_ID: 'test-client', TWITCH_CLIENT_SECRET: 'test-secret', TWITCH_CHANNEL: 'channel', TWITCH_BOT_USERNAME: 'bot' });
  try {
    const status = await (await fetch(fixture.base + '/api/twitch/status')).json();
    assert.equal(status.connected, false); assert.equal(status.eventsub.ready, false);
    assert.match(status.message, mode === 'missing' ? /Authorize/ : /invalid|unreadable/);
    const response = await fetch(fixture.base + '/api/test-canonized', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    assert.equal((await (await fetch(fixture.base + '/health')).json()).canonCount, 8);
    assert.equal(fixture.output().includes('test-secret'), false);
  } finally { await fixture.stop(); rmSync(dir, { recursive: true, force: true }); }
});
