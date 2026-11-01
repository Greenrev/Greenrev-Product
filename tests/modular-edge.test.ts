import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ModularSaasService } from '../src/modular/service.js';
import { SqliteStore } from '../src/modular/stores.js';
import type { Part, Quote, Rental, ServiceInvoice, Transfer } from '../src/modular/model.js';
import { fixture } from './modular-helpers.js';

test('full service credit permits paid-booking cancellation and a separately confirmed refund', async () => {
  const f = await fixture(); const r = await f.booking(await f.fleet(), { deposit: '0' });
  let invoice = await f.post<ServiceInvoice>('/api/service-invoices', { module: 'RENTAL', job_id: r.id, tax_percent: '5' });
  const receipt = await f.post('/api/receipts', { invoice_id: invoice.id, amount: '2100', reference: 'PAID-RENT' });
  await f.post('/api/receipts/' + receipt.id + '/verify', { confirmation: 'Bank confirmed' });
  invoice = (await f.state()).service_invoices[0]!;
  invoice = await f.post<ServiceInvoice>('/api/service-invoices/' + invoice.id + '/credit', { version: invoice.version, reason: 'Cancellation accepted', acknowledgement: 'Customer agreed full credit' });
  await f.post('/api/rentals/' + r.id + '/cancel', { version: r.version });
  await f.post('/api/service-invoices/' + invoice.id + '/refund', { version: invoice.version, amount: '2100', reference: 'REF-RENT', confirmation: 'Refund confirmed' });
  const report = await f.get('/api/reports'); assert.equal(report.receivable_minor, 0); assert.equal(report.bank_minor, 0);
  assert.equal(report.tax_payable_minor, 0); assert.equal(report.refund_payable_minor, 0); assert.equal(report.balance_check_minor, 0); f.store.close();
});
test('availability excludes booked or held assets and includes a returned vehicle', async () => {
  const f = await fixture(); const a = await f.fleet(); const b = await f.fleet(); await f.booking(a);
  let view = await f.get('/api/rentals/availability', { start_at: f.clock.now(), end_at: '2030-01-11T10:00:00Z' });
  assert.deepEqual((view.assets as { id: string }[]).map(a => a.id), [b.id]);
  await f.post('/api/fleet/assets/' + b.id + '/status', { status: 'MAINTENANCE', version: 1 });
  view = await f.get('/api/rentals/availability', { start_at: f.clock.now(), end_at: '2030-01-11T10:00:00Z' });
  assert.deepEqual(view.assets, []); f.store.close();
});
test('published capacities and overage units price extra branches, staff and rental fleet separately', async () => {
  const f = await fixture(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200 },
    limits: { branches: 1, users: 3, capacities: { RENTAL: 5 } }, extra_branch_minor: 50, extra_user_minor: 20,
    extra_capacity_minor: { RENTAL: 10 }, reason: 'Synthetic capacity schedule' }, op);
  const q = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER', branches: 2, users: 4, capacities: { RENTAL: 7 } });
  assert.equal(q.monthly_minor, 390); assert.equal(q.items.find(i => i.product === 'RENTAL_CAPACITY')?.quantity, 2); f.store.close();
});
test('successive upgrades use the original month denominator and old webhook retries remain idempotent', async () => {
  const f = await fixture(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200, PARTS: 300, HAULAGE: 300 }, reason: 'Synthetic prices' }, op);
  const a = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, a.id, 'A', a.due_minor, 'NGN'); f.clock.set('2030-01-25T10:00:00.000Z');
  const b = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL', 'PARTS'], primary_module: 'RENTAL', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, b.id, 'B', b.due_minor, 'NGN');
  const c = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL', 'PARTS', 'HAULAGE'], primary_module: 'RENTAL', tier: 'STARTER' });
  assert.equal(c.due_minor, b.due_minor);
  const duplicate = await f.service.settlePayment(f.tenant, a.id, 'A', a.due_minor, 'NGN') as { duplicate: boolean };
  assert.equal(duplicate.duplicate, true); f.store.close();
});
test('a prepaid renewal cannot be silently replaced or discarded by cancellation', async () => {
  const f = await fixture(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200 }, reason: 'Synthetic' }, op);
  const a = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, a.id, 'ONE', a.due_minor, 'NGN');
  const b = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, b.id, 'TWO', b.due_minor, 'NGN');
  await assert.rejects(f.post('/api/billing/cancel', { reason: 'Cancel' }), /prepaid renewal/);
  await assert.rejects(f.post('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' }), /prepaid change/); f.store.close();
});
test('marketplace-only registration grants no private inventory operations or shared-core charge', async () => {
  const store = new SqliteStore(':memory:'); const service = new ModularSaasService(store);
  const owner = { id: 'owner', tenantId: 'market-only', role: 'OWNER' as const, branches: ['market-only-MAIN'] };
  await service.run(owner, 'POST', '/api/onboarding', { name: 'Marketplace profile', modules: ['DEALER'], primary_module: 'DEALER', mode: 'MARKETPLACE' }, randomUUID());
  const view = await service.run(owner, 'GET', '/api/workspace') as { navigation: unknown[]; permissions: { finance: boolean } };
  assert.deepEqual(view.navigation, []);
  assert.equal(view.permissions.finance, false);
  await assert.rejects(service.run(owner, 'GET', '/api/reports'), /software history/);
  await assert.rejects(service.run(owner, 'POST', '/api/vehicles', {}, randomUUID()), /module.*access/);
  const op = { ...owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await service.run(op, 'POST', '/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { MARKETPLACE: 500 }, reason: 'Synthetic' }, randomUUID());
  const q = await service.run(owner, 'POST', '/api/billing/quotes', { modules: ['DEALER'], primary_module: 'DEALER', tier: 'STARTER', mode: 'MARKETPLACE' }, randomUUID()) as Quote;
  assert.deepEqual(q.items.map(i => i.product), ['MARKETPLACE']); store.close();
});
test('parts branch transfers preserve total inventory value without creating sales revenue', async () => {
  const f = await fixture(['PARTS']); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, PARTS: 200 }, limits: { branches: 2 }, reason: 'Synthetic two-branch plan' }, op);
  const q = await f.post<Quote>('/api/billing/quotes', { modules: ['PARTS'], primary_module: 'PARTS', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, q.id, 'PLAN', q.due_minor, 'NGN');
  const dest = await f.post('/api/branches', { name: 'Destination', modules: ['PARTS'] });
  const p = await f.post<Part>('/api/parts', { branch_id: f.branch, sku: 'TRANSFER', name: 'Transfer stock', asking_price: '200' });
  await f.post('/api/parts/' + p.id + '/receive', { version: 1, supplier_id: f.supplier.id, quantity: 10, cost: '1000' });
  let tr = await f.post<Transfer>('/api/transfers', { part_id: p.id, destination_branch: dest.id, quantity: 4 });
  tr = await f.post<Transfer>('/api/transfers/' + tr.id + '/dispatch', { version: tr.version });
  assert.equal((await f.get('/api/reports')).stock_transit_clearing_minor, 40000);
  await f.post('/api/transfers/' + tr.id + '/receive', { version: tr.version });
  const report = await f.get('/api/reports'); assert.equal(report.parts_inventory_minor, 100000); assert.equal(report.revenue_minor, 0); assert.equal(report.stock_transit_clearing_minor, 0);
  assert.equal((await f.get('/api/reports', { branch_id: dest.id })).parts_inventory_minor, 40000); f.store.close();
});
