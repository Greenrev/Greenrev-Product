# Schema handover — developer-controlled

No existing production schema was inspected or changed. The supplied `migrations/postgres.sql` is a review-only optional adapter table; running the app does not apply PostgreSQL DDL.

`StateStore` defines `read(key)` and an atomic transaction callback. SQLite and PostgreSQL implementations keep each organisation under `tenant:<business-id>` and global catalogue configuration under `catalogue`. A workspace document carries schema_version=4; unsupported versions fail rather than reinitialise or wipe records.

Approve the existing business/user/branch mapping first. Do not duplicate or replace the existing users, invoices, subscriptions or marketplace tables merely because this local reference has equivalent concepts. A developer can implement the same transaction contract against the existing ORM and normalised schema instead of adopting JSONB aggregates.

The workspace aggregate contains module subscriptions and limits, future subscription, catalogue-pinned quotes, membership, contacts, fleet, bookings, haulage/workshop jobs, parts/orders, invoices, receipts, expenses, transfers, journals, audit, replays and a portable dealer snapshot. All use one business transaction. IDs from request bodies locate records only within that business aggregate; staff permissions are read from server state.

The PostgreSQL adapter locks the business key before reading, including first-insert cases. Review pool settings, TLS, application permissions, retention and backups against the actual Railway service. Do not run SQLite source migrations in PostgreSQL. Do not treat tenant owners as global platform administrators.

For historical data, build a reviewed export/import adapter and reconcile inventory, AR/AP, deposits, tax, journals, outstanding bookings and membership before activation. No automatic import from the historical Python SQLite database is supplied. The archive in docs/legacy-v0.3 preserves the earlier mapping notes.

## v0.5 additive data

Root schema_version 4 remains. Optional `extras.version=1` is hydrated without removing known/unknown existing root data. Future unsupported extras are refused. Additive dealer journal branch IDs freeze historic allocations. New fixed-asset/loan/depreciation accounts extend the chart; no automatic depreciation or booked tax changes occur.

Private media metadata points to a MediaStore; bytes are never written into accounting JSON or audit payloads. Auxiliary `marketplace:index`, `mirror:<business>:<listing>` and `passport-index:<vin>` documents carry schema_version 4 and retain generation/ownership indexes. They are distinct from tenant workspaces. The normal host mount does not enable the local public demo index.

Optional `StateStore.list(prefix,limit,after)` provides bounded directory pagination. SQLite uses a literal prefix comparison; PostgreSQL uses the same table without new DDL. Production PostgreSQL execution still needs an actual integration run. Index/worker/media backup and recovery must be included in the host's deployment plan.
