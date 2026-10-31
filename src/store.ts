import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Entry {
  id: number; term: string; definition: string; author: string;
  createdAt: string; votes: number; sourceEvent: string;
  status: 'pending' | 'canon' | 'rejected';
}
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
  ); CREATE INDEX IF NOT EXISTS entries_status ON entries(status, id);`);
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
    close() { db.close(); }
  };
}
export type Store = ReturnType<typeof openStore>;
