import { spawnSync } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const checks = [];
await mkdir(root + 'docs/evidence', { recursive: true });
async function run(name, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  const output = (result.stdout || '') + (result.stderr || '');
  await writeFile(root + 'docs/evidence/' + name + '.log', output);
  checks.push({ name, passed: result.status === 0, exit_code: result.status });
  process.stdout.write((result.status === 0 ? 'PASS ' : 'FAIL ') + name + '\n');
  if (result.status !== 0) { process.stderr.write(output.slice(-10000)); throw new Error(name + ' failed'); }
  return output;
}
await run('typescript-build', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json']);
const tests = (await readdir(root + 'dist/tests')).filter(f => f.endsWith('.test.js')).map(f => 'dist/tests/' + f);
const output = await run('unit-tests', ['--test', '--test-reporter=tap', ...tests]);
await run('frontend-types', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'web/tsconfig.json']);
await run('next-production-build', ['node_modules/next/dist/bin/next', 'build', 'web']);
await run('next-http-smoke', ['scripts/http-smoke.mjs']);
if (process.env.RUN_BROWSER_CHECKS === '1') {await run('browser-scenarios', ['scripts/browser-smoke.mjs']);await run('browser-restored-workflows',['scripts/browser-restoration.mjs']);}
await writeFile(root + 'docs/evidence/verification.json', JSON.stringify({ completed_at: new Date().toISOString(),
  node: process.version, tests: Number(/^# tests (\d+)/m.exec(output)?.[1] ?? 0),
  passed_tests: Number(/^# pass (\d+)/m.exec(output)?.[1] ?? 0), failed_tests: Number(/^# fail (\d+)/m.exec(output)?.[1] ?? 0), checks,
  release:'0.5.0',local_marketplace_e2e_tested:process.env.RUN_BROWSER_CHECKS==='1',live_main_marketplace_tested:false,live_postgresql_tested: false, live_paystack_tested: false, live_sso_tested: false, deployed: false }, null, 2) + '\n');
