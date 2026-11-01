import { requireCondition as check } from '../errors.js';
import { monthAfter, proportional } from '../money.js';
import { MODULES, type Catalogue, type Input, type Product, type Quote,
  type RateCard, type Tier, type WorkspaceState } from './model.js';
import { count, id, modules, moduleCode, object, safeSum, text } from './validation.js';

const PRODUCTS: Product[] = ['CORE', ...MODULES, 'MARKETPLACE'];
export function defaultCatalogue(now: string): Catalogue {
  const make = (branches: number, users: number, size: number): RateCard => ({
    monthly_minor: Object.fromEntries(PRODUCTS.map(p => [p, null])) as RateCard['monthly_minor'],
    extra_branch_minor: null, extra_user_minor: null,
    extra_capacity_minor: Object.fromEntries(MODULES.map(p => [p, null])) as RateCard['extra_capacity_minor'],
    limits: { branches, users, capacities: { DEALER: size * 20, PARTS: size * 500,
      RENTAL: size * 5, HAULAGE: size * 3, MECHANIC: size * 50 } }
  });
  return { schema_version: 4, version: 1, currency: 'NGN', published_at: now,
    tiers: { STARTER: make(1, 3, 1), GROWTH: make(3, 10, 5), ENTERPRISE: make(5, 30, 20) }, changes: [], replays: [] };
}
export function tier(value: unknown): Tier {
  check(['STARTER', 'GROWTH', 'ENTERPRISE'].includes(String(value)), 'Invalid subscription tier');
  return value as Tier;
}
export function changeCatalogue(current: Catalogue, actor: string, d: Input, now: string): Catalogue {
  check(d.expected_version === current.version, 'Catalogue changed; reload before publishing', 409);
  const chosen = tier(d.tier), next = structuredClone(current), row = next.tiers[chosen];
  const prices = object(d.monthly_minor, 'monthly_minor');
  check(Object.keys(prices).every(k => PRODUCTS.includes(k as Product)), 'Unsupported price product');
  for (const product of PRODUCTS) if (product in prices) row.monthly_minor[product] = prices[product] === null
    ? null : count(prices, product, 0, 100_000_000_000);
  if (d.limits !== undefined) {
    const limits = object(d.limits, 'limits');
    if (limits.branches !== undefined) row.limits.branches = count(limits, 'branches', 1, 1000);
    if (limits.users !== undefined) row.limits.users = count(limits, 'users', 1, 10000);
    if (limits.capacities !== undefined) {
      const caps = object(limits.capacities, 'capacities');
      check(Object.keys(caps).every(k => MODULES.includes(k as BusinessModule)), 'Unsupported module capacity');
      for (const m of MODULES) if (m in caps) row.limits.capacities[m] = count(caps, m, 1, 1000000);
    }
  }
  if (d.extra_branch_minor !== undefined) row.extra_branch_minor = count(d, 'extra_branch_minor', 0, 100_000_000_000);
  if (d.extra_user_minor !== undefined) row.extra_user_minor = count(d, 'extra_user_minor', 0, 100_000_000_000);
  if (d.extra_capacity_minor !== undefined) {
    const over = object(d.extra_capacity_minor, 'extra_capacity_minor');
    check(Object.keys(over).every(k => MODULES.includes(k as BusinessModule)), 'Unsupported capacity product');
    for (const m of MODULES) if (m in over) row.extra_capacity_minor[m] = count(over, m, 0, 100_000_000_000);
  }
  next.version++; next.published_at = now;
  next.changes.push({ actor, at: now, reason: text(d, 'reason', undefined, 500), version: next.version });
  return next;
}
// Import type separately to keep the public catalogue contract small.
import type { BusinessModule } from './model.js';

export function makeQuote(s: WorkspaceState, catalogue: Catalogue, d: Input, now: string): Quote {
  check(!s.scheduled_subscription, 'A prepaid change is already scheduled; contact billing before replacing it', 409);
  const selected = modules(d.modules), primary = moduleCode(d.primary_module);
  check(selected.includes(primary), 'Primary module must be selected');
  const chosen = tier(d.tier), card = catalogue.tiers[chosen];
  const mode = text(d, 'mode', 'SAAS');
  check(['SAAS', 'BUNDLE', 'MARKETPLACE'].includes(mode), 'Choose SaaS, Marketplace or Bundle');
  const software = mode !== 'MARKETPLACE', marketplace = mode !== 'SAAS';
  const limits = structuredClone(card.limits);
  limits.branches = count(d, 'branches', card.limits.branches, 1000, card.limits.branches);
  limits.users = count(d, 'users', card.limits.users, 10000, card.limits.users);
  const requested = d.capacities === undefined ? {} : object(d.capacities, 'capacities');
  check(Object.keys(requested).every(k => selected.includes(k as BusinessModule)), 'Capacity must refer to a selected module');
  for (const m of selected) limits.capacities[m] = count(requested, m, card.limits.capacities[m], 1000000, card.limits.capacities[m]);
  const items: Quote['items'] = [];
  const item = (product: string, quantity: number, price: number | null) => {
    if (!quantity) return;
    check(price !== null, 'Pricing has not been published for ' + product + '; request a quote', 409);
    const total = safeSum([Number(BigInt(price) * BigInt(quantity))]);
    items.push({ product, quantity, unit_minor: price, total_minor: total });
  };
  if (software) {
    item('CORE', 1, card.monthly_minor.CORE);
    for (const m of selected) {
      item(m, 1, card.monthly_minor[m]);
      item(m + '_CAPACITY', limits.capacities[m] - card.limits.capacities[m], card.extra_capacity_minor[m]);
    }
    item('EXTRA_BRANCH', limits.branches - card.limits.branches, card.extra_branch_minor);
    item('EXTRA_USER', limits.users - card.limits.users, card.extra_user_minor);
  }
  if (marketplace) item('MARKETPLACE', 1, card.monthly_minor.MARKETPLACE);
  const total = safeSum(items.map(i => i.total_minor));
  const old = s.subscription;
  let start = now, end = monthAfter(now.slice(0, 10), 1) + now.slice(10), due = total;
  if (old?.status === 'ACTIVE' && old.end_at > now) {
    const oldTotal = safeSum(old.items.map(i => i.total_minor));
    const sameOrUpgrade = old.software === software && (!old.marketplace || marketplace)
      && old.modules.every(m => selected.includes(m)) && limits.branches >= old.limits.branches
      && limits.users >= old.limits.users && old.modules.every(m => limits.capacities[m] >= old.limits.capacities[m])
      && total > oldTotal;
    if (sameOrUpgrade) {
      end = old.end_at;
      due = proportional(total - oldTotal, Date.parse(end) - Date.parse(now), Date.parse(end) - Date.parse(old.start_at));
    } else {
      start = old.end_at;
      end = monthAfter(start.slice(0, 10), 1) + start.slice(10);
    }
  }
  return { id: id('QUOTE'), catalogue_version: catalogue.version, created_at: now,
    expires_at: new Date(Date.parse(now) + 15 * 60000).toISOString(),
    modules: selected, primary_module: primary, mode: mode as Quote['mode'],
    tier: chosen, limits, marketplace, items, currency: 'NGN', monthly_minor: total,
    due_minor: due, status: 'OPEN', subscription_revision: old?.revision ?? 0, period_start: start, period_end: end };
}
