/** v0.3 package, branch transfer, expense and marketplace invariants.
 * These are pure rules: persistence, authenticated actors and destination delivery
 * are intentionally supplied by the developer's approved services.
 */
import { Problem, requireCondition } from './errors.js';
import { cleanText, integer, isoDate, minor } from './money.js';

export type Role = 'OWNER' | 'ADMIN' | 'BRANCH_MANAGER' | 'ACCOUNTANT'
  | 'SALES' | 'PARTS_MANAGER' | 'CLERK' | 'DRIVER' | 'MECHANIC'
  | 'RENTAL_AGENT' | 'DISPATCHER' | 'VIEWER';
export type Mode = 'MARKETPLACE' | 'SAAS' | 'BUNDLE';
export interface Principal {
  id: string;
  tenantId: string;
  role: Role;
  branches: readonly string[];
  platformCapabilities?: readonly string[];
}
export interface PackageVersion {
  id: string; code: string; version: number; mode: Mode;
  branchLimit: number | null; userLimit: number | null; vehicleLimit: number | null;
  vehicleListingLimit: number | null; partListingLimit: number | null;
  features: Readonly<Record<string, boolean>>;
}
export interface Subscription {
  packageVersionId: string; status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';
  expiresAt?: string | null;
}

export function requireRole(actor: Principal, roles: readonly Role[]): void {
  if (!roles.includes(actor.role)) throw new Problem('Your role cannot perform this action', 403);
}
export function requireBranch(actor: Principal, branchId: string): void {
  if (!['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(actor.role)
      && !actor.branches.includes(branchId)) {
    throw new Problem('Branch is outside assigned staff scope', 403);
  }
}
export function requirePlatform(actor: Principal, capability: string): void {
  if (!actor.platformCapabilities?.includes(capability)) {
    throw new Problem('Platform operator capability required', 403);
  }
}
export function entitlement(pkg: PackageVersion, sub: Subscription,
  feature: string, at = new Date().toISOString()): void {
  if (sub.packageVersionId !== pkg.id || !['ACTIVE', 'TRIAL'].includes(sub.status)
      || (sub.expiresAt && sub.expiresAt <= at)) {
    throw new Problem('Subscription is not active for new business actions', 403);
  }
  if (!pkg.features[feature]) throw new Problem('Feature is not included in this package', 403);
  if (feature === 'inventory' && pkg.mode === 'MARKETPLACE') {
    throw new Problem('SaaS inventory requires a SaaS or combined package', 403);
  }
  if (feature === 'marketplace_publish' && pkg.mode !== 'BUNDLE') {
    throw new Problem('A combined package is required for publication', 403);
  }
}

export type TransferStatus = 'REQUESTED' | 'DISPATCHED' | 'RECEIVED'
  | 'DISCREPANCY' | 'CANCELLED';
export interface Transfer {
  id: string; tenantId: string; kind: 'VEHICLE' | 'PART';
  sourceBranchId: string; destinationBranchId: string;
  quantity: number; received: number; status: TransferStatus; version: number;
}
export type TransferAction = 'dispatch' | 'receive' | 'resolve' | 'cancel';
export function transitionTransfer(original: Transfer, actor: Principal,
  action: TransferAction, quantity?: number, expectedVersion?: number,
  outcome?: 'RECEIVED_REMAINDER' | 'RETURNED_REMAINDER'): Transfer {
  requireCondition(original.tenantId === actor.tenantId, 'Record not found', 404);
  requireRole(actor, original.kind === 'PART'
    ? ['OWNER', 'ADMIN', 'BRANCH_MANAGER', 'PARTS_MANAGER']
    : ['OWNER', 'ADMIN', 'BRANCH_MANAGER']);
  if (expectedVersion !== undefined && expectedVersion !== original.version) {
    throw new Problem('Transfer changed. Refresh and retry', 409);
  }
  const t = { ...original, version: original.version + 1 };
  if (action === 'cancel') {
    requireBranch(actor, original.sourceBranchId);
    requireCondition(t.status === 'REQUESTED', 'Only an undispatched transfer can be cancelled', 409);
    t.status = 'CANCELLED';
  } else if (action === 'dispatch') {
    requireBranch(actor, original.sourceBranchId);
    requireCondition(t.status === 'REQUESTED', 'Transfer must be requested before dispatch', 409);
    t.status = 'DISPATCHED';
  } else if (action === 'receive') {
    requireBranch(actor, original.destinationBranchId);
    requireCondition(t.status === 'DISPATCHED',
      'Transfer is not awaiting receipt', 409);
    const got = integer(quantity ?? -1, 0, t.quantity - t.received);
    t.received += got;
    t.status = t.received === t.quantity ? 'RECEIVED' : 'DISCREPANCY';
  } else {
    requireRole(actor, ['OWNER', 'ADMIN']);
    requireCondition(t.status === 'DISCREPANCY', 'No discrepancy to resolve', 409);
    requireCondition(outcome === 'RECEIVED_REMAINDER' || outcome === 'RETURNED_REMAINDER',
      'Confirm receipt at destination or physical return to source');
    if (outcome === 'RECEIVED_REMAINDER') t.received = t.quantity;
    t.status = 'RECEIVED';
  }
  return t;
}

export type ExpenseStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'POSTED';
export interface OfficeExpense {
  id: string; tenantId: string; amountMinor: number; taxMinor: number;
  status: ExpenseStatus; branchId: string | null; billId: string | null;
  payeeId: string | null; memo: string;
}
export function officeExpenseAction(original: OfficeExpense, actor: Principal,
  action: 'approve' | 'reject' | 'post', billId?: string): OfficeExpense {
  requireCondition(actor.tenantId === original.tenantId, 'Record not found', 404);
  requireRole(actor, ['OWNER', 'ACCOUNTANT']);
  if (original.status === 'POSTED') throw new Problem('Expense has already been posted', 409);
  if (action === 'post') {
    requireCondition(original.status === 'APPROVED', 'Approve expense before posting', 409);
    requireCondition(!!billId, 'An overhead bill reference is required');
    return { ...original, billId: cleanText(billId), status: 'POSTED' };
  }
  requireCondition(original.status === 'SUBMITTED', 'Expense is not awaiting review', 409);
  return { ...original, status: action === 'approve' ? 'APPROVED' : 'REJECTED' };
}

export interface RecurringExpense {
  id: string; amount: string; startDate: string; day: number; description: string;
}
export function recurringDraft(template: RecurringExpense, month: string,
  alreadyGeneratedPeriods: ReadonlySet<string>) {
  requireCondition(/^\d{4}-\d{2}$/.test(month), 'Period must be YYYY-MM');
  isoDate(month + '-01');
  if (alreadyGeneratedPeriods.has(month)) throw new Problem('Draft already generated for period', 409);
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)),
    Number(month.slice(5, 7)), 0)).getUTCDate();
  const day = Math.min(integer(template.day, 1, 31), monthEnd);
  return {
    templateId: template.id, period: month, dueDate: month + '-' + String(day).padStart(2, '0'),
    amountMinor: minor(template.amount, true),
    memo: cleanText(template.description)
  };
}

export interface PublicVehicle {
  id: string; vin: string; make: string; model: string; year: number;
  location: string; asking_minor: number; status: string; version: number;
  cost_minor?: number; supplier?: string; profit_minor?: number;
}
export function vehicleProjection(v: PublicVehicle) {
  return {
    id: v.id, make: v.make, model: v.model, year: v.year, location: v.location,
    status: v.status, asking_minor: v.asking_minor, version: v.version,
    vin_masked: '•'.repeat(Math.max(0, v.vin.length - 4)) + v.vin.slice(-4)
  };
}
export interface PublicationRequest {
  id: string; tenantId: string; resourceId: string;
  status: 'SUBMITTED' | 'REJECTED' | 'QUEUED' | 'WITHDRAWN';
  generation: number;
}
export function moderate(request: PublicationRequest, actor: Principal,
  decision: 'approve' | 'reject'): PublicationRequest {
  requirePlatform(actor, 'LISTING_MODERATION');
  requireCondition(request.status === 'SUBMITTED', 'Listing is not awaiting moderation', 409);
  return { ...request, generation: request.generation + 1,
    status: decision === 'approve' ? 'QUEUED' : 'REJECTED' };
}
