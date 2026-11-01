'use client';
import {useEffect,useState} from 'react';
import type {FinancialReport} from '../src/modular/financial';
import type {BusinessModule} from '../src/modular/model';
import {cash,type RequestApi} from './common';
export function ModuleFinancialSummary({module,request,refreshKey,onReports}:{module:BusinessModule;request:RequestApi;refreshKey:number;onReports:()=>void}){
 const[r,setReport]=useState<FinancialReport|null>(null),[error,setError]=useState('');useEffect(()=>{let live=true;request<FinancialReport>('/financial-reports?module='+module+'&preset=MONTH').then(r=>{if(live)setReport(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[module,refreshKey]);
 return <><div className="toolbar"><button className="small-button" onClick={onReports}>View {module.toLowerCase()} financial reports</button></div>{error&&<p className="message error">{error}</p>}{r&&<><p className="muted">This activity · {r.from} to {r.to}{!r.shared_overhead_included?' · shared office costs excluded':''}</p><div className="metrics module-financials">{[['Earned revenue',r.revenue_minor],['Net profit / (loss)',r.net_profit_minor],['Receivables',r.receivable_minor],['Payables',r.payable_minor]].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{cash(Number(value))}</strong></div>)}</div></>}</>;
}
