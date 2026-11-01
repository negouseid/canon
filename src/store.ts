import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Entry {
  id: number; term: string; definition: string; author: string;
  createdAt: string; votes: number; sourceEvent: string;
  status: 'pending' | 'canon' | 'rejected';
}
export type RedemptionResult = { kind: 'canonized'; entry: Entry } | { kind: 'duplicate' } | { kind: 'rejected'; reason: string };
export interface Redemption { id: string; input: string; author: string }
export type NewEntry = Pick<Entry, 'term' | 'definition' | 'author' | 'sourceEvent'>;
export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY, term TEXT NOT NULL CHECK(length(trim(term)) BETWEEN 1 AND 100),
    definition TEXT NOT NULL CHECK(length(trim(definition)) BETWEEN 1 AND 1000),
    author TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    votes INTEGER NOT NULL DEFAULT 0, sourceEvent TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','canon','rejected'))
  ); CREATE INDEX IF NOT EXISTS entries_status ON entries(status, id);
    CREATE TABLE IF NOT EXISTS event_receipts (
      id TEXT PRIMARY KEY, entryId INTEGER REFERENCES entries(id), outcome TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );`);
  const canonize = db.transaction((event: Redemption): RedemptionResult => {
    const source = `redemption:${event.id}`;
    const claimed = db.prepare("INSERT INTO event_receipts(id, outcome) VALUES (?, 'processing') ON CONFLICT(id) DO NOTHING").run(source);
    if (!claimed.changes) return { kind: 'duplicate' };
    const reject = (reason: string): RedemptionResult => {
      db.prepare('UPDATE event_receipts SET outcome = ? WHERE id = ?').run(reason, source);
      return { kind: 'rejected', reason };
    };
    let entry: Entry | undefined;
    const input = event.input.trim();
    if (!input || input.toLowerCase() === 'latest') {
      entry = db.prepare("SELECT * FROM entries WHERE status = 'pending' ORDER BY id DESC LIMIT 1").get() as Entry | undefined;
      if (!entry) return reject('No pending proposal. Submit !canon add term: definition first, or redeem with term: definition.');
      entry = db.prepare("UPDATE entries SET status = 'canon' WHERE id = ? RETURNING *").get(entry.id) as Entry;
    } else {
      const colon = input.indexOf(':');
      const term = input.slice(0, colon).trim(), definition = input.slice(colon + 1).trim();
      if (colon < 1 || !term || !definition || term.length > 100 || definition.length > 1000) return reject('Use term: definition (term up to 100 characters; definition up to 1000), or latest.');
      entry = db.prepare("INSERT INTO entries(term, definition, author, sourceEvent, status) VALUES (?, ?, ?, ?, 'canon') RETURNING *")
        .get(term, definition, event.author, source) as Entry;
    }
    db.prepare("UPDATE event_receipts SET entryId = ?, outcome = 'canonized' WHERE id = ?").run(entry.id, source);
    return { kind: 'canonized', entry };
  });
  return {
    add(input: NewEntry, status: Entry['status'] = 'pending') {
      const result = db.prepare('INSERT INTO entries (term, definition, author, sourceEvent, status) VALUES (?, ?, ?, ?, ?) ON CONFLICT(sourceEvent) DO NOTHING')
        .run(input.term.trim(), input.definition.trim(), input.author, input.sourceEvent, status);
      return result.changes ? db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid) as Entry : undefined;
    },
    list(status: Entry['status'] = 'canon') { return db.prepare('SELECT * FROM entries WHERE status = ? ORDER BY id DESC').all(status) as Entry[]; },
    query(term: string) { return db.prepare("SELECT * FROM entries WHERE status = 'canon' AND term = ? COLLATE NOCASE ORDER BY id DESC LIMIT 1").get(term.trim()) as Entry | undefined; },
    random() { return db.prepare("SELECT * FROM entries WHERE status = 'canon' ORDER BY random() LIMIT 1").get() as Entry | undefined; },
    review(id: number, status: 'canon' | 'rejected') { return db.prepare("UPDATE entries SET status = ? WHERE id = ? AND status = 'pending' RETURNING *").get(status, id) as Entry | undefined; },
    canonize(event: Redemption) {
      if (!event.id.trim()) throw new Error('Redemption ID is required');
      return canonize(event);
    },
    close() { db.close(); }
  };
}
export type Store = ReturnType<typeof openStore>;
