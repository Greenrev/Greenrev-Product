# GreenRev Business

**Modular business management and bookkeeping for the automotive sector.**

**Release:** v0.5.0  
**Repository:** [Greenrev-Product](https://github.com/Greenrev/Greenrev-Product)  
**Stack:** TypeScript, Node.js, Next.js and React

GreenRev Business helps automotive businesses manage their daily operations, customers, suppliers, teams and finances in one workspace. A business can choose the activities it operates: vehicle sales, car parts, rentals, haulage or workshop services.

Each activity has its own operational workflow and dashboard. Shared contacts, branches, staff access and accounts connect the business without treating sale inventory, rental vehicles, transport jobs and workshop work as the same thing.

This repository contains the **v0.5.0 TypeScript application package**, an executable local demonstration, reusable domain services, integration adapters, tests and developer documentation. It is designed to support integration with the existing GreenRev marketplace and business platform.

## Contents

- [Business modules](#business-modules)
- [Subscription options](#subscription-options)
- [Core capabilities](#core-capabilities)
- [Accounting and financial reports](#accounting-and-financial-reports)
- [Invoices, payments and receipts](#invoices-payments-and-receipts)
- [Marketplace publishing](#marketplace-publishing)
- [Vehicle Passport and supporting tools](#vehicle-passport-and-supporting-tools)
- [Run locally](#run-locally)
- [Demonstration profiles](#demonstration-profiles)
- [Testing and verification](#testing-and-verification)
- [Project structure](#project-structure)
- [Data storage and upgrades](#data-storage-and-upgrades)
- [Production integration](#production-integration)
- [Current scope and planned integrations](#current-scope-and-planned-integrations)
- [Developer documentation](#developer-documentation)
- [Contributing](#contributing)

## Business modules

| Module | Intended users | Main workflows |
| --- | --- | --- |
| **Dealership** | Vehicle dealers and businesses selling owned or consigned vehicles | Vehicle inventory, acquisition costs, readiness checks, pricing, reservations, cash/instalment/partner-financed sales, handover, owner settlements and returns. |
| **Parts and stock** | Parts vendors and businesses managing parts inventory | SKU records, quantities and inventory value, supplier purchases, orders, discounts, tax, fulfilment, returns, refunds and branch transfers. |
| **Rentals** | Car rental businesses | Rental fleet, availability checks, bookings, agreements, authorised driver details, daily charges, inspections, checkout/return and refundable deposits. |
| **Haulage** | Vehicle transport and haulage operators | Transport fleet, job quotations, routes, cargo details, driver assignment, dispatch, proof of delivery, invoicing and direct trip costs. |
| **Workshop** | Mechanics and automotive service businesses | Customer vehicle jobs, work stages, quotations, service invoices, completion and vehicle history. |

Businesses can select more than one module and choose a primary activity. Access is controlled by purchased activities, staff role and branch assignment.

**Auctions are future scope and are unavailable for selection or purchase in this release.**

## Subscription options

| Option | What it provides |
| --- | --- |
| **Business software only** | Private operations, bookkeeping, reports, customers, suppliers, branches and staff for the selected business activities. |
| **Marketplace only** | Direct marketplace listings without access to private inventory management, bookings or accounting workflows. |
| **Software + marketplace** | Business software together with permission to publish selected inventory or services to the marketplace. |

The pricing model separates:

- One shared core charge for common business tools.
- Charges for the selected software modules.
- Marketplace access where included.
- Additional branches, staff and module capacity where applicable.

The platform pricing administrator can publish versioned rates and allowances. Quotes show the selected components and retain their catalogue version. Paid access requires confirmed payment; commercial rates begin unpublished and must be configured by the platform operator.

## Core capabilities

| Area | Capabilities |
| --- | --- |
| **Activity dashboards** | Independent operational screens and current-month financial summaries for each authorised business activity. |
| **Customers and suppliers** | Shared contact records with branch checks, including lender contacts for partner-financed vehicle sales. |
| **Branches and teams** | Branch creation/editing, verified-account memberships, invitations, roles, activity/branch assignments and staff enable/disable controls. |
| **Inventory photographs** | PNG, JPEG and WebP upload, full-size viewing, private/public visibility and removal controls. |
| **Stock movement** | Parts and vehicle transfers with dispatch, destination confirmation, discrepancies and reviewed resolution. |
| **Customer follow-up** | Leads, stages, notes, interests and next follow-up dates. |
| **Operational expenses** | Supplier expenses, categories, approval/posting, settlement and recurring expense drafts. |
| **Audit history** | Recorded business actions and integration/publication delivery status. |
| **Subscription control** | Module-aware navigation, capacity checks, itemised quotes and protection of existing records when access changes. |

The interface retains the **charcoal, white and lime** GreenRev Business colour scheme.

## Accounting and financial reports

Authorised owners and accountants can review financial results for the whole business or a permitted activity and branch.

### Available reports

- Weekly, monthly, quarterly, calendar-year, financial-year and custom-date reports.
- Profit and loss, with a comparison to the preceding period of equal length.
- Statement of financial position as of the selected end date.
- Trial balance and general ledger.
- Receivables and payables, with ageing and due dates.
- Posted bank/cash movements.
- Posted input-tax and output-tax balances for review.

The P&L covers the selected period. Position and ageing reports reconstruct balances from postings up to the selected end date. Unfinished periods run to the current date.

### Accounting workflows

- Exact minor-unit money calculations and balanced journals.
- Inventory value, cost of sales, discounts and full returns/refunds.
- Earned and unearned contractual finance charges.
- Service and sale income deferred until the relevant fulfilment/completion event.
- Rental security deposits tracked as refundable liabilities.
- Consignment owner payables and separately verified settlements.
- Foreign-currency supplier bills, original amounts, booked exchange rates and realised settlement FX differences.
- Approved recoverable input tax recorded separately from inventory or operating cost.
- Owner capital, opening balances and reasoned adjustment journals.
- Fixed-asset, loan and depreciation ledger accounts for accountant-entered adjustments.

Shared overhead is included for a single-activity business. In a mixed business, an individual activity report identifies excluded shared overhead; the whole-business report includes it once.

### Year-end review pack

**Download accountant review pack** produces a ZIP containing:

| File | Purpose |
| --- | --- |
| `01-profit-and-loss.csv` | Period income, expenses, profit/loss and comparison figures. |
| `02-financial-position.csv` | Assets, liabilities, capital and retained profit. |
| `03-trial-balance.csv` | Account balances and cumulative debit/credit totals. |
| `04-receivables-ageing.csv` | Outstanding customer/lender balances and ageing. |
| `05-payables-ageing.csv` | Outstanding supplier balances, ageing and original bill currency. |
| `06-general-ledger.csv` | Journal lines for the selected reporting period and scope. |
| `07-cash-movements.csv` | Posted cash movements and opening/closing cash. |
| `08-tax-review.csv` | Posted tax-ledger balances for accountant review. |
| `09-review-report.csv` | Review points, report fingerprint and preparation/review notes. |

Financial settings support the financial-year start, legal business name, tax reference, closed periods and policy thresholds. Preparation/review notes are tied to a report fingerprint; later changes can make a previous review stale.

These are bookkeeping statements and supporting records for accountant/tax review. Statutory adjustments, tax eligibility, reconciliation and filing remain subject to professional review. The application does not submit tax returns or certify audited financial statements.

## Invoices, payments and receipts

Sales, orders and service invoices remain reviewable through their activity screens and **Sales & documents**.

A typical workflow is:

1. Record the vehicle sale, parts order or service invoice.
2. Open **View invoice** to review the buyer details, charges, tax, totals and outstanding balance.
3. Record the customer's payment reference and amount as payment evidence.
4. Independently confirm the bank movement in **Accounts & expenses**.
5. Open **View receipt** to print or save the verified payment receipt as a PDF.
6. Record the relevant handover, fulfilment or service-completion event.

Payment evidence does not automatically become posted cash. A buyer receipt is available only for an independently verified incoming invoice payment.

The dealer workflow supports cash, instalment and partner-financed purchases. Instalment invoices can show the agreed payment schedule, while partner-financed invoices identify the financing partner. Full returns retain the history, reverse the relevant accounting and create a refund liability until the refund is confirmed.

Buyer documents can be printed or saved as PDF for sharing. Automatic email delivery is not configured in this package.

## Marketplace publishing

A software-and-marketplace subscription can publish selected inventory or services through **Photos & marketplace**.

### Local demonstration

1. Choose **Software + marketplace · all activities demo** in the profile selector.
2. Open **Parts & stock**.
3. Select **Photos & marketplace** beside **Brake pad set**.
4. Upload a photograph of up to **2 MB**. Mark it public if it should appear in the listing.
5. Enter the public description and choose **Publish to marketplace**.
6. After the local delivery status becomes **DELIVERED**, select **Open published listing**.
7. Review, refresh or withdraw the item through **Marketplace**.

The demonstration public marketplace is available at `/marketplace` while the local server is running. Marketplace-only subscribers have a separate direct-listing form.

Automatic public projections exclude supplier costs, internal accounting data, customer records, full vehicle VINs and private photos. Source availability and subscription rules control publication. Rental and haulage listings invite availability enquiries without exposing private bookings or customer jobs.

### Main marketplace integration

The package includes a signed HTTPS publication transport, a signature-verifying receiver, durable delivery attempts and generation-based withdrawal handling. These are integration components for the existing GreenRev marketplace.

Publishing to the **live main marketplace** requires its actual endpoint, signing configuration, consumer/moderation integration, media access and deployed retry/reconciliation worker. A local **DELIVERED** status demonstrates delivery to the local demo; it does not claim that a listing was published to the live site.

## Vehicle Passport and supporting tools

### Vehicle Passport

Vehicle, fleet and workshop relationships can maintain private, source-labelled vehicle history. Operational lifecycle records are created automatically, and authorised users can append dated notes and supporting references.

Passport permissions include:

- Private and explicitly shared records.
- Declared and internally reviewed labels.
- Expiring named-account grants.
- Owner-controlled cross-business grants to an existing organisation.
- Revocation and checks on the receiving business's authorised vehicle relationship.

Cross-business sharing exposes only records explicitly marked **SHARED** while a valid grant exists. Source-labelled history is not government verification of ownership, accident status, theft status or roadworthiness.

### Imports and Smart Upload

- Reviewed CSV import for supported operational records.
- Conservative extraction from supplied text or a voice transcript.
- Editable previews before committing records.
- Atomic import of up to 100 reviewed rows, subject to normal access/capacity rules.
- Browser speech-to-text where supported, with typed transcripts as an alternative.

Previewing does not save or publish the suggested business records. Imported vehicles start as drafts; imported products do not receive fabricated opening stock.

### Recurring expenses and FX estimates

Recurring templates generate due expense drafts for approval and posting. They do not automatically charge money.

The cost estimator supports purchase currency, exchange rate, additional costs, bank fees, contingency and target margin. A configured reference-rate provider supplies timestamped indicative FX quotes. Stale or unavailable references require an explicitly sourced manual rate; they do not rewrite booked transactions or actual bank execution rates.

## Run locally

### Requirements

- **Node.js 24 recommended**: the v0.5.0 release was validated with Node.js 24.22.1.
- **Node.js 22.13 or newer required** by this package.
- npm, supplied with a normal Node.js installation.
- Internet access for the first dependency installation.
- A browser for opening the local application.

Run commands from the repository folder containing `package.json`.

### Windows launcher

Double-click:

```text
start-demo-windows.bat
```

A terminal window opening is expected. It installs the locked dependencies, compiles the TypeScript services and starts the local Next.js application. Leave it running.

When the terminal reports **Ready**, open:

[http://localhost:3100](http://localhost:3100)

### VS Code or terminal

```powershell
npm ci
npm run demo
```

Then open [http://localhost:3100](http://localhost:3100).

`npm run demo` handles the domain build and enables the isolated local demonstration. Use **Ctrl+C** in its terminal to stop the server.

### Updating an existing local installation

1. Stop the previous server.
2. Back up the existing project, local database, uploaded media and configuration.
3. Copy the new release's contents into the existing project root.
4. Retain the existing data, media and environment configuration.
5. Run the launcher or `npm ci` followed by `npm run demo`.
6. Refresh the browser with **Ctrl+F5**.

See [UPGRADE.md](docs/UPGRADE.md) before applying a patch or migrating existing business data.

## Demonstration profiles

Use the **Review as** selector to explore sample accounts.

| Profile | What to review |
| --- | --- |
| **Rental company · owner** | Rental fleet, bookings, agreements, deposits, invoices and reports. |
| **Parts vendor · owner** | Stock, purchases, orders, returns and supplier balances. |
| **Car dealer · owner** | Sale inventory, acquisition costs, financing, buyer invoices and handover. |
| **Haulage company · owner** | Transport jobs, driver assignment, dispatch and delivery evidence. |
| **Several business activities · owner** | Independent workspaces for all five business activities. |
| **Software + marketplace · all activities demo** | Inventory photographs, publication and the local public listing journey. |
| **Marketplace only · listing seller demo** | Direct listings without private management/accounting access. |
| **Rental company · booking agent** | Role-limited booking operations. |
| **Haulage company · assigned driver** | Assigned transport work with restricted financial access. |
| **GreenRev platform · pricing administrator** | Catalogue rates/allowances, subscribers and listing moderation. |
| **New subscriber · select your modules** | Registration, primary activity and package selection. |

These are synthetic local identities. Production sign-in, account creation, business switching and staff identity verification belong to the existing host application.

## Testing and verification

Install dependencies and run the verification pipeline:

```powershell
npm ci
npm run verify
```

The default pipeline compiles the domain, runs automated tests, checks frontend types, builds the Next.js application and exercises the HTTP boundary.

| Command | Purpose |
| --- | --- |
| `npm test` | Build and run the domain test suite. |
| `npm run build` | Compile the TypeScript domain and declarations. |
| `npm run check:web` | Check frontend types; build the domain first if running this command independently. |
| `npm run build:web` | Build the domain and the Next.js application. |
| `npm run test:http` | Exercise the real local HTTP boundary. |
| `npm run test:browser` | Run the original browser workflow suite. |
| `npm run test:browser:restored` | Run the restored finance, documents, import and publication browser journeys. |

Browser suites require a compatible Chromium installation. Set `CHROMIUM_EXECUTABLE_PATH` if it is outside Playwright's standard browser location.

To include both browser suites in the full verification pipeline from PowerShell:

```powershell
$env:RUN_BROWSER_CHECKS = "1"
npm run verify
```

### Recorded v0.5.0 release evidence

| Check | Recorded result |
| --- | --- |
| Automated tests | **97 passed, 0 failed**; the original 65 regression tests are retained. |
| Browser scenarios | **23 passed** across the original and restored-workflow suites. |
| TypeScript and frontend checks | Passed. |
| Next.js production build | Passed. |
| HTTP checks | Passed. |
| Accountant export | Nine CSV files in a checked ZIP. |
| Printed buyer document | Actual one-page A4 invoice PDF inspected. |
| Earlier contract review | All **84 legacy operations** mapped to current workflows or host-owned integration responsibilities. |

These are the recorded release results, not a claim that tests have run on every developer's computer or production account. See [verification.json](docs/evidence/verification.json), [VALIDATION.md](docs/VALIDATION.md) and the associated evidence logs.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/` | TypeScript domain logic, exact money calculations, ledger, dealer engine and modular services/adapters. |
| `src/modular/` | Business operations, subscriptions, access, reports, documents, stores, publication, media, Passport and supporting workflows. |
| `ui/` | Reusable React workspace, dashboards, reports, buyer documents and administration components. |
| `web/` | Standalone Next.js demonstration application and local session/runtime boundary. |
| `tests/` | Domain, accounting, permissions, billing, persistence, concurrency, HTTP and restoration tests. |
| `scripts/` | Startup, verification, HTTP and browser workflow scripts. |
| `docs/` | API, architecture, feature status, integration, upgrade and validation documentation. |
| `docs/evidence/` | Recorded verification results and logs. |
| `contract/` | Previous API contract and v0.5.0 restoration mapping. |
| `migrations/` | Optional, review-only PostgreSQL adapter schema. |
| `package.json` | Project scripts and dependency declarations. |
| `package-lock.json` | Locked dependency resolution used by `npm ci`. |
| `START-HERE.md` | Short entry point for starting the package. |
| `CHANGELOG.md` | Release/change notes supplied with the application package. |

## Data storage and upgrades

The standalone demo uses persisted **SQLite** data and a local private media store. Its database location can be configured through `GREENREV_DEMO_DB`. Actual photograph bytes are kept outside the accounting aggregate and audit payloads.

A PostgreSQL store adapter is supplied for developer-managed integration. An existing production ORM or normalised database can implement the storage contract instead of adopting the optional adapter table.

Key data controls include:

- Business-scoped state and server-side membership checks.
- Atomic accounting changes, audit events and idempotency records.
- SQLite WAL mode and transaction handling.
- Document/extension version checks that refuse unsupported future formats rather than clearing records.
- Additive upgrades for existing v0.4.x TypeScript workspace documents.

Historical Python business data is **not automatically imported**. A reviewed migration must reconcile original IDs/dates, stock values, receivables, payables, deposits, tax and ledger balances.

## Production integration

The domain and UI components are intended to be integrated into the existing GreenRev application. The standalone demonstration is not a replacement for its live identity, marketplace or database services.

| Integration area | Developer responsibility |
| --- | --- |
| **Identity** | Bind trusted users, business context, roles and staff directory verification to the existing sign-in service. |
| **API boundary** | Preserve the existing Origin, CSRF, session and server-side access controls when mounting the service. |
| **Database** | Review schema ownership, transactions, migrations, backups and the approved Railway database mapping. |
| **Payments** | Configure the payment provider, validate signed callbacks and independently verify payment details. |
| **Media** | Bind durable private object storage for production, including backup and retention handling. |
| **Marketplace** | Connect the real receiver, moderation, public catalogue, media/enquiry URLs and delivery reconciliation worker. |
| **Deployment** | Configure the existing Node.js/Next.js application and Railway environment through its normal release process. |

The optional PostgreSQL DDL is review-only and is not automatically applied. Keep synthetic demo identities out of a live deployment.

## Current scope and planned integrations

| Area | v0.5.0 status |
| --- | --- |
| Five business modules, bookkeeping, buyer documents and local publication | Implemented and covered by the supplied local verification. |
| Live main-marketplace delivery | Integration components supplied; actual endpoint/configuration and deployment are still required. |
| Paystack | Signature and transaction-verification adapter supplied and tested with synthetic provider responses; no live payment account was exercised in the release checks. |
| Live PostgreSQL, production sign-in and Railway deployment | Supplied interfaces/handover require integration with the existing production application; no private production environment was exercised. |
| Live FX fetching | Reference provider adapter supplied; fixture-based validation covers freshness/cache behaviour. A successful live fetch is not asserted by the release evidence. |
| Automatic invoice/receipt emails | Requires the host's approved email/document-delivery integration. |
| Hausa, Igbo or Yoruba translation into English | Requires a separately integrated translation service; current intake uses supplied text/transcripts and available browser speech support. |
| Facebook, Instagram, X, TikTok, Snapchat or WhatsApp cross-posting | Individual platform adapters, authorisation and delivery handling remain integration work. |
| Government/insurance registry verification | Source-labelled Passport history does not claim a live FRSC, VIO or NIID verification connection. |
| Auctions | Future scope; selection and purchase are disabled. |
| Payroll, automatic depreciation and statutory tax filing | Not automated in this release; reviewed ledger adjustments support bookkeeping preparation. |

## Developer documentation

- [Detailed functionality and previous-route mapping](docs/ROUTE_PARITY.md)
- [Current feature status](docs/FEATURE_STATUS.md)
- [v0.5.0 API and permission rules](docs/API_V5.md)
- [Existing modular API reference](docs/API_V4.md)
- [Developer integration and host bindings](docs/DEVELOPER_HANDOVER.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Schema handover](docs/SCHEMA_HANDOVER.md)
- [Railway handover](docs/RAILWAY_HANDOVER.md)
- [Upgrade and data-preservation instructions](docs/UPGRADE.md)
- [Validation evidence and limits](docs/VALIDATION.md)
- [Machine-readable restoration map](contract/restoration-v5.json)

## Contributing

1. Create a branch for the proposed change.
2. Preserve existing business records, module separation, permissions and the agreed colour theme.
3. Add relevant tests when changing business rules, accounting, access or integrations.
4. Run `npm run verify` and the browser suites affected by the change.
5. Open a pull request explaining the behaviour, validation and any schema/integration implications.

Schema changes and production deployment remain part of the existing developer-managed review and release process.
