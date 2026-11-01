import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { requireCondition as check } from '../errors.js';
import { text } from './validation.js';
import type { Input } from './model.js';
export interface MediaStore { put(key: string, bytes: Uint8Array, mime: string): Promise<void>; get(key: string): Promise<Uint8Array | null> }
/** Replace with the host's private object storage in a multi-instance deployment. */
export class FileMediaStore implements MediaStore {
  constructor(private root: string) { this.root = resolve(root); }
  private file(key: string) { check(/^[a-f0-9]{64}$/.test(key), 'Invalid media storage key'); return join(this.root,key); }
  async put(key: string, bytes: Uint8Array) { await mkdir(this.root,{recursive:true}); await writeFile(this.file(key),bytes,{flag:'w',mode:0o600}); }
  async get(key: string) { try { return new Uint8Array(await readFile(this.file(key))); } catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
}
export function imageInput(d: Input) {
  const raw = text(d,'base64',undefined,2_800_000); check(/^[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.length % 4 === 0, 'Invalid image encoding');
  const bytes = Buffer.from(raw,'base64'); check(bytes.toString('base64')===raw && bytes.length > 12 && bytes.length <= 2 * 1024 * 1024, 'Images must be at most 2 MB');
  const mime = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes[0]===255 && bytes[1]===216 && bytes[2]===255 && bytes.at(-2)===255 && bytes.at(-1)===217 ? 'image/jpeg'
    : bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP' && bytes.readUInt32LE(4)+8===bytes.length ? 'image/webp' : null;
  check(mime, 'Upload a PNG, JPEG or WebP image');
  // Bound decoded dimensions for formats whose headers expose them directly.
  if(mime==='image/png') check(bytes.length>=33 && bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0 && bytes.readUInt32BE(16)*bytes.readUInt32BE(20)<=40_000_000,'PNG dimensions exceed the limit');
  const digest=createHash('sha256').update(bytes).digest('hex'); return {bytes,mime,digest};
}
