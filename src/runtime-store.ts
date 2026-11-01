import { openStore, type Entry, type Store } from './store.js';
import { seed } from './seed.js';

export class StorageUnavailable extends Error {}
export function createRuntimeStore(path: string, shouldSeed: boolean) {
  const status = { mode: 'persistent', persistent: path !== ':memory:', available: true, warning: '' };
  let disk: Store;
  let opened: Store | undefined;
  try { disk = opened = openStore(path); if (shouldSeed) seed(disk); }
  catch {
    try { opened?.close(); } catch { /* Preserve a failed database for repair. */ }
    disk = openStore(':memory:'); seed(disk);
    status.mode = 'memory'; status.persistent = false;
    status.warning = 'Database could not be opened or seeded. Temporary in-memory demo mode: changes will not survive restart. Original files were left in place.';
  }
  if (path === ':memory:') { status.mode = 'memory'; status.persistent = false; }
  const cache: Record<Entry['status'], Entry[]> = { canon: [], pending: [], rejected: [] };
  const failed = () => { status.available = false; status.warning = 'Storage is temporarily unavailable. Showing last-known lore; writes are paused. Check database permissions, disk space, or locks.'; };
  const list = (state: Entry['status'] = 'canon') => {
    try { cache[state] = disk.list(state); } catch { failed(); }
    return cache[state];
  };
  const refresh = () => { list('canon'); list('pending'); list('rejected'); };
  refresh();
  function write<T>(operation: () => T): T {
    let result: T;
    try { result = operation(); }
    catch { failed(); throw new StorageUnavailable('Storage is temporarily unavailable. No successful write is claimed; please retry.'); }
    status.available = true;
    status.warning = status.mode === 'persistent' ? '' : 'Temporary in-memory demo mode: changes will not survive restart. Original files were left in place.';
    refresh(); return result;
  }
  const store: Store = {
    add: (input, state) => write(() => disk.add(input, state)), list,
    query(term) { try { return disk.query(term); } catch { failed(); return cache.canon.find(entry => entry.term.toLowerCase() === term.trim().toLowerCase()); } },
    random() { try { return disk.random(); } catch { failed(); return cache.canon[Math.floor(Math.random() * cache.canon.length)]; } },
    review: (id, state) => write(() => disk.review(id, state)),
    canonize: event => write(() => disk.canonize(event)),
    close() { try { disk.close(); } catch { /* Keep shutdown safe after storage failure. */ } }
  };
  return { store, status };
}
