import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { TokenInfo, InvalidTokenError } from '@twurple/auth';
import { deadline, DeadlineError, readToken, validateToken, permanentFailure, ConfigurationError } from '../src/reliability.js';
import { createRuntimeStore, StorageUnavailable } from '../src/runtime-store.js';
import { handleCommand } from '../src/commands.js';

test('first run creates and seeds missing SQLite; restart does not duplicate entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-first-')); const path = join(dir, 'nested', 'lore.sqlite');
  try {
    const first = createRuntimeStore(path, true); assert.equal(first.status.persistent, true); assert.equal(first.store.list().length, 8); first.store.close();
    const second = createRuntimeStore(path, true); assert.equal(second.store.list().length, 8); second.store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('corrupt SQLite degrades to seeded memory without overwriting the original', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-corrupt-')); const path = join(dir, 'corrupt.sqlite');
  writeFileSync(path, 'not a sqlite database');
  try {
    const runtime = createRuntimeStore(path, true);
    assert.equal(runtime.status.persistent, false); assert.match(runtime.status.warning, /Temporary in-memory/);
    assert.equal(runtime.store.list().length, 8); assert.equal(readFileSync(path, 'utf8'), 'not a sqlite database');
    assert.match(handleCommand(runtime.store, '!canon add Resilient: We keep going.', 'demo', 'memory')!, /Proposed/);
    runtime.store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('runtime write lock returns a bounded recoverable error and preserves readable lore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-locked-')); const path = join(dir, 'lore.sqlite');
  const runtime = createRuntimeStore(path, true); const lock = new Database(path);
  try {
    lock.exec('BEGIN IMMEDIATE');
    assert.throws(() => runtime.store.add({ term: 'Locked', definition: 'Try again.', author: 'demo', sourceEvent: 'lock:test' }), StorageUnavailable);
    assert.equal(runtime.status.available, false); assert.equal(runtime.store.list().length, 8);
    lock.exec('ROLLBACK');
    assert.ok(runtime.store.add({ term: 'Recovered', definition: 'Still running.', author: 'demo', sourceEvent: 'lock:retry' }));
    assert.equal(runtime.status.available, true);
  } finally { lock.close(); runtime.store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('token parser rejects malformed data; validation repairs a revoked access token with a valid refresh token', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-token-')); const path = join(dir, 'token.json');
  const token = { accessToken: 'old', refreshToken: 'refresh', scope: ['chat:read'], expiresIn: 3600, obtainmentTimestamp: Date.now() };
  try {
    for (const text of ['not json', '{}', JSON.stringify({ ...token, refreshToken: null })]) {
      writeFileSync(path, text); assert.throws(() => readToken(path));
    }
    let refreshed = false;
    const info = new TokenInfo({ client_id: 'client', user_id: '123', login: 'bot', scopes: ['chat:read'], expires_in: 3600 });
    const result = await validateToken(token, 'client', 'secret', 'bot', ['chat:read'], {
      async getTokenInfo(access) { if (access === 'old') throw new InvalidTokenError(); return info; },
      async refreshUserToken() { refreshed = true; return { ...token, accessToken: 'new' }; }
    });
    assert.ok(refreshed); assert.equal(result.token.accessToken, 'new');
    await assert.rejects(validateToken(token, 'client', 'secret', 'wrong-account', ['chat:read'], {
      async getTokenInfo() { return info; }, async refreshUserToken() { return token; }
    }), ConfigurationError);
    assert.equal(permanentFailure(new InvalidTokenError()), true);
    assert.equal(permanentFailure({ statusCode: 503 }), false);
    await assert.rejects(deadline(new Promise<never>(() => {}), 20), DeadlineError);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
