import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ModularSaasService, SqliteStore, FileMediaStore, ExchangeRateReference, response, boundedBody, handleModularRequest } from '../../dist/src/index.js';
import type { Principal, BusinessModule } from '../../dist/src/index.js';
import { resolveDemoOrigin } from '../../dist/src/demo/request-origin.js';

const profiles = [
  { id: 'rentals', label: 'Rental company · owner', tenant: 'demo-rental', user: 'rental-owner', role: 'OWNER', modules: ['RENTAL'] },
  { id: 'parts', label: 'Parts vendor · owner', tenant: 'demo-parts', user: 'parts-owner', role: 'OWNER', modules: ['PARTS'] },
  { id: 'dealer', label: 'Car dealer · owner', tenant: 'demo-dealer', user: 'dealer-owner', role: 'OWNER', modules: ['DEALER'] },
  { id: 'haulage', label: 'Haulage company · owner', tenant: 'demo-haulage', user: 'haulage-owner', role: 'OWNER', modules: ['HAULAGE'] },
  { id: 'mixed', label: 'Several business activities · owner', tenant: 'demo-mixed', user: 'mixed-owner', role: 'OWNER', modules: ['DEALER', 'PARTS', 'RENTAL', 'HAULAGE', 'MECHANIC'] },
  { id: 'bundle', label: 'Software + marketplace · all activities demo', tenant: 'demo-bundle', user: 'bundle-owner', role: 'OWNER', modules: ['DEALER', 'PARTS', 'RENTAL', 'HAULAGE', 'MECHANIC'] },
  { id: 'marketplace', label: 'Marketplace only · listing seller demo', tenant: 'demo-marketplace', user: 'marketplace-owner', role: 'OWNER', modules: ['DEALER','PARTS'] },
  { id: 'rental-agent', label: 'Rental company · booking agent', tenant: 'demo-rental', user: 'rental-agent', role: 'RENTAL_AGENT', modules: [] },
  { id: 'driver', label: 'Haulage company · assigned driver', tenant: 'demo-haulage', user: 'haulage-driver', role: 'DRIVER', modules: [] },
  { id: 'platform', label: 'GreenRev platform · pricing administrator', tenant: 'demo-platform', user: 'platform-operator', role: 'OWNER', modules: ['RENTAL'] },
  { id: 'new', label: 'New subscriber · select your modules', tenant: 'demo-new', user: 'new-owner', role: 'OWNER', modules: [] }
] as const;
type DemoProfile = typeof profiles[number];
interface Session { profile: string; csrf: string }
interface Runtime { service: ModularSaasService; sessions: Map<string, Session> }
const cache = globalThis as typeof globalThis & { greenrevModularRuntime?: Promise<Runtime> };
function actor(profile: DemoProfile): Principal {
  return { id: profile.user, tenantId: profile.tenant, role: profile.role,
    branches: [profile.tenant + '-MAIN'], platformCapabilities: profile.id === 'platform' ? ['CATALOG_ADMIN', 'BILLING_ADMIN','MARKETPLACE_ADMIN','PLATFORM_AUDIT'] : [] };
}
async function createRuntime(): Promise<Runtime> {
  if (process.env.GREENREV_DEMO !== '1') throw new Error('This standalone app is a local demo. Use the host integration for real accounts.');
  const store = new SqliteStore(process.env.GREENREV_DEMO_DB || join(process.cwd(), '.data', 'greenrev-demo.sqlite'));
  const service = new ModularSaasService(store, { verifyStaffSubject: value => profiles.some(p => p.user === value), fxProvider: new ExchangeRateReference(), localMarketplace: true, mediaStore: new FileMediaStore((process.env.GREENREV_DEMO_DB || join(process.cwd(), '.data', 'greenrev-demo.sqlite')) + '-media') });
  const sessions = new Map<string, Session>();
  for (const p of profiles.filter(p => p.role === 'OWNER' && p.modules.length)) {
    const owner = actor(p); const first = await store.read('tenant:' + p.tenant);
    if (first) continue;
    const call = (path: string, body: Record<string, unknown>) => service.run(owner, 'POST', path, body, randomUUID()) as Promise<Record<string, unknown>>;
    await service.run(owner, 'GET', '/api/workspace');
    await call('/api/onboarding', { name: p.id === 'mixed' ? 'Mobility group demo' : p.label.split(' · ')[0] + ' demo',
      modules: p.modules, primary_module: p.modules[0], mode: p.id === 'bundle' ? 'BUNDLE' : p.id === 'marketplace' ? 'MARKETPLACE' : 'SAAS' });
    if (p.id === 'marketplace') continue;
    const b = p.tenant + '-MAIN';
    const c = await call('/api/parties', { name: 'Demo customer', kind: 'CUSTOMER', branch_id: b, contact: 'Synthetic demonstration contact' });
    const supplier = await call('/api/parties', { name: 'Demo supplier', kind: 'SUPPLIER', branch_id: b });
    if (p.id === 'rentals') await call('/api/staff/memberships', { subject_id: 'rental-agent', role: 'RENTAL_AGENT', modules: ['RENTAL'], branch_id: b });
    if (p.id === 'haulage') await call('/api/staff/memberships', { subject_id: 'haulage-driver', role: 'DRIVER', modules: ['HAULAGE'], branch_id: b });
    const selected: readonly string[] = p.modules;
    for (const m of ['RENTAL', 'HAULAGE'] as const) if (selected.includes(m)) {
      const a = await call('/api/fleet/assets', { module: m, branch_id: b, vin: m === 'RENTAL' ? '1HGCM82633A123456' : '1HGCM82633A123457',
        name: m === 'RENTAL' ? 'Toyota Corolla · demo fleet' : 'Vehicle transporter · demo fleet', registration: 'DEMO-' + m });
      const start = Date.now() - 60000;
      const timing = { start_at: new Date(start).toISOString(), end_at: new Date(start + 2 * 86400000).toISOString() };
      if (m === 'RENTAL') await call('/api/rentals', { ...timing, branch_id: b, asset_id: a.id, customer_id: c.id,
        title: 'Two-day rental · demonstration', driver_name: 'Demo authorised driver', agreement: 'DEMO-AGREEMENT', daily_rate: '25000', deposit: '0' });
      else {
        const job = await call('/api/haulage', { ...timing, branch_id: b, asset_id: a.id, customer_id: c.id,
          title: 'Abuja to Kaduna · demonstration', origin: 'Abuja', destination: 'Kaduna', cargo: 'One customer vehicle', quote: '150000' });
        if (p.id === 'haulage') await call('/api/haulage/' + job.id + '/assign', { version: 1, driver_id: 'haulage-driver' });
      }
    }
    if (selected.includes('PARTS')) {
      const part = await call('/api/parts', { branch_id: b, sku: 'DEMO-BRAKE-PAD', name: 'Brake pad set', asking_price: '18000', reorder_level: 2 });
      await call('/api/parts/' + part.id + '/receive', { version: 1, supplier_id: supplier.id, quantity: 10, cost: '100000' });
    }
    if (selected.includes('DEALER')) {
      const v = await call('/api/vehicles', { branch_id: b, vin: '1HGCM82633A123458', make: 'Toyota', model: 'Camry', year: 2021, location: 'Abuja', asking_price: '6500000' });
      await call('/api/bills', { vehicle_id: v.id, party_id: supplier.id, amount: '5000000' });
      await call('/api/vehicles/' + v.id + '/readiness', { version: 1, inspection_ready: true, documents_ready: true });
      await call('/api/vehicles/' + v.id + '/publish', { version: 2 });
    }
    if (selected.includes('MECHANIC')) await call('/api/workshop', { branch_id: b, customer_id: c.id, title: 'Inspection and service · demo', subject_vin: '1HGCM82633A123459', quote: '35000' });
  }
  return { service, sessions };
}
export function runtime(): Promise<Runtime> {
  return cache.greenrevModularRuntime ??= createRuntime();
}
function cookie(req: Request): string | null {
  return req.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('greenrev_demo='))?.slice(14) ?? null;
}
export async function demoHandler(req: Request): Promise<Response> {
  if (process.env.GREENREV_DEMO !== '1') return response(503, { error: 'Standalone demo is disabled. Mount the service behind your existing sign-in.' });
  try {
    const rt = await runtime(); const url = new URL(req.url); let sessionId = cookie(req); let session = sessionId ? rt.sessions.get(sessionId) : undefined;
    const origin = resolveDemoOrigin(req, process.env.GREENREV_DEMO_ORIGIN);
    if (req.method === 'GET' && url.pathname === '/api/saas/session') {
      if (!session) { sessionId = randomBytes(24).toString('hex'); session = { profile: 'rentals', csrf: randomBytes(24).toString('hex') }; rt.sessions.set(sessionId, session); }
      const result = response(200, { csrf: session.csrf, profile: session.profile, demo: true,
        profiles: profiles.map(p => ({ id: p.id, label: p.label })) });
      result.headers.set('Set-Cookie', 'greenrev_demo=' + sessionId + '; HttpOnly; SameSite=Strict; Path=/' + (url.protocol === 'https:' ? '; Secure' : ''));
      return result;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/saas/public-marketplace')) return handleModularRequest(req, {service:rt.service,origin,resolvePrincipal:async()=>null,verifyCsrf:async()=>false});
    if (!session) return response(401, { error: 'Open a demo session first' });
    if (req.method === 'POST' && url.pathname === '/api/saas/demo/session') {
      if (req.headers.get('Origin') !== origin || req.headers.get('X-CSRF-Token') !== session.csrf) return response(403, { error: 'Session change refused' });
      const body = JSON.parse(await boundedBody(req)) as { profile?: string };
      const p = profiles.find(p => p.id === body.profile); if (!p) return response(400, { error: 'Unknown demo profile' });
      session.profile = p.id; return response(200, { profile: p.id });
    }
    const profile = profiles.find(p => p.id === session!.profile)!;
    return handleModularRequest(req, { service: rt.service, origin,
      resolvePrincipal: async () => actor(profile), verifyCsrf: async request => request.headers.get('X-CSRF-Token') === session!.csrf });
  } catch (error) {
    console.error('GreenRev demo request failed', error instanceof Error ? error.message : 'Unknown error');
    if (error && typeof error === 'object' && 'status' in error && error.status === 403) {
      return response(403, { error: 'Demo address refused. Open the local address shown in the terminal.' });
    }
    return response(500, { error: 'Unable to load the demonstration workspace' });
  }
}
