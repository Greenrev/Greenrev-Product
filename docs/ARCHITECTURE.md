# Architecture — v0.4

The host's verified principal enters `mountGreenRevSaas` and `handleModularRequest`. Mutations validate same-origin CSRF, bounded JSON, tenant membership, role, branch, subscription module, capacity and expected record version. Successful mutations commit business records, journals, audit and idempotent response together through StateStore. Failed actions roll back.

The subscription is an organisation agreement with module items. Staff identities and roles are separate from modules the organisation bought. Module history permits authorised reads/settlement after removal or expiry, while new business actions require active access. New registration never inserts Dealer or Parts defaults.

`src/modular/catalogue.ts` owns versioned price/limit publication and itemised quotes. The core appears once. Quotes use a saved catalogue and subscription revision. A server-verified provider or separately provisioned billing operator applies access.

`src/modular/operations.ts` owns fleet, rental, haulage, workshop, parts and service/expense finance. `src/modular/service.ts` coordinates onboarding, membership, read projections, finance, billing and the preserved dealer workbench. `src/modular/stores.ts` provides SQLite and PostgreSQL adapters. `ui/GreenRevWorkspace.tsx` is the reusable client; `web/` supplies a local synthetic Next.js review shell.

The standalone demo has an explicit environment guard and maps a fixed profile selector to server-held demo principals. It is never a production identity adapter. The host factory offers a separate integration path without demo sessions.

For scalability, an entire tenant document is currently locked/rewritten. This is an honest integration reference, not a benchmarked replacement for an established normalised production database. See the developer handover for policy and integration boundaries.

## v0.5 restoration layer

`financial.ts` derives period reports, historical subledgers, review fingerprints and export CSVs from immutable tagged journals. `documents.ts` builds safe invoices/verified receipts and scoped sales history. `restoration.ts`, `vehicle-transfers.ts` and additive `restoration-state.ts` restore administrative/history workflows without replacing the v4 controller. `media.ts` separates blob storage, and `marketplace.ts` plus `marketplace-receiver.ts` implement safe projections, durable attempts, signed transport and monotone receiver storage. Independent UI components add these surfaces while preserving the existing module pages and classic CSS tokens. `API_V5.md` and the restoration matrix are the current capability references.
