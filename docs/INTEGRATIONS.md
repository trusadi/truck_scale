# Integration boundary

## Public demo runtime

This package is deliberately self-contained. It requires no application credentials or custom environment variables.

| Capability       | Public demo behavior                                                | Live connection                     |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------- |
| SAP S/4HANA      | Creates 20 fictional PO, STO, and DO appointments                   | Disabled                            |
| Weighbridge      | Supports deterministic simulation and reason-required manual entry  | Disabled                            |
| Email            | Saves and displays exception-notification previews                  | Disabled; no message is sent        |
| Staff identity   | Every visitor acts as `Demo supervisor`                             | No sign-in or access control        |
| Driver tracking  | Random, expiring, renewable QR URL with a limited read-only payload | Enabled on the deployed Netlify URL |
| Workflow storage | One shared, strongly consistent Netlify Blobs record                | Enabled                             |

The public-demo server does not read identity headers, passwords, SMTP settings, SAP secrets, or scale tokens. Do not add real integration credentials to this edition.

## Production boundary

A production solution should be a separately secured edition, not a configuration change to this public demo.

### SAP S/4HANA

An approved SMF integration layer should supply scheduled appointments and expected net cargo weight. The application needs a normalized payload containing:

- stable visit or appointment ID;
- plant and delivery direction;
- scheduled date and time;
- PO, STO, or delivery-order number and item;
- supplier, source, or destination label;
- material and description;
- quantity, unit, and authoritative expected net weight in kilograms;
- optional assigned truck, driver, and carrier details; and
- source-system update timestamp/version for idempotent synchronization.

The production import must define how non-weight order units are converted to expected kilograms and who owns that conversion. Do not infer a production cargo weight from bags, cases, or pieces without approved material master data.

### Weighbridge

Use a site-local adapter or approved gateway that converts the specific scale protocol into an authenticated HTTPS response. A captured reading should contain the weight, unit, stable device ID, capture time, stability/validity indicator, and unique transaction ID. The server—not the browser—must validate and save it idempotently.

Manual entry should remain an exception path with a mandatory reason and appropriate audit and approval policy.

### Email and decisions

The production server should send weight-exception notifications through an SMF-approved mail service using an idempotency key. Email should point an authenticated supervisor to the application; approval and rejection should be recorded in the application, not inferred from a normal email reply.

### Identity and authorization

Before live use, add corporate SSO/MFA and enforce roles on the server for every read and write. At minimum, distinguish administrator, site operator, and site/direction supervisor. The browser interface is not a security boundary.

### QR tracking

Keep driver pages read-only and disclose only operational progress. Production policy should define pass lifetime, renewal, revocation, rate limits, monitoring, personal-data handling, and whether the plate should be partially masked. Generate QR URLs only from an approved canonical HTTPS origin.

### Storage and operations

The demo uses a single JSON record and optimistic concurrency. Production design should address expected transaction volume, retention, immutable audit history, backups, recovery testing, monitoring, alerting, data residency, privacy requests, and separation between development, test, and production.

## Core workflow invariant

Inbound cargo uses loaded-first then empty weight; outbound cargo uses empty-first then loaded weight. In both cases:

`actual net cargo = loaded truck weight − empty truck weight`

The final result stores the tolerance rule version used at calculation time. A variance outside the inclusive allowed range blocks normal clearance until a supervisor approves or rejects it with a reason.
