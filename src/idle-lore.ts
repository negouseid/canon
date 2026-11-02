import type { LiveEvent, Publish } from './events.js';
import type { Store } from './store.js';

type Timer = ReturnType<typeof setInterval>;
export interface IdleClock {
  now(): number;
  every(callback: () => void, milliseconds: number): Timer;
  cancel(timer: Timer): void;
}
const clock: IdleClock = { now: () => Date.now(), every: setInterval, cancel: clearInterval };
export function idleLoreSeconds(raw: string | undefined): number {
  if (raw === undefined || !raw.trim()) return 180;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 && Number.isSafeInteger(seconds * 1000) ? seconds : 180;
}

export function createIdleLore(store: Pick<Store, 'random'>, publish: Publish, seconds: number, time: IdleClock = clock) {
  const gap = seconds * 1000;
  let timer: Timer | undefined;
  let nextAttempt = time.now() + gap;
  const activity = () => { nextAttempt = time.now() + gap; };
  return {
    activity,
    observe(event: LiveEvent) {
      if (event.type === 'canonized' || event.type === 'community') activity();
    },
    start() {
      if (gap <= 0 || timer) return;
      activity();
      timer = time.every(() => {
        if (time.now() < nextAttempt) return;
        // Empty stores and failures get another full gap, rather than a hot retry loop.
        nextAttempt = time.now() + gap;
        try {
          const entry = store.random();
          if (!entry) return;
          publish({ type: 'community', kind: 'lore', text: `Remember this? ${entry.term} — ${entry.definition}` });
          activity();
        } catch { /* Keep the overlay/server alive if storage or delivery is unavailable. */ }
      }, Math.min(1000, gap));
      timer.unref();
    },
    stop() { if (timer) time.cancel(timer); timer = undefined; }
  };
}
