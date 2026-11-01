import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { withTestServer } from './test-server.mjs';

const evidence = [];
await withTestServer(async base => {
  const sessionResponse = await fetch(base + '/api/saas/session');
  assert.equal(sessionResponse.status, 200);
  const cookie = sessionResponse.headers.get('set-cookie').split(';')[0]; const session = await sessionResponse.json();
  for (const [origin, csrf] of [['https://attacker.example', session.csrf], [base, 'incorrect-token']]) {
    const refused = await fetch(base + '/api/saas/demo/session', { method: 'POST', headers: { Cookie: cookie, Origin: origin,
      'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ profile: 'parts' }) });
    assert.equal(refused.status, 403);
  }
  evidence.push({ external_origins_and_invalid_csrf_refused: true, origin_configuration: 'normal unpinned startup' });
  const call = async (path, body) => {
    const result = await fetch(base + '/api/saas' + path, { method: body ? 'POST' : 'GET',
      headers: { Cookie: cookie, ...(body ? { Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf, 'Idempotency-Key': randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: result.status, data: await result.json() };
  };
  for (const [profile, expected] of [['rentals', ['RENTAL']], ['parts', ['PARTS']], ['dealer', ['DEALER']], ['haulage', ['HAULAGE']], ['mixed', ['DEALER', 'PARTS', 'RENTAL', 'HAULAGE', 'MECHANIC']]]) {
    assert.equal((await call('/demo/session', { profile })).status, 200); const view = await call('/workspace'); assert.equal(view.status, 200);
    assert.deepEqual(view.data.navigation.map(n => n.module), expected); evidence.push({ profile, modules: expected, passed: true });
  }
  await call('/demo/session', { profile: 'parts' }); assert.equal((await call('/rentals', {})).status, 403);
  await call('/demo/session', { profile: 'driver' }); const driver = (await call('/workspace')).data;
  assert.equal(driver.reports, null); assert.deepEqual(driver.parties, []); evidence.push({ driver_financial_isolation: true });
  await call('/demo/session', { profile: 'new' }); assert.equal((await call('/workspace')).data.needs_onboarding, true);
  assert.equal((await call('/onboarding', { name: 'Smoke-test rental business', modules: ['RENTAL'], primary_module: 'RENTAL' })).status, 200);
  assert.deepEqual((await call('/workspace')).data.navigation.map(n => n.module), ['RENTAL']); evidence.push({ new_subscriber_selection: true });
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /GreenRev/); evidence.push({ next_page_response: 200 });
});
await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/http-smoke.json', JSON.stringify({ completed_at: new Date().toISOString(), checks: evidence }, null, 2) + '\n');
process.stdout.write('PASS: real Next.js routes, five business profiles, driver isolation and new-subscriber onboarding.\n');
