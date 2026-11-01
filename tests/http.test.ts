import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSaasRequest } from '../src/http.js';
import { MemoryWorkbench } from '../src/memory-workbench.js';
import type { Principal } from '../src/v3-rules.js';

const actor: Principal = { id: 'O', tenantId: 'T', role: 'OWNER', branches: ['B'] };
const service = new MemoryWorkbench('T');
const deps = {
  service, origin: 'https://staging.greenrev.example',
  resolvePrincipal: async (_req: Request): Promise<Principal | null> => actor,
  verifyCsrf: async (req: Request) => req.headers.get('X-CSRF-Token') === 'accepted'
};
test('unauthenticated requests and mismatched origin are refused', async () => {
  const anonymous = await handleSaasRequest(new Request('https://api.test/api/saas/workspace'),
    { ...deps, resolvePrincipal: async () => null });
  assert.equal(anonymous.status, 401);
  const badOrigin = await handleSaasRequest(new Request('https://api.test/api/saas/parties', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: '{"name":"bad"}'
  }), deps);
  assert.equal(badOrigin.status, 403);
});
test('CSRF and JSON scalar restrictions protect mutating routes', async () => {
  const make = (body: string, csrf: string) => new Request('https://api.test/api/saas/parties', {
    method: 'POST', headers: {
      Origin: deps.origin, 'Content-Type': 'application/json',
      'X-CSRF-Token': csrf, 'Idempotency-Key': 'http-test-123'
    }, body
  });
  assert.equal((await handleSaasRequest(make('{"name":"A"}', 'wrong'), deps)).status, 403);
  assert.equal((await handleSaasRequest(make('{"name":{"nested":"no"}}', 'accepted'), deps)).status, 400);
  const valid = await handleSaasRequest(make('{"name":"Buyer"}', 'accepted'), deps);
  assert.equal(valid.status, 200);
  const result = await valid.json() as { id: string };
  assert.equal(typeof result.id, 'string');
});
