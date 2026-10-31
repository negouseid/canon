import { randomBytes } from 'node:crypto';

export function createOAuthStates(now = () => Date.now()) {
  const states = new Map<string, number>();
  return {
    issue() {
      for (const [key, expires] of states) if (expires <= now()) states.delete(key);
      if (states.size >= 100) states.delete(states.keys().next().value!);
      const state = randomBytes(32).toString('hex');
      states.set(state, now() + 10 * 60_000);
      return state;
    },
    consume(state: string, cookie: string | undefined) {
      const expires = states.get(state);
      if (!expires || state !== cookie) return false;
      states.delete(state);
      return expires > now();
    }
  };
}
