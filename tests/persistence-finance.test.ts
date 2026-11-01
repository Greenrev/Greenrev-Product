import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ModularSaasService } from '../src/modular/service.js';
import { SqliteStore } from '../src/modular/stores.js';
import type { Part, PartsOrder, Receipt, Quote } from '../src/modular/model.js';
import { fixture } from './modular-helpers.js';

test('parts purchase, fulfilled sale, return and cash refund reconcile stock, AR, AP and profit', async () => {
  const f = await fixture(['PARTS']); let p = await f.post<Part>('/api/parts', { branch_id: f.branch, sku: 'BRAKE', name: 'Brake pads', asking_price: '150' });
  p = await f.post<Part>('/api/parts/' + p.id + '/receive', { version: 1, supplier_id: f.supplier.id, quantity: 10, cost: '1000' });
  let o = await f.post<PartsOrder>('/api/parts-orders', { part_id: p.id, customer_id: f.customer.id, quantity: 3 });
  const receipt = await f.post<Receipt>('/api/receipts', { invoice_id: o.id, amount: '450', reference: 'PARTS-PAYMENT' });
  await f.post('/api/receipts/' + receipt.id + '/verify', { confirmation: 'Bank independently confirmed' });
  o = (await f.state()).orders[0]!;
  o = await f.post<PartsOrder>('/api/parts-orders/' + o.id + '/fulfil', { version: o.version });
  let report = await f.get('/api/reports'); assert.equal(report.net_profit_minor, 15000); assert.equal(report.parts_inventory_minor, 70000);
  o = await f.post<PartsOrder>('/api/parts-orders/' + o.id + '/return', { version: o.version, reason: 'Full return accepted' });
  assert.equal((await f.get('/api/reports')).refund_payable_minor, 45000);
  await f.post('/api/parts-orders/' + o.id + '/refund', { version: o.version, amount: '450', reference: 'REF-PARTS', confirmation: 'Refund confirmed' });
  report = await f.get('/api/reports'); assert.equal(report.net_profit_minor, 0); assert.equal(report.parts_inventory_minor, 100000);
  assert.equal(report.payable_minor, 100000); assert.equal(report.receivable_minor, 0); assert.equal(report.refund_payable_minor, 0); assert.equal(report.balance_check_minor, 0); f.store.close();
});
test('open orders reserve stock and competing fulfilments cannot oversell it', async () => {
  const f = await fixture(['PARTS']); let p = await f.post<Part>('/api/parts', { branch_id: f.branch, sku: 'ONE', name: 'One', asking_price: '10' });
  p = await f.post<Part>('/api/parts/' + p.id + '/receive', { version: 1, supplier_id: f.supplier.id, quantity: 3, cost: '15' });
  await f.post('/api/parts-orders', { part_id: p.id, customer_id: f.customer.id, quantity: 2 });
  await assert.rejects(f.post('/api/parts-orders', { part_id: p.id, customer_id: f.customer.id, quantity: 2 }), /Insufficient/);
  assert.equal((await f.state()).orders.length, 1); f.store.close();
});
test('pending payment evidence cannot overpay an invoice when independently verified', async () => {
  const f = await fixture(); const r = await f.booking(await f.fleet(), { deposit: '0' });
  const i = await f.post('/api/service-invoices', { module: 'RENTAL', job_id: r.id });
  const a = await f.post('/api/receipts', { invoice_id: i.id, amount: '1500', reference: 'A' });
  const b = await f.post('/api/receipts', { invoice_id: i.id, amount: '1500', reference: 'B' });
  await f.post('/api/receipts/' + a.id + '/verify', { confirmation: 'Checked A' });
  await assert.rejects(f.post('/api/receipts/' + b.id + '/verify', { confirmation: 'Checked B' }), /overpay/);
  assert.equal((await f.state()).service_invoices[0]?.paid_minor, 150000); f.store.close();
});
test('shared office costs stay outside module profit and posting twice cannot create a duplicate payable', async () => {
  const f = await fixture(); let e = await f.post('/api/office-expenses', { module: 'SHARED', branch_id: f.branch,
    supplier_id: f.supplier.id, description: 'Office electricity', amount: '100' });
  e = await f.post('/api/office-expenses/' + e.id + '/approve', { version: e.version });
  e = await f.post('/api/office-expenses/' + e.id + '/post', { version: e.version });
  await assert.rejects(f.post('/api/office-expenses/' + e.id + '/post', { version: e.version }), /Approve expense/);
  const all = await f.get('/api/reports'), module = await f.get('/api/reports', { module: 'RENTAL' });
  assert.equal(all.net_profit_minor, -10000); assert.equal(module.net_profit_minor, 0); assert.equal(module.unallocated_shared_overhead_minor, 10000);
  assert.equal(all.balance_check_minor, 0); f.store.close();
});
test('persisted state survives a fresh service process and failed mutations leave no partial state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greenrev-persistence-')); const file = join(directory, 'data.sqlite');
  const f = await fixture(['RENTAL'], file); const a = await f.fleet(); const before = await f.state();
  await assert.rejects(f.post('/api/fleet/assets/' + a.id + '/status', { status: 'UNSUPPORTED', version: 1 }));
  assert.deepEqual(await f.state(), before); f.store.close();
  const reopened = new SqliteStore(file), next = new ModularSaasService(reopened, { now: f.clock.now });
  const view = await next.run(f.owner, 'GET', '/api/workspace') as { fleet: { id: string }[] };
  assert.equal(view.fleet[0]?.id, a.id); reopened.close(); await rm(directory, { recursive: true });
});
test('two independent workers racing to book one fleet asset produce exactly one booking', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greenrev-race-')); const file = join(directory, 'data.sqlite');
  const f = await fixture(['RENTAL'], file); const a = await f.fleet();
  const run = () => new Promise<{ status: number }>((resolve, reject) => {
    const worker = new Worker(new URL('./booking-race-worker.js', import.meta.url), { workerData: {
      file, owner: f.owner, now: f.clock.now(), data: { branch_id: f.branch, asset_id: a.id, customer_id: f.customer.id,
        start_at: f.clock.now(), end_at: '2030-01-11T10:00:00Z', daily_rate: '100', driver_name: 'Driver', agreement: 'Test agreement' } } });
    worker.once('message', resolve); worker.once('error', reject); worker.once('exit', code => { if (code) reject(new Error('Booking worker exited ' + code)); });
  });
  const results = await Promise.all([run(), run()]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await f.state()).rentals.length, 1); f.store.close(); await rm(directory, { recursive: true });
});
test('stale quote payment cannot undo a newer subscription change', async () => {
  const f = await fixture(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200, PARTS: 300 }, reason: 'Synthetic' }, op);
  const old = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  const newer = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL', 'PARTS'], primary_module: 'RENTAL', tier: 'STARTER' });
  await f.service.settlePayment(f.tenant, newer.id, 'NEW', newer.due_minor, 'NGN');
  await assert.rejects(f.service.settlePayment(f.tenant, old.id, 'OLD', old.due_minor, 'NGN'), /Subscription changed/);
  assert.equal((await f.state()).subscription?.modules.includes('PARTS'), true); f.store.close();
});
