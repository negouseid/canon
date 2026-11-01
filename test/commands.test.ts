import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';
import { handleCommand, chatText, isCanonCommand } from '../src/commands.js';
import { createOAuthStates } from '../src/oauth-state.js';

test('chat commands persist proposals, hide pending lore, and deduplicate message delivery', () => {
  const store = openStore(':memory:');
  try {
    assert.equal(handleCommand(store, 'hello chat', 'viewer', 'a'), undefined);
    assert.match(handleCommand(store, '!lore', 'viewer', 'b')!, /unwritten/);
    assert.match(handleCommand(store, '!canon add Door: The final boss: push.', 'viewer', 'c')!, /Waiting/);
    assert.equal(handleCommand(store, '!canon add Door: The final boss: push.', 'viewer', 'c'), undefined);
    assert.equal(store.list('pending').length, 1);
    assert.match(handleCommand(store, '!canon door', 'viewer', 'd')!, /No canon/);
    const pending = store.list('pending')[0];
    assert.equal(pending.author, 'viewer');
    assert.equal(pending.sourceEvent, 'chat:c');
    store.review(pending.id, 'canon');
    assert.equal(handleCommand(store, '!CANON DOOR', 'viewer', 'e'), 'Door: The final boss: push.');
    assert.match(handleCommand(store, '!lore', 'viewer', 'f')!, /The final boss: push/);
    for (const bad of ['!canon add : empty', '!canon add missing', '!canon add term: ', '!canon add '+ 'x'.repeat(101)+': too long']) {
      handleCommand(store, bad, 'viewer', 'g');
      assert.equal(store.list('pending').length, 0);
    }
    assert.ok(chatText('/ban someone\nnew line').startsWith('Canon: '));
    assert.equal(chatText('x'.repeat(1000)).length, 450);
    assert.ok(!chatText('x\ny').includes('\n'));
  } finally { store.close(); }
});

test('OAuth state is browser-bound, single-use, and expires after ten minutes', () => {
  let now = 0;
  const states = createOAuthStates(() => now);
  const first = states.issue();
  assert.equal(states.consume(first, 'other-browser'), false);
  assert.equal(states.consume(first, first), true);
  assert.equal(states.consume(first, first), false);
  const second = states.issue();
  now = 600_001;
  assert.equal(states.consume(second, second), false);
  assert.equal(states.consume('invented', 'invented'), false);
});

test('same-account commands are accepted while bot replies never trigger a command loop', () => {
  const store = openStore(':memory:');
  try {
    store.add({ term: 'The Chair Council', definition: 'The chair rules.', author: 'demo', sourceEvent: 'seed:test' }, 'canon');
    const command = '!canon The Chair Council';
    assert.equal(isCanonCommand(command), true);
    const reply = handleCommand(store, command, 'neverstreaminggoo', 'self-test')!;
    assert.equal(reply, 'The Chair Council: The chair rules.');
    assert.equal(isCanonCommand(chatText(reply)), false);
    assert.equal(isCanonCommand(chatText('!lore')), false);
    assert.equal(isCanonCommand('!canonical'), false);
  } finally { store.close(); }
});
