import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withTestServer(action, port = 3125, options = {}) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temp = await mkdtemp(join(tmpdir(), 'greenrev-web-check-'));
  const base = 'http://127.0.0.1:' + port;
  const environment = { ...process.env, GREENREV_DEMO: '1',
      GREENREV_DEMO_DB: join(temp, 'demo.sqlite'), GREENREV_NEXT_DIST: '.next-smoke-' + port,
      NEXT_TELEMETRY_DISABLED: '1' };
  if (options.pinOrigin === true) environment.GREENREV_DEMO_ORIGIN = base;
  else delete environment.GREENREV_DEMO_ORIGIN;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'web', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = ''; server.stdout.on('data', d => { log = (log + d).slice(-12000); }); server.stderr.on('data', d => { log = (log + d).slice(-12000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      try { const response = await fetch(base + '/api/saas/session', { signal: AbortSignal.timeout(3000) }); if (response.ok) { ready = true; break; } }
      catch {}
      if (server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Test server did not become ready.\n' + log);
    return await action(base);
  } catch (error) { process.stderr.write(log + '\n'); throw error; }
  finally { server.kill('SIGTERM'); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 3000); } }); await rm(temp, { recursive: true, force: true }); }
}
