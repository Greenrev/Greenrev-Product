import type { RestorationState } from './restoration-model.js';
import type { Journal } from '../ledger.js';
import type { Principal, Role } from '../v3-rules.js';
import type { WorkbenchSnapshot } from '../memory-workbench.js';

export const MODULES = ['DEALER', 'PARTS', 'RENTAL', 'HAULAGE', 'MECHANIC'] as const;
export type BusinessModule = typeof MODULES[number];
export type Tier = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
export type Product = 'CORE' | BusinessModule | 'MARKETPLACE';
export type Input = Record<string, unknown>;
export interface Limits { branches: number; users: number; capacities: Record<BusinessModule, number> }
export interface RateCard {
  monthly_minor: Record<Product, number | null>;
  extra_branch_minor: number | null;
  extra_user_minor: number | null;
  extra_capacity_minor: Record<BusinessModule, number | null>;
  limits: Limits;
}
export interface Catalogue {
  schema_version: 4;
  version: number;
  currency: 'NGN';
  published_at: string;
  tiers: Record<Tier, RateCard>;
  changes: { actor: string; at: string; reason: string; version: number }[];
  replays: { key: string; fingerprint: string; response: unknown }[];
}
export interface QuoteItem { product: string; quantity: number; unit_minor: number; total_minor: number }
export interface Quote {
  id: string; catalogue_version: number; created_at: string; expires_at: string;
  modules: BusinessModule[]; primary_module: BusinessModule; mode: 'SAAS' | 'BUNDLE' | 'MARKETPLACE';
  tier: Tier; limits: Limits; marketplace: boolean; items: QuoteItem[];
  currency: 'NGN'; monthly_minor: number; due_minor: number;
  status: 'OPEN' | 'APPLIED'; subscription_revision: number;
  period_start: string; period_end: string;
  applied_reference?: string;
}
export interface Subscription {
  revision: number; status: 'TRIAL' | 'ACTIVE' | 'CANCELLED';
  start_at: string; end_at: string; tier: Tier; modules: BusinessModule[]; primary_module: BusinessModule;
  marketplace: boolean; software: boolean; limits: Limits; items: QuoteItem[]; catalogue_version: number;
  payment_reference: string | null;
}
export interface Branch { id: string; name: string; modules: BusinessModule[]; active: boolean }
export interface Member { id: string; role: Role; branches: string[]; modules: BusinessModule[]; active: boolean }
export interface Party { id: string; branch_id: string; name: string; kind: 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'LENDER'; contact: string }
export interface FleetAsset {
  id: string; branch_id: string; module: 'RENTAL' | 'HAULAGE'; vin: string; name: string;
  registration: string; status: 'ACTIVE' | 'MAINTENANCE' | 'ARCHIVED'; version: number;
}
export interface Inspection { odometer: number; fuel_percent: number; condition: string; acknowledgement: string; at: string }
export interface Rental {
  id: string; branch_id: string; asset_id: string; customer_id: string; title: string;
  start_at: string; end_at: string; rate_minor: number; charge_minor: number;
  status: 'BOOKED' | 'CHECKED_OUT' | 'RETURNED' | 'CANCELLED'; version: number;
  driver_name: string; agreement: string; checkout: Inspection | null; returned: Inspection | null;
  deposit_required_minor: number; deposit_received_minor: number; deposit_deducted_minor: number;
  deposit_refunded_minor: number; deposit_references: string[];
}
export interface HaulageJob {
  id: string; branch_id: string; asset_id: string; customer_id: string;
  title: string; origin: string; destination: string; cargo: string;
  start_at: string; end_at: string; quote_minor: number;
  status: 'QUOTED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  driver_id: string | null; delivery_evidence: string | null; delivered_at: string | null; version: number;
}
export interface WorkshopJob {
  id: string; branch_id: string; customer_id: string; title: string; subject_vin: string;
  status: 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; quote_minor: number; version: number;
}
export interface Part {
  id: string; branch_id: string; sku: string; name: string; asking_minor: number;
  quantity: number; value_minor: number; reorder_level: number; version: number;
}
export interface PartsOrder {
  id: string; branch_id: string; part_id: string; customer_id: string; quantity: number;
  total_minor: number; net_minor?: number; tax_minor?: number; discount_minor?: number; cost_minor: number; paid_minor: number; refunded_minor: number;
  status: 'OPEN' | 'FULFILLED' | 'RETURNED'; version: number;
}
export interface ServiceInvoice {
  id: string; module: 'RENTAL' | 'HAULAGE' | 'MECHANIC'; branch_id: string; job_id: string;
  customer_id: string; net_minor: number; tax_minor: number; total_minor: number; paid_minor: number;
  status: 'DEFERRED' | 'EARNED' | 'VOID' | 'CREDITED'; refunded_minor: number; version: number;
}
export interface Receipt {
  id: string; module: BusinessModule; branch_id: string; invoice_id: string;
  amount_minor: number; reference: string; status: 'EVIDENCE' | 'VERIFIED'; verified_by: string | null;
}
export interface Expense {
  currency?:string;foreign_minor?:number;fx?:string;recoverable_tax_minor?:number;paid_foreign_minor?:number;settled_base_minor?:number;
  id: string; branch_id: string; module: BusinessModule | 'SHARED'; job_id: string | null;
  supplier_id: string; description: string; category?: string; amount_minor: number; paid_minor: number;
  status: 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'REJECTED'; version: number;
}
export interface Transfer {
  id: string; part_id: string; source_branch: string; destination_branch: string; quantity: number;
  value_minor: number; received_quantity?: number; received_value_minor?: number; discrepancy_note?: string; status: 'REQUESTED' | 'DISPATCHED' | 'RECEIVED' | 'DISCREPANCY' | 'CANCELLED'; version: number;
}
export interface ListingRequest {
  id: string; module: BusinessModule; resource_id: string; branch_id: string;
  status: 'QUEUED' | 'DELIVERED' | 'WITHDRAWN'; generation?: number; public_url?: string; moderation?: 'PENDING' | 'APPROVED' | 'REJECTED'; rejection_reason?: string; payload: Record<string, unknown>;
}
export interface Audit { id: string; actor: string; action: string; entity: string; at: string; detail?: Input }
export interface WorkspaceState {
  extras?: RestorationState;
  schema_version: 4; id: string; name: string; revision: number;
  selected_modules: BusinessModule[]; software_history: BusinessModule[];
  primary_module: BusinessModule | null; trial_used: boolean;
  branches: Branch[]; members: Member[]; subscription: Subscription | null; scheduled_subscription: Subscription | null;
  quotes: Quote[]; payment_references: string[]; parties: Party[];
  fleet: FleetAsset[]; rentals: Rental[]; haulage: HaulageJob[]; workshop: WorkshopJob[];
  parts: Part[]; orders: PartsOrder[]; service_invoices: ServiceInvoice[]; receipts: Receipt[];
  expenses: Expense[]; transfers: Transfer[]; listings: ListingRequest[];
  journals: (Journal & { module: BusinessModule | 'SHARED'; branch_id: string })[];
  audit: Audit[]; idempotency: { key: string; fingerprint: string; response: unknown }[];
  dealer: WorkbenchSnapshot | null;
}
export interface Context { state: WorkspaceState; actor: Principal; member: Member; now: string; posting_date?: string }
export interface Mutation { entity?: string; result: unknown }
export interface StateStore {
  list?(prefix: string, limit?: number, after?: string): Promise<{key:string;value:unknown}[]>;
  read(key: string): Promise<unknown | null>;
  transaction<T>(key: string, action: (current: unknown | null) => { state: unknown; result: T }): Promise<T>;
  close?(): Promise<void> | void;
}
