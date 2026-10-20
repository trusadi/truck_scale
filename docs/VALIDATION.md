# Validation record

Validated on **2026-09-08** with Node.js **22.23.2**, Next.js **16.3.4**, Netlify CLI **27.5.0**, Netlify Build **36.4.6**, and Netlify Next.js Runtime **5.15.13**.

## Final results

| Check                      | Result     | Coverage                                                                                                                                                                                                                                                       |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                   | Pass       | Clean lockfile installation on Node.js 22                                                                                                                                                                                                                      |
| `npm run typecheck`        | Pass       | TypeScript application and server contracts                                                                                                                                                                                                                    |
| `npm test`                 | Pass — 8/8 | Weight math, inclusive tolerance boundaries, inbound/outbound order of weighing, exception decisions, queue rules, storage concurrency, QR privacy/expiry/rotation, and absence of application sign-in artifacts                                               |
| `npm run build`            | Pass       | Optimized Next.js production build                                                                                                                                                                                                                             |
| `npm run test:integration` | Pass — 1/1 | Built HTTP application, direct public access, ignored forged identity, same-origin write enforcement, shared saved changes, stale-write conflict, decision flow, public QR response minimization, QR renewal, disabled email submission, and sample-data reset |
| `netlify build --offline`  | Pass       | Netlify detected the Next.js runtime, rebuilt the application, and bundled the server handler function                                                                                                                                                         |

## Production route manifest

```text
ƒ /
○ /_not-found
ƒ /api/operations
ƒ /api/tracking/[token]
ƒ /track/[token]
```

There is no `/login` page and no `/api/auth` route. The application has no password library, application user list, session secret, or application environment file.

## Public-demo safeguards verified

- A visible notice says that no sign-in is required and the workflow is public/shared.
- The interface warns users not to enter real or confidential information.
- Live SAP, weighbridge, and email capabilities report as disabled.
- The server refuses physical-scale capture and live email submission.
- Writes require a matching same-origin request and reject a simulated cross-site request.
- Optimistic revision and ETag checks reject stale or concurrent writes.
- The QR API returns a minimal driver view with `no-store`, `no-referrer`, and `noindex` protections.
- QR tokens contain 192 random bits, expire after seven days, and can be rotated.
- The application and driver routes carry `noindex, nofollow` headers.
- The reset operation restores fictional orders and default rules while preserving safe concurrency behavior.

## Scope note

No live Netlify deployment was performed while preparing this downloadable package. The Netlify build was run locally in offline mode; publishing requires the package owner to authorize their own Netlify account. Browser-based visual QA was not requested, so validation used compilation plus production HTTP integration tests.

This validation is for a public prototype using fictional data. It is not a production security certification and does not authorize connection to SMF systems.
