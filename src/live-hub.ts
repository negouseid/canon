import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { FastifyBaseLogger } from 'fastify';
import type { Store } from './store.js';
import type { LiveEvent } from './events.js';
import { createCanonCounts } from './canon-counts.js';

export function createLiveHub(server: Server, store: Store, port: number, log: Pick<FastifyBaseLogger, 'warn'>, counts = createCanonCounts(store)) {
  const ws = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  function send(client: WebSocket, event: LiveEvent) {
    if (client.readyState !== WebSocket.OPEN) return false;
    if (client.bufferedAmount > 1_000_000) { client.terminate(); return false; }
    try { client.send(JSON.stringify(event), error => { if (error) client.terminate(); }); return true; }
    catch { client.terminate(); return false; }
  }
  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => socket.destroy());
    const host = request.headers.host;
    if (request.url !== '/ws' || ![`localhost:${port}`, `127.0.0.1:${port}`].includes(host || '') || request.headers.origin !== `http://${host}`) { socket.destroy(); return; }
    try { ws.handleUpgrade(request, socket, head, client => ws.emit('connection', client, request)); }
    catch { socket.destroy(); }
  });
  const alive = new WeakSet<WebSocket>();
  ws.on('error', () => log.warn('Overlay WebSocket error; HTTP studio remains available.'));
  ws.on('connection', client => {
    alive.add(client); client.on('pong', () => alive.add(client));
    client.on('error', () => client.terminate());
    try { send(client, counts.snapshot()); }
    catch { client.close(1011, 'Storage unavailable; reconnecting'); }
  });
  const heartbeat = setInterval(() => {
    for (const client of ws.clients) {
      if (!alive.has(client)) { client.terminate(); continue; }
      alive.delete(client); send(client, { type: 'heartbeat' }); try { client.ping(); } catch { client.terminate(); }
    }
  }, 15_000); heartbeat.unref();
  return {
    publish(event: LiveEvent) { let count = 0; for (const client of ws.clients) if (send(client, event)) count++; return count; },
    close() { clearInterval(heartbeat); for (const client of ws.clients) client.terminate(); ws.close(); }
  };
}
