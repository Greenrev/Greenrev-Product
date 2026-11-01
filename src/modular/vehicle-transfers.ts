import {requireCondition as check} from '../errors.js';
import {access,branch,finance} from './access.js';
import type {Context,Input,Mutation} from './model.js';
import type {VehicleTransfer} from './restoration-model.js';
import {extras} from './restoration-state.js';
import {post} from './operations.js';
import {found,id,text,version,vin} from './validation.js';
export function vehicleTransfers(ctx:Context,path:string,d:Input):Mutation|null {
 const s=ctx.state,ex=extras(s);
 if(path==='/api/vehicle-transfers'){
   access(ctx,'DEALER',true);const v=found(s.dealer?.vehicles.find(([id])=>id===d.vehicle_id)?.[1]);branch(ctx,v.branch_id,'DEALER');const destination=text(d,'destination_branch');check(s.branches.some(b=>b.id===destination&&b.active&&b.modules.includes('DEALER'))&&destination!==v.branch_id,'Choose a different active dealer branch');check(['DRAFT','AVAILABLE'].includes(v.status),'Only unsold and unreserved inventory can be transferred',409);check(!ex.vehicle_transfers.some(t=>t.vehicle_id===v.id&&['REQUESTED','DISPATCHED','DISCREPANCY'].includes(t.status)),'A vehicle transfer is already open',409);
   const row:VehicleTransfer={id:id('VTR'),vehicle_id:v.id,source_branch:v.branch_id,destination_branch:destination,status:'REQUESTED',initial_status:v.status,value_minor:0,version:1,evidence:''};ex.vehicle_transfers.push(row);return{entity:row.id,result:row};
 }
 const match=/^\/api\/vehicle-transfers\/([^/]+)\/(dispatch|receive|resolve|cancel)$/.exec(path);if(!match)return null;
 access(ctx,'DEALER',true,match[2]!=='dispatch');const t=found(ex.vehicle_transfers.find(x=>x.id===match[1])),v=found(s.dealer?.vehicles.find(([id])=>id===t.vehicle_id)?.[1]);version(t,d);branch(ctx,['receive','resolve'].includes(match[2]!)?t.destination_branch:t.source_branch,'DEALER');
 if(match[2]==='dispatch'){check(t.status==='REQUESTED'&&['DRAFT','AVAILABLE'].includes(v.status),'Transfer or vehicle is unavailable',409);t.initial_status=v.status;t.value_minor=v.ownership==='OWNED'?s.dealer!.bills.filter(([,b])=>b.vehicle_id===v.id).reduce((n,[,b])=>n+b.base_minor-b.recoverable_tax_minor,0):0;if(t.value_minor)post(ctx,'DEALER',t.source_branch,'VEHICLE_TRANSFER_DISPATCH',t.id,[['1500',t.value_minor,0],['1200',0,t.value_minor]]);t.status='DISPATCHED';v.status='IN_TRANSIT';v.version++;}
 else if(match[2]==='cancel'){check(t.status==='REQUESTED','Only an undispatched transfer can be cancelled',409);t.status='CANCELLED';}
 else {if(match[2]==='resolve'){finance(ctx);check(t.status==='DISCREPANCY','Only a discrepancy can be resolved',409);}else check(t.status==='DISPATCHED','Dispatch before confirming receipt',409);
   const chassis=vin(d.received_vin),evidence=text(d,'evidence',undefined,1000);t.evidence=evidence;
   if(chassis!==v.vin){check(match[2]!=='resolve','Resolution must confirm the correct vehicle VIN',409);t.status='DISCREPANCY';}
   else{if(t.value_minor)post(ctx,'DEALER',t.destination_branch,'VEHICLE_TRANSFER_RECEIPT',t.id,[['1200',t.value_minor,0],['1500',0,t.value_minor]]);v.branch_id=t.destination_branch;v.location=s.branches.find(b=>b.id===t.destination_branch)!.name;v.status='DRAFT';v.inspection_ready=false;v.documents_ready=false;v.version++;t.status='RECEIVED';const p=ex.passports.find(p=>p.resource_id===v.id&&p.module==='DEALER');if(p){p.branch_id=t.destination_branch;for(const link of p.links??[])if(link.resource_id===v.id&&link.module==='DEALER')link.branch_id=t.destination_branch;p.entries.push({id:id('HIST'),category:'LOCATION_TRANSFER',day:ctx.now.slice(0,10),note:'Vehicle receipt confirmed at the destination branch; readiness checks are required.',source:s.name,verification:'DECLARED',visibility:'PRIVATE',evidence:'',actor:ctx.member.id});}}
 }
 t.version++;return{entity:t.id,result:t};
}
