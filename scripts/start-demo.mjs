import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'web', '--hostname', '127.0.0.1', '--port', '3100'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, GREENREV_DEMO: '1', NEXT_TELEMETRY_DISABLED: '1' }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code || 0; });
