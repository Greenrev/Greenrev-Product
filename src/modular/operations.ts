import { requireCondition as check, Problem } from '../errors.js';
import { journal, reversal, type AccountCode } from '../ledger.js';
import { basisPoints, convert, isoDate, proportional, rate } from '../money.js';
import { access, branch, capacity, finance, OPERATORS, role, scoped } from './access.js';
import type { BusinessModule, Context, Input, Inspection, Mutation, Rental, ServiceInvoice } from './model.js';
import { assertPostingOpen, extras } from './restoration-state.js';
import { count, found, id, moduleCode, money, period, safeSum, text, timestamp, version, vin } from './validation.js';

export function post(ctx: Context, module: BusinessModule | 'SHARED', branchId: string,
  source: string, sourceId: string, entries: readonly (readonly [AccountCode, number, number])[]): void {
  assertPostingOpen(ctx.state, ctx.posting_date ?? ctx.now.slice(0, 10));
  ctx.state.journals.push({ ...journal(ctx.state.id, source, sourceId, source.replaceAll('_', ' '), entries,
    (ctx.posting_date ?? ctx.now.slice(0, 10))), module, branch_id: branchId });
}
export function bankReference(ctx: Context, d: Input): string {
  const reference = text(d, 'reference', undefined, 150);
  check(!ctx.state.payment_references.includes(reference), 'Bank reference has already been used', 409);
  ctx.state.payment_references.push(reference);
  return reference;
}
function supplierAmounts(d:Input,field:string){const currency=text(d,'currency','NGN');check(['NGN','USD','GBP','EUR','CAD','AED','CNY'].includes(currency),'Unsupported supplier bill currency');const fx=currency==='NGN'?'1.00000000':rate(text(d,'fx')),foreign=money(d,field,'0',true),base=convert(foreign,fx),tax=money(d,'recoverable_tax');check(base>tax,'Recoverable input tax must be below the gross bill amount');return{currency,fx,foreign_minor:foreign,amount_minor:base,recoverable_tax_minor:tax,paid_foreign_minor:0,settled_base_minor:0};}
function customer(ctx: Context, customerId: string, branchId: string): void {
  const party = found(ctx.state.parties.find(p => p.id === customerId));
  check(['CUSTOMER', 'BOTH'].includes(party.kind), 'Choose a customer');
  check(party.branch_id === branchId, 'Customer must belong to the operating branch', 403);
}
function assetFree(ctx: Context, assetId: string, start: string, end: string, except = ''): void {
  const bookings = [...ctx.state.rentals, ...ctx.state.haulage];
  check(!bookings.some(b => b.id !== except && b.asset_id === assetId
    && ['BOOKED', 'CHECKED_OUT', 'QUOTED', 'DISPATCHED'].includes(b.status)
    && ((b.start_at < end && b.end_at > start)
      || (['CHECKED_OUT', 'DISPATCHED'].includes(b.status) && b.end_at < ctx.now))),
  'Fleet asset is booked or has an overdue unreturned job', 409);
}
export function availableAssets(ctx: Context, d: Input) {
  const [start, end] = period(d, ctx.now);
  if (d.branch_id) branch(ctx, text(d, 'branch_id'), 'RENTAL');
  return ctx.state.fleet.filter(a => a.module === 'RENTAL' && a.status === 'ACTIVE' && scoped(ctx, a.branch_id)
    && (!d.branch_id || a.branch_id === d.branch_id)).filter(a => {
      try { assetFree(ctx, a.id, start, end); return true; }
      catch (error) { if (error instanceof Problem && error.status === 409) return false; throw error; }
    }).map(a => ({ id: a.id, name: a.name, registration: a.registration, branch_id: a.branch_id }));
}
function inspection(d: Input, now: string): Inspection {
  return { odometer: count(d, 'odometer', 0, 10_000_000), fuel_percent: count(d, 'fuel_percent', 0, 100),
    condition: text(d, 'condition', undefined, 1500), acknowledgement: text(d, 'acknowledgement', undefined, 500), at: now };
}
function rental(ctx: Context, rentalId: string, write = true, settlement = false): Rental {
  const row = found(ctx.state.rentals.find(r => r.id === rentalId));
  access(ctx, 'RENTAL', write, settlement); branch(ctx, row.branch_id, 'RENTAL');
  return row;
}
function invoice(ctx: Context, invoiceId: string): ServiceInvoice {
  const row = found(ctx.state.service_invoices.find(r => r.id === invoiceId));
  access(ctx, row.module, true, true); branch(ctx, row.branch_id, row.module);
  return row;
}
function completed(ctx: Context, module: BusinessModule, jobId: string): boolean {
  return module === 'RENTAL' ? ctx.state.rentals.some(r => r.id === jobId && r.status === 'RETURNED')
    : module === 'HAULAGE' ? ctx.state.haulage.some(r => r.id === jobId && r.status === 'DELIVERED')
    : ctx.state.workshop.some(r => r.id === jobId && r.status === 'COMPLETED');
}
function earn(ctx: Context, module: BusinessModule, jobId: string): void {
  const bill = ctx.state.service_invoices.find(i => i.job_id === jobId && i.module === module && i.status === 'DEFERRED');
  if (bill) {
    post(ctx, bill.module, bill.branch_id, 'SERVICE_EARNED', bill.id,
      [['2500', bill.net_minor, 0], ['4200', 0, bill.net_minor]]);
    bill.status = 'EARNED'; bill.version++;
  }
}

export function operations(ctx: Context, path: string, d: Input): Mutation | null {
  const s = ctx.state;
  if (path === '/api/fleet/assets') {
    const m = moduleCode(d.module ?? d.kind);
    check(m === 'RENTAL' || m === 'HAULAGE', 'Choose rental or haulage fleet');
    access(ctx, m, true); const b = text(d, 'branch_id'); branch(ctx, b, m);
    capacity(ctx, m, s.fleet.filter(a => a.module === m && a.status !== 'ARCHIVED').length);
    const chassis = vin(d.vin);
    check(!s.fleet.some(a => a.vin === chassis && a.status !== 'ARCHIVED')
      && !(s.dealer?.vehicles.some(([, v]) => v.vin === chassis && v.status !== 'DELIVERED')),
    'This VIN is already active in sale inventory or the operational fleet', 409);
    const row = { id: id('FLEET'), branch_id: b, module: m, vin: chassis, name: text(d, 'name'),
      registration: text(d, 'registration', ''), status: 'ACTIVE' as const, version: 1 };
    s.fleet.push(row); return { entity: row.id, result: row };
  }
  let match = /^\/api\/fleet\/assets\/([^/]+)\/status$/.exec(path);
  if (match) {
    const a = found(s.fleet.find(x => x.id === match![1])); access(ctx, a.module, true); branch(ctx, a.branch_id, a.module); version(a, d);
    check(['ACTIVE', 'MAINTENANCE', 'ARCHIVED'].includes(String(d.status)), 'Invalid asset status');
    if (d.status !== 'ACTIVE') check(!s.rentals.some(r => r.asset_id === a.id && ['BOOKED', 'CHECKED_OUT'].includes(r.status))
      && !s.haulage.some(j => j.asset_id === a.id && ['QUOTED', 'DISPATCHED'].includes(j.status)),
    'Resolve active bookings before holding or archiving an asset', 409);
    else if (a.status === 'ARCHIVED') capacity(ctx, a.module, s.fleet.filter(x => x.module === a.module && x.status !== 'ARCHIVED').length);
    a.status = d.status as typeof a.status; a.version++; return { entity: a.id, result: a };
  }
  if (path === '/api/rentals') {
    access(ctx, 'RENTAL', true); const b = text(d, 'branch_id'); branch(ctx, b, 'RENTAL');
    const a = found(s.fleet.find(x => x.id === d.asset_id && x.branch_id === b && x.module === 'RENTAL' && x.status === 'ACTIVE'));
    const c = text(d, 'customer_id'); customer(ctx, c, b); const [start, end] = period(d, ctx.now);
    assetFree(ctx, a.id, start, end);
    const daily = money(d, 'daily_rate', '0', true), days = Math.ceil((Date.parse(end) - Date.parse(start)) / 86400000);
    check(days <= 366, 'Rental duration cannot exceed 366 days');
    const row: Rental = { id: id('RENT'), branch_id: b, asset_id: a.id, customer_id: c, title: text(d, 'title', 'Vehicle rental'),
      start_at: start, end_at: end, rate_minor: daily, charge_minor: safeSum(Array<number>(days).fill(daily)),
      status: 'BOOKED', version: 1, driver_name: text(d, 'driver_name'), agreement: text(d, 'agreement', undefined, 1000),
      checkout: null, returned: null, deposit_required_minor: money(d, 'deposit'), deposit_received_minor: 0,
      deposit_deducted_minor: 0, deposit_refunded_minor: 0, deposit_references: [] };
    check(days <= 366, 'Rental duration cannot exceed 366 days');
    s.rentals.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/rentals\/([^/]+)\/(checkout|return|cancel|reschedule|deposit|deduction|refund)$/.exec(path);
  if (match) {
    const verb = match[2]!, r = rental(ctx, match[1]!, true, ['return', 'cancel', 'deposit', 'deduction', 'refund'].includes(verb)); version(r, d);
    if (verb === 'checkout') {
      check(r.status === 'BOOKED' && ctx.now >= r.start_at && ctx.now < r.end_at, 'Booking is not due for checkout', 409);
      const a = found(s.fleet.find(a => a.id === r.asset_id)); check(a.status === 'ACTIVE', 'Asset is on maintenance hold', 409);
      check(!s.rentals.some(x => x.id !== r.id && x.asset_id === r.asset_id && x.status === 'CHECKED_OUT'), 'Vehicle has not been returned', 409);
      check(r.deposit_received_minor >= r.deposit_required_minor, 'Collect and confirm the required security deposit', 409);
      r.checkout = inspection(d, ctx.now); r.status = 'CHECKED_OUT';
    } else if (verb === 'return') {
      check(r.status === 'CHECKED_OUT' && r.checkout, 'Only checked-out vehicles can be returned', 409);
      const reading = inspection(d, ctx.now); check(reading.odometer >= r.checkout.odometer, 'Return mileage cannot be lower than pickup');
      r.returned = reading; r.status = 'RETURNED'; earn(ctx, 'RENTAL', r.id);
    } else if (verb === 'cancel') {
      check(r.status === 'BOOKED', 'Only unstarted bookings can be cancelled', 409);
      check(!s.service_invoices.some(i => i.job_id === r.id && !['VOID', 'CREDITED'].includes(i.status)), 'Void or credit the invoice before cancellation', 409);
      r.status = 'CANCELLED';
    } else if (verb === 'reschedule') {
      check(r.status === 'BOOKED' && !s.service_invoices.some(i => i.job_id === r.id && !['VOID', 'CREDITED'].includes(i.status)), 'Rescheduling requires an unstarted, uninvoiced booking', 409);
      const [start, end] = period(d, ctx.now); const days = Math.ceil((Date.parse(end) - Date.parse(start)) / 86400000);
      check(days <= 366, 'Rental duration cannot exceed 366 days'); assetFree(ctx, r.asset_id, start, end, r.id);
      r.start_at = start; r.end_at = end; r.charge_minor = safeSum(Array<number>(days).fill(r.rate_minor));
    } else {
      finance(ctx); const amount = money(d, 'amount', '0', true); const balance = r.deposit_received_minor - r.deposit_deducted_minor - r.deposit_refunded_minor;
      if (verb === 'deposit') {
        check(['BOOKED', 'CHECKED_OUT'].includes(r.status), 'Deposit collection is closed', 409);
        check(amount <= r.deposit_required_minor - r.deposit_received_minor, 'Deposit exceeds the agreed requirement');
        text(d, 'confirmation', undefined, 500); r.deposit_references.push(bankReference(ctx, d));
        r.deposit_received_minor += amount;
        post(ctx, 'RENTAL', r.branch_id, 'RENTAL_DEPOSIT', r.id, [['1000', amount, 0], ['2600', 0, amount]]);
      } else {
        check(['RETURNED', 'CANCELLED'].includes(r.status), 'Close the booking before refund or deduction', 409);
        check(amount <= balance, 'Amount exceeds the remaining deposit');
        if (verb === 'deduction') {
          check(r.status === 'RETURNED', 'Damage deductions require a returned vehicle');
          text(d, 'reason', undefined, 1000); text(d, 'acknowledgement', undefined, 500);
          r.deposit_deducted_minor += amount;
          post(ctx, 'RENTAL', r.branch_id, 'RENTAL_DEDUCTION', r.id, [['2600', amount, 0], ['4200', 0, amount]]);
        } else {
          text(d, 'confirmation', undefined, 500); r.deposit_references.push(bankReference(ctx, d));
          r.deposit_refunded_minor += amount;
          post(ctx, 'RENTAL', r.branch_id, 'RENTAL_DEPOSIT_REFUND', r.id, [['2600', amount, 0], ['1000', 0, amount]]);
        }
      }
    }
    r.version++; return { entity: r.id, result: r };
  }
  if (path === '/api/haulage') {
    access(ctx, 'HAULAGE', true); const b = text(d, 'branch_id'); branch(ctx, b, 'HAULAGE');
    const a = found(s.fleet.find(a => a.id === d.asset_id && a.branch_id === b && a.module === 'HAULAGE' && a.status === 'ACTIVE'));
    const c = text(d, 'customer_id'); customer(ctx, c, b); const [start, end] = period(d, ctx.now); assetFree(ctx, a.id, start, end);
    const row = { id: id('HAUL'), branch_id: b, asset_id: a.id, customer_id: c, title: text(d, 'title'),
      origin: text(d, 'origin'), destination: text(d, 'destination'), cargo: text(d, 'cargo', undefined, 1500),
      start_at: start, end_at: end, quote_minor: money(d, 'quote', '0', true), status: 'QUOTED' as const,
      driver_id: null, delivery_evidence: null, delivered_at: null, version: 1 };
    s.haulage.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/haulage\/([^/]+)\/(assign|dispatch|deliver|cancel)$/.exec(path);
  if (match) {
    const r = found(s.haulage.find(j => j.id === match![1])), verb = match[2];
    if (ctx.member.role === 'DRIVER') {
      check(verb === 'deliver' && r.driver_id === ctx.member.id && ctx.member.modules.includes('HAULAGE'), 'Driver can update only their own assigned delivery', 403);
    } else access(ctx, 'HAULAGE', true, verb === 'deliver' || verb === 'cancel');
    branch(ctx, r.branch_id, 'HAULAGE'); version(r, d);
    if (verb === 'assign') {
      check(r.status === 'QUOTED', 'Assign the driver before dispatch', 409);
      const driver = found(s.members.find(m => m.id === d.driver_id && m.active && m.role === 'DRIVER'
        && m.branches.includes(r.branch_id) && m.modules.includes('HAULAGE')));
      check(!s.haulage.some(j => j.id !== r.id && j.driver_id === driver.id && ['QUOTED', 'DISPATCHED'].includes(j.status)
        && ((j.start_at < r.end_at && j.end_at > r.start_at) || (j.status === 'DISPATCHED' && j.end_at < ctx.now))), 'Driver is already assigned to a conflicting job', 409);
      r.driver_id = driver.id;
    } else if (verb === 'dispatch') {
      check(r.status === 'QUOTED' && r.driver_id && ctx.now >= r.start_at && ctx.now < r.end_at, 'Job needs an assigned driver and must be due for dispatch', 409);
      check(s.members.some(m => m.id === r.driver_id && m.active), 'Assigned driver is inactive', 409);
      check(s.fleet.some(a => a.id === r.asset_id && a.status === 'ACTIVE'), 'Truck is unavailable', 409);
      check(!s.haulage.some(j => j.id !== r.id && j.asset_id === r.asset_id && j.status === 'DISPATCHED'), 'Truck has not completed its previous delivery', 409);
      r.status = 'DISPATCHED';
    } else if (verb === 'deliver') {
      check(r.status === 'DISPATCHED', 'Only dispatched jobs can be delivered', 409);
      r.delivery_evidence = text(d, 'proof_of_delivery', undefined, 2000); r.delivered_at = ctx.now; r.status = 'DELIVERED'; earn(ctx, 'HAULAGE', r.id);
    } else {
      check(r.status === 'QUOTED' && !s.service_invoices.some(i => i.job_id === r.id && !['VOID', 'CREDITED'].includes(i.status)), 'Credit the invoice before cancelling an undispatched job', 409);
      r.status = 'CANCELLED';
    }
    r.version++; return { entity: r.id, result: r };
  }
  if (path === '/api/workshop') {
    access(ctx, 'MECHANIC', true); const b = text(d, 'branch_id'); branch(ctx, b, 'MECHANIC');
    capacity(ctx, 'MECHANIC', s.workshop.filter(j => !['COMPLETED', 'CANCELLED'].includes(j.status)).length);
    const c = text(d, 'customer_id'); customer(ctx, c, b);
    const row = { id: id('WORK'), branch_id: b, customer_id: c, title: text(d, 'title'), subject_vin: vin(d.subject_vin),
      status: 'BOOKED' as const, quote_minor: money(d, 'quote', '0', true), version: 1 };
    s.workshop.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/workshop\/([^/]+)\/(start|complete|cancel)$/.exec(path);
  if (match) {
    const r = found(s.workshop.find(j => j.id === match![1])); access(ctx, 'MECHANIC', true, match[2] !== 'start'); branch(ctx, r.branch_id, 'MECHANIC'); version(r, d);
    if (match[2] === 'start') { check(r.status === 'BOOKED', 'Job must be booked', 409); r.status = 'IN_PROGRESS'; }
    else if (match[2] === 'complete') { check(r.status === 'IN_PROGRESS', 'Job must be in progress', 409); r.status = 'COMPLETED'; earn(ctx, 'MECHANIC', r.id); }
    else { check(r.status === 'BOOKED' && !s.service_invoices.some(i => i.job_id === r.id && !['VOID', 'CREDITED'].includes(i.status)), 'Void or credit an invoice before cancelling an unstarted job', 409); r.status = 'CANCELLED'; }
    r.version++; return { entity: r.id, result: r };
  }
  if (path === '/api/service-invoices') {
    const m = moduleCode(d.module); check(['RENTAL', 'HAULAGE', 'MECHANIC'].includes(m), 'Invalid service module'); access(ctx, m, true, true);
    const job = found((m === 'RENTAL' ? s.rentals : m === 'HAULAGE' ? s.haulage : s.workshop).find(j => j.id === d.job_id)); branch(ctx, job.branch_id, m);
    check(job.status !== 'CANCELLED' && !s.service_invoices.some(i => i.job_id === job.id && !['VOID', 'CREDITED'].includes(i.status)), 'Job is cancelled or already invoiced', 409);
    const price = 'charge_minor' in job ? job.charge_minor : job.quote_minor;
    const discount = money(d, 'discount'); check(discount < price, 'Discount must be below the agreed charge');
    if (discount * 100 > price * 5) { role(ctx, ['OWNER']); text(d, 'override_reason', undefined, 500); }
    const net = price - discount, tax = proportional(net, basisPoints(text(d, 'tax_percent', '0')), 10000);
    const earned = completed(ctx, m, job.id);
    const row: ServiceInvoice = { id: id('SINV'), module: m as ServiceInvoice['module'], branch_id: job.branch_id,
      job_id: job.id, customer_id: job.customer_id, net_minor: net, tax_minor: tax, total_minor: safeSum([net, tax]), paid_minor: 0,
      status: earned ? 'EARNED' : 'DEFERRED', refunded_minor: 0, version: 1 };
    post(ctx, m, job.branch_id, 'SERVICE_INVOICE', row.id, [['1100', row.total_minor, 0], ['2100', 0, tax], [earned ? '4200' : '2500', 0, net]]);
    s.service_invoices.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/service-invoices\/([^/]+)\/void$/.exec(path);
  if (match) {
    finance(ctx); const row = invoice(ctx, match[1]!); version(row, d);
    check(row.status === 'DEFERRED' && row.paid_minor === 0, 'Only unpaid, unearned service invoices can be voided', 409);
    text(d, 'reason', undefined, 500);
    post(ctx, row.module, row.branch_id, 'SERVICE_VOID', row.id, [['2500', row.net_minor, 0], ['2100', row.tax_minor, 0], ['1100', 0, row.total_minor]]);
    row.status = 'VOID'; row.version++; return { entity: row.id, result: row };
  }
  match = /^\/api\/service-invoices\/([^/]+)\/(credit|refund)$/.exec(path);
  if (match) {
    finance(ctx); const row = invoice(ctx, match[1]!); version(row, d);
    if (match[2] === 'credit') {
      check(['DEFERRED', 'EARNED'].includes(row.status), 'Invoice is already voided or credited', 409);
      text(d, 'reason', undefined, 1000); text(d, 'acknowledgement', undefined, 500);
      assertPostingOpen(s,ctx.posting_date??ctx.now.slice(0,10));
      const originals = s.journals.filter(j => j.source_id === row.id && ['SERVICE_INVOICE', 'SERVICE_EARNED'].includes(j.source_type));
      for (const j of originals) s.journals.push({ ...reversal(j, 'Approved full service credit'), date: ctx.posting_date ?? ctx.now.slice(0,10), module: row.module, branch_id: row.branch_id });
      if (row.paid_minor) post(ctx, row.module, row.branch_id, 'SERVICE_REFUND_DUE', row.id, [['1100', row.paid_minor, 0], ['2400', 0, row.paid_minor]]);
      row.status = 'CREDITED';
    } else {
      check(row.status === 'CREDITED', 'Credit the service invoice before refunding', 409);
      const amount = money(d, 'amount', '0', true); check(amount <= row.paid_minor - row.refunded_minor, 'Refund exceeds the confirmed amount collected');
      text(d, 'confirmation', undefined, 500); bankReference(ctx, d); row.refunded_minor += amount;
      post(ctx, row.module, row.branch_id, 'SERVICE_REFUND', row.id, [['2400', amount, 0], ['1000', 0, amount]]);
    }
    row.version++; return { entity: row.id, result: row };
  }
  if (path === '/api/receipts') {
    const order = s.orders.find(o => o.id === d.invoice_id), bill = s.service_invoices.find(i => i.id === d.invoice_id);
    const target = found(order ?? bill), m = order ? 'PARTS' : bill!.module;
    access(ctx, m, true, true); branch(ctx, target.branch_id, m);
    check(!['VOID', 'CREDITED', 'RETURNED'].includes(target.status), 'Invoice is closed', 409);
    const amount = money(d, 'amount', '0', true); check(amount <= target.total_minor - target.paid_minor, 'Receipt exceeds outstanding balance');
    const row = { id: id('REC'), module: m as BusinessModule, branch_id: target.branch_id, invoice_id: target.id,
      amount_minor: amount, reference: bankReference(ctx, d), status: 'EVIDENCE' as const, verified_by: null };
    s.receipts.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/receipts\/([^/]+)\/verify$/.exec(path);
  if (match) {
    finance(ctx); const r = found(s.receipts.find(r => r.id === match![1])); access(ctx, r.module, true, true); branch(ctx, r.branch_id, r.module);
    if (r.status === 'VERIFIED') return { entity: r.id, result: r };
    text(d, 'confirmation', undefined, 500);
    const target = found(s.orders.find(o => o.id === r.invoice_id) ?? s.service_invoices.find(i => i.id === r.invoice_id));
    check(!['VOID', 'CREDITED', 'RETURNED'].includes(target.status) && r.amount_minor <= target.total_minor - target.paid_minor, 'Invoice is closed or receipt would overpay', 409);
    target.paid_minor += r.amount_minor; target.version++; r.status = 'VERIFIED'; r.verified_by = ctx.member.id;
    post(ctx, r.module, r.branch_id, 'RECEIPT_VERIFIED', r.id, [['1000', r.amount_minor, 0], ['1100', 0, r.amount_minor]]);
    return { entity: r.id, result: r };
  }
  if (path === '/api/parts') {
    access(ctx, 'PARTS', true); const b = text(d, 'branch_id'); branch(ctx, b, 'PARTS');
    const sku = text(d, 'sku'); check(!s.parts.some(p => p.sku === sku && p.branch_id === b), 'SKU already exists in this branch', 409);
    capacity(ctx, 'PARTS', new Set(s.parts.map(p => p.sku)).size);
    const row = { id: id('PART'), branch_id: b, sku, name: text(d, 'name'), asking_minor: money(d, 'asking_price', '0', true),
      quantity: 0, value_minor: 0, reorder_level: count(d, 'reorder_level', 0, 1000000, 2), version: 1 };
    s.parts.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/parts\/([^/]+)\/receive$/.exec(path);
  if (match) {
    access(ctx, 'PARTS', true); finance(ctx); const p = found(s.parts.find(p => p.id === match![1])); branch(ctx, p.branch_id, 'PARTS'); version(p, d);
    const supplier = found(s.parties.find(x => x.id === d.supplier_id && ['SUPPLIER', 'BOTH'].includes(x.kind)));
    check(supplier.branch_id === p.branch_id, 'Supplier must belong to the receiving branch');
    const amounts=supplierAmounts(d,'cost'),amount=amounts.amount_minor-amounts.recoverable_tax_minor, qty = count(d, 'quantity', 1, 1000000);
    p.quantity = count({ quantity: p.quantity + qty }, 'quantity', 0, 1000000); p.value_minor = safeSum([p.value_minor, amount]); p.version++;
    const expense = { id: id('AP'), branch_id: p.branch_id, module: 'PARTS' as const, job_id: null, supplier_id: supplier.id,
      description: 'Stock receipt: ' + p.sku, category:'Stock purchases',...amounts,paid_minor: 0, status: 'POSTED' as const, version: 1 };
    s.expenses.push(expense); post(ctx, 'PARTS', p.branch_id, 'PARTS_RECEIPT', expense.id, [['1210', amount, 0],['1400',amounts.recoverable_tax_minor,0], ['2000', 0, amounts.amount_minor]]);
    if(d.due_date)extras(s).due_dates[expense.id]=isoDate(text(d,'due_date'));
    return { entity: p.id, result: { ...p, payable_id: expense.id } };
  }
  if (path === '/api/parts-orders') {
    access(ctx, 'PARTS', true); const p = found(s.parts.find(p => p.id === d.part_id)); branch(ctx, p.branch_id, 'PARTS');
    const c = text(d, 'customer_id'); customer(ctx, c, p.branch_id); const qty = count(d, 'quantity', 1, 1000000);
    const reserved = s.orders.filter(o => o.part_id === p.id && o.status === 'OPEN').reduce((a, o) => a + o.quantity, 0);
    check(qty <= p.quantity - reserved, 'Insufficient available stock', 409);
    const gross = safeSum([Number(BigInt(p.asking_minor) * BigInt(qty))]);
    const discount = money(d,'discount'); check(discount < gross,'Discount must be below the order value');
    if (BigInt(discount) * 10000n > BigInt(gross) * BigInt(extras(s).financial.discount_limit_bps)) check(ctx.member.role==='OWNER' && text(d,'override_reason','',500), 'Owner approval and a reason are required for this discount',403);
    const net=gross-discount,tax=proportional(net,basisPoints(text(d,'tax_percent','0')),10000),total=safeSum([net,tax]);
    const row = { id: id('ORDER'), branch_id: p.branch_id, part_id: p.id, customer_id: c, quantity: qty,
      total_minor: total, net_minor: net, tax_minor: tax, discount_minor: discount, cost_minor: 0, paid_minor: 0, refunded_minor: 0, status: 'OPEN' as const, version: 1 };
    s.orders.push(row); post(ctx, 'PARTS', p.branch_id, 'PARTS_ORDER', row.id, [['1100', total, 0], ['2500', 0, net], ['2100',0,tax]]);
    return { entity: row.id, result: row };
  }
  match = /^\/api\/parts-orders\/([^/]+)\/(fulfil|return|refund)$/.exec(path);
  if (match) {
    const verb = match[2], o = found(s.orders.find(o => o.id === match![1])); access(ctx, 'PARTS', true, verb !== 'fulfil'); branch(ctx, o.branch_id, 'PARTS'); version(o, d);
    const p = found(s.parts.find(p => p.id === o.part_id));
    if (verb === 'fulfil') {
      check(o.status === 'OPEN' && p.quantity >= o.quantity, 'Order is closed or stock unavailable', 409);
      o.cost_minor = proportional(p.value_minor, o.quantity, p.quantity); p.quantity -= o.quantity; p.value_minor -= o.cost_minor; p.version++;
      post(ctx, 'PARTS', p.branch_id, 'PARTS_FULFILMENT', o.id, [['2500', o.net_minor ?? o.total_minor, 0], ['4000', 0, o.net_minor ?? o.total_minor]]);
      if (o.cost_minor) post(ctx, 'PARTS', p.branch_id, 'PARTS_COGS', o.id, [['5000', o.cost_minor, 0], ['1210', 0, o.cost_minor]]);
      o.status = 'FULFILLED';
    } else if (verb === 'return') {
      finance(ctx); check(o.status !== 'RETURNED', 'Order was already returned', 409); text(d, 'reason', undefined, 500);
      assertPostingOpen(s,ctx.posting_date??ctx.now.slice(0,10));
      const originals = s.journals.filter(j => j.source_id === o.id && ['PARTS_ORDER', 'PARTS_FULFILMENT', 'PARTS_COGS'].includes(j.source_type));
      for (const j of originals) s.journals.push({ ...reversal(j, 'Parts order return'), date: ctx.posting_date ?? ctx.now.slice(0,10), module: 'PARTS', branch_id: o.branch_id });
      if (o.status === 'FULFILLED') { p.quantity += o.quantity; p.value_minor = safeSum([p.value_minor, o.cost_minor]); p.version++; }
      if (o.paid_minor) post(ctx, 'PARTS', p.branch_id, 'PARTS_REFUND_DUE', o.id, [['1100', o.paid_minor, 0], ['2400', 0, o.paid_minor]]);
      o.status = 'RETURNED';
    } else {
      finance(ctx); check(o.status === 'RETURNED', 'Return the order before refunding'); const amount = money(d, 'amount', '0', true);
      check(amount <= o.paid_minor - o.refunded_minor, 'Refund exceeds money collected'); text(d, 'confirmation', undefined, 500); bankReference(ctx, d);
      o.refunded_minor += amount; post(ctx, 'PARTS', o.branch_id, 'PARTS_REFUND', o.id, [['2400', amount, 0], ['1000', 0, amount]]);
    }
    o.version++; return { entity: o.id, result: o };
  }
  if (path === '/api/office-expenses') {
    role(ctx, ['OWNER', 'ACCOUNTANT', 'ADMIN', 'BRANCH_MANAGER']); const m: BusinessModule | 'SHARED' = d.module === 'SHARED' ? 'SHARED' : moduleCode(d.module);
    const b = text(d, 'branch_id'); branch(ctx, b, m === 'SHARED' ? undefined : m);
    if (m !== 'SHARED') access(ctx, m, true); else {check(s.software_history.every(mod=>ctx.member.modules.includes(mod)),'Shared expenses require whole-business access',403);check(s.subscription?.software && s.subscription.start_at<=ctx.now && s.subscription.end_at > ctx.now && s.subscription.status !== 'CANCELLED', 'Active business software subscription required', 403);}
    const supplier = found(s.parties.find(p => p.id === d.supplier_id && ['SUPPLIER', 'BOTH'].includes(p.kind) && p.branch_id === b));
    const jobId = text(d, 'job_id', '') || null;
    if (jobId) check(m === 'HAULAGE' && s.haulage.some(j => j.id === jobId && j.branch_id === b), 'Job cost must refer to a haulage job in this branch');
    const row = { id: id('EXP'), branch_id: b, module: m, job_id: jobId, supplier_id: supplier.id,
      description: text(d, 'description', undefined, 1000), category:text(d,'category','General'),...supplierAmounts(d,'amount'),paid_minor: 0, status: 'SUBMITTED' as const, version: 1 };
    s.expenses.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/office-expenses\/([^/]+)\/(approve|reject|post|pay)$/.exec(path);
  if (match) {
    finance(ctx); const r = found(s.expenses.find(e => e.id === match![1])); branch(ctx, r.branch_id); version(r, d);
    if(r.module!=='SHARED')access(ctx,r.module,true,true);else check(s.software_history.every(m=>ctx.member.modules.includes(m)),'Shared expenses require whole-business access',403);
    const verb = match[2];
    if (verb === 'approve' || verb === 'reject') { check(r.status === 'SUBMITTED', 'Expense already reviewed', 409); r.status = verb === 'approve' ? 'APPROVED' : 'REJECTED'; }
    else if (verb === 'post') { check(r.status === 'APPROVED', 'Approve expense before posting', 409); post(ctx, r.module, r.branch_id, 'OFFICE_EXPENSE', r.id, [['6000', r.amount_minor-(r.recoverable_tax_minor??0), 0],['1400',r.recoverable_tax_minor??0,0], ['2000', 0, r.amount_minor]]); r.status = 'POSTED'; }
    else {
      check(r.status === 'POSTED', 'Post the expense before settling'); const amount = money(d, 'amount', '0', true);
      const foreignTotal=r.foreign_minor??r.amount_minor,oldForeign=r.paid_foreign_minor??r.paid_minor;
      check(amount <= foreignTotal-oldForeign, 'Supplier payment exceeds payable'); text(d, 'confirmation', undefined, 500); bankReference(ctx, d);
      const executionFx=(r.currency??'NGN')==='NGN'?'1.00000000':rate(text(d,'fx')),cash=convert(amount,executionFx),newForeign=oldForeign+amount,newCarrying=proportional(r.amount_minor,newForeign,foreignTotal),carrying=newCarrying-(r.settled_base_minor??r.paid_minor);
      const entries:[AccountCode,number,number][]=[['2000',carrying,0],['1000',0,cash]];if(cash>carrying)entries.push(['6100',cash-carrying,0]);else if(carrying>cash)entries.push(['6100',0,carrying-cash]);
      r.paid_foreign_minor=newForeign;r.settled_base_minor=newCarrying;r.paid_minor=newCarrying;post(ctx,r.module,r.branch_id,'SUPPLIER_PAYMENT',r.id,entries);
    }
    r.version++; return { entity: r.id, result: r };
  }
  if (path === '/api/transfers') {
    access(ctx, 'PARTS', true); const p = found(s.parts.find(p => p.id === d.part_id)); branch(ctx, p.branch_id, 'PARTS');
    const dest = text(d, 'destination_branch'); found(s.branches.find(b => b.id === dest && b.active && b.modules.includes('PARTS')));
    check(dest !== p.branch_id, 'Transfer branches must differ');
    const qty = count(d, 'quantity', 1, 1000000); check(qty <= p.quantity, 'Insufficient stock');
    const row = { id: id('TR'), part_id: p.id, source_branch: p.branch_id, destination_branch: dest, quantity: qty, value_minor: 0, status: 'REQUESTED' as const, version: 1 };
    s.transfers.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/transfers\/([^/]+)\/(dispatch|receive|cancel|resolve)$/.exec(path);
  if (match) {
    access(ctx, 'PARTS', true, match[2] !== 'dispatch'); const t = found(s.transfers.find(t => t.id === match![1])); version(t, d);
    const p = found(s.parts.find(p => p.id === t.part_id)); branch(ctx, ['receive','resolve'].includes(match[2]!) ? t.destination_branch : t.source_branch, 'PARTS');
    if (match[2] === 'dispatch') {
      const reserved = s.orders.filter(o => o.part_id === p.id && o.status === 'OPEN').reduce((a, o) => a + o.quantity, 0);
      check(t.status === 'REQUESTED' && t.quantity <= p.quantity - reserved, 'Transfer is unavailable or stock is reserved', 409);
      t.value_minor = proportional(p.value_minor, t.quantity, p.quantity); p.quantity -= t.quantity; p.value_minor -= t.value_minor; p.version++; t.status = 'DISPATCHED';
      if (t.value_minor) post(ctx, 'PARTS', t.source_branch, 'PARTS_TRANSFER_DISPATCH', t.id, [['1500', t.value_minor, 0], ['1210', 0, t.value_minor]]);
    } else if (match[2] === 'receive') {
      check(t.status === 'DISPATCHED', 'Transfer must be dispatched', 409);
      let dest = s.parts.find(x => x.branch_id === t.destination_branch && x.sku === p.sku);
      if (!dest) { dest = { ...p, id: id('PART'), branch_id: t.destination_branch, quantity: 0, value_minor: 0, version: 1 }; s.parts.push(dest); }
      const received=count(d,'received_quantity',0,t.quantity,t.quantity),value=proportional(t.value_minor,received,t.quantity);
      t.received_quantity=received;t.received_value_minor=value;
      if(received!==t.quantity)t.discrepancy_note=text(d,'discrepancy_note',undefined,1000);
      dest.quantity += received; dest.value_minor = safeSum([dest.value_minor, value]); dest.version++; t.status = received===t.quantity?'RECEIVED':'DISCREPANCY';
      if (value) post(ctx, 'PARTS', t.destination_branch, 'PARTS_TRANSFER_RECEIPT', t.id, [['1210', value, 0], ['1500', 0, value]]);
    } else if(match[2]==='resolve') {
      finance(ctx);branch(ctx,t.destination_branch,'PARTS');check(t.status==='DISCREPANCY','Only a discrepant transfer can be resolved',409);text(d,'reason',undefined,1000);const missing=t.quantity-(t.received_quantity??0),value=t.value_minor-(t.received_value_minor??0);
      const outcome=text(d,'outcome');check(['FOUND','LOSS'].includes(outcome),'Choose received stock found or reviewed stock loss');
      if(outcome==='FOUND'){let dest=s.parts.find(x=>x.branch_id===t.destination_branch&&x.sku===p.sku);check(dest,'Destination product not found',409);dest.quantity+=missing;dest.value_minor=safeSum([dest.value_minor,value]);dest.version++;if(value)post(ctx,'PARTS',t.destination_branch,'PARTS_TRANSFER_RESOLUTION',t.id,[['1210',value,0],['1500',0,value]]);}
      else if(value)post(ctx,'PARTS',t.source_branch,'PARTS_TRANSFER_LOSS',t.id,[['6000',value,0],['1500',0,value]]);
      t.status='RECEIVED';t.discrepancy_note=(t.discrepancy_note??'')+' · '+outcome+': '+text(d,'reason');
    } else { check(t.status === 'REQUESTED', 'Only undispatched transfers can be cancelled', 409); t.status = 'CANCELLED'; }
    t.version++; return { entity: t.id, result: t };
  }
  return null;
}
