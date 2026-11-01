# Upgrade to v0.5.0

This is an additive TypeScript update. Keep the classic palette, existing module names, financial records, subscriptions, tenant IDs and trusted host identity boundary.

## Local v0.4.0/v0.4.1 installation

Stop the prior process, back up the project/database/media, and copy this release's contents into the existing project root containing `package.json`. Keep database, uploaded-media and environment files. Run the Windows launcher or `npm ci` then `npm run demo`; open http://localhost:3100 and use Ctrl+F5. Running the BAT opening a terminal is expected. Leave that terminal running.

The workspace remains `schema_version:4`, preserving the v4 aggregate and optional PostgreSQL check. Missing `extras` is initialised additively, with an explicit extension version. Existing fields/records remain. Future unsupported extension versions fail rather than reset. Dealer journal branch metadata is frozen before introducing vehicle transfers so later location changes cannot rewrite historical branch allocations.

Existing demo businesses retain their records and chosen software-only packages. New **Software + marketplace** and **Marketplace only** profiles demonstrate publication without changing those subscriptions. Existing trial expiry/payment rules are retained; upgrading source does not grant paid access.

## Developer-managed production application

Do not copy this standalone demo identity handler into a live app. Mount the existing factory behind the existing SSO/CSRF/directory and use the production schema mapping. Review the changes and deploy through the application's normal process. No production migration, secret change or deployment is run by this package.

Use the supplied patches against their exact source baselines:

- `UPGRADE_FROM_V0.4.1.patch`: the classic v0.4.1 TypeScript ZIP.
- `UPGRADE_FROM_V0.4.0.patch`: the prior modular TypeScript ZIP.
- `UPGRADE_FROM_V0.3.patch`: the earlier **TypeScript foundation**, not Python files.

Each patch is generated from the exact baseline, checked with `git apply --check`, applied in an isolated copy and byte-compared with this release. Locally customised projects may need manual conflict resolution. Never apply these patches blindly to an unrelated Git checkout or database.

Bind durable private object storage for photographs in a multi-instance deployment. Local `FileMediaStore` defaults beside the sample database and must be backed up with it. Publication queues/indexes and Passport ownership indexes use distinct reserved document keys with schema_version 4; there is no automatic DDL. An existing normalised schema can implement equivalent adapters instead of adopting the optional JSONB table.

Start a trusted marketplace worker that calls `deliverPublications` to reconcile source availability, expiry and withdrawals and retry failed deliveries. Integrate the signed receiver into the main marketplace's moderation, media, enquiry and public listing lifecycle. The local demo index is disabled in the default host mount.

## Python business history

Features have been ported; historical data has not been silently converted. Export/import business history through an approved migration, retaining original IDs and dates, and reconcile opening balances, receivables/payables, instalments, VAT/input tax, inventory value, deposits, refunds and ledger totals before activation. CSV/Smart Upload creates reviewed operational records, not a complete replacement for a financial migration.
