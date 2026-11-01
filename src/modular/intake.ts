import { requireCondition as check } from '../errors.js';
import { minor } from '../money.js';
import type { Input } from './model.js';
export const INTAKE = {
  PASSPORT_EVENT:{module:'DEALER',route:'/api/passports',required:['vin','category','day','note']},
  VEHICLE:{module:'DEALER',route:'/api/vehicles',required:['vin','make','model','year','location','asking_price']},
  PART:{module:'PARTS',route:'/api/parts',required:['sku','name','asking_price']},
  RENTAL_ASSET:{module:'RENTAL',route:'/api/fleet/assets',required:['vin','name']},
  HAULAGE_ASSET:{module:'HAULAGE',route:'/api/fleet/assets',required:['vin','name']},
  MECHANIC_JOB:{module:'MECHANIC',route:'/api/workshop',required:['customer_id','title','subject_vin','quote']},
  RENTAL_JOB:{module:'RENTAL',route:'/api/rentals',required:['customer_id','asset_id','title','start_at','end_at','daily_rate','driver_name','agreement']},
  HAULAGE_JOB:{module:'HAULAGE',route:'/api/haulage',required:['customer_id','asset_id','title','origin','destination','cargo','start_at','end_at','quote']}
} as const;
export type IntakeKind = keyof typeof INTAKE;
export function intakeKind(value:unknown):IntakeKind {check(typeof value==='string'&&Object.hasOwn(INTAKE,value),'Choose an available intake type');return value as IntakeKind;}
export function parseCsv(source:string):Record<string,string>[] {
  check(source.length<=50000,'CSV is too large');const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
  for(let i=0;i<source.length;i++){const c=source[i]!;if(quoted){if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
    else if(c==='"'){check(field.length===0&&!closed,'Invalid quote in CSV');quoted=true;}
    else if(c===','){row.push(field);field='';closed=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';closed=false;check(rows.length<=101,'CSV supports up to 100 records');}
    else {check(!closed||/\s/.test(c),'Unexpected text after CSV quote');if(!closed)field+=c;}}
  check(!quoted,'CSV has an unclosed quoted field');row.push(field);if(row.some(v=>v.trim()))rows.push(row);check(rows.length>=2&&rows.length<=101,'CSV needs a header and one to 100 records');
  const headers=rows.shift()!.map(x=>x.trim().replace(/^\uFEFF/,'').toLowerCase());check(headers.every(h=>/^[a-z][a-z0-9_]{0,49}$/.test(h)&&!['constructor','prototype','__proto__'].includes(h))&&new Set(headers).size===headers.length,'CSV headers must be unique field names');
  return rows.map((r,i)=>{check(r.length===headers.length,`CSV row ${i+2} has a different number of columns`);return Object.fromEntries(headers.map((h,n)=>[h,r[n]!.trim()]));});
}
const makes=['Toyota','Honda','Lexus','Mercedes-Benz','BMW','Hyundai','Kia','Ford','Nissan','Volkswagen','Audi','Peugeot','Mazda','Mitsubishi','Land Rover','Range Rover','Volvo','Suzuki','Infiniti','Chevrolet','Geely','Changan','GAC'];
export function intakePreview(kind:IntakeKind,source:string,format:'TEXT'|'CSV'='TEXT') {
  check(source.trim()&&source.length<=50000,'Provide text or CSV of up to 50,000 characters');let drafts:Input[];
  if(format==='CSV')drafts=parseCsv(source);
  else {const d:Input={};for(const segment of source.split(/[\n;]/)){const m=/^\s*([a-z_ ]+)\s*[:=]\s*(.+?)\s*$/i.exec(segment);if(m)d[m[1]!.trim().toLowerCase().replaceAll(' ','_')]=m[2]!;}
    const foundVin=/\b[A-HJ-NPR-Z0-9]{17}\b/.exec(source.toUpperCase());if(foundVin&&!d.vin)d.vin=foundVin[0];if(kind==='MECHANIC_JOB'&&d.vin)d.subject_vin=d.vin;if(kind==='PASSPORT_EVENT'){d.category??=d.kind??'';d.day??=d.date??'';}
    if(kind==='VEHICLE'){if(!d.make)d.make=makes.find(m=>source.toLowerCase().includes(m.toLowerCase()))??'';if(!d.year)d.year=/\b(?:19[5-9]\d|20\d\d)\b/.exec(source)?.[0]??'';}
    const price=/(?:₦|NGN\s*|(?:price|asking|cost)\s*[:=]\s*)([\d,]+(?:\.\d{1,2})?)\s*(million|m|k)?\b/i.exec(source);
    if(price){try{const cents=BigInt(minor(price[1]!.replaceAll(',','')))*(price[2]?/^(m|million)$/i.test(price[2])?1000000n:1000n:1n);const value=`${cents/100n}.${String(cents%100n).padStart(2,'0')}`;minor(value);if(!d.asking_price)d.asking_price=value;if(!d.quote)d.quote=value;}catch{/* Leave invalid money for explicit correction. */}}
    if(d.price&&!d.asking_price)d.asking_price=d.price;drafts=[d];}
  return {kind,drafts:drafts.map(d=>({draft:d,missing:INTAKE[kind].required.filter(f=>!String(d[f]??'').trim())})),persisted:false,published:false,notice:'Suggestions from your supplied text. Review and correct each field before saving. Nothing has been saved or published.'};
}
