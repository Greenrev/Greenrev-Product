# GreenRev v0.3.0 route parity

Generated from the supplied OpenAPI contract. **Synthetic workbench** means
the TypeScript exercise implementation only; it does not mean production-ready.
**Pure business rule** means validation/state-transition logic exists but no
persistent API implementation. All remaining routes require a reviewed port.

| Method | Contract route | Current TypeScript status |
| --- | --- | --- |
| GET | /health | Not ported |
| GET | /session | Not ported |
| POST | /login | Not ported |
| POST | /demo-session | Not ported |
| POST | /logout | Not ported |
| GET | /workspace | Synthetic workbench (limited cases) |
| POST | /parties | Synthetic workbench (limited cases) |
| POST | /vehicles | Synthetic workbench (limited cases) |
| POST | /import/vehicles | Not ported |
| POST | /vehicles/{vehicleId}/readiness | Synthetic workbench (limited cases) |
| POST | /vehicles/{vehicleId}/price | Synthetic workbench (limited cases) |
| POST | /vehicles/{vehicleId}/publish | Synthetic workbench (limited cases) |
| POST | /vehicles/{vehicleId}/reserve | Synthetic workbench (limited cases) |
| POST | /vehicles/{vehicleId}/release | Synthetic workbench (limited cases) |
| GET | /vehicles/{vehicleId}/passport | Not ported |
| POST | /vehicles/{vehicleId}/passport | Not ported |
| GET | /public/listings/{vehicleId} | Not ported |
| POST | /bills | Synthetic workbench (limited cases) |
| POST | /parts | Not ported |
| POST | /parts-orders | Not ported |
| POST | /parts-orders/{orderId}/fulfil | Not ported |
| POST | /parts-orders/{orderId}/return | Not ported |
| POST | /invoices | Synthetic workbench (limited cases) |
| POST | /invoices/{invoiceId}/handover | Synthetic workbench (limited cases) |
| POST | /invoices/{invoiceId}/return | Not ported |
| POST | /payments | Synthetic workbench (limited cases) |
| POST | /payments/{paymentId}/verify | Synthetic workbench (limited cases) |
| POST | /capital | Not ported |
| POST | /settings | Not ported |
| GET | /reports | Synthetic workbench (limited cases) |
| GET | /ledger | Not ported |
| GET | /fx | Not ported |
| POST | /estimate | Pure business rule only |
| POST | /leads | Not ported |
| POST | /leads/{leadId}/stage | Not ported |
| POST | /outbox/{eventId}/ack | Not ported |
| GET | /organisation | Not ported |
| POST | /organisation/profile | Not ported |
| POST | /branches | Not ported |
| POST | /staff/invitations | Not ported |
| POST | /invitations/accept | Not ported |
| POST | /staff/{userId}/disable | Not ported |
| POST | /staff/{userId}/enable | Not ported |
| POST | /staff/{userId}/role | Not ported |
| POST | /staff/{userId}/branch | Not ported |
| POST | /vehicles/{vehicleId}/transfer | Not ported |
| POST | /parts/{partId}/transfer | Not ported |
| POST | /fleet/assets | Not ported |
| POST | /service-jobs | Not ported |
| POST | /service-jobs/{jobId}/stage | Not ported |
| POST | /service-invoices | Not ported |
| POST | /service-invoices/{invoiceId}/payments | Not ported |
| POST | /service-invoices/{invoiceId}/payments/{receiptId}/verify | Not ported |
| GET | /passports/{vin} | Not ported |
| POST | /passports/{vin}/contributions | Not ported |
| POST | /passports/{vin}/grants | Not ported |
| POST | /smart-upload/preview | Not ported |
| GET | /entitlements | Pure business rule only |
| GET | /platform/packages | Not ported |
| POST | /platform/packages | Not ported |
| GET | /platform/subscribers | Not ported |
| POST | /platform/subscribers/{tenantId}/subscription | Not ported |
| GET | /platform/audit | Not ported |
| GET | /branch-summary | Not ported |
| GET | /transfers | Not ported |
| POST | /transfers | Not ported |
| POST | /transfers/{transferId}/dispatch | Pure business rule only |
| POST | /transfers/{transferId}/receive | Pure business rule only |
| POST | /transfers/{transferId}/cancel | Pure business rule only |
| POST | /transfers/{transferId}/resolve | Pure business rule only |
| GET | /marketplace/requests | Not ported |
| POST | /marketplace/requests | Not ported |
| GET | /platform/listing-requests | Not ported |
| POST | /platform/listing-requests/{requestId}/moderate | Pure business rule only |
| GET | /office-expenses | Not ported |
| POST | /office-expenses | Not ported |
| GET | /expense-categories | Not ported |
| POST | /expense-categories | Not ported |
| GET | /recurring-expenses | Not ported |
| POST | /recurring-expenses | Not ported |
| POST | /recurring-expenses/{templateId}/generate | Pure business rule only |
| POST | /office-expenses/{expenseId}/approve | Pure business rule only |
| POST | /office-expenses/{expenseId}/reject | Pure business rule only |
| POST | /office-expenses/{expenseId}/post | Pure business rule only |

**Total source operations:** 84 · **Workbench routes:** 14 · **Rule-only routes:** 11 · **Other routes pending:** 59
