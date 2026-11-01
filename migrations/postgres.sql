-- REVIEW-ONLY. The developer owns schema integration. This file is never auto-run.
-- Preserve existing users, marketplace, billing and financial tables.
-- One isolated aggregate per tenant; catalogue uses a separate reserved key.
CREATE TABLE greenrev_saas_documents (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  CONSTRAINT greenrev_saas_document_version CHECK ((payload->>'schema_version')::integer = 4)
);

-- A least-privilege application account needs SELECT/INSERT/UPDATE on this table.
-- Do not expose it directly to a browser. Audit/journals are append-only through
-- the application; database owners retain write authority. Backups are required.
-- The adapter uses advisory transaction locks even for first inserts.
-- No permissions, users, existing tables, database engines or production data are
-- changed by the TypeScript package. Review tenancy, backups and retention first.
