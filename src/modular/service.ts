import { createHash } from 'node:crypto';
import { Problem, requireCondition as check } from '../errors.js';
import { reports, type Journal } from '../ledger.js';
import { MemoryWorkbench, type Payload } from '../memory-workbench.js';
import { estimate } from '../pricing.js';
import { isoDate } from '../money.js';
import type { Principal, Role } from '../v3-rules.js';
import { access, active, branch, capacity, finance, MANAGE, OPERATORS, role, scoped } from './access.js';
import { changeCatalogue, defaultCatalogue, makeQuote } from './catalogue.js';
import { MODULES, type BusinessModule, type Catalogue, type Context, type Input,
  type Mutation, type Quote, type StateStore, type Subscription, type WorkspaceState } from './model.js';
import {recordOperationalHistory} from './passport-events.js';
import { INTAKE, intakeKind, intakePreview } from './intake.js';
import type { FxProvider } from './fx.js';
import { imageInput, type MediaStore } from './media.js';
import { emitPublication, marketplaceMutation, reconcilePublications, publicationAccess, safeProjection, type MarketplaceTransport, type PublicationEnvelope } from './marketplace.js';
import { financialReport, reportFiles } from './financial.js';
import { buyerDocument, salesHistory } from './documents.js';
import { restorationMutation } from './restoration.js';
import { assertPostingOpen, extras } from './restoration-state.js';
import { bankReference, operations, post, availableAssets } from './operations.js';
import { stateDocument } from './stores.js';
import { count, found, id, moduleCode, modules, object, safeSum, text } from './validation.js';

export interface PaymentProvider {
  initialise(request: { tenant_id: string; quote: Quote; email: string }): Promise<{ reference: string; authorization_url: string }>;
}
export interface ServiceOptions {
  now?: () => string;
  verifyStaffSubject?: (subjectId: string) => boolean | Promise<boolean>;
  paymentProvider?: PaymentProvider;
  mediaStore?: MediaStore;
  marketplaceTransport?: MarketplaceTransport;
  localMarketplace?: boolean;
  fxProvider?: FxProvider;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
const fingerprint = (actor: Principal, path: string, data: Input, scope?: unknown) => createHash('sha256')
  .update(JSON.stringify([actor.id, actor.tenantId, actor.role, actor.branches, path, canonical(data), canonical(scope)])).digest('hex');
function requestKey(key?: string): string {
  check(key && /^[A-Za-z0-9_-]{8,100}$/.test(key), 'A unique Idempotency-Key of 8–100 characters is required');
  return key;
}
function empty(actor: Principal): WorkspaceState {
  check(actor.role === 'OWNER', 'The host must provision a business owner before onboarding', 403);
  return { schema_version: 4, id: actor.tenantId, name: 'My business', revision: 0,
    selected_modules: [], software_history: [], primary_module: null, trial_used: false,
    branches: [{ id: actor.tenantId + '-MAIN', name: 'Main branch', modules: [], active: true }],
    members: [{ id: actor.id, role: 'OWNER', branches: [actor.tenantId + '-MAIN'], modules: [], active: true }],
    subscription: null, scheduled_subscription: null, quotes: [], payment_references: [], parties: [],
    fleet: [], rentals: [], haulage: [], workshop: [], parts: [], orders: [], service_invoices: [], receipts: [],
    expenses: [], transfers: [], listings: [], journals: [], audit: [], idempotency: [], dealer: null };
}
function provision(s: WorkspaceState, sub: Subscription): void {
  s.subscription = sub; s.selected_modules = sub.modules; s.primary_module = sub.primary_module;
  if (sub.software) s.software_history = [...new Set([...s.software_history, ...sub.modules])];
  for (const owner of s.members.filter(m => m.role === 'OWNER')) owner.modules = [...new Set([...owner.modules, ...sub.modules])];
  const main = s.branches[0];
  if (main) main.modules = [...new Set([...main.modules, ...sub.modules])];
}
function advance(s: WorkspaceState, now: string): void {
  if (s.scheduled_subscription && s.scheduled_subscription.start_at <= now) {
    provision(s, s.scheduled_subscription); s.scheduled_subscription = null;
  }
  reconcilePublications(s,now);
}
function journalViews(s: WorkspaceState): (Journal & { module: BusinessModule | 'SHARED'; branch_id: string })[] {
  const sourceBranch = (j: Journal) => {
    const vehicle = s.dealer?.vehicles.find(([id]) => id === j.source_id)?.[1];
    const bill = s.dealer?.bills.find(([id]) => id === j.source_id)?.[1];
    const inv = s.dealer?.invoices.find(([id]) => id === j.source_id)?.[1];
    const payment = s.dealer?.payments.find(([id]) => id === j.source_id)?.[1];
    const target = payment ? (payment.target_type !== 'BILL' ? s.dealer?.invoices.find(([id]) => id === payment.target_id)?.[1]
      : s.dealer?.bills.find(([id]) => id === payment.target_id)?.[1]) : null;
    const vid = vehicle?.id ?? bill?.vehicle_id ?? inv?.vehicle_id ?? target?.vehicle_id;
    return s.dealer?.vehicles.find(([id]) => id === vid)?.[1].branch_id ?? s.branches[0]!.id;
  };
  return [...s.journals, ...(s.dealer?.journals ?? []).map(j => {j.branch_id??=sourceBranch(j);return{ ...j, module: 'DEALER' as const, branch_id: j.branch_id };})];
}

export class ModularSaasService {
  private clock: () => string;
  constructor(readonly store: StateStore, private options: ServiceOptions = {}) {
    this.clock = options.now ?? (() => new Date().toISOString());
  }
  async catalogue(): Promise<Catalogue> {
    return this.store.transaction('catalogue', value => {
      const catalogue = value ? stateDocument<Catalogue>(value, 'Catalogue') : defaultCatalogue(this.clock());
      return { state: catalogue, result: catalogue };
    });
  }
  async run(actor: Principal, method: 'GET' | 'POST', path: string, data: Input = {}, key?: string): Promise<unknown> {
    check(actor && /^[A-Za-z0-9_-]{1,120}$/.test(actor.tenantId) && !!actor.id, 'Valid host identity is required', 401);
    object(data, 'Request');
    if (path.startsWith('/api/platform/')) return this.platform(actor, method, path, data, key);
    if (path === '/api/catalogue' && method === 'GET') {
      const c = await this.catalogue(); return { version: c.version, currency: c.currency, tiers: c.tiers,
        available_modules: MODULES, future_modules: ['AUCTION'] };
    }
    if(method==='GET'&&path==='/api/fx'){await this.run(actor,'GET','/api/financial-reports');check(this.options.fxProvider,'FX reference is not configured. Enter an explicitly sourced actual bank rate.',503);return this.options.fxProvider.quote(text(data,'currency'));}
    const passportRead=/^\/api\/passports\/([^/]+)$/.exec(path);if(method==='GET'&&passportRead)return this.passportHistory(actor,passportRead[1]!);
    if(method==='POST'&&/^\/api\/passports\/[^/]+\/grants$/.test(path)&&data.grantee_business_id){const own=stateDocument<WorkspaceState>(await this.store.read('tenant:'+actor.tenantId),'Workspace');check(own.members.some(m=>m.id===actor.id&&m.active&&m.role==='OWNER'),'Only the owner may share history with another business',403);const target=text(data,'grantee_business_id');check(target!==actor.tenantId&&/^[A-Za-z0-9_-]{1,120}$/.test(target)&&await this.store.read('tenant:'+target),'Choose a different existing GreenRev business',404);}
    let verifiedStaff: string | undefined;
    if (method === 'POST' && (path === '/api/staff/memberships' || path === '/api/staff/invitations')) {
      const current = stateDocument<WorkspaceState>(await this.store.read('tenant:' + actor.tenantId), 'Workspace');
      const manager = current.members.find(m => m.id === actor.id && m.active && MANAGE.includes(m.role));
      check(manager, 'Only an active business owner or administrator can grant staff access', 403);
      const subject = text(data, 'subject_id');
      check(await this.options.verifyStaffSubject?.(subject) === true, 'Host identity must verify this staff account before membership is granted', 403);
      verifiedStaff = subject;
    }
    if (method === 'POST' && path === '/api/media') {
      check(this.options.mediaStore, 'Image storage is not configured', 409);
      const pre = stateDocument<WorkspaceState>(await this.store.read('tenant:' + actor.tenantId), 'Workspace');
      const member = found(pre.members.find(m => m.id === actor.id && m.active));
      const ctx: Context = {state:pre, member, actor:{...actor,role:member.role,branches:member.branches}, now:this.clock()};
      const m = moduleCode(data.module); if (pre.subscription?.software) access(ctx,m,true); else publicationAccess(ctx,m); branch(ctx,text(data,'branch_id'),m);
      const resource=text(data,'resource_id'),b=text(data,'branch_id');const source=m==='DEALER'?pre.dealer?.vehicles.find(([id])=>id===resource)?.[1]:m==='PARTS'?pre.parts.find(x=>x.id===resource):m==='MECHANIC'?pre.workshop.find(x=>x.id===resource):pre.fleet.find(x=>x.id===resource&&x.module===m);check(source?.branch_id===b || pre.listings.some(l=>l.resource_id===resource&&l.branch_id===b&&l.module===m&&l.payload.direct===true),'Image item not found',404);check(extras(pre).media.filter(p=>p.resource_id===resource&&!p.archived).length<8,'Use at most eight photos per item',409);
      const image = imageInput(data); const storage_key = createHash('sha256').update(actor.tenantId + ':' + image.digest).digest('hex');
      await this.options.mediaStore.put(storage_key,image.bytes,image.mime);
      data = {...data,base64:undefined,mime:image.mime,size:image.bytes.length,digest:image.digest,storage_key}; delete data.base64;
    }
    const catalogue = await this.catalogue();
    let passportVins:string[]=[];
    const answer = await this.store.transaction('tenant:' + actor.tenantId, value => {
      const state = value ? stateDocument<WorkspaceState>(value, 'Workspace') : empty(actor);
      check(state.id === actor.tenantId, 'Workspace identity mismatch', 409); advance(state, this.clock());
      const accepting=/^\/api\/staff\/invitations\/([^/]+)\/accept$/.exec(path);
      if(method==='POST'&&accepting&&!state.members.some(m=>m.id===actor.id)){const invitation=found(extras(state).invites.find(i=>i.id===accepting[1]&&i.subject_id===actor.id&&i.status==='PENDING'&&i.expires_at>this.clock()));check(active(state,this.clock())&&state.subscription?.software,'Active software subscription required',403);check(state.members.filter(m=>m.active).length<state.subscription.limits.users,'Staff capacity reached',409);check(invitation.modules.every(m=>state.subscription!.modules.includes(m)),'Invitation modules are no longer subscribed',403);state.members.push({id:actor.id,role:invitation.role as Role,branches:[invitation.branch_id],modules:invitation.modules,active:true});}
      const member = found(state.members.find(m => m.id === actor.id && m.active));
      extras(state); journalViews(state);
      const posting = data.transaction_date ? isoDate(text(data, 'transaction_date')) : undefined;
      if (posting) { check(['OWNER', 'ACCOUNTANT'].includes(member.role), 'Only finance can choose a posting date', 403); check(posting <= this.clock().slice(0,10), 'Posting date cannot be in the future'); if (posting !== this.clock().slice(0,10)) text(data, 'posting_reason', undefined, 500); }
      const ctx: Context = { state, member, posting_date: posting, actor: { ...actor, role: member.role, branches: member.branches }, now: this.clock() };
      if(method==='POST'&&path==='/api/intake/preview'){const kind=intakeKind(data.kind);access(ctx,kind==='PASSPORT_EVENT'?moduleCode(data.module??state.primary_module):INTAKE[kind].module,true);return{state,result:intakePreview(kind,text(data,'source',undefined,50000),data.format==='CSV'?'CSV':'TEXT')};}
      if (method === 'GET') return { state, result: this.read(ctx, path, data) };
      const k = requestKey(key), hash = fingerprint(ctx.actor, path, data, member);
      const old = state.idempotency.find(r => r.key === k);
      if (old) { check(old.fingerprint === hash, 'Idempotency key was reused with different input', 409); return { state, result: old.response }; }
      const change = this.mutate(ctx, path, data, catalogue, k, verifiedStaff);
      passportVins=recordOperationalHistory(ctx,path,change.entity??'');if(path==='/api/passports/link')passportVins.push((change.result as {vin:string}).vin);if(path==='/api/intake/import')passportVins.push(...extras(state).passports.map(p=>p.vin));
      if(data.due_date&&change.entity){const dueTarget=change.result&&typeof change.result==='object'&&'payable_id'in change.result?String(change.result.payable_id):change.entity;extras(state).due_dates[dueTarget]=isoDate(text(data,'due_date'));}
      reconcilePublications(state,ctx.now);
      state.revision++;
      state.audit.push({ id: id('AUD'), actor: actor.id, action: path, entity: change.entity ?? '', at: ctx.now, detail: structuredClone(data) });
      state.idempotency.push({ key: k, fingerprint: hash, response: structuredClone(change.result) });
      return { state, result: change.result };
    });
    if(method==='POST'&&path==='/api/passports/link')passportVins.push((answer as {vin:string}).vin);
    for(const chassis of new Set(passportVins)){await this.store.transaction('passport-index:'+chassis,value=>{const index=(value??{schema_version:4,owners:[]}) as {schema_version:4;owners:string[]};if(!index.owners.includes(actor.tenantId))index.owners.push(actor.tenantId);return{state:index,result:null};});}
    if (method === 'POST' && (this.options.localMarketplace || this.options.marketplaceTransport) ) await this.deliverPublications(actor.tenantId,this.options.localMarketplace?1000:1);
    return answer;
  }
  private read(ctx: Context, path: string, d: Input): unknown {
    const s = ctx.state;
    if (path === '/api/financial-reports' || path === '/api/financial-reports/export') { const report = financialReport(ctx, d, journalViews(s)); return path.endsWith('/export') ? { files: reportFiles(report), from: report.from, to: report.to } : report; }
    if(path==='/api/marketplace/preview'){const m=moduleCode(d.module),resource=text(d,'resource_id');access(ctx,m);const source=m==='DEALER'?s.dealer?.vehicles.find(([id])=>id===resource)?.[1]:m==='PARTS'?s.parts.find(x=>x.id===resource):m==='MECHANIC'?s.workshop.find(x=>x.id===resource):s.fleet.find(x=>x.id===resource&&x.module===m);check(source,'Item not found',404);branch(ctx,source.branch_id,m);return{preview:safeProjection(s,{module:m,resource_id:resource,payload:{title:text(d,'title','')}})};}
    if (path === '/api/marketplace') { check(ctx.member.role !== 'DRIVER','Marketplace access refused',403); return { local_demo: !!this.options.localMarketplace, transport_configured: !!this.options.marketplaceTransport, listings: s.listings.filter(l=>ctx.member.modules.includes(l.module)&&scoped(ctx,l.branch_id)), modules:s.selected_modules, branches:s.branches.filter(b=>scoped(ctx,b.id)), deliveries:extras(s).deliveries.filter(e=>s.listings.some(l=>l.id===e.listing_id&&ctx.member.modules.includes(l.module)&&scoped(ctx,l.branch_id))) }; }
    if (path === '/api/sales') return salesHistory(ctx);
    const document = /^\/api\/documents\/(invoices|receipts)\/([^/]+)$/.exec(path);
    if (document) return buyerDocument(ctx, document[1] === 'invoices' ? 'INVOICE' : 'RECEIPT', document[2]!);
    if (path === '/api/tools') { check(ctx.member.role !== 'DRIVER', 'Tools access refused', 403); const ex = extras(s); const visible = (r: { module: BusinessModule | 'SHARED'; branch_id: string }) => scoped(ctx, r.branch_id) && (r.module === 'SHARED' ? s.software_history.every(m => ctx.member.modules.includes(m)) : ctx.member.modules.includes(r.module)); return { business_id:s.id,financial_settings: ['OWNER','ACCOUNTANT'].includes(ctx.member.role) ? ex.financial : null, leads: ex.leads.filter(visible), passports: ex.passports.filter(p=>(p.links??[p]).some(visible)).map(p => ({...p, grants: MANAGE.includes(ctx.member.role) ? p.grants : []})), templates: ['OWNER','ACCOUNTANT'].includes(ctx.member.role) ? ex.templates.filter(visible) : [], invites: MANAGE.includes(ctx.member.role) ? ex.invites : [], deliveries: MANAGE.includes(ctx.member.role) ? ex.deliveries.filter(x => s.listings.some(l => l.id === x.listing_id && visible(l))) : [], media: ex.media.filter(p=>!p.archived&&visible(p)), categories:['OWNER','ACCOUNTANT'].includes(ctx.member.role)?ex.categories:[], vehicle_transfers:ctx.member.modules.includes('DEALER')?ex.vehicle_transfers.filter(t=>scoped(ctx,t.source_branch)||scoped(ctx,t.destination_branch)):[] }; }
    if(path==='/api/branch-summary')return{branches:(this.read(ctx,'/api/workspace',{}) as {branch_summary:unknown}).branch_summary};
    if (path === '/api/rentals/availability') {
      access(ctx, 'RENTAL'); return { assets: availableAssets(ctx, d) };
    }
    if (path === '/api/entitlements' || path === '/api/billing') {
      role(ctx, ['OWNER', 'ADMIN', 'ACCOUNTANT']);
      return { active: active(s, ctx.now), subscription: s.subscription, scheduled_subscription: s.scheduled_subscription,
        selected_modules: s.selected_modules, primary_module: s.primary_module, quotes: s.quotes };
    }
    if (path === '/api/reports' || path === '/api/ledger') {
      finance(ctx); check(s.software_history.some(m => ctx.member.modules.includes(m)), 'Business software history is required', 403);
      const m = d.module ? moduleCode(d.module) : undefined;
      if (m) access(ctx, m); const b = typeof d.branch_id === 'string' ? d.branch_id : undefined;
      if (b) branch(ctx, b);
      const sharedAccess=s.software_history.every(x=>ctx.member.modules.includes(x));
      const journals = journalViews(s).filter(j => scoped(ctx,j.branch_id) && (j.module === 'SHARED' ? sharedAccess : ctx.member.modules.includes(j.module))
        && (!m || j.module === m) && (!b || j.branch_id === b));
      if (path === '/api/ledger') return { journals };
      const from = d.from ? isoDate(text(d, 'from')) : undefined, to = d.to ? isoDate(text(d, 'to')) : ctx.now.slice(0, 10);
      return { ...reports(s.id, journals, from, to), module: m ?? 'ALL', branch_id: b ?? 'ALL',
        shared_overhead_included: !m&&sharedAccess, unallocated_shared_overhead_minor: m && sharedAccess ? reports(s.id, s.journals.filter(j => j.module === 'SHARED'&&(!b||j.branch_id===b)),
          from, to).overhead_minor : 0 };
    }
    if(path==='/api/integrations'){finance(ctx);return{events:(ctx.member.modules.includes('DEALER')?s.dealer?.outbox??[]:[]).map(e=>({...e,...(extras(s).metadata['outbox:'+e.id]??{}),status:extras(s).metadata['outbox:'+e.id]?'ACKNOWLEDGED':'PENDING'})),publications:extras(s).deliveries.filter(e=>s.listings.some(l=>l.id===e.listing_id&&ctx.member.modules.includes(l.module)&&scoped(ctx,l.branch_id)))};}
    if (path === '/api/audit') { role(ctx, ['OWNER']); return { events: s.audit }; }
    if (path !== '/api/workspace') throw new Problem('Unknown read route', 404);
    const canRead = (m: BusinessModule) => s.software_history.includes(m) && ctx.member.modules.includes(m);
    const visible = (row: { branch_id: string }) => scoped(ctx, row.branch_id);
    const financeAccess = ['OWNER', 'ACCOUNTANT'].includes(ctx.member.role) && s.software_history.some(m => canRead(m));
    const driver = ctx.member.role === 'DRIVER';
    const readable = MODULES.filter(m => canRead(m) && (driver ? m === 'HAULAGE' : true));
    const navigation = readable.map(m => ({ module: m, read_only: !active(s, ctx.now) || !s.subscription?.software
      || !s.subscription.modules.includes(m) || !OPERATORS[m].includes(ctx.member.role),
      active: active(s, ctx.now) && !!s.subscription?.software && !!s.subscription.modules.includes(m) }));
    const dealer = canRead('DEALER') && !driver ? MemoryWorkbench.restore(s.id, s.dealer)
      .run(ctx.actor, 'GET', '/api/workspace') as Record<string, unknown> : {};
    const haulage = canRead('HAULAGE') ? s.haulage.filter(j => visible(j) && (!driver || j.driver_id === ctx.member.id)) : [];
    const rentalRows = canRead('RENTAL') && !driver ? s.rentals.filter(visible).map(r => ({ ...r, deposit_references: financeAccess ? r.deposit_references : [] })) : [];
    return { id: s.id, name: s.name, revision: s.revision, now: ctx.now,
      member: ctx.member, navigation, primary_module: s.primary_module, needs_onboarding: !s.trial_used && !s.subscription,
      subscription: driver ? null : { active: active(s, ctx.now), status: s.subscription?.status ?? 'NONE',
        end_at: s.subscription?.end_at ?? null, marketplace: !!s.subscription?.marketplace,
        software: !!s.subscription?.software, modules: s.subscription?.modules ?? [], tier: s.subscription?.tier ?? null,
        limits: s.subscription?.limits ?? null },
      branches: s.branches.filter(b => scoped(ctx, b.id)),
      branch_summary:s.branches.filter(b=>scoped(ctx,b.id)).map(b=>({id:b.id,sale_vehicles:canRead('DEALER')&&!driver?s.dealer?.vehicles.filter(([,v])=>v.branch_id===b.id&&!['DELIVERED','ARCHIVED'].includes(v.status)).length??0:0,parts_units:canRead('PARTS')&&!driver?s.parts.filter(p=>p.branch_id===b.id).reduce((n,p)=>n+p.quantity,0):0,rentals_open:rentalRows.filter(r=>r.branch_id===b.id&&['BOOKED','CHECKED_OUT'].includes(r.status)).length,haulage_open:haulage.filter(j=>j.branch_id===b.id&&['QUOTED','DISPATCHED'].includes(j.status)).length,workshop_open:canRead('MECHANIC')&&!driver?s.workshop.filter(j=>j.branch_id===b.id&&['BOOKED','IN_PROGRESS'].includes(j.status)).length:0})),
      members: MANAGE.includes(ctx.member.role) ? s.members : [],
      parties: driver ? [] : s.parties.filter(p => visible(p) && (financeAccess || p.kind === 'CUSTOMER' || p.kind === 'BOTH')),
      vehicle_transfers:canRead('DEALER')&&!driver?extras(s).vehicle_transfers.filter(t=>scoped(ctx,t.source_branch)||scoped(ctx,t.destination_branch)):[],
      dealer,
      dealer_payments: financeAccess && canRead('DEALER') ? s.dealer?.payments.map(([, p]) => p) ?? [] : [],
      dealer_bills: financeAccess && canRead('DEALER') ? s.dealer?.bills.map(([, b]) => b) ?? [] : [],
      dispatch_drivers: canRead('HAULAGE') && !driver ? s.members.filter(m => m.active && m.role === 'DRIVER'
        && m.modules.includes('HAULAGE') && m.branches.some(b => scoped(ctx, b))).map(m => ({ id: m.id, branches: m.branches })) : [],
      fleet: s.fleet.filter(a => readable.includes(a.module) && visible(a) && (!driver || haulage.some(j => j.asset_id === a.id)))
        .map(a => driver ? { id: a.id, name: a.name, registration: a.registration, module: a.module, branch_id: a.branch_id, status: a.status } : a),
      rentals: rentalRows,
      rental_summary: { pickups_today: rentalRows.filter(r => r.status === 'BOOKED' && r.start_at.slice(0, 10) === ctx.now.slice(0, 10)).length,
        outstanding_returns: rentalRows.filter(r => r.status === 'CHECKED_OUT').length,
        overdue_returns: rentalRows.filter(r => r.status === 'CHECKED_OUT' && r.end_at < ctx.now).length,
        deposit_balance_minor: safeSum(rentalRows.map(r => r.deposit_received_minor - r.deposit_deducted_minor - r.deposit_refunded_minor)) },
      haulage: driver ? haulage.map(j => ({ id: j.id, title: j.title, origin: j.origin, destination: j.destination, cargo: j.cargo,
        status: j.status, start_at: j.start_at, end_at: j.end_at, version: j.version, driver_id: j.driver_id })) : haulage,
      workshop: canRead('MECHANIC') && !driver ? s.workshop.filter(visible) : [],
      parts: canRead('PARTS') && !driver ? s.parts.filter(visible).map(p => financeAccess ? p : { ...p, value_minor: undefined }) : [],
      orders: canRead('PARTS') && !driver ? s.orders.filter(visible).map(o => financeAccess ? o : { ...o, cost_minor: undefined }) : [],
      transfers: canRead('PARTS') && !driver ? s.transfers.filter(t => scoped(ctx, t.source_branch) || scoped(ctx, t.destination_branch)) : [],
      service_invoices: driver ? [] : s.service_invoices.filter(i => canRead(i.module) && visible(i)),
      receipts: financeAccess ? s.receipts.filter(r => canRead(r.module) && visible(r)) : [],
      expenses: financeAccess ? s.expenses.filter(e => (e.module === 'SHARED' ? s.software_history.every(m=>canRead(m)) : canRead(e.module)) && visible(e)) : [],
      listings: driver ? [] : s.listings.filter(l => ctx.member.modules.includes(l.module) && visible(l)),
      reports: financeAccess ? reports(s.id, journalViews(s).filter(j => scoped(ctx,j.branch_id) && (j.module === 'SHARED' ? s.software_history.every(x=>canRead(x)) : canRead(j.module))), undefined, ctx.now.slice(0, 10)) : null,
      permissions: { finance: financeAccess, manage: MANAGE.includes(ctx.member.role), driver,
        platform_catalogue: ctx.actor.platformCapabilities?.includes('CATALOG_ADMIN') ?? false } };
  }
  private mutate(ctx: Context, path: string, d: Input, catalogue: Catalogue, key: string, verifiedStaff?: string): Mutation {
    const s = ctx.state;
    if(path==='/api/intake/import'){const kind=intakeKind(d.kind);const intakeModule=kind==='PASSPORT_EVENT'?moduleCode(d.module??s.primary_module):INTAKE[kind].module;access(ctx,intakeModule,true);const b=text(d,'branch_id');branch(ctx,b,intakeModule);check(Array.isArray(d.rows)&&d.rows.length>0&&d.rows.length<=100,'Import one to 100 reviewed rows');const results=d.rows.map(raw=>{const row=object(raw,'Import row');const input:Input={...row,branch_id:b};if(kind.endsWith('_ASSET'))input.module=INTAKE[kind].module;for(const field of ['year','reorder_level'])if(input[field]!==undefined)input[field]=Number(input[field]);const route=kind==='PASSPORT_EVENT'?'/api/passports/'+text(row,'vin')+'/contributions':INTAKE[kind].route;if(kind==='PASSPORT_EVENT'){const passport=found(extras(s).passports.find(p=>p.vin===row.vin));check(passport.branch_id===b,'Choose the branch where this vehicle Passport is linked',403);}
        const imported=this.mutate(ctx,route,input,catalogue,key+'_'+id('ROW'));recordOperationalHistory(ctx,route,imported.entity??'');return imported.result;});return{result:{imported:results.length,results,published:false}};}
    const accept=/^\/api\/staff\/invitations\/([^/]+)\/(accept|revoke)$/.exec(path);if(accept){const invite=found(extras(s).invites.find(i=>i.id===accept[1]));if(accept[2]==='accept'){check(invite.subject_id===ctx.member.id&&invite.status==='PENDING'&&invite.expires_at>ctx.now,'Invitation cannot be accepted',403);invite.status='ACCEPTED';}else{role(ctx,MANAGE);check(invite.status==='PENDING','Only pending invitations can be revoked; disable an accepted member under staff access',409);invite.status='REVOKED';}return{entity:invite.id,result:invite};}
    const restored = restorationMutation(ctx, path, d, journalViews(s)); if (restored) return restored;
    if (path === '/api/onboarding') {
      role(ctx, ['OWNER']); check(!s.trial_used && !s.subscription, 'This business has already used onboarding', 409);
      const chosen = modules(d.modules), primary = moduleCode(d.primary_module); check(chosen.includes(primary), 'Choose a primary module from your selections');
      const mode = text(d, 'mode', 'SAAS'); check(['SAAS', 'BUNDLE', 'MARKETPLACE'].includes(mode), 'Invalid product mode');
      s.name = text(d, 'name'); extras(s).financial.legal_name=s.name; s.trial_used = true;
      provision(s, { revision: 1, status: 'TRIAL', start_at: ctx.now,
        end_at: new Date(Date.parse(ctx.now) + 14 * 86400000).toISOString(), tier: 'STARTER', modules: chosen,
        primary_module: primary, marketplace: mode !== 'SAAS', software: mode !== 'MARKETPLACE',
        limits: structuredClone(catalogue.tiers.STARTER.limits), items: [], catalogue_version: catalogue.version, payment_reference: null });
      return { result: { subscription: s.subscription, name: s.name } };
    }
    if (path === '/api/organisation/profile') {
      role(ctx, MANAGE); s.name = text(d, 'name'); const primary = moduleCode(d.primary_module);
      check(s.selected_modules.includes(primary), 'Primary module must be part of the business selection'); s.primary_module = primary;
      return { result: { name: s.name, primary_module: primary } };
    }
    if (path === '/api/billing/quotes') {
      role(ctx, ['OWNER']); const quote = makeQuote(s, catalogue, d, ctx.now); s.quotes.push(quote); return { entity: quote.id, result: quote };
    }
    if (path === '/api/billing/cancel') {
      role(ctx, ['OWNER']); check(s.subscription, 'No subscription to cancel'); text(d, 'reason', undefined, 500);
      check(!s.scheduled_subscription, 'A prepaid renewal is scheduled; billing must reconcile it before cancellation', 409);
      s.subscription.status = 'CANCELLED'; s.subscription.revision++; s.scheduled_subscription = null;
      for (const listing of s.listings) listing.status = 'WITHDRAWN';
      return { result: { status: 'CANCELLED', history_preserved: true } };
    }
    if (path === '/api/branches') {
      role(ctx, MANAGE); check(active(s, ctx.now) && s.subscription?.software, 'Active business software subscription required', 403);
      check(s.branches.filter(b => b.active).length < s.subscription.limits.branches, 'Branch allowance reached', 409);
      const chosen = modules(d.modules); check(chosen.every(m => s.subscription!.modules.includes(m)), 'Branch module has not been purchased', 403);
      const row = { id: id('BR'), name: text(d, 'name'), modules: chosen, active: true }; s.branches.push(row);
      if (ctx.member.role === 'ADMIN') ctx.member.branches.push(row.id);
      return { entity: row.id, result: row };
    }
    if (path === '/api/staff/memberships') {
      role(ctx, MANAGE); check(active(s, ctx.now) && s.subscription?.software, 'Active software subscription required', 403);
      const subject = text(d, 'subject_id'); check(verifiedStaff === subject, 'Host identity must verify this staff account before membership is granted', 403);
      const chosenRole = text(d, 'role') as Role;
      const roles: Role[] = ['ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SALES', 'PARTS_MANAGER', 'CLERK', 'DRIVER', 'MECHANIC', 'RENTAL_AGENT', 'DISPATCHER', 'VIEWER'];
      check(roles.includes(chosenRole), 'Choose a supported staff role');
      if (ctx.member.role === 'ADMIN') check(!['ADMIN', 'ACCOUNTANT'].includes(chosenRole), 'Owner approval required for financial or administrator roles', 403);
      check(!s.members.some(m => m.id === subject), 'Use the membership update endpoint for existing staff', 409);
      check(s.members.filter(m => m.active).length + extras(s).invites.filter(i=>i.status==='PENDING'&&i.expires_at>ctx.now).length < s.subscription.limits.users, 'Staff allowance reached', 409);
      const chosen = modules(d.modules); check(chosen.every(m => s.subscription!.modules.includes(m)), 'Staff module has not been purchased', 403);
      const b = text(d, 'branch_id'); branch(ctx, b);
      check(chosen.every(m => s.branches.find(x => x.id === b)!.modules.includes(m)), 'Module is not enabled at this branch', 403);
      const row = { id: subject, role: chosenRole, branches: [b], modules: chosen, active: true }; s.members.push(row);
      return { entity: subject, result: row };
    }
    let match = /^\/api\/staff\/([^/]+)\/(disable|enable)$/.exec(path);
    if (match) {
      role(ctx, MANAGE); const m = found(s.members.find(m => m.id === match![1]));
      check(m.role !== 'OWNER' && m.id !== ctx.member.id, 'Owner and self-deactivation are prohibited', 403);
      if (ctx.member.role === 'ADMIN') check(!['ADMIN', 'ACCOUNTANT'].includes(m.role), 'Only the owner may manage this role', 403);
      if (match[2] === 'enable') check(active(s, ctx.now) && s.subscription
        && s.members.filter(m => m.active).length < s.subscription.limits.users, 'Active subscription and available staff capacity required', 409);
      m.active = match[2] === 'enable'; return { entity: m.id, result: m };
    }
    if (path === '/api/parties') {
      role(ctx, ['OWNER', 'ACCOUNTANT', 'ADMIN', 'BRANCH_MANAGER', 'SALES', 'PARTS_MANAGER', 'RENTAL_AGENT', 'DISPATCHER', 'MECHANIC']);
      check(active(s, ctx.now) && s.subscription?.software, 'Active software subscription required', 403);
      const b = text(d, 'branch_id'); branch(ctx, b);
      const kind = text(d, 'kind', 'CUSTOMER'); check(['CUSTOMER', 'SUPPLIER', 'BOTH', 'LENDER'].includes(kind), 'Invalid contact type');
      if (kind !== 'CUSTOMER') finance(ctx);
      const row = { id: id('PTY'), branch_id: b, name: text(d, 'name'), kind: kind as 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'LENDER', contact: text(d, 'contact', '', 300) };
      s.parties.push(row); return { entity: row.id, result: row };
    }
    if (path === '/api/capital') {
      role(ctx, ['OWNER']); check(active(s, ctx.now) && s.subscription?.software, 'Active software subscription required', 403);
      const b = text(d, 'branch_id'); branch(ctx, b); const amount = importAmount(d, 'amount'); bankReference(ctx, d); const entity = id('CAP');
      post(ctx, 'SHARED', b, 'CAPITAL', entity, [['1000', amount, 0], ['3000', 0, amount]]); return { entity, result: { id: entity } };
    }
    if (path === '/api/estimate') { finance(ctx); return { result: estimate({ ...d, purchase: text(d, 'purchase') }) }; }
    const publication = marketplaceMutation(ctx,path,d); if(publication) return publication;
    const mediaAction=/^\/api\/media\/([^/]+)\/(visibility|archive)$/.exec(path);
    if(mediaAction){const photo=found(extras(s).media.find(p=>p.id===mediaAction[1]&&!p.archived));role(ctx,OPERATORS[photo.module]);check(ctx.member.modules.includes(photo.module),'Image access refused',403);branch(ctx,photo.branch_id,photo.module);check(d.version===(photo.version??1),'Image changed; refresh before editing',409);if(mediaAction[2]==='archive'){photo.archived=true;photo.public=false;}else{check(typeof d.public==='boolean','Choose public or private');if(d.public){if(s.subscription?.software)access(ctx,photo.module,true);else publicationAccess(ctx,photo.module);}photo.public=d.public;}photo.version=(photo.version??1)+1;return{entity:photo.id,result:{id:photo.id,public:photo.public,archived:photo.archived,version:photo.version}};}
    if(path==='/api/media') {
      const m=moduleCode(d.module), b=text(d,'branch_id'); if(s.subscription?.software) access(ctx,m,true); else publicationAccess(ctx,m); branch(ctx,b,m);
      const resource=text(d,'resource_id'); const source=m==='DEALER'?s.dealer?.vehicles.find(([id])=>id===resource)?.[1]:m==='PARTS'?s.parts.find(x=>x.id===resource):m==='MECHANIC'?s.workshop.find(x=>x.id===resource):s.fleet.find(x=>x.id===resource&&x.module===m);
      check(source?.branch_id===b || s.listings.some(l=>l.resource_id===resource&&l.branch_id===b&&l.module===m&&l.payload.direct===true),'Image must belong to an item in this business and branch',404);
      check(extras(s).media.filter(x=>x.resource_id===resource&&!x.archived).length<8,'Use at most eight photos per item',409);
      const row={id:id('IMG'),module:m,branch_id:b,resource_id:resource,mime:text(d,'mime'),size:count(d,'size',1,2097152),digest:text(d,'digest'),storage_key:text(d,'storage_key'),caption:text(d,'caption','',300),public:d.public===true,at:ctx.now,version:1,archived:false}; extras(s).media.push(row);return{entity:row.id,result:row};
    }
    const result = operations(ctx, path, d); if (result) return result;
    return this.dealer(ctx, path, d, key);
  }
  private dealer(ctx: Context, path: string, d: Input, key: string): Mutation {
    const s = ctx.state;
    check(/^\/api\/(vehicles|invoices|bills|payments)(?:\/|$)/.test(path), 'Unknown mutation route', 404);
    const settlement = /\/payments(?:\/|$)/.test(path) || /\/invoices\/[^/]+\/(handover|return)$/.test(path);
    access(ctx, 'DEALER', true, settlement);
    const clone = structuredClone(d);
    if (path === '/api/vehicles') {
      const b = text(d, 'branch_id'); branch(ctx, b, 'DEALER');
      capacity(ctx, 'DEALER', s.dealer?.vehicles.filter(([, v]) => !['DELIVERED', 'ARCHIVED'].includes(v.status)).length ?? 0);
      check(!s.fleet.some(a => a.vin === d.vin && a.status !== 'ARCHIVED'), 'VIN is already an active rental or haulage asset', 409);
    }
    const routeId = path.split('/')[3];
    let vehicleId = typeof d.vehicle_id === 'string' ? d.vehicle_id : undefined;
    if (path.startsWith('/api/vehicles/') && routeId) vehicleId = routeId;
    if (path.startsWith('/api/invoices/') && routeId) vehicleId = found(s.dealer?.invoices.find(([id]) => id === routeId)?.[1]).vehicle_id;
    if (path === '/api/payments' || path.startsWith('/api/payments/')) {
      const payment = path === '/api/payments' ? null : found(s.dealer?.payments.find(([id]) => id === routeId)?.[1]);
      const kind = payment?.target_type ?? d.target_type, target = payment?.target_id ?? d.target_id;
      vehicleId = kind !== 'BILL' ? found(s.dealer?.invoices.find(([id]) => id === target)?.[1]).vehicle_id
        : found(s.dealer?.bills.find(([id]) => id === target)?.[1]).vehicle_id ?? undefined;
      if (path === '/api/payments') bankReference(ctx, d);
    }
    if (vehicleId) branch(ctx, found(s.dealer?.vehicles.find(([id]) => id === vehicleId)?.[1]).branch_id, 'DEALER');
    if (path === '/api/invoices') {
      const v = found(s.dealer?.vehicles.find(([id]) => id === d.vehicle_id)?.[1]);
      check(s.parties.some(p => p.id === d.customer_id && p.branch_id === v.branch_id), 'Customer must belong to the sale branch', 403);
    }
    let app = MemoryWorkbench.restore(s.id, s.dealer, ctx.posting_date ?? ctx.now.slice(0,10), extras(s).financial); let snap = app.snapshot();
    snap.parties = s.parties.map(p => [p.id, { id: p.id, tenant_id: s.id, name: p.name, kind: p.kind, contact: p.contact }]);
    app = MemoryWorkbench.restore(s.id, snap, ctx.posting_date ?? ctx.now.slice(0,10), extras(s).financial);
    check(Object.values(clone).every(v => v === null || ['string', 'number', 'boolean'].includes(typeof v)), 'Dealer fields must be scalar');
    const answer = app.run(ctx.actor, 'POST', path, clone as Payload, key);
    if (app.snapshot().journals.length > (s.dealer?.journals.length ?? 0)) assertPostingOpen(s, ctx.posting_date ?? ctx.now.slice(0,10));
    const next=app.snapshot();s.dealer=next;journalViews(s);return { entity: (answer as { id?: string }).id, result: answer };
  }
  async passportHistory(actor:Principal,chassis:string) {
    check(/^[A-HJ-NPR-Z0-9]{17}$/.test(chassis),'Use a valid 17-character VIN');const own=stateDocument<WorkspaceState>(await this.store.read('tenant:'+actor.tenantId),'Workspace'),member=found(own.members.find(m=>m.id===actor.id&&m.active)),ctx:Context={state:own,member,actor:{...actor,role:member.role,branches:member.branches},now:this.clock()};
    const p=found(extras(own).passports.find(p=>p.vin===chassis));check(member.role!=='DRIVER','Passport access refused',403);const related=(p.links??[p]).some(l=>member.modules.includes(l.module)&&scoped(ctx,l.branch_id));check(related||p.grants.some(g=>g.subject===member.id&&g.expires_at>ctx.now),'Passport access has not been granted',403);
    const shared:{id:string;day:string;category:string;note:string;source:string;verification:string;business_id:string}[]=[];
    if(related){const index=await this.store.read('passport-index:'+chassis) as {owners:string[]}|null;
      for(const businessId of index?.owners??[]){if(businessId===own.id)continue;const raw=await this.store.read('tenant:'+businessId);if(!raw||(raw as {schema_version?:number}).schema_version!==4)continue;const source=raw as WorkspaceState,passport=extras(source).passports.find(p=>p.vin===chassis);if(!passport?.grants.some(g=>g.business_id===own.id&&g.expires_at>ctx.now))continue;for(const e of passport.entries.filter(e=>e.visibility==='SHARED'))shared.push({id:e.id,day:e.day,category:e.category,note:e.note,source:e.source??source.name,verification:e.verification??'DECLARED',business_id:source.id});}
    }
    return{vin:p.vin,module:p.module,entries:related?p.entries:p.entries.map(({day,category,note})=>({day,category,note})),grants:MANAGE.includes(member.role)?p.grants:[],shared_history:shared,notice:'Source-labelled vehicle history is not a government, ownership, accident or theft verification.'};
  }
  async image(actor: Principal, imageId: string): Promise<{bytes:Uint8Array;mime:string}> {
    const raw=await this.store.read('tenant:'+actor.tenantId);check(raw,'Image not found',404);const s=stateDocument<WorkspaceState>(raw,'Workspace'),member=found(s.members.find(m=>m.id===actor.id&&m.active));
    const row=found(extras(s).media.find(p=>p.id===imageId&&!p.archived));check(member.role!=='DRIVER'&&member.modules.includes(row.module),'Image access refused',403);branch({state:s,member,actor,now:this.clock()},row.branch_id,row.module);
    const bytes=await this.options.mediaStore?.get(row.storage_key);check(bytes,'Image not found',404);return{bytes,mime:row.mime};
  }
  /** Can be called by a trusted host worker to retry durable pending events. */
  async deliverPublications(tenantId:string,maxDeliveries=20):Promise<void> {
    const snapshot=await this.store.transaction('tenant:'+tenantId,value=>{const s=stateDocument<WorkspaceState>(value,'Workspace');reconcilePublications(s,this.clock());return{state:s,result:s};});
    let attempted=0;for(const item of extras(snapshot).deliveries.filter(e=>e.status==='PENDING').reverse()) {
      const listing=snapshot.listings.find(l=>l.id===item.listing_id);if(!listing)continue;
      if(listing.generation!==item.generation){await this.store.transaction('tenant:'+tenantId,value=>{const s=stateDocument<WorkspaceState>(value,'Workspace'),e=extras(s).deliveries.find(e=>e.id===item.id);if(e){e.status='DELIVERED';e.last_error='Superseded by a newer publication generation';}return{state:s,result:null};});continue;}
      if(attempted>=maxDeliveries)break;attempted++;
      const available=active(snapshot,this.clock())&&snapshot.subscription?.marketplace&&listing.status!=='WITHDRAWN'?safeProjection(snapshot,listing):null;
      const event:PublicationEnvelope={event_id:item.id,tenant_id:tenantId,listing_id:listing.id,generation:item.generation,kind:available&&item.kind!=='WITHDRAW'?'UPSERT':'WITHDRAW',payload:available??{}};
      let publicUrl:string|undefined,error='';
      try {
        if(this.options.localMarketplace) {await this.store.transaction('marketplace:index',value=>{const index=(value??{items:[]}) as {schema_version?:4;items:{tenant_id:string;listing_id:string;generation:number}[]};index.schema_version=4;const old=index.items.find(x=>x.tenant_id===tenantId&&x.listing_id===listing.id);if(!old)index.items.push({tenant_id:tenantId,listing_id:listing.id,generation:item.generation});else if(item.generation>old.generation)old.generation=item.generation;return{state:index,result:null};});publicUrl='/marketplace#'+listing.id;}
        else if(this.options.marketplaceTransport)publicUrl=(await this.options.marketplaceTransport.deliver(event)).public_url;
        else continue;
      }catch(e){error=e instanceof Error?e.message:'Delivery failed';}
      await this.store.transaction('tenant:'+tenantId,value=>{const s=stateDocument<WorkspaceState>(value,'Workspace'),delivery=extras(s).deliveries.find(e=>e.id===item.id),l=s.listings.find(l=>l.id===listing.id);if(delivery){delivery.attempts++;delivery.last_error=error;if(!error){delivery.status='DELIVERED';delivery.delivered_at=this.clock();if(l&&l.generation===item.generation){l.status=event.kind==='WITHDRAW'?'WITHDRAWN':'DELIVERED';l.moderation=this.options.localMarketplace?'APPROVED':l.moderation;l.public_url=publicUrl;}}}return{state:s,result:null};});
    }
  }
  async publicListings() {
    check(this.options.localMarketplace,'Local public marketplace is disabled',404);
    const index=(await this.store.read('marketplace:index')??{items:[]}) as {items:{tenant_id:string;listing_id:string}[]};
    const rows:Record<string,unknown>[]=[];
    for(const item of index.items) {const raw=await this.store.read('tenant:'+item.tenant_id);if(!raw)continue;const s=stateDocument<WorkspaceState>(raw,'Workspace'),l=s.listings.find(l=>l.id===item.listing_id);if(!l||l.status!=='DELIVERED'||l.moderation!=='APPROVED'||!active(s,this.clock())||!s.subscription?.marketplace||!s.subscription.modules.includes(l.module))continue;const projection=safeProjection(s,l);if(projection)rows.push({...projection,listing_id:l.id});}
    return{local_demo:true,listings:rows};
  }
  async publicImage(listingId:string,imageId:string):Promise<{bytes:Uint8Array;mime:string}> {
    const publicRows=await this.publicListings();check(publicRows.listings.some(l=>l.listing_id===listingId&&(l.photos as {id:string}[]).some(p=>p.id===imageId)),'Public image not found',404);
    const index=(await this.store.read('marketplace:index')) as {items:{tenant_id:string;listing_id:string}[]};const item=found(index.items.find(x=>x.listing_id===listingId));const s=stateDocument<WorkspaceState>(await this.store.read('tenant:'+item.tenant_id),'Workspace');const photo=found(extras(s).media.find(p=>p.id===imageId&&p.public));const bytes=await this.options.mediaStore?.get(photo.storage_key);check(bytes,'Image not found',404);return{bytes,mime:photo.mime};
  }
  private async platform(actor: Principal, method: string, path: string, d: Input, key?: string): Promise<unknown> {
    const requireCapability = (name: string) => check(actor.platformCapabilities?.includes(name), 'Separately provisioned platform authority is required', 403);
    const acknowledgement=/^\/api\/platform\/subscribers\/([A-Za-z0-9_-]+)\/outbox\/([^/]+)\/ack$/.exec(path);
    if(acknowledgement){requireCapability('INTEGRATION_WORKER');check(method==='POST','Method not allowed',405);requestKey(key);return this.store.transaction('tenant:'+acknowledgement[1],value=>{const s=stateDocument<WorkspaceState>(value,'Subscriber'),event=found(s.dealer?.outbox.find(e=>e.id===acknowledgement[2]));const reference=text(d,'reference');const old=extras(s).metadata['outbox:'+event.id];if(old){check(old.reference===reference,'Acknowledgement reference changed',409);return{state:s,result:old};}const result={reference,actor:actor.id,acknowledged_at:this.clock()};extras(s).metadata['outbox:'+event.id]=result;s.audit.push({id:id('AUD'),actor:actor.id,action:path,entity:event.id,at:this.clock()});return{state:s,result};});}
    if(path==='/api/platform/subscribers'&&method==='GET'){requireCapability('BILLING_ADMIN');check(this.store.list,'The host store must supply its subscriber directory adapter',409);const limit=count(d,'limit',1,100,50),after=text(d,'after','');const rows=await this.store.list('tenant:',limit,after);return{items:rows.map(({value})=>{const s=stateDocument<WorkspaceState>(value,'Subscriber');return{id:s.id,name:s.name,subscription:s.subscription,usage:{branches:s.branches.filter(b=>b.active).length,users:s.members.filter(m=>m.active).length},pending_publications:s.listings.filter(l=>l.moderation==='PENDING'&&l.status!=='WITHDRAWN').length};}),next_cursor:rows.length===limit?rows.at(-1)!.key:null};}
    if(path==='/api/platform/audit'&&method==='GET'){requireCapability('PLATFORM_AUDIT');check(this.store.list,'Host directory adapter required',409);const rows=await this.store.list('tenant:',100,text(d,'after',''));const catalogue=await this.catalogue();return{events:[...(!d.after?catalogue.changes.map(c=>({id:'catalogue-'+c.version,actor:c.actor,action:'/api/platform/catalogue',entity:'catalogue',at:c.at,detail:{reason:c.reason,version:c.version},tenant_id:null})):[]),...rows.flatMap(({value})=>{const s=stateDocument<WorkspaceState>(value,'Subscriber');return s.audit.filter(a=>a.action.startsWith('/api/platform/')).map(a=>({...a,tenant_id:s.id}));})],next_cursor:rows.length===100?rows.at(-1)!.key:null};}
    const moderation=/^\/api\/platform\/subscribers\/([A-Za-z0-9_-]+)\/marketplace(?:\/([^/]+)\/moderate)?$/.exec(path);
    if(moderation){requireCapability('MARKETPLACE_ADMIN');const tenant=moderation[1]!;
      if(method==='GET'&&!moderation[2]){const s=stateDocument<WorkspaceState>(await this.store.read('tenant:'+tenant),'Subscriber');return{tenant_id:tenant,name:s.name,listings:s.listings.map(l=>({id:l.id,module:l.module,generation:l.generation??0,status:l.status,moderation:l.moderation??'PENDING',payload:safeProjection(s,l),rejection_reason:l.rejection_reason}))};}
      check(method==='POST'&&moderation[2],'Unknown marketplace moderation route',404);const k=requestKey(key),hash=fingerprint(actor,path,d);
      const answer=await this.store.transaction('tenant:'+tenant,value=>{const s=stateDocument<WorkspaceState>(value,'Subscriber'),replay=s.idempotency.find(x=>x.key==='platform_'+k);if(replay){check(replay.fingerprint===hash,'Idempotency key conflicts',409);return{state:s,result:replay.response};}
        const l=found(s.listings.find(l=>l.id===moderation[2]));check(d.expected_generation===(l.generation??0),'Publication changed; refresh before moderating',409);const reason=text(d,'reason',undefined,1000);check(['APPROVE','REJECT'].includes(String(d.decision)),'Choose approve or reject');
        check(l.status!=='WITHDRAWN','Listing has been withdrawn',409);if(d.decision==='APPROVE'){check(active(s,this.clock())&&s.subscription?.marketplace&&safeProjection(s,l),'Listing is no longer available',409);l.moderation='APPROVED';}else{l.moderation='REJECTED';l.rejection_reason=reason;l.status='WITHDRAWN';emitPublication(s,l,this.clock(),'WITHDRAW');}
        s.revision++;s.audit.push({id:id('AUD'),actor:actor.id,action:path,entity:l.id,at:this.clock(),detail:{reason,decision:d.decision}});const result={id:l.id,moderation:l.moderation,status:l.status};s.idempotency.push({key:'platform_'+k,fingerprint:hash,response:result});return{state:s,result};});if(this.options.localMarketplace||this.options.marketplaceTransport)await this.deliverPublications(tenant);return answer;
    }
    if (path === '/api/platform/catalogue') {
      requireCapability('CATALOG_ADMIN');
      if (method === 'GET') return this.catalogue();
      const k = requestKey(key), hash = fingerprint(actor, path, d);
      return this.store.transaction('catalogue', value => {
        const old = value ? stateDocument<Catalogue>(value, 'Catalogue') : defaultCatalogue(this.clock());
        const replay = old.replays.find(r => r.key === k);
        if (replay) { check(replay.fingerprint === hash, 'Idempotency key conflicts', 409); return { state: old, result: replay.response }; }
        const next = changeCatalogue(old, actor.id, d, this.clock());
        const result = { version: next.version, published_at: next.published_at };
        next.replays.push({ key: k, fingerprint: hash, response: result }); return { state: next, result };
      });
    }
    const match = /^\/api\/platform\/subscribers\/([A-Za-z0-9_-]+)(?:\/(activate|listing-ack))?$/.exec(path);
    check(match, 'Unknown platform route', 404); requireCapability('BILLING_ADMIN');
    if (method === 'GET' && !match[2]) {
      const s = stateDocument<WorkspaceState>(await this.store.read('tenant:' + match[1]), 'Subscriber');
      return { id: s.id, name: s.name, subscription: s.subscription, scheduled_subscription: s.scheduled_subscription,
        usage: { branches: s.branches.filter(b => b.active).length, users: s.members.filter(m => m.active).length,
          vehicles: s.dealer?.vehicles.length ?? 0, rental_fleet: s.fleet.filter(a => a.module === 'RENTAL' && a.status !== 'ARCHIVED').length } };
    }
    check(method === 'POST' && match[2] === 'activate', 'Unknown platform mutation', 404);
    requestKey(key); text(d, 'reason', undefined, 1000); text(d, 'confirmation', undefined, 500);
    return this.settlePayment(match[1]!, text(d, 'quote_id'), text(d, 'reference'), count(d, 'amount_minor', 0, 900_000_000_000_000), 'NGN', actor.id,
      { reason: text(d, 'reason'), confirmation: text(d, 'confirmation') });
  }
  async checkout(actor: Principal, quoteId: string, email: string): Promise<unknown> {
    check(this.options.paymentProvider, 'Payment provider is not configured; a platform billing operator can record an independently confirmed payment', 409);
    const state = stateDocument<WorkspaceState>(await this.store.read('tenant:' + actor.tenantId), 'Workspace');
    check(state.members.some(m => m.id === actor.id && m.active && m.role === 'OWNER'), 'Only the owner can start checkout', 403);
    const quote = found(state.quotes.find(q => q.id === quoteId && q.status === 'OPEN' && q.expires_at > this.clock()));
    check(quote.subscription_revision === (state.subscription?.revision ?? 0), 'Subscription changed; create a fresh quote', 409);
    check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'A billing email is required');
    return this.options.paymentProvider.initialise({ tenant_id: state.id, quote, email });
  }
  /** Trusted provider ingress only. No customer-facing route accepts a paid=true flag. */
  async settlePayment(tenantId: string, quoteId: string, reference: string, amount: number, currency: string, actor = 'VERIFIED_PROVIDER', detail?: Input): Promise<unknown> {
    return this.store.transaction<unknown>('tenant:' + tenantId, value => {
      const s = stateDocument<WorkspaceState>(value, 'Workspace'); const quote = found(s.quotes.find(q => q.id === quoteId));
      check(currency === quote.currency && Number.isSafeInteger(amount) && amount === quote.due_minor, 'Payment amount or currency does not match the quote', 409);
      if (quote.status === 'APPLIED') {
        check(quote.applied_reference === reference, 'Quote was paid using another reference', 409);
        return { state: s, result: { applied: true, duplicate: true } };
      }
      check(quote.expires_at > this.clock(), 'Quote expired; payment needs billing reconciliation', 409);
      check(quote.subscription_revision === (s.subscription?.revision ?? 0), 'Subscription changed; payment needs billing reconciliation', 409);
      check(!s.payment_references.includes(reference), 'Payment reference already used', 409);
      const sub: Subscription = { revision: (s.subscription?.revision ?? 0) + 1, status: 'ACTIVE', start_at: quote.period_start,
        end_at: quote.period_end, tier: quote.tier, modules: quote.modules, primary_module: quote.primary_module,
        marketplace: quote.marketplace, software: quote.mode !== 'MARKETPLACE', limits: quote.limits,
        items: quote.items, catalogue_version: quote.catalogue_version, payment_reference: reference };
      if (s.subscription?.status === 'ACTIVE' && quote.period_start <= this.clock()
        && s.subscription.end_at === quote.period_end) sub.start_at = s.subscription.start_at;
      if (quote.period_start > this.clock()) s.scheduled_subscription = sub;
      else { provision(s, sub); s.scheduled_subscription = null; }
      quote.status = 'APPLIED'; quote.applied_reference = reference; s.payment_references.push(reference); s.revision++;
      s.audit.push({ id: id('AUD'), actor, action: 'SUBSCRIPTION_PAYMENT_CONFIRMED', entity: quote.id, at: this.clock(), detail });
      return { state: s, result: { applied: true, effective_at: quote.period_start, subscription: sub,
        customer_bank_movement_posted: false } };
    });
  }
}
import { money as importAmount } from './validation.js';
