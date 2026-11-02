import type { Entry, Store } from './store.js';
import { createCanonCounts, type CanonCounts } from './canon-counts.js';
export type LiveEvent =
  | { type: 'canonized'; entry: Entry; test?: boolean }
  | { type: 'snapshot'; entries: Entry[]; counts?: CanonCounts }
  | { type: 'pending-changed' }
  | { type: 'chat-changed' }
  | { type: 'heartbeat' }
  | { type: 'community'; kind: 'raid' | 'subscription' | 'lore'; text: string };
export type Publish = (event: LiveEvent) => void;

export function createEventHandlers(store: Store, rewardTitle: string, publish: Publish, counts = createCanonCounts(store)) {
  return {
    redemption(event: { id: string; rewardTitle: string; input: string; userName: string; status: string }) {
      if (event.rewardTitle !== rewardTitle || event.status.toLowerCase() === 'canceled') return;
      const result = store.canonize({ id: event.id, input: event.input, author: event.userName });
      if (result.kind === 'canonized') {
        counts.recordCanonization();
        publish({ type: 'canonized', entry: result.entry });
        publish(counts.snapshot());
        publish({ type: 'pending-changed' });
      }
      return result;
    },
    raid(event: { raidingBroadcasterDisplayName: string; viewers: number }) {
      const lore = store.random();
      publish({ type: 'community', kind: 'raid', text: `Welcome ${event.viewers} raiders from ${event.raidingBroadcasterDisplayName}! ${lore ? `Our lore: ${lore.term} — ${lore.definition}` : 'Help us write channel history.'}` });
    },
    subscription(event: { userDisplayName: string; isGift: boolean }) {
      publish({ type: 'community', kind: 'subscription', text: `${event.userDisplayName} ${event.isGift ? 'joined through a gift sub' : 'subscribed'} — another chapter in channel history. Welcome to the canon!` });
    }
  };
}
