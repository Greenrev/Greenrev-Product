import type { BusinessModule, Input } from './model.js';
export interface FinancialSettings { year_start_month: number; currency: 'NGN'; tax_reference: string; legal_name: string; closed_through: string | null; discount_limit_bps: number; minimum_margin_bps: number }
export interface Review { id: string; from: string; to: string; module: string; branch_id: string; fingerprint: string; scope_modules?: BusinessModule[]; status: 'PREPARED' | 'REVIEWED'; note: string; actor: string; at: string }
export interface Lead { id: string; module: BusinessModule; branch_id: string; name: string; contact: string; interest: string; stage: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST'; next_followup: string; notes: string; version: number }
export interface MediaRecord { id: string; module: BusinessModule; branch_id: string; resource_id: string; mime: string; size: number; digest: string; storage_key: string; caption: string; public: boolean; at: string; version?:number; archived?:boolean }
export interface Passport {links?:{module:BusinessModule;branch_id:string;resource_id:string}[];vin: string; module: BusinessModule; branch_id: string; resource_id: string; grants: { subject: string; business_id?:string; expires_at: string }[]; entries: { id: string; category: string; day: string; note: string; evidence: string; actor: string;visibility?:'PRIVATE'|'SHARED';verification?:'DECLARED'|'REVIEWED';source?:string }[] }
export interface ExpenseTemplate { id: string; branch_id: string; module: BusinessModule | 'SHARED'; supplier_id: string; description: string; amount: string; category: string; frequency: 'WEEKLY' | 'MONTHLY' | 'ANNUAL'; next_due: string; active: boolean }
export interface Invite { id: string; subject_id: string; role: string; modules: BusinessModule[]; branch_id: string; status: 'PENDING' | 'ACCEPTED' | 'REVOKED'; expires_at: string }
export interface OutboxDelivery { id: string; listing_id: string; generation: number; kind: 'UPSERT' | 'WITHDRAW'; status: 'PENDING' | 'DELIVERED'; attempts: number; at: string; last_error: string; delivered_at?: string }
export interface VehicleTransfer {id:string;vehicle_id:string;source_branch:string;destination_branch:string;value_minor:number;status:'REQUESTED'|'DISPATCHED'|'RECEIVED'|'DISCREPANCY'|'CANCELLED';initial_status:string;version:number;evidence:string}
export interface RestorationState {
  vehicle_transfers:VehicleTransfer[]; categories:{id:string;name:string}[];
  version: 1; financial: FinancialSettings; reviews: Review[]; due_dates: Record<string, string>;
  leads: Lead[]; media: MediaRecord[]; passports: Passport[]; templates: ExpenseTemplate[]; invites: Invite[];
  deliveries: OutboxDelivery[]; metadata: Record<string, Input>;
}
