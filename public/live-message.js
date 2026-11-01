// Shared by the overlay and studio. Ignore damaged/unexpected messages without stopping timers.
globalThis.CanonLive = {
  parse(data) {
    try {
      const event = JSON.parse(data);
      if (!event || typeof event !== 'object') return null;
      const entry = value => value && typeof value.term === 'string' && value.term.length <= 100 &&
        typeof value.definition === 'string' && value.definition.length <= 1000 && typeof value.author === 'string';
      if (event.type === 'heartbeat' || event.type === 'pending-changed') return event;
      if (event.type === 'snapshot' && Array.isArray(event.entries)) return { ...event, entries: event.entries.filter(entry) };
      if (event.type === 'canonized' && entry(event.entry)) return event;
      if (event.type === 'community' && typeof event.text === 'string' && event.text.length <= 2000) return event;
    } catch { /* Keep displaying last-known lore. */ }
    return null;
  }
};
