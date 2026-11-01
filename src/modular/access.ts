import { requireCondition as check } from '../errors.js';
import type { Role } from '../v3-rules.js';
import type { BusinessModule, Context, WorkspaceState } from './model.js';
import { found } from './validation.js';

export const FINANCE: Role[] = ['OWNER', 'ACCOUNTANT'];
export const MANAGE: Role[] = ['OWNER', 'ADMIN'];
export const OPERATORS: Record<BusinessModule, Role[]> = {
  DEALER: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'SALES'],
  PARTS: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'PARTS_MANAGER'],
  RENTAL: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'RENTAL_AGENT'],
  HAULAGE: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'DISPATCHER'],
  MECHANIC: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'MECHANIC']
};
export function role(ctx: Context, allowed: readonly Role[]): void {
  check(allowed.includes(ctx.member.role), 'Your staff role cannot perform this action', 403);
}
export function active(state: WorkspaceState, now: string): boolean {
  return !!state.subscription && state.subscription.status !== 'CANCELLED'
    && state.subscription.start_at <= now && state.subscription.end_at > now;
}
export function scoped(ctx: Context, branchId: string): boolean {
  return ['OWNER', 'ACCOUNTANT'].includes(ctx.member.role) || ctx.member.branches.includes(branchId);
}
export function branch(ctx: Context, branchId: string, module?: BusinessModule): void {
  const row = found(ctx.state.branches.find(b => b.id === branchId && b.active));
  check(scoped(ctx, branchId), 'Branch is outside your staff access', 403);
  if (module) check(row.modules.includes(module), 'This module is not enabled at this branch', 403);
}
export function access(ctx: Context, module: BusinessModule, write = false, settlement = false): void {
  check(ctx.state.software_history.includes(module) && ctx.member.modules.includes(module),
    'This business module is outside your access', 403);
  if (write) {
    role(ctx, OPERATORS[module]);
    if (!settlement) check(active(ctx.state, ctx.now) && ctx.state.subscription?.software
      && ctx.state.subscription.modules.includes(module), 'An active subscription to this module is required', 403);
  }
}
export function capacity(ctx: Context, module: BusinessModule, used: number): void {
  check(ctx.state.subscription && used < ctx.state.subscription.limits.capacities[module],
    'Module capacity reached; increase the allowance before adding more', 409);
}
export function finance(ctx: Context): void { role(ctx, FINANCE); }
