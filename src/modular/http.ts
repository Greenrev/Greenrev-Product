import { Problem, requireCondition as check } from '../errors.js';
import type { Principal } from '../v3-rules.js';
import type { Input } from './model.js';
import { ModularSaasService } from './service.js';
import { object, text } from './validation.js';

export interface ModularHttpDependencies {
  service: ModularSaasService; origin: string;
  resolvePrincipal(request: Request): Promise<Principal | null>;
  verifyCsrf(request: Request, principal: Principal): Promise<boolean>;
}
export const response = (status: number, data: unknown) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
export async function boundedBody(request: Request, limit = 65536): Promise<string> {
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Problem('Request body is too large', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
function validateTree(value: unknown, depth = 0): void {
  check(depth <= 6, 'JSON is too deeply nested');
  if (Array.isArray(value)) { check(value.length <= 100, 'JSON list is too long'); value.forEach(v => validateTree(v, depth + 1)); }
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    check(!['__proto__', 'constructor', 'prototype'].includes(key), 'Unsupported JSON key'); validateTree(child, depth + 1);
  }
  else check(value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value)), 'Unsupported JSON value');
}
export async function handleModularRequest(request: Request, deps: ModularHttpDependencies): Promise<Response> {
  try {
    const publicPath=new URL(request.url).pathname.replace(/^\/api\/saas(?=\/)/,'/api');
    if(request.method==='GET' && publicPath==='/api/public-marketplace') return response(200,await deps.service.publicListings());
    const publicImage=/^\/api\/public-marketplace\/([^/]+)\/images\/([^/]+)$/.exec(publicPath);
    if(request.method==='GET'&&publicImage) {const file=await deps.service.publicImage(publicImage[1]!,publicImage[2]!);return new Response(file.bytes as BodyInit,{headers:{'Content-Type':file.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; sandbox"}});}
    const actor = await deps.resolvePrincipal(request); check(actor, 'Authentication required', 401);
    const method = request.method; check(method === 'GET' || method === 'POST', 'Method not allowed', 405);
    const url = new URL(request.url); const path = url.pathname.replace(/^\/api\/saas(?=\/)/, '/api');
    let data: Input = {};
    if (method === 'POST') {
      check(request.headers.get('Origin') === deps.origin, 'Origin refused', 403);
      check(await deps.verifyCsrf(request, actor), 'CSRF validation failed', 403);
      check(request.headers.get('Content-Type')?.split(';')[0]?.trim() === 'application/json', 'Content-Type must be application/json', 415);
      try { data = object(JSON.parse(await boundedBody(request,path==='/api/media'?2_900_000:65536)) as unknown, 'JSON body'); }
      catch (error) { if (error instanceof Problem) throw error; throw new Problem('Invalid JSON body'); }
      validateTree(data);
    } else data = Object.fromEntries(url.searchParams.entries());
    const image=/^\/api\/media\/([^/]+)$/.exec(path);
    if(method==='GET'&&image){const file=await deps.service.image(actor,image[1]!);return new Response(file.bytes as BodyInit,{headers:{'Content-Type':file.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}
    const result = path === '/api/billing/checkout' && method === 'POST'
      ? await deps.service.checkout(actor, text(data, 'quote_id'), text(data, 'email'))
      : await deps.service.run(actor, method, path, data, request.headers.get('Idempotency-Key') ?? undefined);
    return response(200, result);
  } catch (error) {
    const p = error instanceof Problem ? error : new Problem('Internal service error', 500);
    return response(p.status, { error: p.message });
  }
}
