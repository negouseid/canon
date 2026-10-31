import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { seed } from '../src/seed.js';
test('canon persists across restart; proposals stay private; source events deduplicate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canon-'));
  const path = join(dir, 'canon.sqlite');
  let store = openStore(path);
  try {
    seed(store); seed(store); assert.equal(store.list().length, 8);
    const input = { term: 'Moon cheese', definition: 'The moon is our snack sponsor.', author: 'viewer', sourceEvent: 'chat:123' };
    const entry = store.add(input)!;
    assert.equal(store.query('moon cheese'), undefined);
    assert.equal(store.add(input), undefined);
    assert.equal(store.review(entry.id, 'canon')?.status, 'canon');
    assert.equal(store.review(entry.id, 'canon'), undefined);
    store.close(); store = openStore(path);
    assert.equal(store.query('MOON CHEESE')?.definition, input.definition);
    assert.equal(store.list().length, 9);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
