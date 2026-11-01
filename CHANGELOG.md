# Change log

## 0.4.1 — 1 November 2026

- Restored the previous Business Desk palette: charcoal/black, white text and lime (#a3e635).
- Fixed local demo session switching and all mutations when Next normalises the browser host to localhost.
- Retained strict origin and CSRF validation; only validated local addresses are inferred.
- Prevented duplicate first-load session creation during React development effect replay.
- Removed the test-only origin override from normal HTTP/browser checks; added localhost and 127.0.0.1 regression cases.
- Added a drop-in update patch and instructions for existing v0.4.0 users.

## 0.4.0 — 1 November 2026

- Added separate Dealer, Parts, Rentals, Haulage and Workshop module onboarding and navigation; blocked future Auctions.
- Added core-once module price items, configurable versioned catalogues/allowances/overage, pinned quotes, upgrade proration and future paid plan changes.
- Added durable local SQLite transactions and a developer-controlled PostgreSQL adapter/migration reference.
- Added fleet availability, overlap/overdue controls, rental inspections, deposits, credits/deductions and refunds.
- Added haulage driver assignment, dispatch, assigned-driver proof of delivery and job costs.
- Added parts stock/cost/AP, reservations, fulfilment, full returns/refunds and branch transfer clearing.
- Added workshop/service finance, independent receipt confirmation, office expense review/posting and module/branch/combined reporting.
- Preserved dealer money/FX/instalment/consignment/workbench behaviour; added portable snapshot persistence and fixed branch filtering of legacy invoices.
- Added a Next.js review app, reusable host integration factory and Paystack verification adapter.
- Added functional, financial, isolation, concurrency, persistence, HTTP, provider and browser verification. See docs/VALIDATION.md for actual results and limits.

## 0.3.0-ts.1

Initial tested business-rule foundation. Historical documentation is preserved in docs/legacy-v0.3.
