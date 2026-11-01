# Railway integration

Use the existing application/repository and its approved deployment process. Do not deploy web/server/runtime.ts as production authentication. It is explicitly a local review adapter.

Use Node.js 24 (minimum 22.13 for this package), approve the schema mapping, instantiate PostgresStore or a host ORM adapter, bind trusted SSO/CSRF/directory callbacks and configure the payment provider server-side. The Next.js route uses runtime=nodejs, not Edge. Follow the existing application's secrets, TLS, pooling and health-check conventions.

Test the real database concurrency, isolation, schema/backfill and rollback behaviour in staging. Reconcile opening balances before writes. Then validate hosted payment initialisation, a valid/invalid/repeated webhook, wrong amount/currency, stale quote reconciliation, failed renewal and module removal. Connect the existing marketplace consumer before claiming listings are live.

The standalone Next.js production build is a verification artifact; no site, Railway service or live database was deployed from this task.
