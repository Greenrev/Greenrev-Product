# GreenRev SaaS — TypeScript migration foundation

**Source:** uploaded GreenRev SaaS v0.3.0 extension (29 October 2026)  
**Target:** your developer's existing Node.js/TypeScript backend and Next.js frontend on Railway  
**Status:** tested **partial domain port**, **NOT** an end-to-end conversion or a deployable backend

The source ZIP contains 84 documented API operations and reported 122 Python
tests plus seven frontend tests. The supplied Python reference was re-run in an
isolated environment; all 122 + 7 passed. This TypeScript package is an
initial, testable port of selected business rules, not a claim that 122 source
tests have been replaced. See [route parity](docs/ROUTE_PARITY.md).

## Included

| Module | Current TypeScript implementation |
| --- | --- |
| Exact amounts / FX / instalments | BigInt-backed minor units, 8-decimal FX, schedule, date and margin helpers |
| Accounting | Balanced immutable journal objects, reversals, period trial balance / P&L |
| Dealer workbench | **Synthetic in-memory only:** parties, vehicles, readiness, price, publish/reserve/release, vehicle bills, cash/instalment invoices, payment evidence/confirmation, handover, reports |
| v0.3 subscriptions | Pure eligibility and pinned-package access validation |
| Physical transfers | Pure branch/role and transition validation, with source/destination separation |
| Office expenses | Pure review, once-only posting eligibility, recurring date/deduplication checks |
| Marketplace | Minimal private-field-safe vehicle projection, moderation capability check |
| HTTP boundary | Fetch API adapter with trusted identity hook, same-origin/CSRF checks, idempotency header and scalar JSON limit |
| API contract | Original v0.3 OpenAPI JSON plus operation-by-operation parity register |

The synthetic workbench clones its entire state before a mutation and commits
only on success. That is suitable **only for unit tests**. It does **not** use
your developer's database, persist across restarts, handle multi-instance
concurrency, or represent the production integration.

## Run on a development computer

Requires Node.js 20+ and npm.

~~~sh
npm install
npm test
~~~

The compiler builds ESM JavaScript under \`dist/\`. There is deliberately no
\`npm start\` or Railway service entry point: deploying an in-memory finance
workbench would be unsafe. Your developer must first integrate the approved
database/ORM transaction adapter and SSO/session logic.

## Integrating into your existing Next.js application

1. Read [architecture and identity boundary](docs/ARCHITECTURE.md).
2. Your developer approves a table/ORM mapping and migrations from
   [schema handover](docs/SCHEMA_HANDOVER.md). **No schema mutations are supplied or run.**
3. Port remaining business operations and all original tests indicated in
   [route parity](docs/ROUTE_PARITY.md). Replace synthetic state with a real,
   transaction-safe repository.
4. Adapt the Fetch handler \`src/http.ts\` to the existing SSO and CSRF
   implementation. Neither client-supplied roles nor tenant headers are authority.
5. Integrate approved APIs with existing Next.js business and admin pages;
   do not replace the marketplace or its admin system.
6. Run staging tests on Railway following [deployment gates](docs/RAILWAY_HANDOVER.md).

## Deliberately NOT included / not yet ported

- Real PostgreSQL/MySQL/Prisma/Drizzle adapter (your developer's database/ORM
  and schema were not provided).
- Next.js UI replacement or existing frontend integration.
- Full parts receipts/orders/returns, bill categories other than vehicle costs,
  supplier settlements and returns, partner finance, CSV imports, sessions,
  staff invitations, Passport event persistence, service jobs, rentals/haulage.
- Persistent v0.3 catalogue, subscription assignment, branch balances,
  transfers, office expenses, recurring jobs and marketplace outbox delivery.
- Paystack/bank integration, actual marketplace delivery, SSO integration,
  live FX retrieval, document storage or live social posting.

These are not silently mocked as live functionality. The original Python
implementation and its source documentation remain the reference for porting.
Do not merge this into a real-data route or deploy it as a production service.

## Provenance

The uploaded ZIP was inspected as-is. The OpenAPI contract under
\`contract/openapi.v3.json\` is copied from that ZIP. No credentials, demo
user passwords or real customer records are included in this TypeScript output.
