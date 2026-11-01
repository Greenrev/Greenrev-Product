import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mountGreenRevSaas } from '../src/modular/host.js';
import { ModularSaasService } from '../src/modular/service.js';
import { SqliteStore } from '../src/modular/stores.js';
import { fixture } from './modular-helpers.js';

test('host mount uses existing identity and CSRF, provides a non-demo session and refuses unsigned provider ingress', async () => {
  const store = new SqliteStore(':memory:'); const owner = { id: 'owner', tenantId: 'host', role: 'OWNER' as const, branches: ['host-MAIN'] };
  const host = mountGreenRevSaas({ store, origin: 'https://business.example', resolvePrincipal: async () => owner,
    verifyCsrf: async r => r.headers.get('X-CSRF-Token') === 'trusted-csrf', getCsrfToken: async () => 'trusted-csrf', verifyStaffSubject: async () => false });
  const session = await host.GET(new Request('https://business.example/api/saas/session'));
  assert.deepEqual(await session.json(), { csrf: 'trusted-csrf', demo: false, profile: '', profiles: [] });
  assert.equal((await host.POST(new Request('https://business.example/api/saas/webhooks/paystack', { method: 'POST', body: '{}' }))).status, 503);
  const onboard = await host.POST(new Request('https://business.example/api/saas/onboarding', { method: 'POST', headers: {
    Origin: 'https://business.example', 'Content-Type': 'application/json', 'X-CSRF-Token': 'trusted-csrf', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ name: 'Host business', modules: ['PARTS'], primary_module: 'PARTS' }) }));
  assert.equal(onboard.status, 200); store.close();
});
test('asynchronous identity-directory rejection cannot accidentally grant staff membership', async () => {
  const f = await fixture(); const service = new ModularSaasService(f.store, { now: f.clock.now, verifyStaffSubject: async () => false });
  await assert.rejects(service.run(f.owner, 'POST', '/api/staff/memberships', { subject_id: 'unknown', role: 'RENTAL_AGENT', modules: ['RENTAL'], branch_id: f.branch }, randomUUID()), /must verify/);
  assert.equal((await f.state()).members.length, 1); f.store.close();
});
test('an accountant assigned to Rentals cannot read Parts journals through combined reports', async () => {
  const f = await fixture(['RENTAL', 'PARTS']);
  await f.post('/api/staff/memberships', { subject_id: 'rental-accountant', role: 'ACCOUNTANT', modules: ['RENTAL'], branch_id: f.branch });
  const p = await f.post('/api/parts', { branch_id: f.branch, sku: 'PRIVATE', name: 'Private parts stock', asking_price: '200' });
  await f.post('/api/parts/' + p.id + '/receive', { version: 1, supplier_id: f.supplier.id, quantity: 1, cost: '100' });
  const accountant = { id: 'rental-accountant', tenantId: f.tenant, role: 'ACCOUNTANT' as const, branches: [f.branch] };
  const report = await f.get('/api/reports', {}, accountant); assert.equal(report.parts_inventory_minor, 0); assert.equal(report.payable_minor, 0);
  await assert.rejects(f.get('/api/reports', { module: 'PARTS' }, accountant), /module.*access/); f.store.close();
});
