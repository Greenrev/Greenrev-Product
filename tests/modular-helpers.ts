import { randomUUID } from 'node:crypto';
import { ModularSaasService } from '../src/modular/service.js';
import { SqliteStore } from '../src/modular/stores.js';
import type { BusinessModule, Input, FleetAsset, Party, Rental, WorkspaceState } from '../src/modular/model.js';
import type { Principal } from '../src/v3-rules.js';

let sequence = 0;
export async function fixture(selected: BusinessModule[] = ['RENTAL'], path = ':memory:') {
  const tenant = 'tenant-' + ++sequence, owner: Principal = { id: 'owner', tenantId: tenant, role: 'OWNER', branches: [tenant + '-MAIN'] };
  let now = '2030-01-10T10:00:00.000Z';
  const store = new SqliteStore(path), service = new ModularSaasService(store, { now: () => now, verifyStaffSubject: () => true });
  const post = <T = Record<string, unknown>>(route: string, data: Input, actor = owner, key = randomUUID()) => service.run(actor, 'POST', route, data, key) as Promise<T>;
  const get = <T = Record<string, unknown>>(route = '/api/workspace', data: Input = {}, actor = owner) => service.run(actor, 'GET', route, data) as Promise<T>;
  await get(); await post('/api/onboarding', { name: 'Synthetic business', modules: selected, primary_module: selected[0], mode: 'SAAS' });
  const branch = tenant + '-MAIN';
  const customer = await post<Party>('/api/parties', { branch_id: branch, name: 'Test customer', kind: 'CUSTOMER' });
  const supplier = await post<Party>('/api/parties', { branch_id: branch, name: 'Test supplier', kind: 'SUPPLIER' });
  const fleet = (module: 'RENTAL' | 'HAULAGE' = 'RENTAL', vin?: string) => post<FleetAsset>('/api/fleet/assets', {
    branch_id: branch, module, name: 'Test fleet', vin: vin ?? '1HGCM82633A' + String(++sequence).padStart(6, '0'), registration: 'TEST' });
  const booking = (asset: FleetAsset, extra: Input = {}) => post<Rental>('/api/rentals', { branch_id: branch,
    asset_id: asset.id, customer_id: customer.id, title: 'Rental test', driver_name: 'Test driver', agreement: 'Agreement test',
    start_at: now, end_at: '2030-01-12T10:00:00.000Z', daily_rate: '1000', deposit: '100', ...extra });
  const state = async () => await store.read('tenant:' + tenant) as WorkspaceState;
  return { tenant, owner, branch, store, service, post, get, customer, supplier, fleet, booking, state,
    clock: { set(value: string) { now = value; }, now() { return now; } } };
}
export const inspect = { odometer: 100, fuel_percent: 80, condition: 'Inspected with customer', acknowledgement: 'Signed inspection record' };
