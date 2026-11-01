# Feature status — v0.5.0

The v0.3 Python contract was reviewed operation by operation. The existing v0.4 TypeScript business flows are retained; this release adds usable screens and persisted workflows for the identified gaps. `ROUTE_PARITY.md` maps the legacy contract to the current surfaces. It is a functional migration map, not a claim that old HTTP names are all aliases.

| Capability | Current status | Evidence |
| --- | --- | --- |
| Five independently selectable activities, primary activity, role/module/branch gating | Working local and host-bound domain; auctions blocked | Original billing, access and browser tests |
| Weekly/monthly/quarterly/year/custom/fiscal reports, comparison P&L, dated position, trial balance, AR/AP ageing, cash and tax ledger | Implemented, with activity/branch scope, explicit shared overhead and historical allocations | restoration-finance tests; restored browser suite |
| Year-end review/export, report fingerprints, period closing/reopening, opening and adjustment journals | Implemented; nine CSVs in a valid ZIP and print/save PDF; no statutory filing/audit certification | restoration-finance tests; browser ZIP/PDF checks |
| Rental fleet assets and depreciation/loan ledger support | Operational fleet plus accountant-entered fixed-asset/loan/depreciation journals; no automatic depreciation engine | fixed-asset/depreciation test |
| Buyer invoices, verified buyer receipts and sale history | Implemented for dealer, parts and services; print/save PDF; manual sharing rather than automatic email dispatch | buyer-document tests; browser invoice/receipt/PDF flow |
| Rental, haulage, workshop, service invoices/credits and payments | Preserved and surfaced; deposits/POD/driver restrictions retained | Original module and browser suites |
| Dealer cash/instalments/partner lender, readiness/reservation/repricing, consignment payout, full return/refund | Persisted domain and screens; lender ageing, quarantine on return, independent payout/refund verification | dealer restoration and original parity tests |
| Parts stock/orders/tax/discount, return/refund, vehicle and parts transfers with discrepancies | Implemented, with finance-reviewed loss or receipt resolution | restoration-workflows and finance tests |
| Images | Private storage adapter, bounded PNG/JPEG/WebP upload, full-size viewer, public consent, visibility/removal controls; files persist locally | image privacy tests; real browser upload/view/public image flow |
| Marketplace publication | Real local publication, public listing page, plan gate, direct marketplace-only listings, refresh/retry/withdraw, safe projections | marketplace tests; restored browser suite |
| Live main marketplace connection | Signed HTTPS producer + HMAC receiver + monotone generation/tombstone storage supplied; host endpoint, moderation policy, worker and deployment remain | synthetic signed transport/receiver tests; no live main-site delivery |
| Customer lead/follow-up, CSV, Smart Upload, voice transcript | Persisted leads; atomic reviewed import; conservative text/CSV extraction; browser speech where available; no claimed AI image recognition/translation service | intake atomicity tests and browser import/search |
| Vehicle Passport | Automatically linked private vehicle/fleet/workshop lifecycle history, internally reviewed/declaration labels, named-account grants and owner-controlled expiring cross-business sharing of explicitly SHARED records only | Passport permission/revocation/cross-business tests |
| Recurring expenses/categories | Templates generate due drafts; approve/post/pay workflow; no automatic cash charge | recurring and expense tests |
| FX and cost estimates | Cached provider adapter validates rates and source age; explicit manual execution rates remain possible; estimates do not rewrite booked transactions | synthetic provider/cache/stale-reference tests; live FX not claimed verified |
| Staff, invitations and branches | Verified host accounts, bound expiring invitations, acceptance route/page, capacity reservations, roles/branches/activities, enable/disable | invitation/access tests; frontend type and production build checks |
| Subscriber/admin/pricing/moderation/history | Versioned rates/allowances, paginated subscriber directory, per-business moderation and segregated worker acknowledgements | billing/platform/marketplace tests; existing pricing browser scenario |
| SQLite | Working local persistence, restarts/rollback and worker contention tests | Existing repository and concurrency tests |
| PostgreSQL | Adapter and optional review-only schema supplied; no live instance available in this task | Code/mocked contract checks only |
| Payments | Paystack signature plus independent transaction verification supplied; no live secret or charge | Synthetic provider tests |
| Sign-in, account creation/passwords, email sending and production business switching | Existing host owns identity and messaging. Invitations bind verified host subjects; no duplicate password store or auto email sender introduced | Host binding tests; live host not connected |
| Production deployment and historical Python data migration | Developer-controlled; not performed. Existing TypeScript workspace documents are extended in place | Additive migration/future-version protection and restart tests |

Retained scope limits include full rather than partial service credits, no automatic payroll or statutory tax computation, and no advanced transport routing/claims engine. Those are not represented as recovered features from the earlier simple business desk.

Foreign-currency parts purchases and office expenses also retain original amount/rate, recoverable input tax, gross AP and exact realised settlement FX differences. These flows are covered by the financial restoration tests; indicative reference fetching never rewrites their booked or actual execution rates.
