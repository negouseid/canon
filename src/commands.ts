import type { Store } from './store.js';

/** Replies start with Canon:, so commands from the bot account are safe to accept. */
export function isCanonCommand(text: string): boolean {
  return /^!(canon(?:\s|$)|lore$)/i.test(text.trim());
}

/** Return a response only for recognized commands. Proposals never become canon here. */
export function handleCommand(store: Store, text: string, author: string, messageId: string): string | undefined {
  const input = text.trim();
  if (/^!lore$/i.test(input)) {
    const entry = store.random();
    return entry ? `Channel history: ${entry.term} — ${entry.definition}` : 'Our history is unwritten. Propose lore with !canon add term: definition';
  }
  const match = /^!canon(?:\s+([\s\S]*))?$/i.exec(input);
  if (!match) return;
  const argument = match[1]?.trim() || '';
  if (!argument) return 'Use !canon <term>, !canon add <term>: <definition>, or !lore.';
  if (/^add(?:\s|$)/i.test(argument)) {
    const proposal = argument.slice(3).trim();
    const colon = proposal.indexOf(':');
    const term = proposal.slice(0, colon).trim();
    const definition = proposal.slice(colon + 1).trim();
    if (colon < 1 || !term || !definition) return 'Propose lore with !canon add term: definition';
    if (term.length > 100 || definition.length > 1000) return 'Keep the term under 101 characters and its definition under 1001.';
    if (!messageId) return 'Could not identify that message. Please try again.';
    const entry = store.add({ term, definition, author, sourceEvent: `chat:${messageId}` });
    return entry ? `Proposed “${entry.term}” (#${entry.id}). Waiting for canonization.` : undefined;
  }
  if (argument.length > 100) return 'Canon terms can contain up to 100 characters.';
  const entry = store.query(argument);
  return entry ? `${entry.term}: ${entry.definition}` : `No canon for “${argument}” yet. Propose it with !canon add term: definition`;
}

export function chatText(text: string): string {
  return `Canon: ${text.replace(/[\r\n\x00-\x1f]/g, ' ')}`.slice(0, 450);
}
