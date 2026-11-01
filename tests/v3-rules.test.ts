import test from 'node:test';
import assert from 'node:assert/strict';
import { entitlement, moderate, officeExpenseAction, recurringDraft,
  transitionTransfer, vehicleProjection, type Principal } from '../src/v3-rules.js';

const owner: Principal = { id: 'o', tenantId: 'T', role: 'OWNER', branches: ['A', 'B'] };
const source: Principal = { id: 's', tenantId: 'T', role: 'BRANCH_MANAGER', branches: ['A'] };
const dest: Principal = { id: 'd', tenantId: 'T', role: 'BRANCH_MANAGER', branches: ['B'] };
test('subscription mode, expiry and pinned package access', () => {
  const pkg = { id: 'v1', code: 'BUNDLE', version: 1, mode: 'BUNDLE' as const,
    branchLimit: 5, userLimit: 20, vehicleLimit: 100,
    vehicleListingLimit: 10, partListingLimit: 40,
    features: { marketplace_publish: true, inventory: true } };
  assert.doesNotThrow(() => entitlement(pkg, { packageVersionId: 'v1',
    status: 'ACTIVE', expiresAt: '2027-01-01' }, 'marketplace_publish', '2026-10-30'));
  assert.throws(() => entitlement({ ...pkg, mode: 'SAAS' },
    { packageVersionId: 'v1', status: 'ACTIVE' }, 'marketplace_publish'));
  assert.throws(() => entitlement({ ...pkg, mode: 'MARKETPLACE' },
    { packageVersionId: 'v1', status: 'ACTIVE' }, 'inventory'));
  assert.throws(() => entitlement(pkg, { packageVersionId: 'v1', status: 'EXPIRED' }, 'inventory'));
  assert.throws(() => entitlement(pkg, { packageVersionId: 'v0', status: 'ACTIVE' }, 'inventory'));
});
test('branch dispatch and destination-only receipt with discrepancy', () => {
  const request = { id: 'TR1', tenantId: 'T', kind: 'PART' as const,
    sourceBranchId: 'A', destinationBranchId: 'B',
    quantity: 10, received: 0, status: 'REQUESTED' as const, version: 1 };
  assert.throws(() => transitionTransfer(request, dest, 'dispatch'));
  const dispatched = transitionTransfer(request, source, 'dispatch', undefined, 1);
  assert.throws(() => transitionTransfer(dispatched, source, 'receive', 8));
  const discrepancy = transitionTransfer(dispatched, dest, 'receive', 8);
  assert.equal(discrepancy.status, 'DISCREPANCY');
  assert.equal(discrepancy.received, 8);
  assert.throws(() => transitionTransfer(discrepancy, dest, 'resolve', undefined, 3, 'RECEIVED_REMAINDER'));
  assert.equal(transitionTransfer(discrepancy, owner, 'resolve', undefined, 3, 'RECEIVED_REMAINDER').status,
    'RECEIVED');
  assert.throws(() => transitionTransfer(request,
    { ...source, role: 'DRIVER' }, 'dispatch'));
});
test('expenses post once; recurring drafts clamp month ends and deduplicate', () => {
  const expense = { id: 'E', tenantId: 'T', amountMinor: 10000, taxMinor: 0,
    status: 'SUBMITTED' as const, branchId: 'A', billId: null, payeeId: 'P', memo: 'Rent' };
  const approved = officeExpenseAction(expense, owner, 'approve');
  const posted = officeExpenseAction(approved, owner, 'post', 'BILL1');
  assert.equal(posted.status, 'POSTED');
  assert.throws(() => officeExpenseAction(posted, owner, 'post', 'BILL2'));
  const template = { id: 'R', amount: '100', startDate: '2026-01-01', day: 31, description: 'Rent' };
  assert.equal(recurringDraft(template, '2026-02', new Set()).dueDate, '2026-02-28');
  assert.throws(() => recurringDraft(template, '2026-02', new Set(['2026-02'])));
});
test('public marketplace projection never includes private costs or full VIN', () => {
  const publicData = vehicleProjection({ id: 'V', vin: '1HGCM82633A123456',
    make: 'Toyota', model: 'Camry', year: 2021, location: 'Abuja',
    asking_minor: 100, status: 'AVAILABLE', version: 1, cost_minor: 50,
    supplier: 'Private seller', profit_minor: 50 });
  assert.equal(publicData.vin_masked.endsWith('3456'), true);
  assert.equal(JSON.stringify(publicData).includes('Private seller'), false);
  assert.equal(JSON.stringify(publicData).includes('cost_minor'), false);
  assert.equal(JSON.stringify(publicData).includes('1HGCM82633A123456'), false);
});
test('platform operator rights are distinct from business OWNER', () => {
  const listing = { id: 'L', tenantId: 'T', resourceId: 'V', status: 'SUBMITTED' as const, generation: 0 };
  assert.throws(() => moderate(listing, owner, 'approve'));
  const op = { ...owner, platformCapabilities: ['LISTING_MODERATION'] };
  const queued = moderate(listing, op, 'approve');
  assert.equal(queued.status, 'QUEUED');
  assert.equal(queued.generation, 1);
  assert.throws(() => moderate(queued, op, 'approve'));
});
