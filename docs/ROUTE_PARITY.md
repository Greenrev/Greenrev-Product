# Previous-functionality restoration audit — v0.5.0

The supplied Python v0.3 contract contains **84 operations**. Every operation is mapped below. These are functional equivalents in the current TypeScript module design; an adapted path is not an assertion that an old HTTP URL/payload remains a supported alias. Existing v0.4 TypeScript routes and their original regression tests are retained.

The original host continues to own production sign-in/passwords, sign-out, account creation and deployment. Local demonstration publication executes end to end; main-site delivery needs the actual destination integration. No production business history was silently imported.

| Legacy operation | Status | Current implementation / workflow |
| --- | --- | --- |
| `GET /health` | Host | Existing host health check; standalone readiness is exercised through /api/saas/session. |
| `GET /session` | Host + demo | GET /session in host mount; standalone demo session remains isolated. |
| `POST /login` | Host | Existing verified SSO/sign-in; no replacement password database. |
| `POST /demo-session` | Local only | POST /demo/session; server-held synthetic identities and strict Origin/CSRF. |
| `POST /logout` | Host | Existing host sign-out/session revocation. |
| `GET /workspace` | Preserved | GET /workspace; independent module navigation and scoped records, plus activity/branch summaries. |
| `POST /parties` | Expanded | POST /parties; CUSTOMER/SUPPLIER/BOTH/LENDER, shared contacts with branch checks. |
| `POST /vehicles` | Expanded | POST /vehicles; owned/consigned stock and automatic private Passport relationship/history. |
| `POST /import/vehicles` | Adapted | POST /intake/preview and /intake/import with VEHICLE; atomic reviewed rows, DRAFT status. |
| `POST /vehicles/{vehicleId}/readiness` | Preserved | POST /vehicles/{id}/readiness; optimistic version, documents and inspection. |
| `POST /vehicles/{vehicleId}/price` | Preserved | POST /vehicles/{id}/price; existing stock repricing. |
| `POST /vehicles/{vehicleId}/publish` | Expanded | POST /vehicles/{id}/publish makes stock available; explicit /marketplace/requests publishes it. |
| `POST /vehicles/{vehicleId}/reserve` | Preserved | POST /vehicles/{id}/reserve; reconciliation withdraws unavailable public inventory. |
| `POST /vehicles/{vehicleId}/release` | Preserved | POST /vehicles/{id}/release; available stock can be explicitly republished. |
| `GET /vehicles/{vehicleId}/passport` | Adapted | Automatic private lifecycle history; /passports/link, /passports/{vin}, /contributions for reviewed notes. |
| `POST /vehicles/{vehicleId}/passport` | Adapted | Automatic private lifecycle history; /passports/link, /passports/{vin}, /contributions for reviewed notes. |
| `GET /public/listings/{vehicleId}` | Adapted | Local public /public-marketplace feed and /marketplace listing permalink; signed receiver for main-site delivery. |
| `POST /bills` | Expanded | Dealer /bills; parts /parts/{id}/receive; general /office-expenses. Currency/rates, input tax, AP and settlement FX are retained. |
| `POST /parts` | Preserved | POST /parts; dedicated SKU stock separate from vehicle sales/fleet. |
| `POST /parts-orders` | Expanded | POST /parts-orders; reservation, tax/discount, buyer invoice, separate verified payment and fulfilment. |
| `POST /parts-orders/{orderId}/fulfil` | Preserved | POST /parts-orders/{id}/fulfil; releases inventory and recognises net sales/COGS. |
| `POST /parts-orders/{orderId}/return` | Expanded | POST /parts-orders/{id}/return; full return restores cost, reverses tax/sale and records refund due; /refund confirms cash. |
| `POST /invoices` | Expanded | POST /invoices supports CASH/INSTALLMENT/PARTNER, lender/agreement, policy and instalment schedule; safe buyer document. |
| `POST /invoices/{invoiceId}/handover` | Preserved | POST /invoices/{id}/handover; confirmed settlement or owner-approved eligible credit release; deferred income earned. |
| `POST /invoices/{invoiceId}/return` | Restored | POST /invoices/{id}/return; quarantine/readiness reset, stock recovery, refund liability and owner-payout reconciliation guard. |
| `POST /payments` | Expanded | POST /payments for dealer INVOICE/BILL/CONSIGNMENT/REFUND; /receipts for parts/services. Evidence stays unposted. |
| `POST /payments/{paymentId}/verify` | Expanded | POST /payments/{id}/verify or /receipts/{id}/verify; independent confirmation, exact carrying/FX and buyer receipt. |
| `POST /capital` | Preserved | POST /capital; also reviewed opening/adjustment journals through /financial/journals. |
| `POST /settings` | Adapted | /financial/settings for fiscal/policy/closing/tax identity; /organisation/profile for business name/primary activity. |
| `GET /reports` | Expanded | Existing /reports remains compatible; new /financial-reports adds presets, historical ageing, detailed UI, review and nine-file export. |
| `GET /ledger` | Expanded | Existing /ledger retained; scoped/date-based general ledger in /financial-reports and CSV export. |
| `GET /fx` | Restored | GET /fx with configured timestamped reference provider, cache/stale rejection and explicit manual-rate fallback workflow. |
| `POST /estimate` | Preserved | POST /estimate; exact landed costs/contingency/margin and unposted price estimate. |
| `POST /leads` | Restored | POST /leads, GET /tools; scoped customer interest/contact and follow-up. |
| `POST /leads/{leadId}/stage` | Adapted | POST /leads/{id}; versioned stage, notes and follow-up updates. |
| `POST /outbox/{eventId}/ack` | Adapted | GET /integrations; separately trusted INTEGRATION_WORKER /platform/subscribers/{tenant}/outbox/{event}/ack, confirmed consumer reference. |
| `GET /organisation` | Adapted | GET /workspace and /tools; business, branch, membership, settings and purchased activity context. |
| `POST /organisation/profile` | Preserved | POST /organisation/profile; primary must be a selected activity. |
| `POST /branches` | Expanded | POST /branches and /branches/{id}; allowance, modules, scope and historical assignment preservation. |
| `POST /staff/invitations` | Restored | POST /staff/invitations; verified host subject, scoped roles/modules, reserved capacity, expiry and acceptance page. |
| `POST /invitations/accept` | Adapted | POST /staff/invitations/{id}/accept from the named verified host account; account creation/sign-in remains host-owned. |
| `POST /staff/{userId}/disable` | Preserved | POST /staff/{id}/disable; owner/self and privileged-role safeguards. |
| `POST /staff/{userId}/enable` | Preserved | POST /staff/{id}/enable; active plan/capacity and role authority. |
| `POST /staff/{userId}/role` | Adapted | POST /staff/{id}/access; owner-constrained role/module/branch editor. |
| `POST /staff/{userId}/branch` | Adapted | POST /staff/{id}/access with branches and module checks. |
| `POST /vehicles/{vehicleId}/transfer` | Adapted | POST /vehicle-transfers, then dispatch/receive/cancel/resolve; source/destination checks and frozen historical branch journals. |
| `POST /parts/{partId}/transfer` | Adapted | POST /transfers; quantity/cost, reservations, destination confirmation and finance-reviewed shortages. |
| `POST /fleet/assets` | Expanded | POST /fleet/assets and /status; separate rental/haulage fleet, VIN/capacity/conflict checks and Passport history. |
| `POST /service-jobs` | Adapted | Distinct POST /rentals, /haulage and /workshop; industry-specific schedules, agreements, inspection, POD and job details. |
| `POST /service-jobs/{jobId}/stage` | Adapted | Rental checkout/return/cancel; haulage assign/dispatch/deliver/cancel; workshop start/complete/cancel, with scope/version guards. |
| `POST /service-invoices` | Expanded | POST /service-invoices; deferred/earned services, discount/tax, due terms, buyer documents and full credit/refund/void. |
| `POST /service-invoices/{invoiceId}/payments` | Adapted | POST /receipts {invoice_id,amount,reference}; service/parts payment evidence. |
| `POST /service-invoices/{invoiceId}/payments/{receiptId}/verify` | Adapted | POST /receipts/{id}/verify; independently confirmed posting and receipt document. |
| `GET /passports/{vin}` | Expanded | GET /passports/{vin}; authorised linked relationship, private local records and explicitly shared cross-business records only. |
| `POST /passports/{vin}/contributions` | Expanded | POST /passports/{vin}/contributions; append-only source/category/date/evidence, PRIVATE/SHARED and DECLARED/REVIEWED. |
| `POST /passports/{vin}/grants` | Expanded | Owner-controlled existing business grants, plus named-account grants, expiry and revocation; source private evidence stays private. |
| `POST /smart-upload/preview` | Adapted | POST /intake/preview; conservative text/CSV/transcript extraction including Passport events, no draft/source audit persistence, reviewed commit. |
| `GET /entitlements` | Preserved | GET /entitlements; status, purchased modules, capacity and history availability. |
| `GET /platform/packages` | Adapted | GET/POST /platform/catalogue; versioned activity/core/marketplace rates, tier allowances and extra-unit prices. |
| `POST /platform/packages` | Adapted | GET/POST /platform/catalogue; versioned activity/core/marketplace rates, tier allowances and extra-unit prices. |
| `GET /platform/subscribers` | Restored | GET /platform/subscribers; separately authorised paginated directory and per-subscriber usage. |
| `POST /platform/subscribers/{tenantId}/subscription` | Adapted | Quote-pinned /platform/subscribers/{tenant}/activate after independently confirmed payment; no tenant-owner global powers. |
| `GET /platform/audit` | Restored | GET /platform/audit for separately granted PLATFORM_AUDIT; platform subscriber decisions and catalogue history. |
| `GET /branch-summary` | Restored | GET /branch-summary plus module dashboards and branch-filtered financial reports. |
| `GET /transfers` | Expanded | Parts /transfers and vehicle /vehicle-transfers; GET /workspace exposes scoped transfer records for each screen. |
| `POST /transfers` | Expanded | Parts /transfers and vehicle /vehicle-transfers; GET /workspace exposes scoped transfer records for each screen. |
| `POST /transfers/{transferId}/dispatch` | Expanded | POST /transfers/{id}/dispatch (parts) or /vehicle-transfers/{id}/dispatch; value moved to transit. |
| `POST /transfers/{transferId}/receive` | Expanded | Destination /receive confirms part quantity or vehicle VIN/evidence; discrepancies retain unresolved value. |
| `POST /transfers/{transferId}/cancel` | Preserved | Undispatched request cancellation only. |
| `POST /transfers/{transferId}/resolve` | Restored | Finance-reviewed parts FOUND/LOSS or confirmed correct-vehicle receipt; no silent transit write-off. |
| `GET /marketplace/requests` | Expanded | GET /marketplace and POST /marketplace/requests; photos, preview, plan gate, direct-only mode, public URL, durable delivery and withdrawal. |
| `POST /marketplace/requests` | Expanded | GET /marketplace and POST /marketplace/requests; photos, preview, plan gate, direct-only mode, public URL, durable delivery and withdrawal. |
| `GET /platform/listing-requests` | Adapted | GET /platform/subscribers/{tenant}/marketplace after authorised directory selection. |
| `POST /platform/listing-requests/{requestId}/moderate` | Adapted | POST /platform/subscribers/{tenant}/marketplace/{id}/moderate; expected generation, reason and separate platform authority. |
| `GET /office-expenses` | Expanded | POST /office-expenses and GET /workspace; currency, booked rate, approved input tax, category, branch/activity and supplier balance. |
| `POST /office-expenses` | Expanded | POST /office-expenses and GET /workspace; currency, booked rate, approved input tax, category, branch/activity and supplier balance. |
| `GET /expense-categories` | Restored | POST /expense-categories, GET /tools categories and recurring expense category selector. |
| `POST /expense-categories` | Restored | POST /expense-categories, GET /tools categories and recurring expense category selector. |
| `GET /recurring-expenses` | Adapted | POST /expense-templates, GET /tools; due frequency/category/amount and disable. |
| `POST /recurring-expenses` | Adapted | POST /expense-templates, GET /tools; due frequency/category/amount and disable. |
| `POST /recurring-expenses/{templateId}/generate` | Adapted | POST /expense-templates/{id}/generate; one due draft advances once and never auto-charges cash. |
| `POST /office-expenses/{expenseId}/approve` | Preserved | POST /office-expenses/{id}/approve; finance scope and optimistic version. |
| `POST /office-expenses/{expenseId}/reject` | Preserved | POST /office-expenses/{id}/reject; no posted accounting on rejected draft. |
| `POST /office-expenses/{expenseId}/post` | Expanded | POST /office-expenses/{id}/post; approved expense net/input-tax/AP posting, followed by independently confirmed settlement and FX. |

## Evidence by functional group

| Group | Source and verification |
| --- | --- |
| Money, ledger, fulfilment and old dealer flows | `src/money.ts`, `ledger.ts`, `memory-workbench.ts`; original money/ledger/workbench/v3-rules tests |
| Module, billing, access and host boundary | `src/modular/service.ts`, `access.ts`, `catalogue.ts`, `host.ts`; original modular/edge/http/host tests and browser suite |
| Rental, haulage and workshop | `operations.ts`; rental-haulage and original browser checks |
| Detailed finance, buyer documents and scope | `financial.ts`, `documents.ts`, UI report/document components; `restoration-finance.test.ts` and restored browser suite |
| Dealer/foreign bills, returns, imports, staff, history, transfers, recurring drafts | `restoration.ts`, `vehicle-transfers.ts`, `passport-events.ts`, `intake.ts`, `fx.ts`, `operations.ts`; `restoration-workflows.test.ts` and finance tests |
| Images, publication, moderation and receiver | `media.ts`, `marketplace.ts`, `marketplace-receiver.ts`; `restoration-marketplace.test.ts` and real browser publication/withdrawal |
| Persistence and upgrades | `stores.ts`, `restoration-state.ts`; restart/rollback/contention and additive/future-version tests |

No raw count is treated as a certification of all production integrations. `FEATURE_STATUS.md` and `docs/evidence/verification.json` distinguish local/synthetic verification from unconnected live services.
