import { requireCondition as check } from '../errors.js';
import { rate } from '../money.js';
export interface FxQuote { currency:string;target:'NGN';rate:string;source:string;as_of:string;fetched_at:string;indicative:true;attribution_url:string }
export interface FxProvider { quote(currency:string):Promise<FxQuote> }
export class ExchangeRateReference implements FxProvider {
  private cache:{data:{rates:Record<string,number>;time_last_update_unix:number};fetched:number}|null=null;
  constructor(private send:typeof fetch=fetch,private clock:()=>number=Date.now) {}
  async quote(currency:string):Promise<FxQuote> {
    check(['USD','GBP','EUR','CAD','AED','CNY'].includes(currency),'Select a supported foreign currency');const now=this.clock();
    if(!this.cache||now-this.cache.fetched>=3600000){let raw:unknown;try{const r=await this.send('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(10000),redirect:'error'});check(r.ok,'FX provider unavailable',503);const body=await r.text();check(body.length<=100000,'Invalid FX provider response',503);raw=JSON.parse(body);}catch{check(false,'FX reference unavailable. Enter an explicitly sourced bank rate; no fallback rate has been invented.',503);}
      const data=raw as {result:string;base_code:string;rates:Record<string,number>;time_last_update_unix:number};check(data.result==='success'&&data.base_code==='USD'&&data.rates&&Number.isSafeInteger(data.time_last_update_unix),'Invalid FX provider response',503);
      for(const c of ['USD','GBP','EUR','CAD','AED','CNY','NGN'])check(Number.isFinite(data.rates[c])&&data.rates[c]!>0,'Invalid FX provider rate',503);
      check(now/1000-data.time_last_update_unix>=0&&now/1000-data.time_last_update_unix<=172800,'FX provider reference is stale or in the future',503);this.cache={data,fetched:now};}
    const {data}=this.cache;check(now/1000-data.time_last_update_unix<=172800,'FX reference is stale. Use an explicitly sourced manual rate.',503);
    const scaled=(n:number)=>BigInt(rate(String(n)).replace('.',''));const denominator=scaled(data.rates[currency]!),numerator=scaled(data.rates.NGN!)*100000000n;const q=(numerator+denominator/2n)/denominator;
    const value=rate(`${q/100000000n}.${String(q%100000000n).padStart(8,'0')}`);
    return {currency,target:'NGN',rate:value,source:'ExchangeRate-API indicative daily reference',as_of:new Date(data.time_last_update_unix*1000).toISOString(),fetched_at:new Date(now).toISOString(),indicative:true,attribution_url:'https://www.exchangerate-api.com'};
  }
}
