'use client';
import type { ReactNode } from 'react';
export const cash = (value = 0) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(value / 100);
export const Panel = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => <section className="panel"><div className="panel-head"><h2>{title}</h2>{aside}</div>{children}</section>;
export const DataTable = ({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) => <div className="table-scroll"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r, n) => <tr key={n}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>) : <tr><td colSpan={headers.length} className="muted">No records in this period.</td></tr>}</tbody></table></div>;
export type RequestApi = <T = unknown>(path: string, data?: Record<string, unknown>) => Promise<T>;
export function download(name: string, data: BlobPart, type = 'text/csv;charset=utf-8') { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
// Uncompressed standard ZIP, generated locally from authenticated export files.
export function downloadZip(name: string, files: { name: string; csv: string }[]) {
  const encoder = new TextEncoder(), locals: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  const crc = (bytes: Uint8Array) => { let v = 0xffffffff; for (const byte of bytes) { v ^= byte; for (let i = 0; i < 8; i++) v = (v >>> 1) ^ (v & 1 ? 0xedb88320 : 0); } return (v ^ 0xffffffff) >>> 0; };
  for (const file of files) { const n = encoder.encode(file.name), b = encoder.encode(file.csv), checksum = crc(b); const local = new Uint8Array(30 + n.length + b.length), view = new DataView(local.buffer); view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint32(14, checksum, true); view.setUint32(18, b.length, true); view.setUint32(22, b.length, true); view.setUint16(26, n.length, true); local.set(n, 30); local.set(b, 30 + n.length); locals.push(local);
    const c = new Uint8Array(46 + n.length), cv = new DataView(c.buffer); cv.setUint32(0, 0x02014b50, true); cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0x0800,true); cv.setUint32(16,checksum,true); cv.setUint32(20,b.length,true); cv.setUint32(24,b.length,true); cv.setUint16(28,n.length,true); cv.setUint32(42,offset,true); c.set(n,46); central.push(c); offset += local.length;
  }
  const directorySize = central.reduce((n,b) => n+b.length,0), end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true); ev.setUint32(12,directorySize,true); ev.setUint32(16,offset,true);
  const result = new Uint8Array(offset + directorySize + 22); let cursor = 0; for (const part of [...locals,...central,end]) { result.set(part,cursor); cursor += part.length; } download(name,result,'application/zip');
}
/** Exact client form conversion; the backend independently validates every submitted price. */
export function nairaMinor(raw:string):number{const value=raw.trim();if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('Use a non-negative decimal amount with at most two decimal places');const [whole,fraction='']=value.split('.');const cents=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));if(cents>900000000000000n)throw new Error('Amount is too large');return Number(cents);}
