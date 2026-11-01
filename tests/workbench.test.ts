import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryWorkbench, type Payload } from '../src/memory-workbench.js';
import { Problem } from '../src/errors.js';
import type { Principal } from '../src/v3-rules.js';

const owner: Principal = { id: 'OWNER1', tenantId: 'T1', role: 'OWNER', branches: ['B1'] };
const sales: Principal = { id: 'SALES1', tenantId: 'T1', role: 'SALES', branches: ['B1'] };
const viewer: Principal = { id: 'VIEW1', tenantId: 'T1', role: 'VIEWER', branches: ['B1'] };
let sequence = 0;
const post = (app: MemoryWorkbench, actor: Principal, path: string, d: Payload) =>
  app.run(actor, 'POST', path, d, 'unique-key-' + ++sequence) as Record<string, any>;
function setup() {
  const app = new MemoryWorkbench('T1');
  const supplier = post(app, owner, '/api/parties', { name: 'Importer', kind: 'SUPPLIER' }).id as string;
  const customer = post(app, owner, '/api/parties', { name: 'Buyer', kind: 'CUSTOMER' }).id as string;
  const vehicle = post(app, owner, '/api/vehicles', {
    vin: '1HGCM82633A123456', make: 'Toyota', model: 'Camry', year: 2021,
    location: 'Abuja', asking_price: '130000', branch_id: 'B1'
  }).id as string;
  return { app, supplier, customer, vehicle };
}
test('sales can create customer but viewer cannot mutate', () => {
  const { app } = setup();
  assert.throws(() => post(app, viewer, '/api/parties', { name: 'bad' }), Problem);
  assert.equal(typeof post(app, sales, '/api/parties', { name: 'Customer' }).id, 'string');
  assert.throws(() => post(app, sales, '/api/parties', { name: 'Supplier', kind: 'SUPPLIER' }));
});
test('inventory readiness, version conflict, acquisition, sale and revenue at handover', () => {
  const { app, supplier, customer, vehicle } = setup();
  assert.throws(() => post(app, owner, '/api/vehicles/' + vehicle + '/publish', { version: 1 }));
  const ready = post(app, owner, '/api/vehicles/' + vehicle + '/readiness',
    { version: 1, inspection_ready: true, documents_ready: true });
  assert.equal(ready.version, 2);
  assert.throws(() => post(app, owner, '/api/vehicles/' + vehicle + '/price',
    { version: 1, asking_price: '150000' }));
  post(app, owner, '/api/bills', { party_id: supplier, vehicle_id: vehicle, amount: '100000' });
  post(app, owner, '/api/vehicles/' + vehicle + '/publish', { version: 2 });
  const invoice = post(app, owner, '/api/invoices', {
    vehicle_id: vehicle, customer_id: customer, version: 3
  });
  assert.equal(invoice.total_minor, 13000000);
  assert.equal((app.run(owner, 'GET', '/api/reports') as any).net_profit_minor, 0);
  const p = post(app, owner, '/api/payments', { target_type: 'INVOICE',
    target_id: invoice.id, amount: '130000', reference: 'BANK-ABC-1' });
  assert.equal(p.status, 'EVIDENCE');
  assert.equal((app.run(owner, 'GET', '/api/reports') as any).bank_minor, 0);
  post(app, owner, '/api/payments/' + p.id + '/verify', { confirmation: 'Bank reference independently verified' });
  post(app, owner, '/api/invoices/' + invoice.id + '/handover', { recipient: 'Buyer signature' });
  const report = app.run(owner, 'GET', '/api/reports') as any;
  assert.equal(report.net_profit_minor, 3000000);
  assert.equal(report.balance_check_minor, 0);
  assert.equal(report.payable_minor, 10000000);
});
test('failed operation rolls back and replayed idempotency key is stable', () => {
  const { app, customer, vehicle } = setup();
  const data = { version: 1, inspection_ready: true, documents_ready: true };
  const first = app.run(owner, 'POST', '/api/vehicles/' + vehicle + '/readiness', data, 'same-request');
  const second = app.run(owner, 'POST', '/api/vehicles/' + vehicle + '/readiness', data, 'same-request');
  assert.deepEqual(first, second);
  assert.throws(() => app.run(owner, 'POST', '/api/vehicles/' + vehicle + '/readiness',
    { ...data, documents_ready: false }, 'same-request'));
  assert.throws(() => post(app, owner, '/api/invoices',
    { vehicle_id: vehicle, customer_id: customer, version: 2 }));
  const view = app.run(owner, 'GET', '/api/workspace') as any;
  assert.equal(view.invoices.length, 0);
});
test('tenant and branch scope protect reads and writes', () => {
  const { app } = setup();
  const outsider: Principal = { id: 'bad', tenantId: 'T2', role: 'OWNER', branches: ['B1'] };
  assert.throws(() => app.run(outsider, 'GET', '/api/workspace'), Problem);
  const otherBranch: Principal = { ...sales, branches: ['B2'] };
  assert.equal((app.run(otherBranch, 'GET', '/api/workspace') as any).vehicles.length, 0);
  assert.throws(() => post(app, otherBranch, '/api/vehicles', {
    vin: '1HGCM82633A123457', make: 'Kia', model: 'Rio',
    year: 2022, location: 'Abuja', branch_id: 'B1'
  }));
});
