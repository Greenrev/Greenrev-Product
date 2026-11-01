/**
 * Transactionally cloned dealer domain engine. ModularSaasService persists its
 * portable snapshot in the business transaction. Host adapters bind this engine
 * to the existing Railway database and verified identity service.
 */
import { createHash, randomUUID } from 'node:crypto';
import { Problem, requireCondition } from './errors.js';
import { basisPoints, cleanText, convert, integer, isoDate, minor, proportional, rate, schedule } from './money.js';
import { journal, reports, reversal, type AccountCode, type Journal } from './ledger.js';
import { requireRole, vehicleProjection, type Principal } from './v3-rules.js';

type Scalar = string | number | boolean | null;
export type Payload = Record<string, Scalar>;
interface Party { id: string; tenant_id: string; name: string; kind: string; contact: string }
interface Vehicle {
  id: string; tenant_id: string; branch_id: string; vin: string; make: string; model: string;
  year: number; location: string; ownership: 'OWNED' | 'CONSIGNMENT';
  owner_id: string | null; owner_due_minor: number; status: string; asking_minor: number;
  inspection_ready: boolean; documents_ready: boolean; version: number; created_at: string;
}
interface Bill {
  id: string; tenant_id: string; party_id: string; vehicle_id: string | null;
  currency: string; foreign_minor: number; fx: string; base_minor: number;
  recoverable_tax_minor: number; paid_foreign_minor: number; settled_base_minor: number;
}
interface Invoice {
  id: string; tenant_id: string; vehicle_id: string; customer_id: string;
  mode: string; net_minor: number; discount_minor: number; vat_minor: number;
  total_minor: number; paid_minor: number; finance_minor: number; cost_minor: number;
  status: string; override_reason: string; debtor_id?: string; finance_agreement?: string; refunded_minor?: number;
  plan: { due_date: string; principal_minor: number; finance_minor: number; paid_minor: number }[];
}
interface Payment {
  id: string; tenant_id: string; target_type: 'INVOICE' | 'BILL' | 'CONSIGNMENT' | 'REFUND';
  target_id: string; amount_minor: number; fx: string; reference: string;
  status: 'EVIDENCE' | 'VERIFIED'; payer: string;
}
interface State {
  parties: Map<string, Party>;
  vehicles: Map<string, Vehicle>;
  bills: Map<string, Bill>;
  invoices: Map<string, Invoice>;
  payments: Map<string, Payment>;
  journals: Journal[];
  idempotency: Map<string, { hash: string; response: unknown }>;
  outbox: { id: string; tenant_id: string; kind: string; aggregate_id: string; payload: unknown }[];
  audit: { id: string; tenant_id: string; actor: string; route: string }[];
}

/** Portable dealer state, committed by the modular repository in the same transaction. */
export interface WorkbenchSnapshot {
  schema_version: 1;
  tenant_id: string;
  parties: [string, Party][]; vehicles: [string, Vehicle][]; bills: [string, Bill][];
  invoices: [string, Invoice][]; payments: [string, Payment][];
  journals: Journal[]; idempotency: [string, { hash: string; response: unknown }][];
  outbox: State['outbox']; audit: State['audit'];
}

const FINANCE = ['OWNER', 'ACCOUNTANT'] as const;
const STOCK = ['OWNER', 'ACCOUNTANT', 'SALES', 'ADMIN', 'BRANCH_MANAGER'] as const;
const newId = (prefix: string) => prefix + '-' + randomUUID();
const field = (d: Payload, k: string, fallback = ''): string => {
  const v = d[k];
  return v === undefined || v === null ? fallback : String(v);
};
const amount = (d: Payload, k: string, fallback = '0', positive = false) =>
  minor(field(d, k, fallback), positive);

export class MemoryWorkbench {
  private state: State = {
    parties: new Map(), vehicles: new Map(), bills: new Map(), invoices: new Map(),
    payments: new Map(), journals: [], idempotency: new Map(), outbox: [], audit: []
  };
  constructor(readonly tenantId: string, private discountLimitBps = 500,
    private minimumMarginBps = 1000, private postingDay?: string) {}

  snapshot(): WorkbenchSnapshot {
    const s = this.state;
    return structuredClone({ schema_version: 1, tenant_id: this.tenantId,
      parties: [...s.parties], vehicles: [...s.vehicles], bills: [...s.bills],
      invoices: [...s.invoices], payments: [...s.payments], journals: s.journals,
      idempotency: [...s.idempotency], outbox: s.outbox, audit: s.audit });
  }
  static restore(tenantId: string, snapshot: WorkbenchSnapshot | null, postingDay?: string, policy?: { discount_limit_bps: number; minimum_margin_bps: number }): MemoryWorkbench {
    const app = new MemoryWorkbench(tenantId, policy?.discount_limit_bps, policy?.minimum_margin_bps, postingDay);
    if (!snapshot) return app;
    requireCondition(snapshot.schema_version === 1 && snapshot.tenant_id === tenantId,
      'Dealer snapshot does not match this workspace', 409);
    app.state = structuredClone({ parties: new Map(snapshot.parties), vehicles: new Map(snapshot.vehicles),
      bills: new Map(snapshot.bills), invoices: new Map(snapshot.invoices), payments: new Map(snapshot.payments),
      journals: snapshot.journals, idempotency: new Map(snapshot.idempotency),
      outbox: snapshot.outbox, audit: snapshot.audit });
    return app;
  }

  /** A trusted principal must come from the host SSO adapter, never request JSON. */
  run(actor: Principal, method: 'GET' | 'POST', path: string,
    data: Payload = {}, key?: string): unknown {
    requireCondition(actor && actor.tenantId === this.tenantId, 'Record not found', 404);
    requireCondition(data !== null && !Array.isArray(data) && typeof data === 'object'
      && Object.values(data).every(v => v === null
        || ['string', 'number', 'boolean'].includes(typeof v)), 'Only scalar input fields are supported');
    if (method === 'GET') return this.dispatch(this.state, actor, method, path, data);
    if (!key || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
      throw new Problem('A unique Idempotency-Key header (8–100 characters) is required');
    }
    const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
    const hash = createHash('sha256').update(JSON.stringify([actor.id, actor.role, method, path, sorted])).digest('hex');
    const cacheKey = actor.tenantId + ':' + key;
    const old = this.state.idempotency.get(cacheKey);
    if (old) {
      if (old.hash !== hash) throw new Problem('Idempotency key was already used for a different request', 409);
      return structuredClone(old.response);
    }
    const next = structuredClone(this.state);
    const result = this.dispatch(next, actor, method, path, data);
    next.idempotency.set(cacheKey, { hash, response: structuredClone(result) });
    next.audit.push({ id: newId('AUD'), tenant_id: actor.tenantId, actor: actor.id,
      route: method + ' ' + path });
    this.state = next;
    return result;
  }

  private party(s: State, id: string, kinds?: readonly string[]): Party {
    const p = s.parties.get(id);
    requireCondition(p && p.tenant_id === this.tenantId, 'Record not found', 404);
    if (kinds && !kinds.includes(p.kind)) throw new Problem('Counterparty type does not support this transaction');
    return p;
  }
  private vehicle(s: State, id: string): Vehicle {
    const v = s.vehicles.get(id);
    requireCondition(v && v.tenant_id === this.tenantId, 'Record not found', 404);
    return v;
  }
  private cost(s: State, vehicleId: string): number {
    return [...s.bills.values()].filter(b => b.vehicle_id === vehicleId && b.tenant_id === this.tenantId)
      .reduce((sum, b) => sum + b.base_minor - b.recoverable_tax_minor, 0);
  }
  private post(s: State, source: string, sourceId: string, memo: string,
    entries: Parameters<typeof journal>[4]): void {
    s.journals.push(journal(this.tenantId, source, sourceId, memo, entries, this.postingDay ?? isoDate()));
  }
  private emit(s: State, kind: string, id: string, payload: unknown): void {
    s.outbox.push({ id: newId('EVT'), tenant_id: this.tenantId, kind, aggregate_id: id, payload });
  }

  private dispatch(s: State, actor: Principal, method: string, path: string, d: Payload): unknown {
    const t = this.tenantId;
    if (method === 'GET' && path === '/api/reports') {
      requireRole(actor, FINANCE);
      return reports(t, s.journals);
    }
    if (method === 'GET' && path === '/api/workspace') {
      const finance = FINANCE.includes(actor.role as typeof FINANCE[number]);
      const vehicles = [...s.vehicles.values()].filter(v => v.tenant_id === t
        && (finance || actor.branches.includes(v.branch_id)))
        .map(v => finance ? { ...v, cost_minor: this.cost(s, v.id) } :
          { branch_id: v.branch_id, ...vehicleProjection(v) });
      return {
        vehicles, parties: [...s.parties.values()].filter(p => p.tenant_id === t
          && (finance || ['CUSTOMER', 'BOTH'].includes(p.kind))),
        invoices: [...s.invoices.values()].filter(i => i.tenant_id === t
          && (finance || actor.branches.includes(s.vehicles.get(i.vehicle_id)?.branch_id ?? '')))
          .map(i => finance ? i : { id: i.id, vehicle_id: i.vehicle_id,
            total_minor: i.total_minor, paid_minor: i.paid_minor, status: i.status }),
        reports: finance ? reports(t, s.journals) : undefined
      };
    }
    if (method === 'POST' && path === '/api/parties') {
      requireRole(actor, STOCK);
      const kind = field(d, 'kind', 'CUSTOMER');
      requireCondition(['CUSTOMER', 'SUPPLIER', 'BOTH', 'LENDER'].includes(kind), 'Unsupported counterparty kind');
      if (!FINANCE.includes(actor.role as typeof FINANCE[number]) && kind !== 'CUSTOMER') {
        throw new Problem('Sales may create customers only', 403);
      }
      const p: Party = { id: newId('PTY'), tenant_id: t, name: cleanText(d.name),
        kind, contact: cleanText(field(d, 'contact'), 200, false) };
      s.parties.set(p.id, p);
      return { id: p.id };
    }
    if (method === 'POST' && path === '/api/vehicles') {
      requireRole(actor, STOCK);
      const vin = cleanText(d.vin, 17).toUpperCase();
      requireCondition(/^[A-HJ-NPR-Z0-9]{17}$/.test(vin),
        'Use a 17-character VIN without I, O or Q; legacy chassis requires a separate adapter');
      requireCondition(![...s.vehicles.values()].some(v => v.tenant_id === t && v.vin === vin),
        'Conflicting or duplicate record', 409);
      const ownership = field(d, 'ownership', 'OWNED');
      requireCondition(['OWNED', 'CONSIGNMENT'].includes(ownership), 'Ownership must be OWNED or CONSIGNMENT');
      const owner = ownership === 'CONSIGNMENT'
        ? this.party(s, field(d, 'owner_id'), ['SUPPLIER', 'BOTH']).id : null;
      if (owner) requireRole(actor, FINANCE);
      const branch = field(d, 'branch_id', actor.branches[0] ?? t + '-MAIN');
      if (!FINANCE.includes(actor.role as typeof FINANCE[number])
          && !actor.branches.includes(branch)) throw new Problem('Branch is outside staff scope', 403);
      const v: Vehicle = {
        id: newId('VEH'), tenant_id: t, branch_id: branch, vin,
        make: cleanText(d.make, 80), model: cleanText(d.model, 100),
        year: integer(field(d, 'year'), 1950, new Date().getUTCFullYear() + 2),
        location: cleanText(d.location), ownership: ownership as Vehicle['ownership'],
        owner_id: owner, owner_due_minor: owner ? amount(d, 'owner_due', '0', true) : 0,
        status: 'DRAFT', asking_minor: amount(d, 'asking_price'),
        inspection_ready: false, documents_ready: false, version: 1,
        created_at: new Date().toISOString()
      };
      s.vehicles.set(v.id, v);
      return { id: v.id };
    }
    const action = /^\/api\/vehicles\/([^/]+)\/(readiness|price|publish|reserve|release)$/.exec(path);
    if (method === 'POST' && action) {
      requireRole(actor, STOCK);
      const v = this.vehicle(s, action[1] ?? '');
      requireCondition(FINANCE.includes(actor.role as typeof FINANCE[number])
        || actor.branches.includes(v.branch_id), 'Branch is outside staff scope', 403);
      if (v.status === 'IN_TRANSIT') throw new Problem('Confirm transfer receipt before changing vehicle', 409);
      requireCondition(d.version === v.version,
        'Vehicle changed. Refresh and retry with its current version', 409);
      const verb = action[2];
      if (verb === 'readiness') {
        requireCondition(!['SOLD', 'DELIVERED'].includes(v.status), 'Cannot change readiness after sale', 409);
        requireCondition(typeof d.inspection_ready === 'boolean' && typeof d.documents_ready === 'boolean',
          'Readiness values must be booleans');
        v.inspection_ready = d.inspection_ready;
        v.documents_ready = d.documents_ready;
      } else if (verb === 'price') {
        requireCondition(!['SOLD', 'DELIVERED'].includes(v.status), 'Cannot reprice a sold vehicle', 409);
        v.asking_minor = amount(d, 'asking_price', '0', true);
      } else if (verb === 'publish') {
        requireCondition(['DRAFT', 'AVAILABLE'].includes(v.status)
          && v.inspection_ready && v.documents_ready && v.asking_minor > 0,
        'Publishing requires ready documents, inspection, price and an unsold/unreserved vehicle');
        requireCondition(v.ownership !== 'OWNED' || this.cost(s, v.id) > 0,
          'Record the acquisition cost before publishing');
        v.status = 'AVAILABLE';
      } else if (verb === 'reserve') {
        requireCondition(v.status === 'AVAILABLE', 'Vehicle is not available', 409);
        v.status = 'RESERVED';
      } else {
        requireCondition(v.status === 'RESERVED', 'Only reserved stock can be released', 409);
        v.status = 'AVAILABLE';
      }
      v.version++;
      this.emit(s, 'inventory.' + verb, v.id, vehicleProjection(v));
      return { id: v.id, version: v.version };
    }
    if (method === 'POST' && path === '/api/bills') {
      requireRole(actor, FINANCE);
      const party = this.party(s, field(d, 'party_id'), ['SUPPLIER', 'BOTH']);
      const v = this.vehicle(s, field(d, 'vehicle_id'));
      requireCondition(FINANCE.includes(actor.role as typeof FINANCE[number])
        || actor.branches.includes(v.branch_id), 'Branch is outside staff scope', 403);
      requireCondition(v.status!=='IN_TRANSIT','Confirm transfer receipt before recording additional vehicle costs',409);
      const currency = field(d, 'currency', 'NGN');
      requireCondition(['NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AED', 'CNY'].includes(currency),
        'Unsupported currency');
      const fx = currency === 'NGN' ? '1.00000000' : rate(field(d, 'fx'));
      const foreign = amount(d, 'amount', '0', true), base = convert(foreign, fx);
      const inputTax = amount(d, 'recoverable_tax');
      requireCondition(base > inputTax, 'Recoverable input tax must be less than gross bill value');
      const b: Bill = { id: newId('BIL'), tenant_id: t, party_id: party.id,
        vehicle_id: v.id, currency, foreign_minor: foreign, fx, base_minor: base,
        recoverable_tax_minor: inputTax, paid_foreign_minor: 0, settled_base_minor: 0 };
      s.bills.set(b.id, b);
      const code = v.ownership === 'OWNED' && v.status !== 'DELIVERED' ? '1200' : '5000';
      this.post(s, 'BILL', b.id, 'Vehicle acquisition/landed cost', [
        [code, base - inputTax, 0], ['1400', inputTax, 0], ['2000', 0, base]
      ]);
      return { id: b.id, base_minor: base };
    }
    if (method === 'POST' && path === '/api/invoices') {
      requireRole(actor, STOCK);
      const v = this.vehicle(s, field(d, 'vehicle_id'));
      requireCondition(FINANCE.includes(actor.role as typeof FINANCE[number])
        || actor.branches.includes(v.branch_id), 'Branch is outside staff scope', 403);
      requireCondition(v.version === d.version, 'Vehicle or price changed. Refresh quote', 409);
      requireCondition(['AVAILABLE', 'RESERVED'].includes(v.status),
        'Only available or reserved vehicles can be sold', 409);
      requireCondition(![...s.invoices.values()].some(i => i.vehicle_id === v.id && i.status !== 'RETURNED'),
        'Vehicle already has an active invoice', 409);
      const customer = this.party(s, field(d, 'customer_id'), ['CUSTOMER', 'BOTH']);
      const mode = field(d, 'mode', 'CASH');
      requireCondition(['CASH', 'INSTALLMENT', 'PARTNER'].includes(mode), 'Choose cash, instalments or partner finance');
      const debtor = mode === 'PARTNER' ? this.party(s, field(d, 'debtor_id'), ['LENDER']) : customer;
      const agreement = mode === 'PARTNER' ? cleanText(d.finance_agreement, 500) : '';
      const discount = amount(d, 'discount');
      requireCondition(discount < v.asking_minor, 'Discount must be below asking price');
      const net = v.asking_minor - discount, cost = this.cost(s, v.id);
      requireCondition(v.ownership !== 'OWNED' || cost > 0, 'Acquisition costs must be recorded');
      const economicCost = cost + v.owner_due_minor;
      const breach = BigInt(discount) * 10000n > BigInt(v.asking_minor) * BigInt(this.discountLimitBps)
        || BigInt(net - economicCost) * 10000n < BigInt(net) * BigInt(this.minimumMarginBps);
      const reason = cleanText(field(d, 'override_reason'), 500, false);
      if (breach && (actor.role !== 'OWNER' || !reason)) {
        throw new Problem('Discount or margin exceeds policy. Owner approval with reason required', 403);
      }
      const tax = proportional(net, basisPoints(field(d, 'tax_percent', '0')), 10000);
      const principal = net + tax, fee = amount(d, 'finance_charge');
      requireCondition(mode === 'INSTALLMENT' || fee === 0,
        'Finance charges require an instalment contract');
      const months = mode === 'INSTALLMENT' ? integer(field(d, 'months', '1'), 1, 60) : 1;
      const deposit = mode === 'INSTALLMENT' ? amount(d, 'deposit') : 0;
      const plan = schedule(principal, fee, deposit, months, isoDate(field(d, 'first_due_date')))
        .map(item => ({ ...item, paid_minor: 0 }));
      const total = principal + fee;
      const i: Invoice = { id: newId('INV'), tenant_id: t, vehicle_id: v.id, customer_id: customer.id,
        mode, net_minor: net, discount_minor: discount, vat_minor: tax, total_minor: total,
        paid_minor: 0, finance_minor: fee, cost_minor: cost, status: 'OPEN',
        override_reason: reason, debtor_id: debtor.id, finance_agreement: agreement, refunded_minor: 0, plan };
      s.invoices.set(i.id, i);
      const rev = v.ownership === 'CONSIGNMENT' ? v.owner_due_minor : 0;
      requireCondition(net >= rev, 'Consignment price cannot be below owner payout');
      this.post(s, 'SALE', i.id, 'Invoiced vehicle; revenue deferred until handover',
        [['1100', total, 0], ['2100', 0, tax], ['2200', 0, fee], ['2500', 0, net]]);
      v.status = 'SOLD'; v.version++;
      this.emit(s, 'inventory.sold', v.id, vehicleProjection(v));
      return { id: i.id, total_minor: total, discount_minor: discount, schedule: plan };
    }
    if (method === 'POST' && path === '/api/payments') {
      requireRole(actor, STOCK);
      const kind = field(d, 'target_type');
      requireCondition(['BILL', 'INVOICE', 'CONSIGNMENT', 'REFUND'].includes(kind), 'Unsupported payment target');
      if (kind !== 'INVOICE') requireRole(actor, FINANCE);
      const id = field(d, 'target_id');
      const target = kind === 'BILL' ? s.bills.get(id) : s.invoices.get(id);
      requireCondition(target && target.tenant_id === t, 'Record not found', 404);
      if (kind !== 'BILL') requireCondition(kind === 'REFUND' ? (target as Invoice).status === 'RETURNED' : (target as Invoice).status !== 'RETURNED', 'Invoice status does not allow this payment', 409);
      const consigned = kind === 'CONSIGNMENT' ? this.vehicle(s, (target as Invoice).vehicle_id) : null;
      if (consigned) requireCondition(consigned.ownership === 'CONSIGNMENT' && consigned.status === 'DELIVERED', 'Consignment payout is available after handover');
      const paid = kind === 'REFUND' ? ((target as Invoice).refunded_minor ?? 0) : kind === 'CONSIGNMENT' ? [...s.payments.values()].filter(p => p.target_type === kind && p.target_id === id && p.status === 'VERIFIED').reduce((n,p)=>n+p.amount_minor,0) : kind === 'BILL' ? (target as Bill).paid_foreign_minor : (target as Invoice).paid_minor;
      const total = kind === 'REFUND' ? (target as Invoice).paid_minor : consigned ? consigned.owner_due_minor : kind === 'BILL' ? (target as Bill).foreign_minor : (target as Invoice).total_minor;
      const value = amount(d, 'amount', '0', true);
      requireCondition(value <= total - paid, 'Payment exceeds outstanding balance');
      const reference = cleanText(d.reference, 150);
      requireCondition(![...s.payments.values()].some(p => p.tenant_id === t && p.reference === reference),
        'Payment reference already exists', 409);
      const p: Payment = { id: newId('PAY'), tenant_id: t,
        target_type: kind as Payment['target_type'], target_id: id, amount_minor: value,
        fx: kind === 'BILL' ? rate(field(d, 'fx', '1')) : '1.00000000',
        reference, status: 'EVIDENCE', payer: cleanText(field(d, 'payer', 'Bank evidence')) };
      s.payments.set(p.id, p);
      return { id: p.id, status: p.status, message: 'Not posted. Finance must independently confirm bank movement.' };
    }
    const payment = /^\/api\/payments\/([^/]+)\/verify$/.exec(path);
    if (method === 'POST' && payment) {
      requireRole(actor, FINANCE);
      const p = s.payments.get(payment[1] ?? '');
      requireCondition(p && p.tenant_id === t, 'Record not found', 404);
      if (p.status === 'VERIFIED') return { id: p.id, status: p.status };
      cleanText(d.confirmation, 500);
      const base = convert(p.amount_minor, p.fx);
      if (p.target_type === 'INVOICE') {
        const i = s.invoices.get(p.target_id);
        requireCondition(i && i.tenant_id === t, 'Record not found', 404);
        requireCondition(i.status !== 'RETURNED' && i.paid_minor + base <= i.total_minor,
          'Payment would overpay', 409);
        let left = base, earned = 0;
        for (const due of i.plan) {
          const take = Math.min(left, due.principal_minor + due.finance_minor - due.paid_minor);
          earned += Math.min(due.paid_minor + take, due.finance_minor)
            - Math.min(due.paid_minor, due.finance_minor);
          due.paid_minor += take; left -= take;
        }
        requireCondition(!left, 'Payment allocation does not match schedule', 500);
        i.paid_minor += base;
        if (i.paid_minor === i.total_minor) i.status = 'PAID';
        this.post(s, 'PAYMENT', p.id, 'Invoice bank confirmation',
          [['1000', base, 0], ['1100', 0, base]]);
        if (earned) this.post(s, 'EARNED', i.id, 'Earned contractual finance charge',
          [['2200', earned, 0], ['4100', 0, earned]]);
      } else if (p.target_type === 'CONSIGNMENT' || p.target_type === 'REFUND') {
        const i = s.invoices.get(p.target_id); requireCondition(i, 'Invoice not found',404); const v = this.vehicle(s,i.vehicle_id);
        if (p.target_type === 'CONSIGNMENT') { const paid = [...s.payments.values()].filter(x=>x.target_type==='CONSIGNMENT' && x.target_id===i.id && x.status==='VERIFIED').reduce((n,x)=>n+x.amount_minor,0); requireCondition(i.status!=='RETURNED' && v.status==='DELIVERED' && paid+base<=v.owner_due_minor,'Consignment payout exceeds the amount owed',409); this.post(s,'PAYMENT',p.id,'Confirmed consignment owner payout',[['2300',base,0],['1000',0,base]]); }
        else { requireCondition(i.status==='RETURNED' && (i.refunded_minor??0)+base<=i.paid_minor,'Refund exceeds the amount collected',409); i.refunded_minor=(i.refunded_minor??0)+base; this.post(s,'PAYMENT',p.id,'Confirmed buyer refund',[['2400',base,0],['1000',0,base]]); }
      } else {
        const b = s.bills.get(p.target_id);
        requireCondition(b && b.tenant_id === t, 'Record not found', 404);
        requireCondition(b.paid_foreign_minor + p.amount_minor <= b.foreign_minor,
          'Bill payment would overpay', 409);
        const newPaid = b.paid_foreign_minor + p.amount_minor;
        const carrying = proportional(b.base_minor, newPaid, b.foreign_minor) - b.settled_base_minor;
        b.paid_foreign_minor = newPaid;
        b.settled_base_minor += carrying;
        const lines: [AccountCode, number, number][] = [
          ['2000', carrying, 0], ['1000', 0, base]
        ];
        if (base > carrying) lines.push(['6100', base - carrying, 0]);
        else if (carrying > base) lines.push(['6100', 0, carrying - base]);
        this.post(s, 'PAYMENT', p.id, 'Supplier bank confirmation', lines);
      }
      p.status = 'VERIFIED';
      this.emit(s, 'payment.verified', p.target_id, { id: p.id, amount_minor: p.amount_minor });
      return { id: p.id, status: p.status };
    }
    const handover = /^\/api\/invoices\/([^/]+)\/handover$/.exec(path);
    if (method === 'POST' && handover) {
      requireRole(actor, STOCK);
      const i = s.invoices.get(handover[1] ?? '');
      requireCondition(i && i.tenant_id === t, 'Record not found', 404);
      const v = this.vehicle(s, i.vehicle_id);
      requireCondition(v.status === 'SOLD', 'Vehicle is not awaiting handover', 409);
      const reason = cleanText(field(d, 'credit_release_reason'), 500, false);
      if (i.paid_minor < i.total_minor && !(i.mode === 'INSTALLMENT'
        && actor.role === 'OWNER' && !!reason)) {
        throw new Problem('Settle invoice or obtain owner-approved instalment credit release', 403);
      }
      if (i.paid_minor < i.total_minor && i.plan.length) {
        const firstDue = i.plan[0];
        if (firstDue && firstDue.due_date <= (this.postingDay ?? isoDate())
            && firstDue.paid_minor < firstDue.principal_minor + firstDue.finance_minor) {
          throw new Problem('The initial due instalment/deposit is unpaid', 409);
        }
      }
      const recipient = cleanText(d.recipient);
      if (v.ownership === 'CONSIGNMENT') {
        this.post(s, 'HANDOVER', i.id, 'Recognise fulfilled consignment sale',
          [['2500', i.net_minor, 0], ['2300', 0, v.owner_due_minor],
            ['4010', 0, i.net_minor - v.owner_due_minor]]);
      } else {
        i.cost_minor = this.cost(s, v.id);
        this.post(s, 'HANDOVER', i.id, 'Recognise fulfilled vehicle sale',
          [['2500', i.net_minor, 0], ['4000', 0, i.net_minor]]);
        if (i.cost_minor) this.post(s, 'COGS', i.id, 'Release stock cost at handover',
          [['5000', i.cost_minor, 0], ['1200', 0, i.cost_minor]]);
      }
      v.status = 'DELIVERED'; v.version++;
      this.emit(s, 'deal.handed_over', i.id, { invoice_id: i.id, vehicle_id: v.id });
      return { id: i.id, recipient, status: 'DELIVERED' };
    }
    const returned = /^\/api\/invoices\/([^/]+)\/return$/.exec(path);
    if (method === 'POST' && returned) {
      requireRole(actor, FINANCE); const i = s.invoices.get(returned[1]!); requireCondition(i, 'Invoice not found',404);
      const v = this.vehicle(s,i.vehicle_id); requireCondition(i.status !== 'RETURNED','Invoice already returned',409);
      requireCondition(![...s.payments.values()].some(p=>p.target_id===i.id&&p.target_type==='CONSIGNMENT'&&p.status==='VERIFIED'),'Recover and reconcile the owner payout before returning this consignment sale',409);
      const reason=cleanText(d.reason,500);
      const originals=s.journals.filter(j=>j.source_id===i.id&&['SALE','HANDOVER','EARNED','COGS'].includes(j.source_type));
      for(const j of originals) s.journals.push({...reversal(j,'Approved sale return: '+reason),date:this.postingDay??isoDate()});
      if(i.paid_minor)this.post(s,'REFUND_DUE',i.id,'Buyer refund due on returned sale',[['1100',i.paid_minor,0],['2400',0,i.paid_minor]]);
      i.status='RETURNED';v.status='DRAFT';v.inspection_ready=false;v.documents_ready=false;v.version++;
      this.emit(s,'deal.returned',i.id,{invoice_id:i.id,vehicle_id:v.id});return{id:i.id,status:i.status,refund_due_minor:i.paid_minor-(i.refunded_minor??0)};
    }
    throw new Problem('Route not implemented in this migration workbench', 501);
  }
}
