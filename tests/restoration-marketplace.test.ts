import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {fixture} from './modular-helpers.js';
import {ModularSaasService} from '../src/modular/service.js';
import {SignedMarketplaceTransport,acceptPublication,verifyPublication,type PublicationEnvelope} from '../src/modular/marketplace.js';
import {handleMarketplaceDelivery} from '../src/modular/marketplace-receiver.js';
import type {MediaStore} from '../src/modular/media.js';
import type {Input,ListingRequest,Part,WorkspaceState} from '../src/modular/model.js';
import {SqliteStore} from '../src/modular/stores.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL3sAAAAASUVORK5CYII=';
async function setup(local=true,transport?:{deliver:(event:PublicationEnvelope)=>Promise<{public_url?:string}>}){
 const f=await fixture(['PARTS','RENTAL']);const images=new Map<string,Uint8Array>();const mediaStore:MediaStore={put:async(k,b)=>{images.set(k,b);},get:async k=>images.get(k)??null};
 await f.store.transaction('tenant:'+f.tenant,value=>{const s=value as WorkspaceState;s.subscription!.marketplace=true;return{state:s,result:null};});
 const service=new ModularSaasService(f.store,{now:()=>f.clock.now(),localMarketplace:local,marketplaceTransport:transport,mediaStore});
 const post=<T=Record<string,unknown>>(path:string,data:Input,actor=f.owner)=>service.run(actor,'POST',path,data,randomUUID()) as Promise<T>;
 const p=await post<Part>('/api/parts',{branch_id:f.branch,sku:'PUBLISH',name:'Brake pad',asking_price:'200'});await post('/api/parts/'+p.id+'/receive',{version:p.version,supplier_id:f.supplier.id,quantity:5,cost:'500'});return{...f,service,post,p};
}
test('inventory publication delivers to local public marketplace with only selected photos and safe current availability',async()=>{
 const f=await setup();const privatePhoto=await f.post<{id:string}>('/api/media',{module:'PARTS',branch_id:f.branch,resource_id:f.p.id,base64:png,caption:'Private condition record',public:false});
 const photo=await f.post<{id:string}>('/api/media',{module:'PARTS',branch_id:f.branch,resource_id:f.p.id,base64:png,caption:'Product image',public:true});
 const l=await f.post<ListingRequest>('/api/marketplace/requests',{module:'PARTS',branch_id:f.branch,resource_id:f.p.id,description:'Available stock'});let result=await f.service.publicListings();assert.equal(result.listings.length,1);assert.equal((result.listings[0]!.photos as {id:string}[]).length,1);assert.equal((result.listings[0]!.photos as {id:string}[])[0]!.id,photo.id);assert.ok(!JSON.stringify(result).includes('supplier'));assert.ok(!JSON.stringify(result).includes('value_minor'));assert.ok(!JSON.stringify(result).includes('customer'));
 assert.equal((await f.service.publicImage(l.id,photo.id)).mime,'image/png');await assert.rejects(f.service.publicImage(l.id,privatePhoto.id),/not found/);
 await f.post('/api/parts-orders',{part_id:f.p.id,customer_id:f.customer.id,quantity:5});result=await f.service.publicListings();assert.equal(result.listings.length,0);assert.equal((await f.state()).listings[0]!.status,'WITHDRAWN');assert.ok((await f.state()).extras!.deliveries.some(e=>e.kind==='WITHDRAW'));f.store.close();
});
test('software-only plans cannot publish, private images stay tenant scoped and SVG data is rejected',async()=>{
 const f=await fixture(['RENTAL']),asset=await f.fleet();await assert.rejects(f.post('/api/marketplace/requests',{module:'RENTAL',resource_id:asset.id,branch_id:f.branch}),/Marketplace publishing/);f.store.close();
 const g=await setup();await assert.rejects(g.post('/api/media',{module:'PARTS',branch_id:g.branch,resource_id:g.p.id,base64:Buffer.from('<svg onload="alert(1)">not an image</svg>').toString('base64')}),/PNG, JPEG or WebP/);
 const image=await g.post<{id:string}>('/api/media',{module:'PARTS',branch_id:g.branch,resource_id:g.p.id,base64:png});const other=await fixture(['PARTS']);await assert.rejects(g.service.image(other.owner,image.id),/not found/i);g.store.close();other.store.close();
});
test('marketplace-only listing mode has an executable publishing flow without private inventory or financial access',async()=>{
 const store=new SqliteStore(':memory:'),service=new ModularSaasService(store,{localMarketplace:true,now:()=> '2030-01-10T10:00:00Z'}),actor={id:'seller',tenantId:'seller-tenant',role:'OWNER' as const,branches:['seller-tenant-MAIN']};const post=(p:string,d:Input)=>service.run(actor,'POST',p,d,randomUUID());await service.run(actor,'GET','/api/workspace');await post('/api/onboarding',{name:'Listing seller',modules:['PARTS'],primary_module:'PARTS',mode:'MARKETPLACE'});await post('/api/marketplace/direct',{module:'PARTS',branch_id:'seller-tenant-MAIN',title:'Public part',price:'100',description:'Seller listing'});assert.equal((await service.publicListings()).listings.length,1);await assert.rejects(post('/api/parts',{branch_id:'seller-tenant-MAIN',sku:'NO',name:'Private',asking_price:'10'}),/outside/);await assert.rejects(service.run(actor,'GET','/api/financial-reports'),/software history/);store.close();
});
test('failed publication delivery is durable and retryable; platform moderation authority is distinct from owner',async()=>{
 let fail=true;const f=await setup(false,{deliver:async()=>{if(fail)throw new Error('Destination temporarily unavailable');return{public_url:'https://marketplace.example/listing/test'};}});const l=await f.post<ListingRequest>('/api/marketplace/requests',{module:'PARTS',resource_id:f.p.id,branch_id:f.branch});let s=await f.state();assert.equal(s.listings[0]!.status,'QUEUED');assert.equal(s.extras!.deliveries[0]!.attempts,1);assert.match(s.extras!.deliveries[0]!.last_error,/temporarily/);fail=false;await f.service.deliverPublications(f.tenant);s=await f.state();assert.equal(s.listings[0]!.status,'DELIVERED');assert.equal(s.listings[0]!.moderation,'PENDING');assert.equal(s.extras!.deliveries[0]!.attempts,2);
 const path='/api/platform/subscribers/'+f.tenant+'/marketplace/'+l.id+'/moderate';await assert.rejects(f.post(path,{expected_generation:1,decision:'APPROVE',reason:'Reviewed'}),/authority/);await f.post(path,{expected_generation:1,decision:'APPROVE',reason:'Reviewed public listing'}, {...f.owner,platformCapabilities:['MARKETPLACE_ADMIN']});assert.equal((await f.state()).listings[0]!.moderation,'APPROVED');f.store.close();
});
test('signed transport and receiver verify content, timestamps and monotone withdrawal generations',async()=>{
 const secret='test-signing-secret-of-at-least-32-characters',store=new SqliteStore(':memory:');const event:PublicationEnvelope={event_id:'event_1',tenant_id:'tenant_1',listing_id:'listing_1',generation:1,kind:'UPSERT',payload:{title:'Public part',module:'PARTS',asking_minor:10000}};
 const send=(async(url,init)=>{const req=new Request(String(url),init);return handleMarketplaceDelivery(req,{store,secret,publicUrl:()=> 'https://marketplace.example/listing_1'});}) as typeof fetch;
 const transport=new SignedMarketplaceTransport('https://marketplace.example/delivery',secret,send);assert.equal((await transport.deliver(event)).public_url,'https://marketplace.example/listing_1');await transport.deliver(event);
 const tombstone={...event,event_id:'event_2',generation:2,kind:'WITHDRAW' as const,payload:{}};await acceptPublication(store,tombstone);await acceptPublication(store,event);assert.equal(((await store.read('mirror:tenant_1:listing_1')) as PublicationEnvelope).kind,'WITHDRAW');
 const stamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify(event),signature=createHmac('sha256',secret).update(stamp+'.'+body).digest('hex');assert.equal(verifyPublication(secret,body,stamp,signature).listing_id,event.listing_id);assert.throws(()=>verifyPublication(secret,body.replace('Public','Private'),stamp,signature),/signature/);assert.throws(()=>verifyPublication(secret,body,stamp,signature,Date.now()+400000),/timestamp/);await assert.rejects(acceptPublication(store,{...event,listing_id:'other',payload:{cost_minor:9000}}),/private/);store.close();
});
test('making a published photo private or removing it immediately closes public access',async()=>{
 const f=await setup(),photo=await f.post<{id:string;version:number}>('/api/media',{module:'PARTS',branch_id:f.branch,resource_id:f.p.id,base64:png,public:true});const listing=await f.post<ListingRequest>('/api/marketplace/requests',{module:'PARTS',resource_id:f.p.id,branch_id:f.branch});await f.service.publicImage(listing.id,photo.id);const hidden=await f.post<{version:number}>('/api/media/'+photo.id+'/visibility',{version:photo.version,public:false});await assert.rejects(f.service.publicImage(listing.id,photo.id),/not found/);await f.post('/api/media/'+photo.id+'/archive',{version:hidden.version});await assert.rejects(f.service.image(f.owner,photo.id),/not found/);assert.equal(((await f.service.publicListings()).listings[0]!.photos as unknown[]).length,0);f.store.close();
});
