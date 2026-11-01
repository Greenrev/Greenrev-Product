import { requireCondition as check } from '../errors.js';
import { access, branch, role } from './access.js';
import type { BusinessModule, Context } from './model.js';
import { extras } from './restoration-state.js';
import { found } from './validation.js';
export interface BuyerDocument {
  kind: 'INVOICE' | 'RECEIPT'; reference: string; invoice_reference: string; business: string; tax_reference: string;
  customer: string; contact: string; branch: string; module: BusinessModule; date: string | null; due_date: string | null;
  status: string; lines: { description: string; quantity: number; net_minor: number }[];
  net_minor: number; tax_minor: number; finance_minor: number; total_minor: number; paid_minor: number; outstanding_minor: number;
  instalments?:{due_date:string;amount_minor:number;paid_minor:number}[];financed_by?:string;
  payment?: { reference: string; amount_minor: number; verified_at: string | null };
}
export function salesHistory(ctx: Context) {
  const s = ctx.state; role(ctx, ['OWNER','ACCOUNTANT','ADMIN','BRANCH_MANAGER','SALES','PARTS_MANAGER','RENTAL_AGENT','DISPATCHER','MECHANIC','VIEWER']);
  const visible = (m: BusinessModule, b: string) => { try { access(ctx, m); branch(ctx, b, m); return true; } catch { return false; } };
  return { sales: [
    ...s.service_invoices.filter(i => visible(i.module, i.branch_id)).map(i => ({ id: i.id, module: i.module, branch_id: i.branch_id, customer_id: i.customer_id, total_minor: i.total_minor, paid_minor: i.paid_minor, status: i.status, title: (i.module === 'RENTAL' ? s.rentals : i.module === 'HAULAGE' ? s.haulage : s.workshop).find(j => j.id === i.job_id)?.title ?? 'Service', date: s.journals.find(j => j.source_id === i.id && j.source_type === 'SERVICE_INVOICE')?.date ?? null })),
    ...s.orders.filter(i => visible('PARTS', i.branch_id)).map(i => ({ id: i.id, module: 'PARTS' as const, branch_id: i.branch_id, customer_id: i.customer_id, total_minor: i.total_minor, paid_minor: i.paid_minor, status: i.status, title: s.parts.find(p => p.id === i.part_id)?.name ?? 'Parts sale', date: s.journals.find(j => j.source_id === i.id && j.source_type === 'PARTS_ORDER')?.date ?? null })),
    ...(s.dealer?.invoices.map(([, i]) => { const v = s.dealer!.vehicles.find(([id]) => id === i.vehicle_id)![1]; return { ...i, module: 'DEALER' as const, branch_id: v.branch_id, title: `${v.year} ${v.make} ${v.model}`, date: s.dealer!.journals.find(j => j.source_id === i.id && j.source_type === 'SALE')?.date ?? null }; }).filter(i => visible('DEALER', i.branch_id)).map(({ id, module, branch_id, title, date, customer_id, total_minor, paid_minor, status }) => ({ id, module, branch_id, title, date, customer_id, total_minor, paid_minor, status })) ?? [])
  ].map(i => ({ ...i, customer: s.parties.find(p => p.id === i.customer_id)?.name ?? 'Customer', outstanding_minor: ['RETURNED','VOID','CREDITED'].includes(i.status) ? 0 : i.total_minor - i.paid_minor })) };
}
export function buyerDocument(ctx: Context, kind: 'INVOICE' | 'RECEIPT', recordId: string): BuyerDocument {
  const s = ctx.state, ex = extras(s); check(ctx.member.role !== 'DRIVER', 'Document access refused', 403);
  let invoiceId = recordId, payment: BuyerDocument['payment'];
  if (kind === 'RECEIPT') {
    const r = s.receipts.find(r => r.id === recordId);
    const p = s.dealer?.payments.find(([id]) => id === recordId)?.[1];
    check(r || (p && p.target_type === 'INVOICE'), 'Buyer receipt not found', 404);
    check((r ?? p)!.status === 'VERIFIED', 'Only independently verified payments have a receipt', 409);
    invoiceId = r?.invoice_id ?? p!.target_id;
    const j = (r ? s.journals : s.dealer!.journals).find(j => j.source_id === recordId && (j.source_type === 'RECEIPT_VERIFIED' || j.source_type === 'PAYMENT'));
    payment = { reference: (r ?? p)!.reference, amount_minor: (r ?? p)!.amount_minor, verified_at: j?.date ?? null };
  }
  const sale = found(salesHistory(ctx).sales.find(i => i.id === invoiceId)); access(ctx, sale.module); branch(ctx, sale.branch_id, sale.module);
  const customer = s.parties.find(p => p.id === sale.customer_id);
  let net = 0, tax = 0, finance = 0, quantity = 1;
  const service = s.service_invoices.find(i => i.id === invoiceId), order = s.orders.find(i => i.id === invoiceId), dealer = s.dealer?.invoices.find(([id]) => id === invoiceId)?.[1];
  if (service) { net = service.net_minor; tax = service.tax_minor; }
  if (order) { net = order.net_minor ?? order.total_minor; tax = order.tax_minor ?? 0; quantity = order.quantity; }
  if (dealer) { net = dealer.net_minor; tax = dealer.vat_minor; finance = dealer.finance_minor; }
  return { kind, reference: recordId, invoice_reference: invoiceId, business: ex.financial.legal_name || s.name, tax_reference: ex.financial.tax_reference,
    customer: customer?.name ?? sale.customer, contact: customer?.contact ?? '', branch: s.branches.find(b => b.id === sale.branch_id)?.name ?? '', module: sale.module,
    date: payment?.verified_at ?? sale.date, due_date: ex.due_dates[invoiceId] ?? dealer?.plan[0]?.due_date ?? null, ...(dealer?.mode==='INSTALLMENT'?{instalments:dealer.plan.map(d=>({due_date:d.due_date,amount_minor:d.principal_minor+d.finance_minor,paid_minor:d.paid_minor}))}:{}),...(dealer?.mode==='PARTNER'?{financed_by:s.parties.find(p=>p.id===dealer.debtor_id)?.name??'Agreed financing partner'}:{}),status: sale.status,
    lines: [{ description: sale.title, quantity, net_minor: net }], net_minor: net, tax_minor: tax, finance_minor: finance,
    total_minor: sale.total_minor, paid_minor: sale.paid_minor, outstanding_minor: sale.outstanding_minor, ...(payment ? { payment } : {}) };
}
