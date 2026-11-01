import {linkPassport} from './passport-events.js';
import { vehicleTransfers } from './vehicle-transfers.js';
import { requireCondition as check } from '../errors.js';
import { ACCOUNTS, journal, type AccountCode } from '../ledger.js';
import { basisPoints, isoDate } from '../money.js';
import { access, active, branch, finance, MANAGE, role, scoped } from './access.js';
import type { Context, Input, Mutation } from './model.js';
import type { Lead } from './restoration-model.js';
import { assertPostingOpen, extras } from './restoration-state.js';
import { count, found, id, moduleCode, modules, money, object, text, version, vin } from './validation.js';
import { financialReport, type TaggedJournal } from './financial.js';
import { operations } from './operations.js';
export function restorationMutation(ctx: Context, path: string, d: Input, journals: TaggedJournal[]): Mutation | null {
  const s = ctx.state, ex = extras(s);
  const transfer=vehicleTransfers(ctx,path,d);if(transfer)return transfer;
  if(path==='/api/expense-categories'){finance(ctx);const name=text(d,'name');check(!ex.categories.some(c=>c.name.toLowerCase()===name.toLowerCase()),'Expense category already exists',409);const row={id:id('CAT'),name};ex.categories.push(row);return{entity:row.id,result:row};}
  if (path === '/api/financial/settings') {
    role(ctx, ['OWNER']); const old = ex.financial; text(d, 'reason', undefined, 500);
    const closed = d.closed_through === '' || d.closed_through === null ? null : d.closed_through ? isoDate(text(d, 'closed_through')) : old.closed_through;
    check(!closed || closed <= ctx.now.slice(0, 10), 'Cannot close a future period');
    ex.financial = { ...old, year_start_month: count(d, 'year_start_month', 1, 12, old.year_start_month), legal_name: text(d, 'legal_name', old.legal_name), tax_reference: text(d, 'tax_reference', old.tax_reference), closed_through: closed,
      discount_limit_bps: d.discount_limit_percent === undefined ? old.discount_limit_bps : basisPoints(text(d, 'discount_limit_percent')),
      minimum_margin_bps: d.minimum_margin_percent === undefined ? old.minimum_margin_bps : basisPoints(text(d, 'minimum_margin_percent')) };
    return { result: ex.financial };
  }
  if (path === '/api/financial/journals') {
    finance(ctx); check(active(s, ctx.now) && s.subscription?.software, 'Active business software subscription required', 403);
    const b = text(d, 'branch_id'); branch(ctx, b);
    const m = d.module === 'SHARED' ? 'SHARED' as const : moduleCode(d.module); if (m !== 'SHARED') access(ctx, m, true); else check(s.software_history.every(x => ctx.member.modules.includes(x)), 'Shared journals require whole-business financial access', 403);
    const date = isoDate(text(d, 'date')); check(date <= ctx.now.slice(0, 10), 'Cannot post a future journal'); assertPostingOpen(s, date);
    check(Array.isArray(d.lines) && d.lines.length >= 2 && d.lines.length <= 40, 'Provide two to forty journal lines');
    const entries = d.lines.map(line => { const l = object(line, 'Journal line'); const a = text(l, 'account') as AccountCode; check(ACCOUNTS[a], 'Unknown ledger account'); return [a, money(l, 'debit'), money(l, 'credit')] as const; });
    const reason = text(d, 'reason', undefined, 1000), entity = id('ADJ');
    s.journals.push({ ...journal(s.id, 'ADJUSTMENT', entity, reason, entries, date), module: m, branch_id: b });
    return { entity, result: { id: entity } };
  }
  if (path === '/api/financial/reviews') {
    finance(ctx); const r = financialReport(ctx, d, journals); check(d.fingerprint === r.fingerprint, 'The report changed; refresh before recording a review', 409);
    const status = text(d, 'status'); check(['PREPARED','REVIEWED'].includes(status), 'Choose prepared or reviewed');
    if (status === 'REVIEWED') check(!r.checks.some(c => c.severity === 'ERROR'), 'Correct report errors before marking it reviewed', 409);
    const row = { id: id('REV'), from: r.from, to: r.to, module: r.module, branch_id: r.branch_id, fingerprint: r.fingerprint, scope_modules:s.software_history.filter(m=>ctx.member.modules.includes(m)),status: status as 'PREPARED' | 'REVIEWED', actor: ctx.member.id, at: ctx.now, note: text(d, 'note', undefined, 2000) };
    ex.reviews.push(row); return { entity: row.id, result: row };
  }
  if (path === '/api/financial/due-dates') {
    finance(ctx); const r = financialReport(ctx, { preset: 'YEAR' }, journals); const ref = text(d, 'reference');
    check([...r.receivables, ...r.payables].some(i => i.id === ref), 'Choose an outstanding balance in your financial scope', 404);
    ex.due_dates[ref] = isoDate(text(d, 'due_date')); return { entity: ref, result: { reference: ref, due_date: ex.due_dates[ref] } };
  }
  if (path === '/api/leads') {
    const m = moduleCode(d.module); access(ctx, m, true); const b = text(d, 'branch_id'); branch(ctx, b, m);
    const row: Lead = { id: id('LEAD'), module: m, branch_id: b, name: text(d, 'name'), contact: text(d, 'contact', ''), interest: text(d, 'interest', '', 1000), stage: 'NEW', next_followup: d.next_followup ? isoDate(text(d, 'next_followup')) : '', notes: '', version: 1 }; ex.leads.push(row); return { entity: row.id, result: row };
  }
  let match = /^\/api\/leads\/([^/]+)$/.exec(path);
  if (match) {
    const r = found(ex.leads.find(l => l.id === match![1])); access(ctx, r.module, true); branch(ctx, r.branch_id, r.module); version(r, d);
    const stage = text(d, 'stage'); check(['NEW','CONTACTED','QUALIFIED','WON','LOST'].includes(stage), 'Invalid lead stage'); r.stage = stage as Lead['stage'];
    r.notes = text(d, 'notes', r.notes, 3000); r.next_followup = d.next_followup ? isoDate(text(d, 'next_followup')) : ''; r.version++; return { entity: r.id, result: r };
  }
  if (path === '/api/expense-templates') {
    finance(ctx); check(active(s, ctx.now) && s.subscription?.software, 'Active business software required', 403);
    const m = d.module === 'SHARED' ? 'SHARED' as const : moduleCode(d.module); if (m !== 'SHARED') access(ctx, m, true); else check(s.software_history.every(x=>ctx.member.modules.includes(x)),'Shared expenses require whole-business access',403);
    const b = text(d, 'branch_id'); branch(ctx, b); const supplier = found(s.parties.find(p => p.id === d.supplier_id && p.branch_id === b && ['SUPPLIER','BOTH'].includes(p.kind)));
    money(d, 'amount', '0', true); const frequency = text(d, 'frequency'); check(['WEEKLY','MONTHLY','ANNUAL'].includes(frequency), 'Choose a recurrence frequency');
    const row = { id: id('TPL'), module: m, branch_id: b, supplier_id: supplier.id, description: text(d, 'description'), amount: text(d, 'amount'), category: text(d, 'category', 'General'), frequency: frequency as 'WEEKLY' | 'MONTHLY' | 'ANNUAL', next_due: isoDate(text(d, 'next_due')), active: true };
    ex.templates.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/expense-templates\/([^/]+)\/(generate|disable)$/.exec(path);
  if (match) {
    finance(ctx); const t = found(ex.templates.find(x => x.id === match![1])); branch(ctx, t.branch_id); if (t.module !== 'SHARED') access(ctx, t.module, true);
    if (match[2] === 'disable') { t.active = false; return { entity: t.id, result: t }; }
    check(t.active && t.next_due <= ctx.now.slice(0,10), 'Template is inactive or not yet due', 409);
    const result = operations(ctx, '/api/office-expenses', { ...t, job_id: '', description: t.description + ' · ' + t.next_due });
    const date = new Date(t.next_due + 'T00:00:00Z'), originalDay = date.getUTCDate();
    if (t.frequency === 'WEEKLY') date.setUTCDate(originalDay + 7);
    else { date.setUTCDate(1); if (t.frequency === 'MONTHLY') date.setUTCMonth(date.getUTCMonth() + 1); else date.setUTCFullYear(date.getUTCFullYear() + 1); const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(originalDay, last)); }
    t.next_due = date.toISOString().slice(0,10); return result;
  }
  if (path === '/api/staff/invitations') {
    role(ctx, MANAGE); check(active(s, ctx.now) && s.subscription?.software, 'Active business software required', 403);
    check(s.members.filter(m=>m.active).length+ex.invites.filter(i=>i.status==='PENDING'&&i.expires_at>ctx.now).length < s.subscription.limits.users,'Staff allowance is reserved by current members and pending invitations',409);
    const subject = text(d, 'subject_id'); check(!ex.invites.some(i=>i.subject_id===subject&&i.status==='PENDING'&&i.expires_at>ctx.now),'A pending invitation already exists for this account',409); check(!s.members.some(m => m.id === subject), 'This account is already a member', 409);
    const chosen = modules(d.modules), b = text(d, 'branch_id'); branch(ctx, b);
    check(chosen.every(m => s.subscription!.modules.includes(m) && s.branches.find(x => x.id === b)!.modules.includes(m)), 'Invitation modules must be enabled at the branch', 403);
    const grantedRole = text(d, 'role'); check(['ADMIN','BRANCH_MANAGER','ACCOUNTANT','SALES','PARTS_MANAGER','CLERK','DRIVER','MECHANIC','RENTAL_AGENT','DISPATCHER','VIEWER'].includes(grantedRole), 'Choose a supported role');
    if (ctx.member.role === 'ADMIN') check(!['ADMIN','ACCOUNTANT'].includes(grantedRole), 'Owner approval required', 403);
    const row = { id: id('INVITE'), subject_id: subject, role: grantedRole, modules: chosen, branch_id: b, status: 'PENDING' as const, expires_at: new Date(Date.parse(ctx.now) + 7 * 86400000).toISOString() };
    ex.invites.push(row); return { entity: row.id, result: row };
  }
  match = /^\/api\/staff\/([^/]+)\/access$/.exec(path);
  if (match) {
    role(ctx, MANAGE); check(active(s, ctx.now) && s.subscription?.software, 'Active business software required', 403);
    const m = found(s.members.find(x => x.id === match![1])); check(m.role !== 'OWNER' && m.id !== ctx.member.id, 'Owner and self-access changes are prohibited', 403);
    const newRole = text(d, 'role'); check(['ADMIN','BRANCH_MANAGER','ACCOUNTANT','SALES','PARTS_MANAGER','CLERK','DRIVER','MECHANIC','RENTAL_AGENT','DISPATCHER','VIEWER'].includes(newRole), 'Choose a supported role');
    if (ctx.member.role === 'ADMIN') check(!['ADMIN','ACCOUNTANT'].includes(m.role) && !['ADMIN','ACCOUNTANT'].includes(newRole), 'Owner approval required', 403);
    const chosen = modules(d.modules); check(chosen.every(x => s.subscription!.modules.includes(x)), 'Module has not been purchased', 403);
    check(Array.isArray(d.branches) && d.branches.length > 0, 'Choose at least one branch'); const branches = d.branches.map(x => { check(typeof x === 'string', 'Invalid branch'); branch(ctx, x); check(chosen.every(mod => s.branches.find(b => b.id === x)!.modules.includes(mod)), 'Module not enabled at this branch'); return x; });
    m.role = newRole as typeof m.role; m.modules = chosen; m.branches = [...new Set(branches)]; return { entity: m.id, result: m };
  }
  match = /^\/api\/branches\/([^/]+)$/.exec(path);
  if (match) {
    role(ctx, MANAGE); const b = found(s.branches.find(x => x.id === match![1])); branch(ctx, b.id);
    const chosen = modules(d.modules); check(active(s, ctx.now) && s.subscription?.software && chosen.every(x => s.subscription!.modules.includes(x)), 'Active purchased modules required', 403);
    // Existing histories and memberships retain their grants; disabling a module with active work is blocked.
    const removed = b.modules.filter(x => !chosen.includes(x)); check(!removed.length, 'Branches retain historical module assignments; add modules here and manage subscription access separately', 409);
    b.name = text(d, 'name'); b.modules = chosen; return { entity: b.id, result: b };
  }
  if (path === '/api/passports/link') {
    const m = moduleCode(d.module); access(ctx, m, true); const resource = text(d, 'resource_id');
    const workshop=s.workshop.find(j=>j.id===resource);const a = m === 'DEALER' ? s.dealer?.vehicles.find(([id]) => id === resource)?.[1] : m==='MECHANIC'&&workshop?{...workshop,vin:workshop.subject_vin}:s.fleet.find(a => a.id === resource && a.module === m);
    check(a, 'Choose a vehicle belonging to this business', 404); branch(ctx, a.branch_id, m); const chassis = vin(a.vin);
    const row=linkPassport(ctx,chassis,m,a.branch_id,resource); return { entity: chassis, result: row };
  }
  match = /^\/api\/passports\/([^/]+)\/(contributions|grants)$/.exec(path);
  if (match) {
    const p = found(ex.passports.find(x => x.vin === vin(match![1])));const link=found((p.links??[{module:p.module,branch_id:p.branch_id,resource_id:p.resource_id}]).find(l=>ctx.member.modules.includes(l.module)&&scoped(ctx,l.branch_id)));access(ctx,link.module,true);branch(ctx,link.branch_id,link.module);
    if (match[2] === 'grants') { role(ctx, MANAGE); const businessId=text(d,'grantee_business_id',''); const subject = text(d, 'subject','');check(!!businessId!==!!subject,'Choose either a named account or a business grant');if(businessId)role(ctx,['OWNER']); const expires = new Date(text(d, 'expires_at')); check(Number.isFinite(expires.getTime()) && expires.toISOString() > ctx.now, 'Choose a future access expiry'); p.grants = p.grants.filter(g => businessId?g.business_id!==businessId:g.subject !== subject); if (d.revoke !== true) p.grants.push({ subject,...(businessId?{business_id:businessId}:{}), expires_at: expires.toISOString() }); return { entity: p.vin, result: { grants: p.grants } }; }
    const day = isoDate(text(d, 'day')); check(day <= ctx.now.slice(0,10), 'History cannot be dated in the future');
    const visibility=text(d,'visibility','PRIVATE'),verification=text(d,'verification','DECLARED');check(['PRIVATE','SHARED'].includes(visibility)&&['DECLARED','REVIEWED'].includes(verification),'Choose valid visibility and review status');if(verification==='REVIEWED')finance(ctx);
    const entry = {visibility:visibility as 'PRIVATE'|'SHARED',verification:verification as 'DECLARED'|'REVIEWED',source:text(d,'source','',150)||s.name,id: id('HIST'), category: text(d, 'category'), day, note: text(d, 'note', undefined, 3000), evidence: text(d, 'evidence', '', 500), actor: ctx.member.id };
    p.entries.push(entry); return { entity: entry.id, result: entry };
  }
  return null;
}
