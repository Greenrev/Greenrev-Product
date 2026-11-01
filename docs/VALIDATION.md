# Validation — v0.5.0

Run `npm run verify`. It compiles the domain, executes all automated tests, checks the frontend, builds the Next.js production application and exercises the real HTTP boundary. Set `RUN_BROWSER_CHECKS=1` for both browser suites. A completion record is written only when every selected check passes.

The original 65 regression tests are retained. New tests exercise historical reports, accrual/deposit treatment, single/mixed-activity shared costs, financial scope, stale report review, period locks/backdated entries, taxed/discounted parts returns, partner-finance debtor allocation, vehicle returns and verified refunds, consignment payouts, atomic imports, recurring drafts, bound invitations/capacity, private/cross-business Passport grants/revocation, shortage resolution, FX cache/staleness, publication delivery/privacy/withdrawals, signed receiver tombstones, vehicle transfer history, additive upgrades/future-version refusal, global directory permissions, instalment ageing and fixed-asset/depreciation adjustments.

The restored browser suite uses the real Next server and local database. It issues and prints an invoice/PDF, confirms a payment then opens a receipt, switches report periods and downloads a valid accountant ZIP, records a review, imports/searches stock, uploads and views a real PNG, publishes and opens an anonymous public listing, withdraws it, checks marketplace-only/management-only gating and inspects a 390px report layout. The original suite retains profile/origin switching, roles, five activity menus, rentals, haulage/POD, pricing and palette checks.

Authoritative results are in `docs/evidence/verification.json`, `browser-smoke.json`, `browser-restoration.json` and the associated logs. Internal screenshots and generated test documents are excluded from the distribution.

Live PostgreSQL, Paystack accounts, the existing production SSO, main marketplace API/media store, SMTP delivery, live FX success and Railway deployment were not tested with private live credentials. Network/provider behaviour is tested with explicit fixtures and mocked primary interfaces. No real payment, public business listing or tax filing was submitted.

The final finance suite also verifies foreign-currency parts and operating supplier bills, recoverable input tax, partial carrying-value settlement, realised FX gain/loss, original-currency disclosures and unchanged historical AP.
