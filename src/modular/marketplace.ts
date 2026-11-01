import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireCondition as check } from '../errors.js';
import { access, active, branch, OPERATORS, role } from './access.js';
import type { BusinessModule, Context, Input, ListingRequest, Mutation, WorkspaceState, StateStore } from './model.js';
import { extras } from './restoration-state.js';
import { count, found, id, moduleCode, money, text } from './validation.js';
export interface PublicationEnvelope { schema_version?:4; event_id:string; tenant_id:string; listing_id:string; generation:number; kind:'UPSERT'|'WITHDRAW'; payload:Record<string,unknown> }
export interface MarketplaceTransport { deliver(event: PublicationEnvelope): Promise<{ public_url?:string }> }
export function publicationAccess(ctx:Context,m:BusinessModule) { check(active(ctx.state,ctx.now) && ctx.state.subscription?.marketplace && ctx.state.subscription.modules.includes(m) && ctx.member.modules.includes(m),'Marketplace publishing must be included in this subscription and staff access',403); role(ctx,OPERATORS[m]); }
export function safeProjection(s:WorkspaceState, listing:Pick<ListingRequest,'module'|'resource_id'|'payload'>): Record<string,unknown>|null {
  const {module:m,resource_id:resource}=listing; let base:Record<string,unknown>;
  if (listing.payload.direct===true) base={...listing.payload};
  else if(m==='DEALER') {const v=s.dealer?.vehicles.find(([id])=>id===resource)?.[1]; if(!v||v.status!=='AVAILABLE')return null; base={id:v.id,title:`${v.year} ${v.make} ${v.model}`,make:v.make,model:v.model,year:v.year,location:v.location,asking_minor:v.asking_minor};}
  else if(m==='PARTS') {const p=s.parts.find(x=>x.id===resource);if(!p)return null;const qty=p.quantity-s.orders.filter(o=>o.part_id===p.id&&o.status==='OPEN').reduce((n,o)=>n+o.quantity,0);if(qty<=0)return null;base={id:p.id,title:p.name,sku:p.sku,asking_minor:p.asking_minor,quantity:qty};}
  else if(m==='MECHANIC') { const j=s.workshop.find(x=>x.id===resource);if(!j||j.status==='CANCELLED')return null;base={id:j.id,title:listing.payload.title??'Workshop services',asking_minor:listing.payload.asking_minor??0,availability:'Enquire for an appointment'}; }
  else {const a=s.fleet.find(a=>a.id===resource&&a.module===m&&a.status==='ACTIVE');if(!a)return null;base={id:a.id,title:a.name,asking_minor:listing.payload.asking_minor??0,availability:m==='RENTAL'?'Enquire for rental dates':'Enquire for transport availability'};}
  return {...base,description:listing.payload.description??'',module:m,business:s.name,currency:'NGN',photos:extras(s).media.filter(p=>p.resource_id===resource&&p.module===m&&p.public&&!p.archived).map(p=>({id:p.id,caption:p.caption}))};
}
export function emitPublication(s:WorkspaceState,l:ListingRequest,now:string,kind:'UPSERT'|'WITHDRAW') { l.generation=(l.generation??0)+1; extras(s).deliveries.push({id:id('EVT'),listing_id:l.id,generation:l.generation,kind,status:'PENDING',attempts:0,at:now,last_error:''}); }
export function reconcilePublications(s:WorkspaceState,now:string) {
  for(const l of s.listings.filter(l=>l.status!=='WITHDRAWN')){
    const p=active(s,now)&&s.subscription?.marketplace&&s.subscription.modules.includes(l.module)?safeProjection(s,l):null;
    if(!p){l.status='WITHDRAWN';emitPublication(s,l,now,'WITHDRAW');}
    else if(JSON.stringify(Object.entries(p).sort(([a],[b])=>a.localeCompare(b)))!==JSON.stringify(Object.entries(l.payload).filter(([key])=>Object.hasOwn(p,key)).sort(([a],[b])=>a.localeCompare(b)))){l.payload={...l.payload,...p};l.status='QUEUED';l.moderation='PENDING';emitPublication(s,l,now,'UPSERT');}
  }
}

export function marketplaceMutation(ctx:Context,path:string,d:Input):Mutation|null {
  const s=ctx.state;
  if(path==='/api/marketplace/requests' || path==='/api/marketplace/direct') {
    const m=moduleCode(d.module);publicationAccess(ctx,m);const b=text(d,'branch_id',s.branches[0]!.id);branch(ctx,b,m);
    let resource=text(d,'resource_id',''),payload:Record<string,unknown>={description:text(d,'description','',2000),title:text(d,'title',''),asking_minor:money(d,'price')};
    if(path.endsWith('/direct')) {check(!s.subscription!.software,'Direct listings are for a marketplace-only workspace; publish managed inventory from its source',409);resource=id('ITEM');payload={...payload,id:resource,direct:true,title:text(d,'title'),location:text(d,'location','')};}
    else {access(ctx,m,true); const source=m==='DEALER'?s.dealer?.vehicles.find(([id])=>id===resource)?.[1]:m==='PARTS'?s.parts.find(x=>x.id===resource):m==='MECHANIC'?s.workshop.find(x=>x.id===resource):s.fleet.find(x=>x.id===resource&&x.module===m);check(source&&source.branch_id===b,'Choose an item in the selected business branch',404);}
    check(s.listings.filter(l=>l.module===m&&l.status!=='WITHDRAWN').length < s.subscription!.limits.capacities[m],'Marketplace listing allowance reached',409);
    check(!s.listings.some(l=>l.resource_id===resource&&l.status!=='WITHDRAWN'),'A publication request already exists',409);
    const row:ListingRequest={id:id('LIST'),module:m,resource_id:resource,branch_id:b,status:'QUEUED',moderation:'PENDING',generation:0,payload};
    const projection=safeProjection(s,row);check(projection,'Only available inventory or active services can be published',409);
    row.payload={...payload,...projection};s.listings.push(row);emitPublication(s,row,ctx.now,'UPSERT');return {entity:row.id,result:row};
  }
  const match=/^\/api\/marketplace\/requests\/([^/]+)\/(withdraw|retry|refresh)$/.exec(path);
  if(match) {const l=found(s.listings.find(x=>x.id===match[1]));role(ctx,OPERATORS[l.module]);check(ctx.member.modules.includes(l.module),'Listing outside your access',403);branch(ctx,l.branch_id,l.module);
    if(match[2]==='withdraw'){if(l.status!=='WITHDRAWN'){l.status='WITHDRAWN';emitPublication(s,l,ctx.now,'WITHDRAW');}return{entity:l.id,result:l};}
    publicationAccess(ctx,l.module);check(l.status!=='WITHDRAWN','Create a new request for withdrawn listings',409);const p=safeProjection(s,l);check(p,'Item is no longer available',409);l.payload={...l.payload,...p};l.status='QUEUED';l.moderation='PENDING';emitPublication(s,l,ctx.now,'UPSERT');return{entity:l.id,result:l};
  }
  return null;
}
/** Signed outgoing adapter. Receiver must apply generations monotonically, including tombstones. */
export class SignedMarketplaceTransport implements MarketplaceTransport {
  constructor(private endpoint:string,private secret:string,private send:typeof fetch=fetch) {check(new URL(endpoint).protocol==='https:'&&secret.length>=32,'Configure an HTTPS marketplace endpoint and a signing secret of at least 32 characters');}
  async deliver(event:PublicationEnvelope) {const body=JSON.stringify(event),stamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',this.secret).update(stamp+'.'+body).digest('hex');const r=await this.send(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-GreenRev-Time':stamp,'X-GreenRev-Signature':signature,'Idempotency-Key':event.event_id},body,signal:AbortSignal.timeout(15000),redirect:'error'});check(r.ok,'Marketplace rejected delivery ('+r.status+')',502);const value=await r.json() as {listing_id?:string;generation?:number;public_url?:string};check(value.listing_id===event.listing_id&&value.generation===event.generation,'Marketplace acknowledgement does not match this publication',502);if(value.public_url)check(new URL(value.public_url).protocol==='https:','Marketplace returned an invalid public URL',502);return{public_url:value.public_url};}
}
export function verifyPublication(secret:string,body:string,stamp:string,signature:string,now=Date.now()):PublicationEnvelope {
  check(secret.length>=32&&/^\d{10}$/.test(stamp)&&Math.abs(now/1000-Number(stamp))<=300,'Publication timestamp refused',403);check(/^[a-f0-9]{64}$/.test(signature),'Invalid publication signature',403);const actual=createHmac('sha256',secret).update(stamp+'.'+body).digest();check(timingSafeEqual(actual,Buffer.from(signature,'hex')),'Publication signature refused',403);let parsed:unknown;try{parsed=JSON.parse(body);}catch{check(false,'Invalid publication JSON');}const e=parsed as PublicationEnvelope;check(e&&typeof e.event_id==='string'&&typeof e.tenant_id==='string'&&typeof e.listing_id==='string'&&Number.isSafeInteger(e.generation)&&e.generation>0&&['UPSERT','WITHDRAW'].includes(e.kind)&&e.payload&&typeof e.payload==='object'&&!Array.isArray(e.payload),'Invalid publication envelope');return e;
}

/** Receiver storage uses a generation tombstone so late retries cannot resurrect withdrawals. */
export async function acceptPublication(store:StateStore,event:PublicationEnvelope) {
  check(/^[A-Za-z0-9_-]{1,120}$/.test(event.tenant_id)&&/^[A-Za-z0-9_-]{1,120}$/.test(event.listing_id),'Invalid publication identifiers');
  const allowed=['id','title','make','model','year','location','asking_minor','quantity','description','module','business','currency','photos','availability','sku','direct'];
  check(Object.keys(event.payload).every(k=>allowed.includes(k)),'Publication contains unsupported private fields');
  const next={...event,schema_version:4 as const};
  return store.transaction<{listing_id:string;generation:number;ignored?:boolean;duplicate?:boolean;withdrawn?:boolean}>('mirror:'+event.tenant_id+':'+event.listing_id,value=>{
    const current=value as PublicationEnvelope|null;
    if(current&&current.generation>event.generation)return{state:current,result:{listing_id:current.listing_id,generation:current.generation,ignored:true}};
    if(current&&current.generation===event.generation){check(JSON.stringify(current)===JSON.stringify(next),'A publication generation was reused with different content',409);return{state:current,result:{listing_id:event.listing_id,generation:event.generation,duplicate:true}};}
    return{state:structuredClone(next),result:{listing_id:event.listing_id,generation:event.generation,withdrawn:event.kind==='WITHDRAW'}};
  });
}
