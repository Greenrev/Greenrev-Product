import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ModularSaasService } from '../src/modular/service.js';
import { SqliteStore } from '../src/modular/stores.js';
import type { Principal } from '../src/v3-rules.js';
import type { BusinessModule, Catalogue, Quote, WorkspaceState } from '../src/modular/model.js';
import { fixture } from './modular-helpers.js';

test('registration has no forced dealer/parts modules and persists only the selected rental activity', async () => {
  const f = await fixture(); const s = await f.state();
  assert.deepEqual(s.selected_modules, ['RENTAL']); assert.deepEqual(s.software_history, ['RENTAL']);
  const view = await f.get(); assert.deepEqual((view.navigation as { module: string }[]).map(n => n.module), ['RENTAL']);
  await assert.rejects(f.post('/api/vehicles', {}), /module.*access/); f.store.close();
});
test('multi-select gives exactly the subscribed workspaces; auction cannot be selected', async () => {
  const f = await fixture(['DEALER', 'RENTAL', 'PARTS']);
  assert.deepEqual((await f.get()).navigation && (await f.state()).selected_modules, ['DEALER', 'PARTS', 'RENTAL']);
  const other = new SqliteStore(':memory:'), app = new ModularSaasService(other);
  const owner = { id: 'o', tenantId: 'new', role: 'OWNER' as const, branches: ['new-MAIN'] };
  await assert.rejects(app.run(owner, 'POST', '/api/onboarding', { name: 'New', modules: ['AUCTION'], primary_module: 'AUCTION' }, randomUUID()), /unavailable/);
  other.close(); f.store.close();
});
test('parts-only owner sees parts, with rental and vehicle mutation refused by the server', async () => {
  const f = await fixture(['PARTS']);
  assert.deepEqual((await f.get()).navigation && (await f.state()).software_history, ['PARTS']);
  await assert.rejects(f.fleet('RENTAL'), /module.*access/);
  await assert.rejects(f.post('/api/vehicles', {}), /module.*access/); f.store.close();
});
test('expired and cancelled subscriptions preserve records and block new operations', async () => {
  const f = await fixture(); const asset = await f.fleet();
  f.clock.set('2030-02-01T10:00:00.000Z');
  await assert.rejects(f.fleet(), /active subscription/);
  assert.equal(((await f.get()).fleet as { id: string }[])[0]?.id, asset.id);
  await f.post('/api/billing/cancel', { reason: 'Customer request' });
  assert.equal((await f.state()).subscription?.status, 'CANCELLED'); f.store.close();
});
test('module role and branch scopes are checked independently of business ownership', async () => {
  const f = await fixture(['RENTAL', 'PARTS']);
  await f.post('/api/staff/memberships', { subject_id: 'agent', role: 'RENTAL_AGENT', branch_id: f.branch, modules: ['RENTAL'] });
  const agent: Principal = { id: 'agent', tenantId: f.tenant, role: 'OWNER', branches: ['forged'] };
  await assert.rejects(f.post('/api/parts', {}, agent), /module.*access/);
  await assert.rejects(f.post('/api/office-expenses', {}, agent), /staff role/);
  await assert.rejects(f.post('/api/parties', { branch_id: 'other-business', name: 'Bad' }, agent), /not found/);
  f.store.close();
});
test('inactive staff cannot read data or replay an earlier successful mutation', async () => {
  const f = await fixture(); await f.post('/api/staff/memberships', { subject_id: 'agent', role: 'RENTAL_AGENT', branch_id: f.branch, modules: ['RENTAL'] });
  const agent: Principal = { id: 'agent', tenantId: f.tenant, role: 'RENTAL_AGENT', branches: [f.branch] };
  const body = { branch_id: f.branch, kind: 'CUSTOMER', name: 'Agent-created customer' }, key = randomUUID();
  await f.post('/api/parties', body, agent, key); await f.post('/api/staff/agent/disable', {});
  await assert.rejects(f.post('/api/parties', body, agent, key), /not found/); f.store.close();
});
test('capacity counts rental fleet independently of dealer inventory and shared seats once', async () => {
  const f = await fixture(['RENTAL', 'DEALER']); for (let i = 0; i < 5; i++) await f.fleet();
  await assert.rejects(f.fleet(), /capacity reached/);
  const v = await f.post('/api/vehicles', { branch_id: f.branch, vin: '1HGCM82633A999998', make: 'Toyota', model: 'Camry', year: 2021, location: 'Abuja', asking_price: '1000' });
  assert.equal(typeof v.id, 'string');
  await f.post('/api/staff/memberships', { subject_id: 'first', role: 'VIEWER', branch_id: f.branch, modules: ['RENTAL', 'DEALER'] });
  await f.post('/api/staff/memberships', { subject_id: 'second', role: 'VIEWER', branch_id: f.branch, modules: ['RENTAL'] });
  await assert.rejects(f.post('/api/staff/memberships', { subject_id: 'third', role: 'VIEWER', branch_id: f.branch, modules: ['DEALER'] }), /Staff allowance/); f.store.close();
});
test('shared core is billed once and quotes retain the exact published catalogue version', async () => {
  const f = await fixture(['RENTAL', 'PARTS']);
  const operator: Principal = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 10000, RENTAL: 20000, PARTS: 30000 }, reason: 'Synthetic test prices' }, operator);
  const q = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL', 'PARTS'], primary_module: 'RENTAL', tier: 'STARTER' });
  assert.equal(q.items.filter(i => i.product === 'CORE').length, 1); assert.equal(q.monthly_minor, 60000);
  await f.post('/api/platform/catalogue', { expected_version: 2, tier: 'STARTER', monthly_minor: { CORE: 50000 }, reason: 'New version for future subscribers' }, operator);
  await f.service.settlePayment(f.tenant, q.id, 'verified-001', 60000, 'NGN');
  assert.equal((await f.state()).subscription?.catalogue_version, 2);
  assert.equal((await f.state()).subscription?.items.find(i => i.product === 'CORE')?.total_minor, 10000); f.store.close();
});
test('customers cannot publish prices or activate their own paid subscription', async () => {
  const f = await fixture();
  await assert.rejects(f.post('/api/platform/catalogue', {}), /platform authority/);
  await assert.rejects(f.post('/api/platform/subscribers/' + f.tenant + '/activate', { paid: true }), /platform authority/); f.store.close();
});
test('unpublished pricing requires a quote and payment must match currency and amount', async () => {
  const f = await fixture();
  await assert.rejects(f.post('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' }), /not been published/);
  const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200 }, reason: 'Synthetic prices' }, op);
  const q = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  await assert.rejects(f.service.settlePayment(f.tenant, q.id, 'ref', 1, 'NGN'), /amount or currency/);
  await assert.rejects(f.service.settlePayment(f.tenant, q.id, 'ref', 300, 'USD'), /amount or currency/);
  assert.equal((await f.state()).subscription?.status, 'TRIAL'); f.store.close();
});
test('paid upgrade adds modules, prorates the increase and preserves current billing end', async () => {
  const f = await fixture(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 10000, RENTAL: 20000, PARTS: 30000 }, reason: 'Synthetic prices' }, op);
  const first = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, first.id, 'initial', first.due_minor, 'NGN');
  f.clock.set('2030-01-25T10:00:00.000Z');
  const upgrade = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL', 'PARTS'], primary_module: 'RENTAL', tier: 'STARTER' });
  assert.equal(upgrade.period_end, first.period_end); assert.ok(upgrade.due_minor > 0 && upgrade.due_minor < 30000);
  await f.service.settlePayment(f.tenant, upgrade.id, 'upgrade', upgrade.due_minor, 'NGN');
  assert.deepEqual((await f.state()).subscription?.modules, ['PARTS', 'RENTAL']); f.store.close();
});
test('downgrades wait until renewal and preserve historical rental records', async () => {
  const f = await fixture(['RENTAL', 'PARTS']); const asset = await f.fleet(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200, PARTS: 300 }, reason: 'Synthetic prices' }, op);
  const first = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL', 'PARTS'], primary_module: 'RENTAL', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, first.id, 'start', first.due_minor, 'NGN');
  const next = await f.post<Quote>('/api/billing/quotes', { modules: ['PARTS'], primary_module: 'PARTS', tier: 'STARTER' });
  assert.equal(next.period_start, first.period_end);
  await f.service.settlePayment(f.tenant, next.id, 'renewal', next.due_minor, 'NGN');
  assert.equal((await f.state()).subscription?.modules.includes('RENTAL'), true);
  f.clock.set(first.period_end); const v = await f.get();
  assert.equal(((v.fleet as { id: string }[]).find(a => a.id === asset.id))?.id, asset.id);
  await assert.rejects(f.fleet(), /active subscription/); f.store.close();
});
test('idempotent replay does not duplicate stock and conflicting key reuse rolls back', async () => {
  const f = await fixture(['PARTS']); const key = randomUUID(); const d = { branch_id: f.branch, sku: 'ONE', name: 'One', asking_price: '1' };
  const first = await f.post('/api/parts', d, f.owner, key); assert.deepEqual(await f.post('/api/parts', d, f.owner, key), first);
  await assert.rejects(f.post('/api/parts', { ...d, sku: 'TWO' }, f.owner, key), /Idempotency/);
  assert.equal((await f.state()).parts.length, 1); f.store.close();
});
test('separate tenants cannot discover records by reusing another tenant resource ID', async () => {
  const f = await fixture(); const asset = await f.fleet();
  const outsider: Principal = { id: 'owner', tenantId: 'another', role: 'OWNER', branches: ['another-MAIN'] };
  await f.service.run(outsider, 'GET', '/api/workspace');
  await assert.rejects(f.post('/api/fleet/assets/' + asset.id + '/status', { status: 'ARCHIVED', version: 1 }, outsider), /not found/);
  assert.equal((await f.state()).fleet[0]?.status, 'ACTIVE'); f.store.close();
});
