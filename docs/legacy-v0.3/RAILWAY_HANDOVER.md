# Railway and GitHub release gates

**Do not deploy this package directly.** It has no persistent storage
implementation or production server entry point. The existing GreenRev
Node.js/Next.js project must host the approved services.

1. Create an integration branch in the **existing** GitHub repo, e.g.
   \`feature/saas-typescript-port\`; keep the working Python reference separate.
2. Copy the required domain modules into your developer's monorepo/package
   layout. Align Node/TypeScript versions, linting, aliases and naming with
   their \`package.json\`.
3. Implement database/ORM adapter and reviewed migrations in staging only.
   The developer explicitly owns schema merging.
4. Connect the existing auth/session middleware; verify revoked, disabled and
   cross-tenant users cannot call SaaS endpoints.
5. Run \`npm test\`, the current marketplace/Next.js tests, migrated Python
   parity tests, browser acceptance and concurrent-write/load testing.
6. Set required Railway environment variables in Railway's secret manager,
   not in GitHub. Exact keys depend on the host app; likely
   \`DATABASE_URL\`, auth/session secrets, \`GREENREV_ORIGIN\`,
   cookie/security flags and provider sandbox keys.
7. Verify the app listens on Railway's assigned \`PORT\`, serves health checks,
   runs no demo seeding or unreviewed migrations on startup, and restricts
   public routes to approved interfaces.
8. Confirm backups, rollback routing, migration-forward recovery,
   log/alert redaction, HTTPS/cookie security and provider webhook sandbox tests.
9. Use a PR with developer review and explicit business/accounting sign-off.
   GitHub source upload is not the same as deploying to Railway.

There is no GreenRev production DB credential, Railway project config or
developer's backend \`package.json\` in the supplied ZIP. No external writes,
database migrations or deployment actions have been performed.
