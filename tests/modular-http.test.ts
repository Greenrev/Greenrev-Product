import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { handleModularRequest } from '../src/modular/http.js';
import { PaystackProvider } from '../src/modular/paystack.js';
import type { Quote } from '../src/modular/model.js';
import { fixture } from './modular-helpers.js';

test('new HTTP boundary supports module arrays and refuses anonymous, forged-origin and oversized writes', async () => {
  const f = await fixture();
  const deps = { service: f.service, origin: 'https://business.example', resolvePrincipal: async () => f.owner,
    verifyCsrf: async (r: Request) => r.headers.get('X-CSRF-Token') === 'good' };
  const make = (data: unknown, origin = deps.origin, csrf = 'good') => new Request(deps.origin + '/api/saas/billing/quotes', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': randomUUID() }, body: JSON.stringify(data) });
  assert.equal((await handleModularRequest(make({}), { ...deps, resolvePrincipal: async () => null })).status, 401);
  assert.equal((await handleModularRequest(make({}, 'https://attacker.example'), deps)).status, 403);
  assert.equal((await handleModularRequest(make({}, deps.origin, 'bad'), deps)).status, 403);
  assert.equal((await handleModularRequest(make({ blob: 'x'.repeat(66000) }), deps)).status, 413);
  const legitimate = await handleModularRequest(make({ modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' }), deps);
  assert.equal(legitimate.status, 409); assert.match((await legitimate.json() as { error: string }).error, /not been published/); f.store.close();
});
test('hostile nested keys and malformed JSON cannot reach the service', async () => {
  const f = await fixture(); const deps = { service: f.service, origin: 'https://business.example', resolvePrincipal: async () => f.owner, verifyCsrf: async () => true };
  for (const raw of ['{bad', '{"__proto__":{"admin":true}}', '{"modules":[[[[[[[[1]]]]]]]]}']) {
    const req = new Request(deps.origin + '/api/saas/onboarding', { method: 'POST', headers: { Origin: deps.origin, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: raw });
    assert.equal((await handleModularRequest(req, deps)).status, 400);
  } f.store.close();
});
test('Paystack ingress verifies the raw-body signature and re-verifies amount with the provider before activation', async () => {
  const f = await fixture(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200 }, reason: 'Synthetic test' }, op);
  const q = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  const secret = 'sk_test_synthetic_fixture_not_a_real_key', ref = 'GR-' + q.id; let calls = 0;
  const transport: typeof fetch = async () => { calls++; return new Response(JSON.stringify({ status: true, data: {
    status: 'success', reference: ref, currency: 'NGN', amount: q.due_minor,
    metadata: { tenant_id: f.tenant, quote_id: q.id } } }), { status: 200 }); };
  const provider = new PaystackProvider(secret, 'https://business.example/billing/return', transport);
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: 1 } });
  const request = (signature: string) => new Request('https://business.example/webhook', { method: 'POST', headers: { 'x-paystack-signature': signature }, body: raw });
  assert.equal((await provider.webhook(request('forged'), f.service)).status, 401); assert.equal(calls, 0);
  const signature = createHmac('sha512', secret).update(raw).digest('hex');
  assert.equal((await provider.webhook(request(signature), f.service)).status, 200);
  assert.equal((await provider.webhook(request(signature), f.service)).status, 200);
  assert.equal((await f.state()).audit.filter(a => a.action === 'SUBSCRIPTION_PAYMENT_CONFIRMED').length, 1);
  assert.equal((await f.state()).subscription?.status, 'ACTIVE'); f.store.close();
});
test('provider-success flag without matching verified amount cannot activate a subscription', async () => {
  const f = await fixture(); const op = { ...f.owner, platformCapabilities: ['CATALOG_ADMIN'] };
  await f.post('/api/platform/catalogue', { expected_version: 1, tier: 'STARTER', monthly_minor: { CORE: 100, RENTAL: 200 }, reason: 'Synthetic test' }, op);
  const q = await f.post<Quote>('/api/billing/quotes', { modules: ['RENTAL'], primary_module: 'RENTAL', tier: 'STARTER' });
  const secret = 'sk_test_synthetic_fixture_not_a_real_key', ref = 'GR-' + q.id;
  const provider = new PaystackProvider(secret, 'https://business.example/return', async () => new Response(JSON.stringify({ status: true,
    data: { status: 'success', reference: ref, amount: 1, currency: 'NGN', metadata: { tenant_id: f.tenant, quote_id: q.id } } })));
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: ref } });
  const result = await provider.webhook(new Request('https://business.example/webhook', { method: 'POST', headers: { 'x-paystack-signature': createHmac('sha512', secret).update(raw).digest('hex') }, body: raw }), f.service);
  assert.equal(result.status, 409); assert.equal((await f.state()).subscription?.status, 'TRIAL'); f.store.close();
});
