import { requireCondition as check } from '../errors.js';
import type { WorkspaceState } from './model.js';
import type { RestorationState } from './restoration-model.js';
export function extras(s: WorkspaceState): RestorationState {
  if (s.extras) { check(s.extras.version === 1, 'This workspace was updated by a newer application; upgrade before opening it', 409); s.extras.vehicle_transfers ??=[]; s.extras.categories ??=[]; return s.extras; }
  return s.extras = { vehicle_transfers:[],categories:[],version: 1, financial: { year_start_month: 1, currency: 'NGN', legal_name: s.name, tax_reference: '', closed_through: null, discount_limit_bps: 500, minimum_margin_bps: 1000 },
    reviews: [], due_dates: {}, leads: [], media: [], passports: [], templates: [], invites: [], deliveries: [], metadata: {} };
}
export function assertPostingOpen(s: WorkspaceState, day: string): void {
  const closed = extras(s).financial.closed_through;
  check(!closed || day > closed, 'This accounting period is closed. The owner must reopen it with a reason before posting', 409);
}
