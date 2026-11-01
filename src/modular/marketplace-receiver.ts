import {Problem,requireCondition as check} from '../errors.js';
import {boundedBody,response} from './http.js';
import type {StateStore} from './model.js';
import {acceptPublication,verifyPublication} from './marketplace.js';
/** Mount on the actual marketplace server, with a shared signing secret, not in the browser. */
export async function handleMarketplaceDelivery(request:Request,bindings:{store:StateStore;secret:string;publicUrl?:(tenant:string,listing:string)=>string}):Promise<Response>{
 try{check(request.method==='POST','Method not allowed',405);check(request.headers.get('Content-Type')?.split(';')[0]==='application/json','JSON is required',415);const body=await boundedBody(request);const event=verifyPublication(bindings.secret,body,request.headers.get('X-GreenRev-Time')??'',request.headers.get('X-GreenRev-Signature')??'');const applied=await acceptPublication(bindings.store,event);return response(200,{...applied,listing_id:event.listing_id,generation:event.generation,applied_generation:applied.generation,...(event.kind==='UPSERT'&&bindings.publicUrl?{public_url:bindings.publicUrl(event.tenant_id,event.listing_id)}:{})});}catch(e){const p=e instanceof Problem?e:new Problem('Marketplace delivery failed',500);return response(p.status,{error:p.message});}
}
