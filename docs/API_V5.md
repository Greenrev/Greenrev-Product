# API additions — v0.5.0

The mounted prefix is `/api/saas`. In domain calls use `/api/...`; e.g. a browser GET `/api/saas/financial-reports` maps to domain GET `/api/financial-reports`. Preserve the existing v4 operations in `API_V4.md`. Mutations require the existing same-origin + CSRF + idempotency boundary. Identity, roles and scopes are never accepted from request JSON. GET results are private/no-store except for explicitly enabled public demo projections, which are still served no-store.

## Reports and documents

- GET `/financial-reports`: `preset=WEEK|MONTH|QUARTER|YEAR|FINANCIAL_YEAR|CUSTOM`, optional `as_of=YYYY-MM-DD` (date within the selected period), `from`+`to`, `module=ALL|DEALER|PARTS|RENTAL|HAULAGE|MECHANIC`, `branch_id=ALL|id`. Owner/accountant only; backend filters permitted activities/branches. Balances are as of `to`, P&L is period-specific. Unfinished periods end today. Prior comparison uses the same number of preceding days.
- GET `/financial-reports/export`: same filters; returns nine `{name,csv}` entries. The client creates a standard uncompressed ZIP. User text is CSV-escaped and guarded against spreadsheet formulas. The ledger CSV covers the selected period; trial balance/position carry cumulative balances to its end.
- POST `/financial/settings`: owner, `reason` required; legal name, tax reference, year start month 1–12, closed-through date or empty to reopen, discount/margin policy. No tax jurisdiction is auto-invented.
- POST `/financial/journals`: finance, `module` or SHARED, `branch_id`, `date`, `reason`, balanced `lines:[{account,debit,credit}]` with decimal **naira strings**. Two to forty lines. Future/closed dates rejected. Shared postings require whole-business access. Fixed-asset (1300), accumulated depreciation (1310), loan (2700) and depreciation expense (6200) accounts support reviewed opening/year-end entries.
- POST `/financial/reviews`: report filters, exact `fingerprint`, `status=PREPARED|REVIEWED`, `note`. Recomputes the report; rejects stale data or errors for REVIEWED. Access scope is part of the fingerprint and review visibility.
- POST `/financial/due-dates`: `reference`, `due_date`; finance-owned outstanding balances only. Instalment ageing uses contractual due rows and reconstructs historical payment allocations.
- Existing financial mutations accept optional finance-only `transaction_date` and, for a non-today date, `posting_reason`. Closed periods apply to normal posts and credits/returns as well as manual journals. Credits reverse in the credit's posting period rather than rewriting the original period.
- GET `/sales`: authorised sale/invoice summary across permitted activities, with payment/outstanding amounts and status.
- GET `/documents/invoices/{invoice-or-order-id}`: safe buyer invoice data, no acquisition costs or margin policy. Customer/contact, line, net/tax/finance/total, verified payments and outstanding. UUID-backed references remain stable.
- GET `/documents/receipts/{receipt-or-dealer-payment-id}`: independently verified incoming invoice payments only. Unverified evidence has no buyer receipt. Receipt amount/bank reference are the confirmed movement; invoice balances are current when the copy is generated. Driver access is refused.

## Images and publication

- POST `/media`: `module`, `branch_id`, `resource_id`, canonical `base64`, optional `caption`, `public:boolean`. An authenticated authorised member may upload up to eight active PNG/JPEG/WebP images per item, at most 2 MB each. Server checks signatures/PNG dimensions and ignores client MIME/storage-key claims. The JSON HTTP limit is raised only for this route; all other requests retain the smaller bound. Actual bytes are stored through `MediaStore`, not in tenant aggregates/audit logs.
- GET `/media/{id}`: private authorised bytes with validated MIME, nosniff, CSP and no-store.
- POST `/media/{id}/visibility`: `version`, `public:boolean`. Making public requires current write access. Making private remains possible for authorised staff after expiry. POST `/media/{id}/archive` removes the photograph from views/public projections. Storage is private; archival is not a promise of permanent retention-policy deletion.
- GET `/marketplace/preview`: module, source resource and optional public title. Only the safe current projection is returned.
- GET `/marketplace`: permitted listing/history/delivery records and connection status.
- POST `/marketplace/requests`: module/source resource/branch, optional public description/title/price (services). Requires a marketplace-inclusive software subscription. No automatic upgrade.
- POST `/marketplace/direct`: marketplace-only subscription, activity/branch/title/description/location/price. This does not grant private software access.
- POST `/marketplace/requests/{id}/refresh|retry|withdraw`: refresh/retry emits a new generation; withdrawals emit tombstones. Source changes/expiry/deselection reconcile availability. Full VINs, costs, suppliers, customers and private photos are excluded from automatic projections.
- Local demo only: unauthenticated GET `/public-marketplace` and `/public-marketplace/{listing}/images/{image}`. Reads recheck source availability, subscription, moderation and explicit public image consent. The host factory does **not** enable this demo index by default.
- `deliverPublications(tenantId,maxDeliveries)` is a trusted host-worker method. Pending events, attempts and errors are durable. Local requests deliver immediately; external request processing attempts at most one delivery, with a bounded timeout. Schedule worker retries/reconciliation in the host, including expiry/depublication, and monitor failures.
- `SignedMarketplaceTransport` sends HTTPS HMAC events. `handleMarketplaceDelivery` verifies raw body signature/time and applies monotone generation records through `acceptPublication`. The destination must keep withdrawal tombstones and integrate its real moderation/public catalogue, media access, enquiries and URLs. Delivery acknowledgement is distinct from approval. Supply the actual main-marketplace contract before claiming live connectivity.

## Restored tools and administration

- GET `/tools`: scoped settings, leads, Passport links, expense templates/categories, invitations, images and deliveries. GET `/branch-summary` supplies scope-filtered operational branch counts.
- POST `/intake/preview`: kind, source, TEXT/CSV format; conservative suggestions only, no draft/source persistence in business records or audit. Supports vehicle/part/fleet/service/Passport-event intake. Browser microphone support is optional; typed transcripts always remain usable. No OCR, generative image recognition or external translation is claimed.
- POST `/intake/import`: kind, branch, reviewed rows (one to 100). Normal domain validation/roles/capacity apply inside one atomic transaction. Vehicles start DRAFT, products with no fabricated opening stock, and nothing auto-publishes. Quoted CSV parsing rejects duplicate/unsafe headers and malformed records.
- POST `/leads`, POST `/leads/{id}` with version: scoped lead capture, stage, notes and next follow-up date.
- GET `/fx?currency=USD|GBP|EUR|CAD|AED|CNY`: finance-only configured provider, timestamped indicative reference/cache; stale/failing provider returns a manual-rate explanation, never a fabricated fallback. Existing `/estimate` remains an unposted tax-exclusive estimate.
- POST `/expense-categories`, `/expense-templates`, `/expense-templates/{id}/generate|disable`: finance-only. Generate a due draft, then approve/post/pay in the existing expense workflow. One due period advances once; month/year dates clamp appropriately. No automatic cash debit.
- POST `/staff/invitations`: verified `subject_id`, role, activities and branch. Pending invitations reserve staff allowance, expire and bind to that exact trusted sign-in subject. POST `/staff/invitations/{id}/accept|revoke`. Host sign-in/account creation remains authoritative; no email is automatically sent.
- POST `/staff/{id}/access`: owner/admin constrained role, `modules`, `branches`. Owner/self access edits prohibited, privileged financial/admin grants owner-only. Existing enable/disable and direct verified membership APIs remain.
- POST `/branches/{id}`: rename/add enabled activities. Historical branch module assignments are retained; subscription access controls future activity. Create through existing POST `/branches`.
- POST `/passports/link`, GET `/passports/{vin}`, POST `/passports/{vin}/contributions|grants`: automatically link authorised inventory/fleet/workshop vehicles and append safe private lifecycle events; explicitly link/relink as needed; append dated category/note/source and DECLARED/REVIEWED label, PRIVATE/SHARED visibility. Only finance may mark internally reviewed. Named-account grants expire; owner business grants require another existing organisation and a future expiry. A receiving business must have its own authorised linked-vehicle relationship and sees only explicitly SHARED source records while the grant is active. Private evidence/actor details are not exposed cross-business. Revocation takes effect at read time.
- POST `/vehicle-transfers` and `/{id}/dispatch|receive|resolve|cancel`: source dispatch, destination VIN/evidence confirmation, quarantine mismatches, finance resolution and renewed readiness. Parts use the existing `/transfers` family, now with received quantity/discrepancy/FOUND-or-LOSS resolution. Transfer journals preserve historical branch allocations.
- Dealer `/invoices` now supports PARTNER with verified lender party + agreement. Existing BILL/INVOICE evidence also supports CONSIGNMENT/REFUND, independently verified before posting. Full invoice return restores stock, defers cash refund to a liability and blocks unreconciled owner payouts. Parts orders now retain discount/net/tax and defer net sales until fulfilment.
- GET `/integrations`: finance-scoped dealer outbox/history; publication delivery history is scope-filtered. No business subscriber can self-certify external delivery.

## Global platform authority

Trusted host capabilities are separate from being a tenant OWNER:

| Capability | Endpoint family |
| --- | --- |
| CATALOG_ADMIN | Existing GET/POST `/platform/catalogue`, versioned module/core/marketplace rates, allowances and extra capacity |
| BILLING_ADMIN | GET `/platform/subscribers` (paginated) and existing per-subscriber usage/independently confirmed activation |
| MARKETPLACE_ADMIN | GET `/platform/subscribers/{tenant}/marketplace`, POST `/{listing}/moderate` with expected generation, APPROVE/REJECT and reason |
| PLATFORM_AUDIT | GET `/platform/audit` for platform changes |
| INTEGRATION_WORKER | POST `/platform/subscribers/{tenant}/outbox/{event}/ack` with a confirmed consumer reference |

The optional store `list(prefix,limit,after)` powers the paginated directory. Both supplied SQL adapters implement it; an existing host can bind its approved subscriber directory instead. No public browser can choose a capability, owner role or tenant identity.

## Supplier currency and input-tax restoration

Dealer bills, parts stock receipts and approved office expenses retain supported bill currency, original foreign amount, booked NGN rate, gross NGN AP and approved recoverable input tax. Parts/operating cost excludes approved recoverable tax; the tax posts to 1400. Parts receipt `cost` and office expense `amount` are in the chosen bill currency. `recoverable_tax` is a decimal NGN amount. Default NGN behaviour and legacy records without these additive fields are preserved.

For `/office-expenses/{id}/pay` use amount in that bill currency and, for non-NGN, an explicit actual settlement `fx`. The payable is reduced by exact proportional carrying value; bank uses actual execution value; the difference posts to 6100. Overpayments, replay/duplicate bank references and cross-activity financial access remain blocked. The historical report derives NGN balances from postings rather than substituting current paid amounts. Original foreign amount/currency appears in the payable view/export. Input-tax eligibility must be approved by finance rather than inferred by the software.
