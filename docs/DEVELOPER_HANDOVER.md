# Developer handover — v0.4.0

## Scope and integration

The new domain controller is `src/modular/service.ts`. It preserves the v0.3 dealer workbench through explicit snapshot/restore and adds independent business modules. New accounts start with no activities enabled. Onboarding/paid activation adds exactly selected modules; removing a paid module preserves its historical records and authorised settlement paths.

Production integration remains owned by the existing Node.js/TypeScript backend, Next.js frontend, SSO and Railway database. Do not replace or fork the existing marketplace, users or admin app.

## Mount in an existing Next.js Node route

Instantiate the store and mounted handlers once per process. Bind verified identity and CSRF to the existing application's adapters:

```ts
import { PostgresStore, PaystackProvider, mountGreenRevSaas } from '@greenrev/saas-domain';

const handlers = mountGreenRevSaas({
  store: new PostgresStore({ connectionString: process.env.DATABASE_URL }),
  origin: process.env.GREENREV_ORIGIN!,
  resolvePrincipal: hostIdentity.resolvePrincipal,
  verifyCsrf: hostIdentity.verifyCsrf,
  getCsrfToken: hostIdentity.getCsrfToken,
  verifyStaffSubject: hostDirectory.isVerifiedSubject,
  payments: new PaystackProvider(process.env.PAYSTACK_SECRET_KEY!, process.env.PAYSTACK_CALLBACK_URL!)
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handlers.GET;
export const POST = handlers.POST;
```

`hostIdentity` and `hostDirectory` above stand for the application's real adapters, not exports in this package. Omit `payments` while configuring staging rather than inserting a fake secret. PostgreSQL TLS/pool settings must match the actual service; do not disable certificate verification as a workaround.

The route can be `app/api/saas/[...path]/route.ts`. Existing same-origin cookies remain the identity authority. Never accept tenant IDs, roles, owner flags or platform capabilities from browser headers/body. The first trusted OWNER principal may initialise their own organisation. Thereafter membership is loaded from the stored workspace on every request.

`verifyStaffSubject` supports asynchronous directory/database checks and must return exactly true. Membership APIs link an existing verified subject; they do not create SSO accounts, email invitations or reset credentials. Map existing users/branches carefully before enabling access. OWNER/ACCOUNTANT have organisation-wide branch access; accountant module grants still restrict financial visibility. ADMIN and other staff remain branch-scoped.

The client component expects `/session` to return a host-generated CSRF token. The mounted factory supplies this using `getCsrfToken`. Its `demo` flag is false. The existing application owns sign-in and sign-out. A supplied `apiPrefix` can change `/api/saas`.

## Persistence

SQLite is the local executable reference. PostgreSQL uses parameterised queries, transaction-level advisory locking covering first insert, a locked workspace row, atomic JSONB replacement and rollback. The aggregate includes operational state, journals, business audit and idempotency together.

This intentionally small aggregate adapter is suitable for review and modest workloads. It is not a benchmarked large-fleet database design: each mutation serialises the business aggregate. Before a large tenant rollout, map the StateStore contract to approved normalised tables, constraints and reports, and load-test real usage. No DDL runs automatically against PostgreSQL.

Audit and journal append behaviour is enforced by the service. A database owner can still edit the aggregate; independent immutable audit storage/retention should follow the host's existing architecture. Do not expose this table through client database credentials.

## Billing rules

CORE is included once for a software subscription. Each purchased module adds its own base and overage items. Branches and seats count across the business once. Rental/haulage limits count non-archived fleet; dealer counts unsold/undelivered inventory; Parts counts distinct product codes; Workshop counts open jobs. A marketplace-only subscription charges its marketplace product and enables no private SaaS operations.

Prices are null until published. Configure currency-minor-unit prices, limits and overage rates through the catalogue API. Changes publish a new version; existing quotes/subscriptions retain their own values. Every quote is pinned to the subscription revision and expires after 15 minutes.

A higher-priced superset of an active paid package takes effect immediately with a prorated increase over the existing billing period. The original billing-period denominator remains intact across successive upgrades. Removals/reductions and same-package renewals start at the existing period end. Over-limit existing records are retained; new additions are blocked by the lower allowance. A prepaid future change cannot be silently overwritten or discarded. Billing must explicitly reconcile such a change before replacement/cancellation.

There is no automatic provider subscription debit or background renewal scheduler in this release. Paid access is updated by a verified hosted payment or privileged billing confirmation. Tax-inclusive/exclusive subscription prices and commercial notification rules must be agreed before publishing prices.

## Paystack

Keep secrets server-side. Initialise payment using the saved quote. Configure the webhook at `/api/saas/webhooks/paystack`. The adapter validates the SHA-512 HMAC of the raw body and re-verifies the transaction with Paystack. Amount, currency, reference and stored quote must agree before applying access. Browser redirects are not confirmation. Repeated payment events remain idempotent after later subscription changes.

The privileged activation endpoint is for an independently verified manual billing operation, not a customer-facing paid flag. It requires a separate BILLING_ADMIN capability, a reason and confirmation. Vendor subscription receipts are separate from car/parts/rental customer payments.

Expired/stale quotes and mismatched payments return a reconciliation error. Do not discard these events: route failed events to the host's billing support/reconciliation workflow. Live checkout, webhook delivery, settlements and any recurring billing must be verified in the actual staging account.

## Operational and financial policies

Rental day pricing rounds each started 24-hour period up. Walk-in start times may be up to 15 minutes earlier. Rental/haulage periods are half-open for overlap checks, capped at 366 days; overdue checked-out/dispatched assets remain blocked. A return requires nondecreasing odometer readings and acknowledgement. Collection, deduction and refund of deposits are separate records/actions. Security deposits post to a deposit liability, not sales revenue.

Service invoices defer net income until rental return, haulage delivery or workshop completion. Tax is only the explicitly entered configured rate. Receipt evidence does not post a bank movement until finance independently confirms it. Full service credits reverse invoiced/earned income and tax, transfer collected money to refunds payable and allow a separately confirmed refund. Partial service credits are not implemented.

Parts use weighted cost with exact kobo allocation. Open orders reserve stock. Fulfilment recognises revenue/cost; full returns restore the recorded cost. Full-quantity branch transfers use clearing entries and do not create revenue. Shortage/loss/discrepancy resolution still needs a reviewed workflow in this new controller.

Module profit excludes shared office costs and reports the unallocated total separately. Rental asset capitalisation/depreciation, daily accrual, statutory tax determination and a complete general-purpose ERP are not supplied. Obtain the business's accounting policy sign-off before real reporting.

## Marketplace and rollout

Publication requests are QUEUED producer records with a public-safe projection. They are not proof that an advert is live. Connect the existing marketplace consumer and acknowledgement/depublication worker. Public rental/haulage marketplace journeys must exist before selling them as live public capabilities.

Merge on an isolated branch, approve schema/identity mappings, run all tests and the staging payment cases, compare opening balances, then migrate a pilot tenant. Keep the standalone demo disabled. No deployment, private repository merge or production migration was performed here.

## v0.5.0 restoration update — current integration notes

Read `API_V5.md`, `FEATURE_STATUS.md` and `UPGRADE.md` with the earlier mount example. The host factory now accepts optional `mediaStore`, `marketplaceTransport` and `fxProvider` bindings. It still delegates identity/CSRF/staff account verification to the existing application. Local demo publication and identities are not enabled in this factory.

Example additional bindings:

```ts
mediaStore: hostPrivateObjectStorage, // implements MediaStore; never publicly expose its private keys
marketplaceTransport: new SignedMarketplaceTransport(process.env.MARKETPLACE_RECEIVER_URL!, process.env.MARKETPLACE_SIGNING_SECRET!),
fxProvider: new ExchangeRateReference(),
```

On the actual destination, mount `handleMarketplaceDelivery(request,{store,secret,publicUrl})` behind its machine endpoint and connect accepted generations to its own moderation/catalogue. Keep tombstones. A matching delivery receipt is not a grant to bypass destination moderation. Bind real public image/enquiry URLs and a tenant directory. Schedule trusted retries/reconciliation through `service.deliverPublications(tenantId, batchSize)` and monitor pending errors, especially expiry/depublication. No host scheduler has been installed by this source package.

Tenant extras store settings/reviews/terms, leads, photograph metadata, Passport links/grants/history, recurring drafts/categories, invitation state, vehicle transfers and delivery audit. Blob bytes remain external. All journal-changing business actions retain atomic state, audit and idempotency, with posting-date/closed-period controls. Data read/write scope is enforced by the backend, not merely hidden menus. Review fingerprints include the authorised module scope.

Buyer documents are server-authorised safe data rendered into print/save-PDF views. They do not email themselves. Integrate the host's approved transactional email/document-numbering requirements if external dispatch or jurisdiction-specific tax invoice numbering is needed; do not claim such delivery simply because a PDF was generated.
