import { randomUUID } from 'node:crypto';
import { Problem } from './errors.js';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export const ACCOUNTS = {
  '1000': ['Bank and cash', 'ASSET'],
  '1100': ['Accounts receivable', 'ASSET'],
  '1200': ['Vehicle inventory', 'ASSET'],
  '1210': ['Parts inventory', 'ASSET'],
  '1300': ['Fleet and other fixed assets', 'ASSET'],
  '1310': ['Accumulated depreciation', 'ASSET'],
  '1400': ['Approved input tax recoverable', 'ASSET'],
  '1500': ['Stock in transit / interbranch clearing', 'ASSET'],
  '2000': ['Accounts payable', 'LIABILITY'],
  '2100': ['Output tax payable', 'LIABILITY'],
  '2200': ['Unearned finance charges', 'LIABILITY'],
  '2300': ['Consignment owners payable', 'LIABILITY'],
  '2400': ['Customer refunds payable', 'LIABILITY'],
  '2500': ['Invoiced sales pending fulfilment', 'LIABILITY'],
  '2600': ['Refundable rental security deposits', 'LIABILITY'],
  '2700': ['Loans payable', 'LIABILITY'],
  '3000': ['Owner capital', 'EQUITY'],
  '4000': ['Vehicle and parts sales', 'INCOME'],
  '4010': ['Consignment commission', 'INCOME'],
  '4100': ['Earned finance charges', 'INCOME'],
  '4200': ['Service revenue', 'INCOME'],
  '5000': ['Cost of sales', 'EXPENSE'],
  '6000': ['Operating expenses', 'EXPENSE'],
  '6100': ['Realised FX loss / (gain)', 'EXPENSE'],
  '6200': ['Depreciation expense', 'EXPENSE']
} as const satisfies Record<string, readonly [string, AccountType]>;

export type AccountCode = keyof typeof ACCOUNTS;
export interface JournalLine { account: AccountCode; debit: number; credit: number }
export interface Journal {
  id: string;
  branch_id?: string;
  tenant_id: string;
  source_type: string;
  source_id: string;
  memo: string;
  date: string;
  created_at: string;
  lines: JournalLine[];
}

export function journal(tenant: string, source: string, sourceId: string, memo: string,
  entries: readonly (readonly [AccountCode, number, number])[], day: string): Journal {
  if (!entries.length) throw new Problem('Journal needs at least one line');
  let debit = 0n, credit = 0n;
  const lines: JournalLine[] = entries.filter(([, dr, cr]) => dr !== 0 || cr !== 0)
    .map(([account, dr, cr]) => {
    if (!ACCOUNTS[account] || !Number.isSafeInteger(dr) || !Number.isSafeInteger(cr)
        || dr < 0 || cr < 0 || (dr > 0) === (cr > 0)) {
      throw new Problem('Each journal line must contain exactly one non-zero debit or credit');
    }
    debit += BigInt(dr);
    credit += BigInt(cr);
    return { account, debit: dr, credit: cr };
    });
  if (!lines.length) throw new Problem('Journal needs at least one non-zero line');
  if (debit !== credit) throw new Problem('Journal is not balanced');
  return {
    id: 'JRN-' + randomUUID(), tenant_id: tenant, source_type: source,
    source_id: sourceId, memo, date: day, created_at: new Date().toISOString(), lines
  };
}

export function reversal(original: Journal, reason: string): Journal {
  return journal(original.tenant_id, 'REVERSAL', original.id, reason,
    original.lines.map(l => [l.account, l.credit, l.debit] as const), original.date);
}

export function reports(tenant: string, journals: readonly Journal[],
  from = '1900-01-01', to = new Date().toISOString().slice(0, 10)) {
  if (from > to) throw new Problem('Start date must not be after end date');
  const total = new Map<AccountCode, { debit: number; credit: number; balance: number }>();
  const period = new Map<AccountCode, number>();
  for (const j of journals) {
    if (j.tenant_id !== tenant || j.date > to) continue;
    for (const l of j.lines) {
      const existing = total.get(l.account) ?? { debit: 0, credit: 0, balance: 0 };
      existing.debit += l.debit;
      existing.credit += l.credit;
      existing.balance += l.debit - l.credit;
      total.set(l.account, existing);
      if (j.date >= from) period.set(l.account, (period.get(l.account) ?? 0) + l.debit - l.credit);
    }
  }
  const bal = (a: AccountCode) => total.get(a)?.balance ?? 0;
  const pb = (a: AccountCode) => period.get(a) ?? 0;
  const revenue = (-pb('4000') - pb('4010') - pb('4200')) || 0;
  const finance = -pb('4100') || 0;
  const cogs = pb('5000'), overhead = pb('6000'), fx = pb('6100'), depreciation = pb('6200');
  const retained = -Object.entries(ACCOUNTS)
    .filter(([, account]) => account[1] === 'INCOME' || account[1] === 'EXPENSE')
    .reduce((sum, [code]) => sum + bal(code as AccountCode), 0) || 0;
  const byType = (type: AccountType) => Object.entries(ACCOUNTS)
    .filter(([, account]) => account[1] === type)
    .reduce((sum, [code]) => sum + bal(code as AccountCode), 0);
  const assets = byType('ASSET'), liabilities = -byType('LIABILITY') || 0, capital = -bal('3000') || 0;
  return {
    from, to,
    revenue_minor: revenue, finance_income_minor: finance, cogs_minor: cogs,
    gross_profit_minor: revenue - cogs, overhead_minor: overhead, fx_loss_minor: fx,
    depreciation_minor: depreciation, net_profit_minor: revenue + finance - cogs - overhead - fx - depreciation,
    bank_minor: bal('1000'), receivable_minor: bal('1100'),
    inventory_minor: bal('1200'), vehicle_inventory_minor: bal('1200'),
    parts_inventory_minor: bal('1210'),
    total_inventory_minor: bal('1200') + bal('1210'),
    stock_transit_clearing_minor: bal('1500'),
    payable_minor: 0 - bal('2000'), tax_payable_minor: 0 - bal('2100'),
    unearned_finance_minor: 0 - bal('2200'),
    consignment_payable_minor: 0 - bal('2300'),
    refund_payable_minor: 0 - bal('2400'),
    rental_deposits_minor: 0 - bal('2600'),
    assets_minor: assets, liabilities_minor: liabilities,
    capital_minor: capital, retained_profit_minor: retained,
    balance_check_minor: assets - liabilities - capital - retained,
    trial_balance: Object.entries(ACCOUNTS).map(([account, [name, type]]) =>
      ({ account, name, type, ...(total.get(account as AccountCode)
        ?? { debit: 0, credit: 0, balance: 0 }) }))
  };
}
