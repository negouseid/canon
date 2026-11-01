import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';

export async function startFixture(cwd: string, settings: Record<string, string> = {}) {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), resolve('src/server.ts')], {
    cwd, env: { ...process.env, PORT: String(port), TWITCH_ENABLED: 'false', OPENAI_API_KEY: '', ...settings }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(kill); }
  }
  try {
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw Error('Fixture exited: ' + output);
      try { const response = await fetch(base + '/health', { signal: AbortSignal.timeout(1000) }); if (response.ok) return { base, stop, output: () => output }; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Fixture did not start: ' + output);
  } catch (error) { await stop(); throw error; }
}
