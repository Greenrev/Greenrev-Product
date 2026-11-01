# Database schema handover — developer-controlled

**No live schema was inspected. No schema changes have been applied.** Railway
is a hosting platform, not a database engine; confirm whether the service uses
PostgreSQL, MySQL or another system, and which ORM/migration tool is already
used. The SQL in the uploaded Python ZIP is SQLite-specific.

## Source schema reference

The original module contains:

- \`greenrev/schema.sql\` (schema 1): tenants, users, sessions, parties,
  vehicles, stock_items, bills, invoices, instalments, payments,
  parts_orders, refunds, journals, journal_lines, passport_events, leads,
  outbox, audit, idempotency and FX quotes.
- \`greenrev/migration_002.sql\`: branch and staff access, parts branch
  balances, jobs/services, Passport enhancements and role additions.
- \`greenrev/migration_003.sql\`: package/version catalogue, subscriptions,
  physical transfer requests, office expenses, recurrence and marketplace
  producer/moderation controls.

## Developer review decisions

1. Map GreenRev's existing organisation/user/branch IDs. Avoid creating
   parallel generic \`users\`, \`tenants\`, \`invoices\` and \`payments\` tables
   without reconciliation.
2. Approve namespaced SaaS tables or mappings, with tenant/branch foreign
   keys and the database's equivalent of immutable journal/audit controls.
3. Decide monetary storage: signed BIGINT kobo and decimal(precision,8) FX.
   Do not use JS floating-point or SQL FLOAT for posted financial values.
4. Add unique constraints for tenant-scoped VINs and SKUs, bank reference,
   idempotency key, invoice active-sale exclusivity, transfer version and
   recurring template/month combination.
5. Implement one atomic transaction for money, inventory, journals, audit
   and outbox; consider row locks or serializable transactions for competing
   vehicle sales/stock dispatch.
6. Preserve immutable package versions with subscription pinning. Operator
   permissions are separate from dealer roles.
7. Design a migration/backfill strategy for opening stock, AR, AP, tax,
   historical payments, journal cutover, existing subscribers and branch
   memberships. Reconcile opening balances before enabling production writes.
8. Review data residency, retention, secure receipt/document references,
   encrypting sensitive fields, backup/restore and restore-test procedures.

## PostgreSQL-specific caution (if confirmed)

Replace SQLite \`PRAGMA\`, \`INSERT OR IGNORE\`, \`RAISE(ABORT)\`, \`?\`
placeholders, \`BEGIN IMMEDIATE\` and SQLite date expressions with reviewed
PostgreSQL-native constructs. Use appropriate CHECK/partial unique indexes,
row-level security if part of the existing architecture, and append-only
permissions/triggers. Do not blindly run source SQLite migration files in
PostgreSQL.

## Required migration artifacts from the developer

- Approved ERD/table mapping and ownership matrix.
- Forward-only migration(s) and staging rollback plan (not deletion of
  financial records).
- Data reconciliation/checksum evidence.
- Isolation, concurrency, idempotency and journal invariant tests.
- Signed-off staging migration before Railway production deployment.
