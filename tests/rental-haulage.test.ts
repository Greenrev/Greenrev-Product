import test from 'node:test';
import assert from 'node:assert/strict';
import type { Rental, HaulageJob, ServiceInvoice } from '../src/modular/model.js';
import type { Principal } from '../src/v3-rules.js';
import { fixture, inspect } from './modular-helpers.js';

test('rental deposit, customer receipt, return, deduction and refund reconcile without recognising deposits as sales', async () => {
  const f = await fixture(); let r = await f.booking(await f.fleet());
  r = await f.post<Rental>('/api/rentals/' + r.id + '/deposit', { version: r.version, amount: '100', reference: 'DEP', confirmation: 'Bank checked' });
  let report = await f.get('/api/reports'); assert.equal(report.rental_deposits_minor, 10000); assert.equal(report.revenue_minor, 0);
  const i = await f.post<ServiceInvoice>('/api/service-invoices', { module: 'RENTAL', job_id: r.id });
  assert.equal(i.total_minor, 200000); assert.equal((await f.get('/api/reports')).revenue_minor, 0);
  const receipt = await f.post('/api/receipts', { invoice_id: i.id, amount: '2000', reference: 'RENT-PAY' });
  assert.equal((await f.get('/api/reports')).bank_minor, 10000);
  await f.post('/api/receipts/' + receipt.id + '/verify', { confirmation: 'Statement checked' });
  r = await f.post<Rental>('/api/rentals/' + r.id + '/checkout', { version: r.version, ...inspect });
  r = await f.post<Rental>('/api/rentals/' + r.id + '/return', { version: r.version, ...inspect, odometer: 200 });
  r = await f.post<Rental>('/api/rentals/' + r.id + '/deduction', { version: r.version, amount: '40', reason: 'Agreed damage', acknowledgement: 'Customer agreement' });
  await f.post('/api/rentals/' + r.id + '/refund', { version: r.version, amount: '60', reference: 'REF', confirmation: 'Refund independently checked' });
  report = await f.get('/api/reports'); assert.equal(report.rental_deposits_minor, 0); assert.equal(report.revenue_minor, 204000);
  assert.equal(report.bank_minor, 204000); assert.equal(report.receivable_minor, 0); assert.equal(report.balance_check_minor, 0); f.store.close();
});
test('overlapping bookings fail, adjacent intervals work and a cancelled booking releases capacity', async () => {
  const f = await fixture(); const a = await f.fleet(); let r = await f.booking(a, { deposit: '0' });
  await assert.rejects(f.booking(a), /booked/);
  await f.booking(a, { start_at: '2030-01-12T10:00:00.000Z', end_at: '2030-01-13T10:00:00.000Z' });
  await f.post('/api/rentals/' + r.id + '/cancel', { version: r.version });
  await f.booking(a, { deposit: '0' }); assert.equal((await f.state()).rentals.length, 3); f.store.close();
});
test('checkout requires the agreed deposit and return mileage cannot decrease', async () => {
  const f = await fixture(); let r = await f.booking(await f.fleet());
  await assert.rejects(f.post('/api/rentals/' + r.id + '/checkout', { version: r.version, ...inspect }), /security deposit/);
  r = await f.post<Rental>('/api/rentals/' + r.id + '/deposit', { version: r.version, amount: '100', reference: 'D', confirmation: 'Checked' });
  r = await f.post<Rental>('/api/rentals/' + r.id + '/checkout', { version: r.version, ...inspect });
  await assert.rejects(f.post('/api/rentals/' + r.id + '/return', { version: r.version, ...inspect, odometer: 99 }), /mileage/);
  assert.equal((await f.state()).rentals[0]?.status, 'CHECKED_OUT'); f.store.close();
});
test('an overdue checked-out vehicle blocks further bookings and a maintenance hold cannot disrupt live bookings', async () => {
  const f = await fixture(); const a = await f.fleet(); let r = await f.booking(a, { deposit: '0' });
  await assert.rejects(f.post('/api/fleet/assets/' + a.id + '/status', { status: 'MAINTENANCE', version: a.version }), /active bookings/);
  r = await f.post<Rental>('/api/rentals/' + r.id + '/checkout', { version: 1, ...inspect });
  f.clock.set('2030-01-13T10:00:00.000Z');
  await assert.rejects(f.booking(a, { start_at: f.clock.now(), end_at: '2030-01-14T10:00:00.000Z' }), /overdue/); f.store.close();
});
test('returns and deposit refunds remain possible after subscription expiry', async () => {
  const f = await fixture(); let r = await f.booking(await f.fleet());
  r = await f.post<Rental>('/api/rentals/' + r.id + '/deposit', { version: r.version, amount: '100', reference: 'EXDEP', confirmation: 'Checked' });
  r = await f.post<Rental>('/api/rentals/' + r.id + '/checkout', { version: r.version, ...inspect });
  f.clock.set('2030-02-10T10:00:00.000Z');
  r = await f.post<Rental>('/api/rentals/' + r.id + '/return', { version: r.version, ...inspect });
  await f.post('/api/rentals/' + r.id + '/refund', { version: r.version, amount: '100', reference: 'EXREF', confirmation: 'Checked' });
  assert.equal((await f.get('/api/reports')).rental_deposits_minor, 0); f.store.close();
});
test('cancelled booking refunds cannot exceed deposit balance and duplicate references roll back', async () => {
  const f = await fixture(); let r = await f.booking(await f.fleet());
  r = await f.post<Rental>('/api/rentals/' + r.id + '/deposit', { version: 1, amount: '100', reference: 'UNIQUE', confirmation: 'Checked' });
  r = await f.post<Rental>('/api/rentals/' + r.id + '/cancel', { version: r.version });
  await assert.rejects(f.post('/api/rentals/' + r.id + '/refund', { version: r.version, amount: '101', reference: 'X', confirmation: 'Checked' }), /remaining deposit/);
  await assert.rejects(f.post('/api/rentals/' + r.id + '/refund', { version: r.version, amount: '100', reference: 'UNIQUE', confirmation: 'Checked' }), /already been used/);
  assert.equal((await f.get('/api/reports')).rental_deposits_minor, 10000); f.store.close();
});
test('invalid dates and excessively long rentals are rejected before allocating charges', async () => {
  const f = await fixture(); const a = await f.fleet();
  await assert.rejects(f.booking(a, { start_at: '2030-02-30T10:00:00Z', end_at: '2030-03-05T10:00:00Z' }), /Date/);
  await assert.rejects(f.booking(a, { end_at: '2035-01-01T10:00:00Z' }), /366/); f.store.close();
});
test('haulage assignment, dispatch, driver proof and job costs produce module profit', async () => {
  const f = await fixture(['HAULAGE']); const a = await f.fleet('HAULAGE');
  await f.post('/api/staff/memberships', { subject_id: 'driver', role: 'DRIVER', modules: ['HAULAGE'], branch_id: f.branch });
  let j = await f.post<HaulageJob>('/api/haulage', { asset_id: a.id, branch_id: f.branch, customer_id: f.customer.id, title: 'Customer transport',
    origin: 'Abuja', destination: 'Kaduna', cargo: 'A customer car', start_at: f.clock.now(), end_at: '2030-01-11T10:00:00Z', quote: '500' });
  await assert.rejects(f.post('/api/haulage/' + j.id + '/dispatch', { version: j.version }), /assigned driver/);
  j = await f.post<HaulageJob>('/api/haulage/' + j.id + '/assign', { driver_id: 'driver', version: j.version });
  await f.post('/api/service-invoices', { module: 'HAULAGE', job_id: j.id });
  j = await f.post<HaulageJob>('/api/haulage/' + j.id + '/dispatch', { version: j.version });
  const driver: Principal = { id: 'driver', tenantId: f.tenant, role: 'DRIVER', branches: [f.branch] };
  const view = await f.get('/api/workspace', {}, driver);
  assert.equal('quote_minor' in (view.haulage as object[])[0]!, false); assert.equal(view.reports, null); assert.deepEqual(view.parties, []);
  await assert.rejects(f.post('/api/haulage/' + j.id + '/deliver', { version: j.version }, driver), /Text required/);
  await f.post('/api/haulage/' + j.id + '/deliver', { version: j.version, proof_of_delivery: 'Recipient signed POD-01' }, driver);
  let e = await f.post('/api/office-expenses', { module: 'HAULAGE', job_id: j.id, branch_id: f.branch, supplier_id: f.supplier.id, description: 'Trip fuel', amount: '100' });
  e = await f.post('/api/office-expenses/' + e.id + '/approve', { version: e.version });
  await f.post('/api/office-expenses/' + e.id + '/post', { version: e.version });
  const report = await f.get('/api/reports', { module: 'HAULAGE' }); assert.equal(report.net_profit_minor, 40000); assert.equal(report.balance_check_minor, 0); f.store.close();
});
test('another driver cannot deliver an unassigned job or view its financial details', async () => {
  const f = await fixture(['HAULAGE']); const a = await f.fleet('HAULAGE');
  for (const user of ['driver1', 'driver2']) await f.post('/api/staff/memberships', { subject_id: user, role: 'DRIVER', modules: ['HAULAGE'], branch_id: f.branch });
  let j = await f.post<HaulageJob>('/api/haulage', { asset_id: a.id, branch_id: f.branch, customer_id: f.customer.id, title: 'One delivery', origin: 'A', destination: 'B', cargo: 'Cargo', start_at: f.clock.now(), end_at: '2030-01-11T10:00:00Z', quote: '50' });
  j = await f.post<HaulageJob>('/api/haulage/' + j.id + '/assign', { driver_id: 'driver1', version: 1 });
  j = await f.post<HaulageJob>('/api/haulage/' + j.id + '/dispatch', { version: j.version });
  const driver: Principal = { id: 'driver2', tenantId: f.tenant, role: 'DRIVER', branches: [f.branch] };
  await assert.rejects(f.post('/api/haulage/' + j.id + '/deliver', { version: j.version, proof_of_delivery: 'Wrong driver' }, driver), /own assigned delivery/);
  assert.deepEqual((await f.get('/api/workspace', {}, driver)).haulage, []); f.store.close();
});
