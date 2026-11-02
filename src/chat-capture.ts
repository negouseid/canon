export interface ChatMessage {
  id: string; author: string; text: string; receivedAt: number; local: boolean;
}
type Timer = ReturnType<typeof setTimeout>;
export interface ChatClock {
  now(): number;
  later(callback: () => void, milliseconds: number): Timer;
  cancel(timer: Timer): void;
}
const clock: ChatClock = { now: Date.now, later: setTimeout, cancel: clearTimeout };
/** Ephemeral context only. Selected lore is persisted separately through the panel. */
export function createChatCapture(onActivity: () => void = () => {}, onChange: () => void = () => {}, time: ChatClock = clock) {
  let messages: ChatMessage[] = [], notification: Timer | undefined;
  const prune = () => { messages = messages.filter(message => message.receivedAt > time.now() - 10 * 60_000).slice(-50); };
  return {
    add(input: { id: string; author: string; text: string; local?: boolean; ownBot?: boolean }) {
      if (input.ownBot || !input.id || input.id.length > 200 || !input.author.trim() || input.author.length > 80 ||
          !input.text.trim() || input.text.length > 500 || /[\x00-\x1f\x7f]/.test(input.text)) return;
      prune();
      if (messages.some(message => message.id === input.id)) return;
      const message: ChatMessage = { id: input.id, author: input.author, text: input.text.trim(), receivedAt: time.now(), local: input.local === true };
      messages.push(message); prune(); onActivity();
      // Coalesce busy chat without putting raw messages on the overlay's socket.
      if (!notification) {
        notification = time.later(() => { notification = undefined; onChange(); }, 250);
        notification.unref();
      }
      return { ...message };
    },
    list() { prune(); return messages.map(message => ({ ...message })); },
    close() { if (notification) time.cancel(notification); notification = undefined; messages = []; }
  };
}
export type ChatCapture = ReturnType<typeof createChatCapture>;
