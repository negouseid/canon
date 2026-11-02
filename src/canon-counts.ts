import type { Store } from './store.js';

export interface CanonCounts { total: number; session: number }
export function createCanonCounts(store: Pick<Store, 'list'>) {
  let session = 0;
  return {
    recordCanonization() { session = Math.min(Number.MAX_SAFE_INTEGER, session + 1); },
    read(): CanonCounts { return { total: store.list().length, session }; },
    snapshot() {
      const entries = store.list();
      return { type: 'snapshot' as const, entries, counts: { total: entries.length, session } };
    }
  };
}
export type CanonCountState = ReturnType<typeof createCanonCounts>;
