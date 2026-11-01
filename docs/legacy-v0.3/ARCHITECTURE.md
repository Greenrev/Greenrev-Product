# Architecture and application integration

## Boundary

Your developer owns the existing Node.js service, TypeScript build, Next.js
frontend, Railway hosting, user identity, data model and production schema.
This package owns reusable domain rules and testable examples; it is not a
second SaaS login/database deployed beside their platform.

The original Python \`Service.run(user, method, path, data, key)\` used a
transaction around permission checks, idempotency, business updates, journals,
audit and outbox. In production TypeScript, **all of these must commit or roll
back in the same database transaction**, using the chosen ORM/driver. The
in-memory \`MemoryWorkbench\` demonstrates intended behaviour but does not
provide this guarantee across Railway instances.

## Application entry

The \`handleSaasRequest\` function in \`src/http.ts\` is a framework-neutral
Fetch API adapter, so it can be called from Next.js route handlers after
authentication. It intentionally requires the host application's own trusted
identity and CSRF validation.

Illustrative Next.js integration (replace placeholders with **actual reviewed**
host adapters; this code is not a ready-to-deploy route):

~~~ts
import { handleSaasRequest } from '@greenrev/saas-domain';
import { getVerifiedGreenRevPrincipal, verifySessionCsrf } from '@/server/auth';
import { liveGreenRevSaasService } from '@/server/saas-service';

export async function POST(request: Request) {
  return handleSaasRequest(request, {
    service: liveGreenRevSaasService,
    origin: process.env.GREENREV_ORIGIN!,
    resolvePrincipal: getVerifiedGreenRevPrincipal,
    verifyCsrf: verifySessionCsrf
  });
}
~~~

The above intentionally references host-specific functions not included here.
Never replace them with \`X-Role\`, \`X-Tenant-ID\`, email-only lookup,
unsigned JWTs or tenant/actor fields supplied by a browser.

## Data and security

- Business IDs and platform operator identities are distinct. Tenant OWNER
  must not automatically gain global catalogue, support or billing access.
- Enforce tenant and branch scoping **inside database queries** as well as
  route checks. A global read followed by JavaScript filtering is insufficient
  to protect production data.
- Protect mutable vehicle versions and physical transfer versions with atomic
  compare-and-swap updates, not read-then-write alone.
- Idempotency keys bind tenant, verified actor, role, route and canonical
  payload. Replay identical requests; reject changed reuse with 409.
- Journal rows, audit and events are append-only. Never edit posted financial
  journals; reversal posts an equal opposite journal.
- Currency input is a decimal string in major units. Use integer minor-unit
  storage; the BigInt helpers avoid floating-point journal rounding.
- Business payment evidence and bank confirmation are **not** PSP/webhook
  verification. Build signed provider ingress and independent settlement checks
  in the existing payment platform.
- Marketplace events may be QUEUED but are not LIVE until the destination
  acknowledges delivery. Hide full VIN, supplier, acquisition cost and profit.
- As-of subscription expiry must be enforced at mutation time and reconciled
  in a scheduled destination depublication job.
- Keep real-data demo mode disabled; do not seed sample owner accounts into
  production.

## Source-to-target mapping

| Original Python | TypeScript in this package | Further integration |
| --- | --- | --- |
| \`money.py\`, \`pricing.py\` | \`src/money.ts\`, \`src/pricing.ts\` | Validate against recorded FX provider conventions |
| \`db.py\` journal/reporting | \`src/ledger.ts\` | ORM transaction, immutable journal tables, posting engine |
| \`service.py\` basic workflows | \`src/memory-workbench.ts\` synthetic subset | Port all 84 operations to production repository |
| \`commerce.py\` | \`src/v3-rules.ts\` entitlement subset | Package versioning, assignment, operator audit |
| \`transfers.py\` | \`src/v3-rules.ts\` state rules | Branch balance movements, transaction locking, outbox |
| \`expenses.py\` | \`src/v3-rules.ts\` review/recurrence rules | Supplier bill posting, recurring scheduler, file service |
| \`marketplace.py\` | \`src/v3-rules.ts\` projection/moderation subset | Destination worker, dedup, acknowledgements |
| \`server.py\` | \`src/http.ts\` adapter | Existing Next.js SSO, CSRF and cookies |
| \`web/app.js\` | Not converted | Existing Next.js UI to integrate separately |

## Further parity review

The Python source includes 122 tests in v0.3.0, including actual SQLite and
HTTP acceptance. The included TypeScript suite has 18 focused tests for selected
behaviours. These are **not** one-for-one equivalents. Before acceptance, build
an explicit test migration matrix and rerun all finance, branch, permissions,
idempotency, UAT and admin/marketplace flows against a production-shaped
staging database.
