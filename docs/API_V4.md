# Current module API — v0.4.0

Mount paths below under `/api/saas`. The domain controller uses `/api` internally. The host factory owns the non-demo `/session` and signed provider ingress. Every other route requires verified host identity.

POST requests use same-origin JSON, a host CSRF token and a unique `Idempotency-Key` (8–100 letters/digits/underscore/hyphen). Header roles/tenant IDs and paid flags are never authority. Update actions use the integer `version` returned by the latest record. Stale versions fail with 409. Financial evidence and provider subscription activation are separate concepts.

Money fields (`amount`, `daily_rate`, `quote`, `cost`, `discount`, `deposit`, `asking_price`) are decimal strings in major currency units. Returned `*_minor` values and catalogue prices are integer kobo. Rental/haulage times are ISO strings with timezone. Read availability takes `start_at` and `end_at`; reports/ledger can take `module`, `branch_id`, `from`, `to` (dates YYYY-MM-DD).

The OpenAPI file supplies route inventory and common registration/quote schemas. Other operation bodies are described by the typed controller/model and input validation; do not infer that the historic Python payload for a similarly named route is identical.

| Group | Method | Path | Behaviour |
| --- | --- | --- | --- |
| Read | GET | `/session` | Existing host session and CSRF token |
| Read | GET | `/catalogue` | Public subscription catalogue |
| Read | GET | `/workspace` | Module-filtered business workspace |
| Read | GET | `/billing` | Subscription and saved quotes |
| Read | GET | `/entitlements` | Effective subscription |
| Read | GET | `/reports` | Module/branch/combined finance reports |
| Read | GET | `/ledger` | Scoped journal history |
| Read | GET | `/audit` | Owner audit history |
| Read | GET | `/rentals/availability` | Available rental fleet for a date interval |
| Business | POST | `/onboarding` | Select activities and start one trial |
| Business | POST | `/organisation/profile` | Business name and primary activity |
| Business | POST | `/branches` | Create a branch within purchased limits |
| Business | POST | `/staff/memberships` | Grant membership to a host-verified subject |
| Business | POST | `/staff/{memberId}/disable` | Disable staff access |
| Business | POST | `/staff/{memberId}/enable` | Enable staff within capacity |
| Business | POST | `/capital` | Record owner capital |
| Business | POST | `/estimate` | Entered-rate landed cost estimate |
| Business | POST | `/billing/quotes` | Create a pinned itemised quote |
| Business | POST | `/billing/cancel` | Cancel access with history preserved |
| Business | POST | `/billing/checkout` | Initialise configured hosted checkout |
| Business | POST | `/marketplace/requests` | Queue a public-safe publication request |
| Rentals | POST | `/rentals` | Create a rental record |
| Rentals | POST | `/rentals/{recordId}/checkout` | Checkout a rental record |
| Rentals | POST | `/rentals/{recordId}/return` | Return a rental record |
| Rentals | POST | `/rentals/{recordId}/cancel` | Cancel a rental record |
| Rentals | POST | `/rentals/{recordId}/reschedule` | Reschedule a rental record |
| Rentals | POST | `/rentals/{recordId}/deposit` | Deposit a rental record |
| Rentals | POST | `/rentals/{recordId}/deduction` | Deduction a rental record |
| Rentals | POST | `/rentals/{recordId}/refund` | Refund a rental record |
| Haulage | POST | `/haulage` | Create a haulage record |
| Haulage | POST | `/haulage/{recordId}/assign` | Assign a haulage record |
| Haulage | POST | `/haulage/{recordId}/dispatch` | Dispatch a haulage record |
| Haulage | POST | `/haulage/{recordId}/deliver` | Deliver a haulage record |
| Haulage | POST | `/haulage/{recordId}/cancel` | Cancel a haulage record |
| Workshop | POST | `/workshop` | Create a workshop record |
| Workshop | POST | `/workshop/{recordId}/start` | Start a workshop record |
| Workshop | POST | `/workshop/{recordId}/complete` | Complete a workshop record |
| Workshop | POST | `/workshop/{recordId}/cancel` | Cancel a workshop record |
| Operations | POST | `/fleet/assets` | Create a rental/haulage fleet asset |
| Operations | POST | `/fleet/assets/{assetId}/status` | Update maintenance/archive status |
| Operations | POST | `/service-invoices` | Issue service invoice |
| Operations | POST | `/service-invoices/{invoiceId}/void` | Void unpaid unearned invoice |
| Operations | POST | `/service-invoices/{invoiceId}/credit` | Approve full invoice credit |
| Operations | POST | `/service-invoices/{invoiceId}/refund` | Confirm refund against a full credit |
| Operations | POST | `/receipts` | Record customer payment evidence |
| Operations | POST | `/receipts/{receiptId}/verify` | Independently verify customer receipt |
| Operations | POST | `/parts` | Create a branch product |
| Operations | POST | `/parts/{partId}/receive` | Receive stock and supplier payable |
| Operations | POST | `/parts-orders` | Reserve stock and create order |
| Operations | POST | `/office-expenses` | Submit operating expense |
| Operations | POST | `/transfers` | Request parts branch transfer |
| Parts | POST | `/parts-orders/{orderId}/fulfil` | Fulfil a parts order |
| Parts | POST | `/parts-orders/{orderId}/return` | Return a parts order |
| Parts | POST | `/parts-orders/{orderId}/refund` | Refund a parts order |
| Expenses | POST | `/office-expenses/{expenseId}/approve` | Approve operating expense |
| Expenses | POST | `/office-expenses/{expenseId}/reject` | Reject operating expense |
| Expenses | POST | `/office-expenses/{expenseId}/post` | Post operating expense |
| Expenses | POST | `/office-expenses/{expenseId}/pay` | Pay operating expense |
| Transfers | POST | `/transfers/{transferId}/dispatch` | Dispatch full parts transfer |
| Transfers | POST | `/transfers/{transferId}/receive` | Receive full parts transfer |
| Transfers | POST | `/transfers/{transferId}/cancel` | Cancel full parts transfer |
| Dealer | POST | `/vehicles` | Create dealer sale vehicle |
| Dealer | POST | `/bills` | Record vehicle acquisition/landed cost |
| Dealer | POST | `/invoices` | Create dealer cash/instalment sale |
| Dealer | POST | `/payments` | Record dealer payment evidence |
| Dealer | POST | `/payments/{paymentId}/verify` | Independently confirm dealer payment |
| Dealer | POST | `/invoices/{invoiceId}/handover` | Confirm vehicle handover |
| Dealer | POST | `/vehicles/{vehicleId}/readiness` | Readiness dealer vehicle |
| Dealer | POST | `/vehicles/{vehicleId}/price` | Price dealer vehicle |
| Dealer | POST | `/vehicles/{vehicleId}/publish` | Publish dealer vehicle |
| Dealer | POST | `/vehicles/{vehicleId}/reserve` | Reserve dealer vehicle |
| Dealer | POST | `/vehicles/{vehicleId}/release` | Release dealer vehicle |
| Platform | GET | `/platform/catalogue` | Privileged catalogue read |
| Platform | POST | `/platform/catalogue` | Publish a catalogue version |
| Platform | GET | `/platform/subscribers/{tenantId}` | Privileged subscriber usage/read |
| Platform | POST | `/platform/subscribers/{tenantId}/activate` | Record independently verified billing activation |
| Platform | POST | `/webhooks/paystack` | Signed raw-body Paystack ingress |

## Examples

Rental-only registration:

```json
{"name":"Example rental business","modules":["RENTAL"],"primary_module":"RENTAL","mode":"SAAS"}
```

Dealer + Rentals quote:

```json
{"modules":["DEALER","RENTAL"],"primary_module":"RENTAL","tier":"STARTER","mode":"SAAS","branches":1,"users":3,"capacities":{"DEALER":20,"RENTAL":5}}
```

Publish synthetic test prices (CATALOG_ADMIN only; integer kobo):

```json
{"expected_version":1,"tier":"STARTER","monthly_minor":{"CORE":10000,"RENTAL":20000},"reason":"Synthetic test fixture; not an approved commercial price"}
```

Create a fleet asset before a booking. The booking uses `branch_id`, `asset_id`, `customer_id`, `start_at`, `end_at`, `daily_rate`, `deposit`, `driver_name` and `agreement`. Checkout/return require `version`, `odometer`, `fuel_percent`, `condition` and `acknowledgement`. Deposit/refund uses `version`, decimal `amount`, unique `reference` and independent `confirmation`; deduction requires `reason` and `acknowledgement`.

Haulage uses `branch_id`, `asset_id`, `customer_id`, `title`, `origin`, `destination`, `cargo`, `start_at`, `end_at` and decimal `quote`. Assign a verified DRIVER member before dispatch. Delivery requires `proof_of_delivery`; a driver can deliver only their assigned job.

A service invoice uses `module`, `job_id`, optional decimal `discount`, entered `tax_percent` and owner `override_reason` if discount exceeds policy. A full credit requires `version`, `reason` and customer `acknowledgement`; the resulting customer refund is confirmed separately.

Expiry blocks new bookings/intake while preserving authorised collection, completion, return, credit and refund obligations. No route creates a live social post, runs an auction or proves external marketplace delivery.
