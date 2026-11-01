import { readFileSync, writeFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync(new URL('../contract/openapi.v3.json', import.meta.url), 'utf8'));
const implemented = new Set([
  'GET /workspace', 'GET /reports', 'POST /parties', 'POST /vehicles',
  'POST /vehicles/{vehicleId}/readiness', 'POST /vehicles/{vehicleId}/price',
  'POST /vehicles/{vehicleId}/publish', 'POST /vehicles/{vehicleId}/reserve',
  'POST /vehicles/{vehicleId}/release',
  'POST /bills', 'POST /invoices', 'POST /payments',
  'POST /payments/{paymentId}/verify', 'POST /invoices/{invoiceId}/handover'
]);
const pure = new Set([
  'POST /estimate', 'GET /entitlements',
  'POST /transfers/{transferId}/dispatch', 'POST /transfers/{transferId}/receive',
  'POST /transfers/{transferId}/cancel', 'POST /transfers/{transferId}/resolve',
  'POST /office-expenses/{expenseId}/approve', 'POST /office-expenses/{expenseId}/reject',
  'POST /office-expenses/{expenseId}/post',
  'POST /recurring-expenses/{templateId}/generate',
  'POST /platform/listing-requests/{requestId}/moderate'
]);
const lines = [
  '# GreenRev v0.3.0 route parity',
  '',
  'Generated from the supplied OpenAPI contract. **Synthetic workbench** means',
  'the TypeScript exercise implementation only; it does not mean production-ready.',
  '**Pure business rule** means validation/state-transition logic exists but no',
  'persistent API implementation. All remaining routes require a reviewed port.',
  '',
  '| Method | Contract route | Current TypeScript status |',
  '| --- | --- | --- |'
];
let count = 0, workbench = 0, rules = 0;
for (const [path, item] of Object.entries(doc.paths)) {
  for (const method of Object.keys(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const key = method.toUpperCase() + ' ' + path;
    let status = 'Not ported';
    if (implemented.has(key)) { status = 'Synthetic workbench (limited cases)'; workbench++; }
    else if (pure.has(key)) { status = 'Pure business rule only'; rules++; }
    lines.push('| ' + method.toUpperCase() + ' | ' + path + ' | ' + status + ' |');
    count++;
  }
}
lines.push('', '**Total source operations:** ' + count
  + ' · **Workbench routes:** ' + workbench
  + ' · **Rule-only routes:** ' + rules
  + ' · **Other routes pending:** ' + (count - workbench - rules), '');
writeFileSync(new URL('../docs/ROUTE_PARITY.md', import.meta.url), lines.join('\n'));
