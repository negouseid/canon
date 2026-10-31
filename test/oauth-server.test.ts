import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

test('OAuth HTTP flow binds state to a cookie, rejects callbacks, and keeps codes out of logs', { timeout: 15_000 }, async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const dir = mkdtempSync(join(tmpdir(), 'canon-oauth-'));
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), resolve('src/server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(port), DATABASE_PATH: ':memory:', TWITCH_ENABLED: 'true',
      TWITCH_CLIENT_ID: 'test-client', TWITCH_CLIENT_SECRET: 'test-secret', TWITCH_CHANNEL: 'testchannel',
      TWITCH_BOT_USERNAME: 'testbot', TWITCH_OAUTH_REDIRECT_URI: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  const base = `http://localhost:${port}`;
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw new Error('Test server exited before startup');
      try { if ((await fetch(base + '/health')).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready);
    assert.equal((await (await fetch(base + '/api/twitch/status')).json()).configured, true);
    const start = await fetch(base + '/auth/twitch/bot', { redirect: 'manual' });
    assert.equal(start.status, 302);
    const url = new URL(start.headers.get('location')!);
    assert.equal(url.origin, 'https://id.twitch.tv');
    assert.equal(url.searchParams.get('scope'), 'chat:read chat:edit');
    assert.equal(url.searchParams.get('redirect_uri'), base + '/auth/twitch/callback');
    const state = url.searchParams.get('state')!;
    const cookie = start.headers.get('set-cookie')!.split(';')[0];
    assert.match(start.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/);
    assert.equal((await fetch(base + '/auth/twitch/callback?state=' + state + '&code=do-not-log-this')).status, 400);
    const denied = await fetch(base + '/auth/twitch/callback?state=' + state + '&error=access_denied', { headers: { cookie } });
    assert.equal(denied.status, 400);
    assert.match(await denied.text(), /declined/);
    assert.equal((await fetch(base + '/auth/twitch/callback?state=' + state, { headers: { cookie } })).status, 400);
    assert.equal(logs.includes('do-not-log-this'), false);
    assert.equal(logs.includes('test-secret'), false);
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
