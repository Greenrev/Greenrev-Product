# GreenRev Business — TypeScript v0.5.0

This update restores detailed bookkeeping, buyer documents and the earlier business tools while keeping the classic charcoal, white and lime interface. Dealership, Parts, Rentals, Haulage and Workshop remain independent activities. Auctions remain future scope.

## Start or update on Windows

1. Stop the previous server with **Ctrl+C** in its terminal. Back up your existing project and its local database before replacing source files.
2. Extract this ZIP. For an existing TypeScript installation, copy the **contents** of this release folder into the existing folder that contains `package.json`, choosing **Replace**. Retain your existing database, media and environment configuration. Do not run a second copy against the same database during an upgrade.
3. Use Node.js 24, the version family used for validation. The domain package requires Node 22.13 or newer.
4. Double-click **start-demo-windows.bat**. A terminal opening is expected: it installs locked dependencies, compiles TypeScript and runs the local Next.js server. Leave it open.
5. When it says **Ready**, open **http://localhost:3100** in your browser. Press **Ctrl+F5** after an upgrade. `127.0.0.1:3100` also works when no strict origin pin has been configured.

For a clean new installation, extract into an empty folder and start at step 3. The ZIP contains source code rather than a standalone Windows executable. The first dependency installation needs internet access. If installation fails, the terminal keeps the error output; the website cannot open until the server starts.

The local review application uses clearly labelled sample identities and persists its data. It is not a public production login. A database already created by v0.4.0/v0.4.1 is extended without clearing its records. A Python database needs a separately reviewed data migration; source feature restoration does not automatically move Python accounting history.

## What is restored and improved

| Area | Where to use it |
| --- | --- |
| Weekly, monthly, quarterly, annual, financial-year and custom P&L | **Financial reports**; choose activity, branch and period |
| Financial position, trial balance, cash movements, receivables/payables and ageing | The same report, with historical balances reconstructed from dated postings |
| Year-end preparation | Download the nine-file **accountant review pack**, print/save PDF, record preparation/review notes, set the financial-year start, close/reopen periods, and enter balanced accountant adjustments |
| Buyer invoice | **View invoice** on a vehicle sale, parts order or service invoice; or use **Sales & documents** |
| Buyer payment receipt | Record evidence, independently confirm the bank movement in **Accounts & expenses**, then **View receipt** and print/save PDF |
| Activity dashboards | Each purchased activity has its own operations and current-month revenue, profit, receivable and payable cards |
| Inventory photographs | **Photos & marketplace** beside an item; upload, view full size, make private/public, or remove a photo |
| Inventory publication | Preview and publish from the same panel; see delivery history, public link, refresh/retry and withdraw under **Marketplace** |
| Marketplace-only selling | A separate direct-listing form without private inventory, booking or accounting access |
| Previous supporting tools | **Business tools** includes reviewed CSV/Smart Upload, browser voice transcripts, customer leads/follow-up, private/shared vehicle Passport history, recurring expense drafts, categories, cost/FX estimates, financial settings and activity history |
| Branches and team | Branch creation/editing, verified-account membership or invitations, staff roles/branches/activities, enabling and disabling |
| Dealer finance | Cash, instalment and partner finance, consignment owner settlements, full vehicle return and independently confirmed refund |
| Parts and vehicle transfers | Request, dispatch, receive, record discrepancies and finance-reviewed resolution; in-transit value is retained until resolved |
| Subscription and platform pricing | Activity selection, software/marketplace/bundle, tier, allowances and an itemised quote. Platform operators publish versioned rates and review subscribers/listings |

## Try the main journeys

### Invoice, payment and receipt

Select **Rental company · owner**, open **Rentals**, and issue an **Invoice** for the demonstration booking. Open **View invoice** to print or save it as PDF. Record a payment reference with **Record payment**. In **Accounts & expenses**, independently confirm the bank evidence. **Buyer payment receipts → View receipt** then produces the buyer's receipt. Unverified evidence does not become posted cash or a paid receipt.

**Sales & documents** gathers vehicle, parts and service sales with totals, verified payments, outstanding balances and status. Rental security deposits remain separate refundable liabilities, rather than ordinary sales income. A sale invoice and revenue recognition are separate: vehicle handover, parts fulfilment or service completion earns the relevant income.

### Simple financial statements and year-end review

Open **Financial reports**, choose an activity or the whole business, select the branch and choose **Weekly**, **Monthly**, **Calendar year**, **Financial year** or dates. The P&L covers that period. The financial position, trial balance and ageing show the position at its end. An unfinished period ends at today's date.

Download the **accountant review pack** for P&L, position, trial balance, receivables, payables, general ledger, cash movements, tax-ledger balances and review checks. Record a preparation or review note. Later posting changes mark that review as stale, so an old review is not silently applied to new figures.

Use **Business tools → Financial settings** for the year start, legal name/tax reference, closed periods and policy thresholds. Opening balances, fleet assets/loans, depreciation, accruals and other adjustments can be entered as balanced journals with reasons. Shared office costs are included in a single-activity business; a mixed business sees them separately when viewing one activity. The whole-business report includes shared overhead once.

These are bookkeeping statements and supporting records for accountant/tax review. They do not calculate every statutory adjustment, certify an audit or submit a tax declaration. An indicative cash-movement summary is not presented as an IAS 7 statutory cash-flow statement. Confirm opening balances, tax treatment and adjustments before using the year-end figures for filing.

### Publish an item and open its marketplace listing

1. Select **Software + marketplace · all activities demo**.
2. Open **Parts & stock** and use **Photos & marketplace** beside **Brake pad set**.
3. Upload a PNG/JPEG/WebP of at most 2 MB. Mark it public only if you want it in the listing. Click the image for a larger view.
4. Enter the public description and choose **Publish to marketplace**.
5. Once the local delivery reads **DELIVERED**, click **Open published listing**. This opens the actual local demonstration marketplace at `/marketplace`.
6. Under **Marketplace**, refresh or withdraw the listing. Sold, reserved/unavailable or withdrawn source items are hidden from the local public feed. Rental and haulage listings invite date/availability enquiries rather than disclosing private bookings.

The **Marketplace only · listing seller demo** profile demonstrates direct listings. A software-only profile displays the package upgrade explanation at the publish step. Its subscription is not silently changed. Supplier costs, internal notes, customer records, full vehicle VINs and private photos are excluded from automatic public projections.

This local end-to-end demonstration is executable. Publication to the live main GreenRev marketplace requires the destination API/signing configuration and a deployed receiving/consumer adapter. A signed transport, receiver and generation-safe withdrawal contract are included. The standalone demo does not claim to have published to the live site.

### Pricing

The shared core covers contacts, accounts, financial reports, staff and branches and is charged once. Each selected software activity adds its own line. Marketplace access is a separate line in a bundle; marketplace-only mode does not add private software charges. Extra branches, staff and activity capacity have separate configurable rates.

Commercial rates start **unpublished**, not fabricated. Use the platform pricing demo profile to publish explicitly chosen rates and allowances. These sample edits affect only the local demo database. A published quote pins its catalogue version; payment must be independently confirmed before a paid package activates. Existing paid periods and prepaid scheduled changes remain protected.

## Verification and developer handover

Run `npm ci`, then `npm run verify`. `RUN_BROWSER_CHECKS=1` also runs the original and restored-workflow browser suites; set `CHROMIUM_EXECUTABLE_PATH` if your browser is outside Playwright's standard installation. The release evidence is under `docs/evidence`.

- [Detailed feature audit and previous-route mapping](docs/ROUTE_PARITY.md)
- [Feature status and genuine external dependencies](docs/FEATURE_STATUS.md)
- [New API and permission rules](docs/API_V5.md)
- [Developer integration](docs/DEVELOPER_HANDOVER.md)
- [Upgrade/data preservation](docs/UPGRADE.md)
- [Validation evidence and limitations](docs/VALIDATION.md)

The source package has been verified locally. Live PostgreSQL, payment accounts, production SSO, the main marketplace and Railway deployment require the existing developer's integration and have not been exercised with private production credentials. Do not replace the production users, marketplace or database simply because this review package contains local equivalents.
#   G r e e n r e v - P r o d u c t  
 