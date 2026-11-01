import type {BusinessModule,Context} from './model.js';
import type {Passport} from './restoration-model.js';
import {extras} from './restoration-state.js';
import {id} from './validation.js';
export function linkPassport(ctx:Context,chassis:string,module:BusinessModule,branchId:string,resourceId:string):Passport {
 const passports=extras(ctx.state).passports;let p=passports.find(p=>p.vin===chassis);
 if(!p){p={vin:chassis,module,branch_id:branchId,resource_id:resourceId,links:[],grants:[],entries:[]};passports.push(p);}
 p.links??=[{module:p.module,branch_id:p.branch_id,resource_id:p.resource_id}];const existing=p.links.find(l=>l.module===module&&l.resource_id===resourceId);if(existing)existing.branch_id=branchId;else p.links.push({module,branch_id:branchId,resource_id:resourceId});return p;
}
/** Private source-labelled lifecycle records contain no customer identity, payment or cost. */
export function recordOperationalHistory(ctx:Context,path:string,entity:string):string[] {
 const s=ctx.state;let module:BusinessModule|undefined,branchId='',resourceId='',chassis='',category='',note='';
 const vehicleAction=/^\/api\/vehicles(?:\/([^/]+)\/(readiness|price|publish|reserve|release))?$/.exec(path);
 if(vehicleAction){const v=s.dealer?.vehicles.find(([id])=>id===(vehicleAction[1]??entity))?.[1];if(v){module='DEALER';branchId=v.branch_id;resourceId=v.id;chassis=v.vin;category=vehicleAction[2]?'DEALER_'+vehicleAction[2].toUpperCase():'VEHICLE_REGISTERED';note=vehicleAction[2]?'Dealer recorded '+vehicleAction[2]+'.':'Vehicle added to the business inventory.';}}
 if(path==='/api/fleet/assets'){const a=s.fleet.find(a=>a.id===entity);if(a){module=a.module;branchId=a.branch_id;resourceId=a.id;chassis=a.vin;category='FLEET_REGISTERED';note='Vehicle added to the operational fleet.';}}
 const sale=/^\/api\/invoices(?:\/([^/]+)\/(handover|return))?$/.exec(path);
 if(sale){const invoice=s.dealer?.invoices.find(([id])=>id===(sale[1]??entity))?.[1],v=s.dealer?.vehicles.find(([id])=>id===invoice?.vehicle_id)?.[1];if(v){module='DEALER';branchId=v.branch_id;resourceId=v.id;chassis=v.vin;category=sale[2]==='handover'?'HANDOVER_RECORDED':sale[2]==='return'?'RETURN_RECORDED':'SALE_RECORDED';note=sale[2]==='return'?'Sale returned; renewed readiness checks are required.':sale[2]==='handover'?'Dealer recorded handover. Recipient details remain private.':'Sale recorded. Payment and handover are separate steps.';}}
 const job=/^\/api\/(rentals|haulage|workshop)(?:\/([^/]+)\/(checkout|return|cancel|dispatch|deliver|start|complete))?$/.exec(path);
 if(job){const jobId=job[2]??entity;if(job[1]==='workshop'){const j=s.workshop.find(j=>j.id===jobId);if(j){module='MECHANIC';branchId=j.branch_id;resourceId=j.id;chassis=j.subject_vin;}}
 else{const j=(job[1]==='rentals'?s.rentals:s.haulage).find(j=>j.id===jobId),a=s.fleet.find(a=>a.id===j?.asset_id);if(a){module=a.module;branchId=a.branch_id;resourceId=a.id;chassis=a.vin;}}
 category=(job[1]==='workshop'?'WORKSHOP':job[1]==='rentals'?'RENTAL':'HAULAGE')+'_'+(job[3]??'REGISTERED').toUpperCase();note='Business recorded '+(job[3]??'registration')+' for this vehicle. Customer and payment information remain private.';}
 if(!module||!chassis||!category)return[];const p=linkPassport(ctx,chassis,module,branchId,resourceId);p.entries.push({id:id('HIST'),category,day:ctx.now.slice(0,10),note,evidence:'',actor:ctx.member.id,source:s.name,verification:'DECLARED',visibility:'PRIVATE'});return[chassis];
}
