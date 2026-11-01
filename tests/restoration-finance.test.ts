import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,inspect} from './modular-helpers.js';
import type {Expense,PartsOrder,ServiceInvoice,Receipt,WorkspaceState} from '../src/modular/model.js';
import type {FinancialReport} from '../src/modular/financial.js';
import type {BuyerDocument} from '../src/modular/documents.js';
async function expense(f:Awaited<ReturnType<typeof fixture>>,module='SHARED',amount='50'){
 let e=await f.post<Expense>('/api/office-expenses',{module,branch_id:f.branch,supplier_id:f.supplier.id,description:'Office rent',amount});
 e=await f.post<Expense>('/api/office-expenses/'+e.id+'/approve',{version:e.version});return f.post<Expense>('/api/office-expenses/'+e.id+'/post',{version:e.version});
}
test('historical rental statements use posting dates, earned services and deposit liabilities',async()=>{
 const f=await fixture(),a=await f.fleet();let booking=await f.booking(a);const bill=await f.post<ServiceInvoice>('/api/service-invoices',{module:'RENTAL',job_id:booking.id});
 await f.post('/api/rentals/'+booking.id+'/deposit',{version:booking.version,amount:'100',reference:'DEPOSIT-001',confirmation:'Bank independently checked'});
 let r=await f.get<FinancialReport>('/api/financial-reports',{from:'2030-01-10',to:'2030-01-10',module:'RENTAL'});
 assert.equal(r.revenue_minor,0);assert.equal(r.receivable_minor,200000);assert.equal(r.rental_deposits_minor,10000);assert.equal(r.business.legal_name,'Synthetic business');
 f.clock.set('2030-01-11T10:00:00Z');const receipt=await f.post<Receipt>('/api/receipts',{invoice_id:bill.id,amount:'500',reference:'BANK-001'});
 await assert.rejects(f.get('/api/documents/receipts/'+receipt.id),/verified/);
 await f.post('/api/receipts/'+receipt.id+'/verify',{confirmation:'Independent bank statement'});
 booking=(await f.state()).rentals[0]!;booking=await f.post('/api/rentals/'+booking.id+'/checkout',{...inspect,version:booking.version});
 f.clock.set('2030-01-12T10:00:00Z');await f.post('/api/rentals/'+booking.id+'/return',{...inspect,version:booking.version,odometer:150});
 r=await f.get<FinancialReport>('/api/financial-reports',{from:'2030-01-10',to:'2030-01-10'});assert.equal(r.receivable_minor,200000);assert.equal(r.revenue_minor,0);assert.equal(r.bank_minor,10000);
 r=await f.get<FinancialReport>('/api/financial-reports',{from:'2030-01-11',to:'2030-01-11'});assert.equal(r.receivable_minor,150000);assert.equal(r.bank_minor,60000);assert.equal(r.revenue_minor,0);
 r=await f.get<FinancialReport>('/api/financial-reports',{from:'2030-01-12',to:'2030-01-12'});assert.equal(r.revenue_minor,200000);assert.equal(r.balance_check_minor,0);assert.equal(r.cash.opening_minor,60000);assert.equal(r.cash.closing_minor,60000);
 const doc=await f.get<BuyerDocument>('/api/documents/receipts/'+receipt.id);assert.equal(doc.payment!.amount_minor,50000);assert.equal(doc.kind,'RECEIPT');assert.equal(doc.outstanding_minor,150000);
 const invoice=await f.get<BuyerDocument>('/api/documents/invoices/'+bill.id);assert.equal(invoice.total_minor,200000);assert.equal(invoice.customer,'Test customer');f.store.close();
});
test('single-activity profit includes shared office cost; mixed activity keeps it explicit and excludes unrelated accounts',async()=>{
 const single=await fixture();await expense(single);const r=await single.get<FinancialReport>('/api/financial-reports',{module:'RENTAL'});assert.equal(r.overhead_minor,5000);assert.equal(r.net_profit_minor,-5000);assert.equal(r.shared_overhead_included,true);single.store.close();
 const f=await fixture(['RENTAL','PARTS']);await expense(f);await expense(f,'PARTS','70');const own=await f.get<FinancialReport>('/api/financial-reports',{module:'RENTAL'});assert.equal(own.overhead_minor,0);assert.equal(own.unallocated_shared_overhead_minor,5000);
 await f.post('/api/staff/memberships',{subject_id:'rental-accountant',role:'ACCOUNTANT',modules:['RENTAL'],branch_id:f.branch});const actor={...f.owner,id:'rental-accountant'};
 const limited=await f.get<FinancialReport>('/api/financial-reports',{},actor);assert.equal(limited.payable_minor,0);assert.equal(limited.unallocated_shared_overhead_minor,0);assert.equal(limited.journals.length,0);await assert.rejects(f.get('/api/financial-reports',{module:'PARTS'},actor),/outside/);f.store.close();
});
test('review fingerprints become stale after postings; export contains ledger, ageing and tax review without spreadsheet formulas',async()=>{
 const f=await fixture();await expense(f);let r=await f.get<FinancialReport>('/api/financial-reports');await f.post('/api/financial/reviews',{from:r.from,to:r.to,fingerprint:r.fingerprint,status:'PREPARED',note:'Bank reconciliation checked'});r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.reviews[0]!.current,true);
 await f.post('/api/financial/journals',{module:'RENTAL',branch_id:f.branch,date:'2030-01-10',reason:'Opening capital',lines:[{account:'1000',debit:'1000',credit:'0'},{account:'3000',debit:'0',credit:'1000'}]});
 const updated=await f.get<FinancialReport>('/api/financial-reports');assert.equal(updated.reviews[0]!.current,false);await assert.rejects(f.post('/api/financial/reviews',{from:r.from,to:r.to,fingerprint:r.fingerprint,status:'REVIEWED',note:'Old snapshot'}),/changed/);
 const pack=await f.get<{files:{name:string;csv:string}[]}>('/api/financial-reports/export');assert.equal(pack.files.length,9);assert.ok(pack.files.some(x=>x.name.includes('general-ledger')));assert.ok(pack.files.some(x=>x.csv.includes('not audited')));
 assert.equal(updated.trial_balance.reduce((n,x)=>n+x.debit_balance_minor-x.credit_balance_minor,0),0);f.store.close();
});
test('financial year, prior periods, closed-period controls and backdating remain explicit',async()=>{
 const f=await fixture();await f.post('/api/financial/settings',{year_start_month:4,legal_name:'Example Ltd',closed_through:'2029-12-31',reason:'Prior year reviewed'});
 let r=await f.get<FinancialReport>('/api/financial-reports',{preset:'FINANCIAL_YEAR'});assert.equal(r.from,'2029-04-01');assert.equal(r.to,'2030-01-10');
 await assert.rejects(f.post('/api/financial/journals',{module:'RENTAL',branch_id:f.branch,date:'2029-12-31',reason:'Closed',lines:[{account:'1000',debit:'1',credit:'0'},{account:'3000',debit:'0',credit:'1'}]}),/closed/);
 await assert.rejects(f.post('/api/capital',{branch_id:f.branch,amount:'100',reference:'CAP-BACKDATE',transaction_date:'2029-12-30'}),/text|value|required/i);
 await f.post('/api/financial/settings',{closed_through:'',reason:'Owner reopened for accountant adjustment'});
 await f.post('/api/capital',{branch_id:f.branch,amount:'100',reference:'CAP-BACKDATE',transaction_date:'2029-12-30',posting_reason:'Opening balance reconciliation'});
 r=await f.get<FinancialReport>('/api/financial-reports',{from:'2029-12-01',to:'2029-12-31'});assert.equal(r.bank_minor,10000);assert.equal(r.balance_check_minor,0);
 await f.post('/api/financial/settings',{closed_through:'2030-01-10',reason:'January reviewed'});await assert.rejects(expense(f),/closed/);assert.equal((await f.state()).expenses.filter(e=>e.status==='POSTED').length,0);f.store.close();
});
test('parts invoice tax, discount, verification and full return appear in correct periods',async()=>{
 const f=await fixture(['PARTS']);const p=await f.post<{id:string;version:number}>('/api/parts',{branch_id:f.branch,sku:'TAX',name:'Taxable product',asking_price:'100'});await f.post('/api/parts/'+p.id+'/receive',{version:1,supplier_id:f.supplier.id,quantity:5,cost:'250'});
 let o=await f.post<PartsOrder>('/api/parts-orders',{part_id:p.id,customer_id:f.customer.id,quantity:2,discount:'10',tax_percent:'7.5'});assert.equal(o.total_minor,20425);assert.equal(o.tax_minor,1425);assert.equal(o.net_minor,19000);
 let r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.revenue_minor,0);assert.equal(r.tax.output_minor,1425);
 o=await f.post('/api/parts-orders/'+o.id+'/fulfil',{version:o.version});const rc=await f.post<Receipt>('/api/receipts',{invoice_id:o.id,amount:'204.25',reference:'PART-PAY'});await f.post('/api/receipts/'+rc.id+'/verify',{confirmation:'Bank checked'});
 r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.revenue_minor,19000);assert.equal(r.cogs_minor,10000);assert.equal(r.net_profit_minor,9000);
 f.clock.set('2030-01-11T11:00:00Z');o=(await f.state()).orders[0]!;await f.post('/api/parts-orders/'+o.id+'/return',{version:o.version,reason:'Returned unopened'});
 const historical=await f.get<FinancialReport>('/api/financial-reports',{from:'2030-01-10',to:'2030-01-10'});assert.equal(historical.net_profit_minor,9000);r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.receivable_minor,0);assert.equal(r.net_profit_minor,0);assert.equal(r.refund_payable_minor,20425);assert.equal(r.tax.output_minor,0);f.store.close();
});
test('instalment ageing reconstructs historical allocations instead of using current paid schedule values',async()=>{
 const f=await fixture(['DEALER']);const v=await f.post<{id:string}>('/api/vehicles',{branch_id:f.branch,vin:'1HGCM82633A123456',make:'Toyota',model:'Camry',year:2021,location:'Abuja',asking_price:'1000'});await f.post('/api/bills',{vehicle_id:v.id,party_id:f.supplier.id,amount:'600'});await f.post('/api/vehicles/'+v.id+'/readiness',{version:1,inspection_ready:true,documents_ready:true});await f.post('/api/vehicles/'+v.id+'/publish',{version:2});
 const i=await f.post<{id:string}>('/api/invoices',{vehicle_id:v.id,version:3,customer_id:f.customer.id,mode:'INSTALLMENT',finance_charge:'100',months:2,first_due_date:'2030-01-10'});f.clock.set('2030-01-11T10:00:00Z');const pay=await f.post<{id:string}>('/api/payments',{target_type:'INVOICE',target_id:i.id,amount:'550',reference:'FIRST-INSTALMENT'});await f.post('/api/payments/'+pay.id+'/verify',{confirmation:'Bank checked'});
 const historical=await f.get<FinancialReport>('/api/financial-reports',{from:'2030-01-10',to:'2030-01-10'});assert.equal(historical.receivables.length,2);assert.equal(historical.receivables.reduce((n,x)=>n+x.balance_minor,0),110000);
 const current=await f.get<FinancialReport>('/api/financial-reports');assert.equal(current.receivables.length,1);assert.equal(current.receivables[0]!.due_date,'2030-02-10');assert.equal(current.receivables[0]!.bucket,'CURRENT');assert.equal(current.receivables[0]!.balance_minor,55000);f.store.close();
});
test('fixed-asset and depreciation adjustments support rental year-end review without treating assets as trading inventory',async()=>{
 const f=await fixture();await f.post('/api/financial/journals',{module:'RENTAL',branch_id:f.branch,date:'2030-01-10',reason:'Opening financed rental fleet',lines:[{account:'1300',debit:'10000',credit:'0'},{account:'2700',debit:'0',credit:'10000'}]});await f.post('/api/financial/journals',{module:'RENTAL',branch_id:f.branch,date:'2030-01-10',reason:'Accountant approved depreciation',lines:[{account:'6200',debit:'100',credit:'0'},{account:'1310',debit:'0',credit:'100'}]});const r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.depreciation_minor,10000);assert.equal(r.net_profit_minor,-10000);assert.equal(r.total_inventory_minor,0);assert.equal(r.assets_minor,990000);assert.equal(r.liabilities_minor,1000000);assert.equal(r.balance_check_minor,0);f.store.close();
});
test('an activity-limited accountant cannot read or settle another activity or shared office payables',async()=>{
 const f=await fixture(['RENTAL','PARTS']),shared=await expense(f),parts=await expense(f,'PARTS');await f.post('/api/staff/memberships',{subject_id:'restricted-accountant',role:'ACCOUNTANT',modules:['RENTAL'],branch_id:f.branch});const actor={...f.owner,id:'restricted-accountant'};
 const workspace=await f.get('/api/workspace',{},actor);assert.equal((workspace.expenses as unknown[]).length,0);await assert.rejects(f.post('/api/office-expenses/'+parts.id+'/pay',{version:parts.version,amount:'10',reference:'NOT-ALLOWED',confirmation:'Bank'},actor),/outside/);await assert.rejects(f.post('/api/office-expenses/'+shared.id+'/pay',{version:shared.version,amount:'10',reference:'NOT-ALLOWED-SHARED',confirmation:'Bank'},actor),/whole-business/);f.store.close();
});
test('limited report reviews stay visible to the same authorised activities and private from another activity scope',async()=>{
 const f=await fixture(['RENTAL','PARTS']);await f.post('/api/staff/memberships',{subject_id:'rental-reviewer',role:'ACCOUNTANT',modules:['RENTAL'],branch_id:f.branch});await f.post('/api/staff/memberships',{subject_id:'parts-reviewer',role:'ACCOUNTANT',modules:['PARTS'],branch_id:f.branch});const actor={...f.owner,id:'rental-reviewer'},other={...f.owner,id:'parts-reviewer'},r=await f.get<FinancialReport>('/api/financial-reports',{},actor);await f.post('/api/financial/reviews',{from:r.from,to:r.to,module:'ALL',fingerprint:r.fingerprint,status:'PREPARED',note:'Private rental reconciliation'},actor);assert.equal((await f.get<FinancialReport>('/api/financial-reports',{},actor)).reviews.length,1);assert.equal((await f.get<FinancialReport>('/api/financial-reports',{},other)).reviews.length,0);f.store.close();
});
test('foreign parts supplier bills retain gross AP, net inventory, recoverable tax and exact settlement FX differences',async()=>{
 const f=await fixture(['PARTS']);const p=await f.post<{id:string}>('/api/parts',{branch_id:f.branch,sku:'FX-STOCK',name:'Imported stock',asking_price:'20000'});const receipt=await f.post<{payable_id:string}>('/api/parts/'+p.id+'/receive',{version:1,supplier_id:f.supplier.id,quantity:10,cost:'100',currency:'USD',fx:'1000',recoverable_tax:'5000',due_date:'2030-01-20'});
 let r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.parts_inventory_minor,9500000);assert.equal(r.payable_minor,10000000);assert.equal(r.tax.input_minor,500000);assert.equal(r.payables[0]!.currency,'USD');assert.equal(r.payables[0]!.due_date,'2030-01-20');
 let e=(await f.state()).expenses[0]!;f.clock.set('2030-01-11T10:00:00Z');e=await f.post('/api/office-expenses/'+receipt.payable_id+'/pay',{version:e.version,amount:'40',fx:'1100',reference:'FOREIGN-PART-PAY-1',confirmation:'USD bank movement independently checked'});assert.equal(e.paid_foreign_minor,4000);assert.equal(e.paid_minor,4000000);r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.payable_minor,6000000);assert.equal(r.fx_loss_minor,400000);assert.equal(r.bank_minor,-4400000);
 await f.post('/api/office-expenses/'+e.id+'/pay',{version:e.version,amount:'60',fx:'900',reference:'FOREIGN-PART-PAY-2',confirmation:'Remaining supplier bank settlement checked'});r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.payable_minor,0);assert.equal(r.fx_loss_minor,-200000);assert.equal(r.bank_minor,-9800000);assert.equal(r.balance_check_minor,0);const historical=await f.get<FinancialReport>('/api/financial-reports',{from:'2030-01-10',to:'2030-01-10'});assert.equal(historical.payable_minor,10000000);assert.equal(historical.fx_loss_minor,0);f.store.close();
});
test('foreign operating expenses require approval before posting recoverable input tax and preserve actual bank execution cost',async()=>{
 const f=await fixture();let e=await f.post<Expense>('/api/office-expenses',{module:'RENTAL',branch_id:f.branch,supplier_id:f.supplier.id,description:'Foreign maintenance supplier',amount:'100',currency:'USD',fx:'1000',recoverable_tax:'5000'});assert.equal((await f.get<FinancialReport>('/api/financial-reports')).payable_minor,0);e=await f.post('/api/office-expenses/'+e.id+'/approve',{version:e.version});e=await f.post('/api/office-expenses/'+e.id+'/post',{version:e.version});let r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.overhead_minor,9500000);assert.equal(r.tax.input_minor,500000);await f.post('/api/office-expenses/'+e.id+'/pay',{version:e.version,amount:'100',fx:'1050',reference:'FX-MAINT-PAY',confirmation:'Bank settlement checked'});r=await f.get<FinancialReport>('/api/financial-reports');assert.equal(r.payable_minor,0);assert.equal(r.fx_loss_minor,500000);assert.equal(r.balance_check_minor,0);f.store.close();
});
