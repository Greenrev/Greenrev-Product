/**
 * Framework-neutral Fetch API boundary for Next.js route handlers or a Node server.
 * The caller MUST supply a trusted identity and CSRF adapter. No client tenant/role
 * headers or request body fields are trusted as authority.
 */
import { Problem } from './errors.js';
import type { Payload } from './memory-workbench.js';
import type { Principal } from './v3-rules.js';

export interface ServicePort {
  run(actor: Principal, method: 'GET' | 'POST', path: string, data?: Payload,
    idempotencyKey?: string): Promise<unknown> | unknown;
}
export interface HttpDependencies {
  service: ServicePort;
  origin: string;
  resolvePrincipal(request: Request): Promise<Principal | null>;
  verifyCsrf(request: Request, principal: Principal): Promise<boolean>;
}
const headers = { 'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function reply(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers });
}
export async function handleSaasRequest(req: Request, deps: HttpDependencies): Promise<Response> {
  try {
    const actor = await deps.resolvePrincipal(req);
    if (!actor) throw new Problem('Authentication required', 401);
    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'POST') throw new Problem('Method not allowed', 405);
    const url = new URL(req.url);
    // Existing Next.js gateway can mount this at /api/saas without rewriting.
    const path = url.pathname.startsWith('/api/saas/')
      ? '/api/' + url.pathname.slice('/api/saas/'.length) : url.pathname;
    let data: Payload = {};
    if (method === 'POST') {
      if (req.headers.get('Origin') !== deps.origin) throw new Problem('Origin refused', 403);
      if (!(await deps.verifyCsrf(req, actor))) throw new Problem('CSRF validation failed', 403);
      if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
        throw new Problem('Content-Type must be application/json', 415);
      }
      const body = await req.text();
      if (Buffer.byteLength(body, 'utf8') > 65_536) throw new Problem('JSON body is too large', 413);
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { throw new Problem('Invalid JSON body'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
          || Object.values(parsed).some(v => v !== null
            && !['string', 'number', 'boolean'].includes(typeof v))) {
        throw new Problem('Only scalar input fields are supported');
      }
      data = parsed as Payload;
    } else {
      // The host service may decide which allowlisted query scalars are valid.
      data = Object.fromEntries(url.searchParams.entries());
    }
    const result = await deps.service.run(actor, method, path, data,
      req.headers.get('Idempotency-Key') ?? undefined);
    return reply(200, result);
  } catch (err) {
    const problem = err instanceof Problem ? err : new Problem('Internal service error', 500);
    return reply(problem.status, { error: problem.message });
  }
}
