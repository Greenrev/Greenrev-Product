import { createHash } from 'node:crypto';
import { requireCondition as check } from '../errors.js';
import { ACCOUNTS, reports, type AccountCode, type Journal } from '../ledger.js';
import { isoDate } from '../money.js';
import { access, branch, finance, scoped } from './access.js';
import type { Context, Input } from './model.js';
import { extras } from './restoration-state.js';
import { moduleCode, text } from './validation.js';
export type TaggedJournal = Journal & { module: string; branch_id: string };
const day = (date: Date) => date.toISOString().slice(0, 10);
const shift = (value: string, n: number) => day(new Date(Date.parse(value + 'T00:00:00Z') + n * 86400000));
export function reportPeriod(ctx: Context, d: Input) {
  const today = ctx.now.slice(0, 10), anchor = d.as_of ? isoDate(text(d, 'as_of')) : today;
  const a = new Date(anchor + 'T00:00:00Z'), year = a.getUTCFullYear(), month = a.getUTCMonth();
  let from = anchor, to = anchor; const preset = text(d, 'preset', 'MONTH');
  if (d.from || d.to || preset === 'CUSTOM') { from = isoDate(text(d, 'from')); to = isoDate(text(d, 'to')); }
  else if (preset === 'WEEK') { from = shift(anchor, -((a.getUTCDay() + 6) % 7)); to = shift(from, 6); }
  else if (preset === 'MONTH') { from = day(new Date(Date.UTC(year, month, 1))); to = day(new Date(Date.UTC(year, month + 1, 0))); }
  else if (preset === 'QUARTER') { const q = Math.floor(month / 3) * 3; from = day(new Date(Date.UTC(year, q, 1))); to = day(new Date(Date.UTC(year, q + 3, 0))); }
  else if (preset === 'YEAR') { from = `${year}-01-01`; to = `${year}-12-31`; }
  else if (preset === 'FINANCIAL_YEAR') { const m = extras(ctx.state).financial.year_start_month - 1; const y = month >= m ? year : year - 1; from = day(new Date(Date.UTC(y, m, 1))); to = day(new Date(Date.UTC(y + 1, m, 0))); }
  else check(preset === 'DAY', 'Choose week, month, quarter, year, financial year or custom dates');
  check(from <= to, 'Start date must not be after end date');
  check(Date.parse(to) - Date.parse(from) <= 3660 * 86400000, 'Report range cannot exceed ten years');
  // An unfinished period is shown to date; future invoices cannot enter historical statements.
  const effectiveTo = to > today ? today : to;
  check(from <= effectiveTo, 'Choose a period that has started');
  return { preset, from, to: effectiveTo, requested_to: to, previous_from: shift(from, -(Math.round((Date.parse(effectiveTo) - Date.parse(from)) / 86400000) + 1)), previous_to: shift(from, -1) };
}
export function financialReport(ctx: Context, d: Input, all: TaggedJournal[]) {
  finance(ctx); const s = ctx.state, ex = extras(s);
  check(s.software_history.some(m => ctx.member.modules.includes(m)), 'Business software history is required', 403);
  const m = d.module && d.module !== 'ALL' ? moduleCode(d.module) : undefined; if (m) access(ctx, m);
  const b = d.branch_id && d.branch_id !== 'ALL' ? text(d, 'branch_id') : undefined; if (b) branch(ctx, b);
  const p = reportPeriod(ctx, d);
  const visibleModules = s.software_history.filter(x => ctx.member.modules.includes(x));
  const fullAccess = s.software_history.every(x => ctx.member.modules.includes(x));
  const sharedIncluded = (!m && fullAccess) || (s.software_history.length === 1 && !!m);
  const visible = all.filter(j => scoped(ctx, j.branch_id) && (!b || j.branch_id === b) && (j.module === 'SHARED' ? fullAccess : visibleModules.includes(j.module as never)));
  const journals = visible.filter(j => j.module === 'SHARED' ? sharedIncluded : (!m || j.module === m));
  const current = reports(s.id, journals, p.from, p.to), previous = reports(s.id, journals, p.previous_from, p.previous_to);
  const before = reports(s.id, journals, '1900-01-01', shift(p.from, -1));
  const periodJournals = journals.filter(j => j.date >= p.from && j.date <= p.to);
  const fingerprint = createHash('sha256').update(JSON.stringify({ period: {from:p.from,to:p.to}, m, b, scope_modules:[...visibleModules].sort(),settings: ex.financial,
    journals: journals.filter(j => j.date <= p.to), due_dates: ex.due_dates })).digest('hex');
  // Link every journal to its economic obligation, including reversals and independently verified receipts.
  const byId = new Map(all.map(j => [j.id, j]));
  function target(j: Journal, seen = new Set<string>()): string {
    if (seen.has(j.id)) return j.source_id; seen.add(j.id);
    if (j.source_type === 'REVERSAL') { const original = byId.get(j.source_id); return original ? target(original, seen) : j.source_id; }
    const receipt = s.receipts.find(r => r.id === j.source_id); if (receipt) return receipt.invoice_id;
    const payment = s.dealer?.payments.find(([id]) => id === j.source_id)?.[1]; if (payment) return payment.target_id;
    return j.source_id;
  }
  const groups = new Map<string, { ar: number; ap: number; first: string; module: string; branch_id: string }>();
  for (const j of journals.filter(j => j.date <= p.to)) {
    const key = target(j), g = groups.get(key) ?? { ar: 0, ap: 0, first: j.date, module: j.module, branch_id: j.branch_id };
    for (const l of j.lines) { if (l.account === '1100') g.ar += l.debit - l.credit; if (l.account === '2000') g.ap += l.credit - l.debit; }
    if (j.date < g.first) g.first = j.date; groups.set(key, g);
  }
  function detail(id: string, g: { first: string; module: string; branch_id: string }, amount: number, kind: 'RECEIVABLE' | 'PAYABLE') {
    const invoice = s.service_invoices.find(x => x.id === id) ?? s.orders.find(x => x.id === id) ?? s.dealer?.invoices.find(([key]) => key === id)?.[1];
    const expense = s.expenses.find(x => x.id === id); const bill = s.dealer?.bills.find(([key]) => key === id)?.[1];
    const partyId = (invoice && 'debtor_id' in invoice ? invoice.debtor_id : undefined) ?? invoice?.customer_id ?? expense?.supplier_id ?? bill?.party_id;
    const due = ex.due_dates[id] ?? (invoice && 'plan' in invoice ? invoice.plan[0]?.due_date : undefined) ?? null;
    const age = due ? Math.max(0, Math.floor((Date.parse(p.to) - Date.parse(due)) / 86400000)) : null;
    return { id, obligation_id:id, scheduled:false, kind, party: s.parties.find(x => x.id === partyId)?.name ?? 'Unassigned / adjustment', party_id: partyId ?? null,
      module: g.module, branch_id: g.branch_id, posted_date: g.first, due_date: due, overdue_days: age,
      bucket: !due ? 'NO_DUE_DATE' : due >= p.to ? 'CURRENT' : age! <= 30 ? '1_30' : age! <= 60 ? '31_60' : age! <= 90 ? '61_90' : 'OVER_90',
      balance_minor: amount, currency: bill?.currency ?? expense?.currency ?? 'NGN', foreign_original_minor: bill?.foreign_minor ?? expense?.foreign_minor ?? null };
  }
  const receivables = [...groups].filter(([, g]) => g.ar !== 0).flatMap(([id, g]) => {
    const invoice=s.dealer?.invoices.find(([key])=>key===id)?.[1];
    if(!invoice||invoice.mode!=='INSTALLMENT'||invoice.plan.length<2||g.ar<=0)return[detail(id,g,g.ar,'RECEIVABLE')];
    let paid=Math.max(0,invoice.total_minor-g.ar);
    return invoice.plan.flatMap((due,index)=>{const total=due.principal_minor+due.finance_minor,take=Math.min(total,paid);paid-=take;const remaining=total-take;if(!remaining)return[];const days=Math.max(0,Math.floor((Date.parse(p.to)-Date.parse(due.due_date))/86400000));return[{...detail(id,g,remaining,'RECEIVABLE'),id:id+'#'+(index+1),obligation_id:id,scheduled:true,due_date:due.due_date,overdue_days:days,bucket:due.due_date>=p.to?'CURRENT':days<=30?'1_30':days<=60?'31_60':days<=90?'61_90':'OVER_90'}];});
  });
  const payables = [...groups].filter(([, g]) => g.ap !== 0).map(([id, g]) => detail(id, g, g.ap, 'PAYABLE'));
  const cashRows = periodJournals.flatMap(j => j.lines.filter(l => l.account === '1000').map(l => ({ date: j.date, source: j.source_type,
    source_id: j.source_id, memo: j.memo, module: j.module, branch_id: j.branch_id, inflow_minor: l.debit, outflow_minor: l.credit })));
  const checks: { severity: 'ERROR' | 'REVIEW' | 'INFO'; message: string }[] = [];
  if (current.balance_check_minor !== 0) checks.push({ severity: 'ERROR', message: 'The financial position does not balance.' });
  if (periodJournals.some(j => j.lines.reduce((n, l) => n + l.debit - l.credit, 0) !== 0)) checks.push({ severity: 'ERROR', message: 'An unbalanced journal needs correction.' });
  const pending = s.receipts.filter(r => r.status === 'EVIDENCE' && visibleModules.includes(r.module) && (!m || r.module === m) && (!b || r.branch_id === b)).length
    + (visibleModules.includes('DEALER') && (!m || m === 'DEALER') ? (s.dealer?.payments.filter(([, r]) => r.status === 'EVIDENCE').length ?? 0) : 0);
  if (pending) checks.push({ severity: 'REVIEW', message: `${pending} payment evidence item(s) are unverified and excluded from posted cash.` });
  if ([...receivables, ...payables].some(x => !x.due_date)) checks.push({ severity: 'REVIEW', message: 'Some balances have no due date. They appear in “No due date”, not an invented ageing bucket.' });
  if ([...receivables, ...payables].some(x => x.party_id === null)) checks.push({ severity: 'REVIEW', message: 'Manual adjustments contain receivable/payable balances without a named party; reconcile these before year end.' });
  const shared = reports(s.id, visible.filter(j => j.module === 'SHARED'), p.from, p.to);
  if (!sharedIncluded && shared.overhead_minor) checks.push({ severity: 'REVIEW', message: 'Shared overhead is excluded from this activity. Use the whole-business report for the final net profit.' });
  if (s.transfers.some(t => t.status === 'DISPATCHED' && (!b || [t.source_branch, t.destination_branch].includes(b))) && visibleModules.includes('PARTS')) checks.push({ severity: 'REVIEW', message: 'Parts remain in transit; confirm receipts or record a reviewed loss adjustment.' });
  checks.push({ severity: 'INFO', message: 'Bookkeeping statements for review. Tax, depreciation, accruals, opening balances and statutory adjustments must be checked by your accountant.' });
  const accountTotals = current.trial_balance.map(r => ({ ...r, debit_balance_minor: Math.max(0, r.balance), credit_balance_minor: Math.max(0, -r.balance) }));
  const lines = [['Sales and service revenue', current.revenue_minor, previous.revenue_minor], ['Cost of sales', current.cogs_minor, previous.cogs_minor], ['Gross profit', current.gross_profit_minor, previous.gross_profit_minor], ['Earned finance income', current.finance_income_minor, previous.finance_income_minor], ['Operating expenses', current.overhead_minor, previous.overhead_minor], ['FX loss / (gain)', current.fx_loss_minor, previous.fx_loss_minor], ['Depreciation', current.depreciation_minor, previous.depreciation_minor], ['Net profit / (loss)', current.net_profit_minor, previous.net_profit_minor]].map(([label, amount, prior]) => ({ label: label as string, amount_minor: amount as number, previous_minor: prior as number, change_minor: Number(amount) - Number(prior) }));
  return { ...current, period: p, business: { name: s.name, ...ex.financial }, module: m ?? (fullAccess ? 'ALL' : 'PERMITTED'), branch_id: b ?? 'ALL', fingerprint,
    comparison: previous, profit_loss: lines, trial_balance: accountTotals,
    position: accountTotals.filter(r => ['ASSET', 'LIABILITY', 'EQUITY'].includes(r.type)),
    shared_overhead_included: sharedIncluded, unallocated_shared_overhead_minor: sharedIncluded ? 0 : shared.overhead_minor,
    cash: { opening_minor: before.bank_minor, closing_minor: current.bank_minor, inflow_minor: cashRows.reduce((n, r) => n + r.inflow_minor, 0), outflow_minor: cashRows.reduce((n, r) => n + r.outflow_minor, 0), rows: cashRows },
    receivables, payables, checks, journals: periodJournals,
    reviews: ex.reviews.filter(r => r.from === p.from && r.to === p.to && r.module === (m ?? (fullAccess?'ALL':'PERMITTED')) && (r.module!=='PERMITTED'||JSON.stringify([...(r.scope_modules??[])].sort())===JSON.stringify([...visibleModules].sort())) && r.branch_id === (b ?? 'ALL')).map(r => ({ ...r, current: r.fingerprint === fingerprint })),
    tax: { output_minor: current.tax_payable_minor, input_minor: current.trial_balance.find(r => r.account === '1400')!.balance, net_minor: current.tax_payable_minor - current.trial_balance.find(r => r.account === '1400')!.balance } };
}
export type FinancialReport = ReturnType<typeof financialReport>;
export function csv(rows: unknown[][]): string {
  // Prevent spreadsheet formula execution in text supplied by users.
  const cell = (v: unknown) => { const raw = String(v ?? ''); const safe = typeof v === 'string' && /^[\s]*[=+\-@]/.test(raw) && !/^-?\d+(?:\.\d+)?$/.test(raw) ? "'" + raw : raw; return '"' + safe.replaceAll('"', '""') + '"'; };
  return '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
export function reportFiles(r: FinancialReport): { name: string; csv: string }[] {
  const amount = (n: number) => (n / 100).toFixed(2);
  return [
    { name: '01-profit-and-loss.csv', csv: csv([['Business', r.business.name], ['From', r.from, 'To', r.to, 'Module', r.module, 'Branch', r.branch_id], ['Line', 'NGN', 'Previous NGN'], ...r.profit_loss.map(x => [x.label, amount(x.amount_minor), amount(x.previous_minor)])]) },
    { name: '02-financial-position.csv', csv: csv([['As of', r.to], ['Account', 'Name', 'Type', 'Debit balance NGN', 'Credit balance NGN'], ...r.position.map(x => [x.account, x.name, x.type, amount(x.debit_balance_minor), amount(x.credit_balance_minor)]), ['Retained profit', amount(r.retained_profit_minor)], ['Balance check', amount(r.balance_check_minor)]]) },
    { name: '03-trial-balance.csv', csv: csv([['Account', 'Name', 'Type', 'Cumulative debits NGN', 'Cumulative credits NGN', 'Debit balance NGN', 'Credit balance NGN'], ...r.trial_balance.map(x => [x.account, x.name, x.type, amount(x.debit), amount(x.credit), amount(x.debit_balance_minor), amount(x.credit_balance_minor)])]) },
    ...(['receivables', 'payables'] as const).map((key, i) => ({ name: `0${i + 4}-${key}-ageing.csv`, csv: csv([['Reference', 'Party', 'Module', 'Branch', 'Posted', 'Due', 'Age bucket', 'Balance NGN', 'Bill currency', 'Original foreign amount'], ...r[key].map(x => [x.id, x.party, x.module, x.branch_id, x.posted_date, x.due_date, x.bucket, amount(x.balance_minor),x.currency,x.foreign_original_minor===null?'':amount(x.foreign_original_minor)])]) })),
    { name: '06-general-ledger.csv', csv: csv([['Date', 'Journal', 'Source', 'Reference', 'Module', 'Branch', 'Memo', 'Account', 'Account name', 'Debit NGN', 'Credit NGN'], ...r.journals.flatMap(j => j.lines.map(l => [j.date, j.id, j.source_type, j.source_id, j.module, j.branch_id, j.memo, l.account, ACCOUNTS[l.account][0], amount(l.debit), amount(l.credit)]))]) },
    { name: '07-cash-movements.csv', csv: csv([['Opening cash NGN', amount(r.cash.opening_minor)], ['Closing cash NGN', amount(r.cash.closing_minor)], ['Date', 'Source', 'Reference', 'Module', 'Inflow NGN', 'Outflow NGN'], ...r.cash.rows.map(x => [x.date, x.source, x.source_id, x.module, amount(x.inflow_minor), amount(x.outflow_minor)])]) },
    { name: '08-tax-review.csv', csv: csv([['As of', r.to], ['Posted output tax NGN', amount(r.tax.output_minor)], ['Posted recoverable input tax NGN', amount(r.tax.input_minor)], ['Net ledger tax NGN', amount(r.tax.net_minor)], ['Status', 'For accountant review; no tax rate, deductibility or filing certification is implied.']]) },
    { name: '09-review-report.csv', csv: csv([['Fingerprint', r.fingerprint], ['Statement', 'Bookkeeping review pack; not audited financial statements or a tax filing.'], ['Severity', 'Review point'], ...r.checks.map(c => [c.severity, c.message]), ['Review status', 'Reviewer', 'Date', 'Notes', 'Matches current data'], ...r.reviews.map(x => [x.status, x.actor, x.at, x.note, x.current])]) }
  ];
}
