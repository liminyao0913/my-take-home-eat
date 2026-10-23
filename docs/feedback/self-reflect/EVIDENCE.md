# Review evidence and reproduction notes

Date: October 23, 2026. Application baseline: `0353851`. Findings are in [REVIEW.md](REVIEW.md). No application, migration, dependency, or deployment configuration was changed during this review.

The subsequent remediation and invitation release is recorded separately in [current verification](../../verification.md#remediation-and-invitations-release). The measurements below remain evidence for the reviewed baseline.

## Checks executed

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test:unit` | 24 passed. |
| `npm run test:integration` | 27 passed. |
| `npm run test:e2e` | 23 passed in 1.8 minutes; one unaccelerated ten-minute case skipped by the regular configuration. Includes actual restart/backup restoration. |
| `npm audit --omit=dev --json` | No reported production advisories. |
| `npm audit --json` | Four moderate package entries from one underlying development-tool advisory. |
| `npm outdated --json` | Compatible Next.js / eslint-config-next patch 16.4.3 available; other reported upgrades were majors. No packages changed. |
| GitHub Actions references | Official `checkout`, `setup-node`, and `upload-artifact` repositories all resolve the configured `v7` tag. No GitHub CI run was triggered. |
| Isolated probes and load | Results committed in [review-results.json](evidence/review-results.json). |

Node 24.22.1 was explicitly selected for the commands. Browser and HTTP checks used the existing production build from the completed profile release; the application source had not changed since that build. A new build was unnecessary for this documentation-only review and would have interrupted the running host. The earlier actual ten-minute result is historical release evidence, not a newly repeated check.

## Isolation and artifacts

Routine Playwright tests used the repository's temporary SQLite paths on ports 3100/3101. Additional review probes started one separate production-mode Next.js process bound to `127.0.0.1:3102`, with `DATABASE_PATH` under a newly created `/tmp/lets-eat-self-reflect-*` directory and `APP_ORIGIN=http://127.0.0.1:3102`. The extra process and temporary databases were removed when each probe finished. No production deadlines, profiles, rooms, or credentials were changed.

The then-live HTTP prototype was used only for read-only HTML headers and health checks. Its HTML response had no CSP or X-Frame-Options header. No router/firewall examination, external attack, provider call, or Google API request was performed.

Committed evidence contains no browser tokens or real meal records:

- [review-results.json](evidence/review-results.json): environment, probe outcomes, load percentiles, simultaneous-deadline result, and integrity checks.
- [dependency-audit.json](evidence/dependency-audit.json): audit summary, dependency chain, advisory URL, installed affected version, and available patch.

Additional local artifacts are retained under the ignored `.data/self-reflect-20261023/` directory: `review-probes.mjs`, `readiness-probe.mjs`, their server logs, raw audit output, `lan-headers.txt`, `e2e.log`, and `browser-report/index.html`. They are workspace evidence rather than files required to run the application. The descriptions below specify the probes independently of those scratch scripts.

## Probe procedures

### Oversized create request

Against a fresh isolated database, post a valid create-room payload using tomorrow's date and UTC start times. Include 200 otherwise valid options plus an ignored string field containing 2 MiB of text. Supply the test server's own Origin header. The serialized body was 2,120,058 bytes. Response: 201; rows persisted: 200 options. Do not interpret this as an established maximum request size or an observed memory-exhaustion event.

### Read request during an external write lock

Create one ordinary room. Open a second SQLite connection in a separate process and hold `BEGIN IMMEDIATE` for 1,200 ms, then roll it back. While it holds the lock:

1. Read that room directly through a third SQLite connection: 0.16 ms.
2. Send an authenticated HTTP room GET: 1,238.8 ms, status 200.
3. After 100 ms, send HTTP health: 1,140.38 ms, status 200.

The direct read demonstrates that WAL reads themselves remain available; the application's identity cleanup requests the conflicting write lock. The health request waits behind the synchronous handler in the same Node process. This was a controlled lock, not a disk-failure or a normal-load error.

### Forgetting during a delayed vote body

Create a room and retain its cookie. Open a raw HTTP PUT to that room's option-response endpoint with valid headers, the cookie, and the correct Content-Length, but send only `{"choice":` initially. Wait until the request has authenticated. For deterministic observation, the fixture set the valid credential's expiry to 178 days ahead; its renewal back to 180 days proved identity resolution had occurred before completing the body.

Call DELETE `/api/profile` with the same cookie and wait for its 200 response. Then send the remainder, `"approve"}`, on the pending request. That request returned 200, contained `me`, and stored an approval after forgetting. Send a new vote using the same old cookie: it returned 401. A fresh room read had `me: null`.

The prerequisite is possession of a credential while it is still valid and a request begun before revocation. This does not demonstrate arbitrary profile access or a fresh-request revocation bypass.

### Stale My meals status

In one browser context, create a room and open `/me`; wait for its Open card. Finish the room using authenticated API requests from that context. Dispatch a window focus event and wait for the resulting `/api/profile` response. The card remained Open. Reading `/api/profile/rooms` immediately afterward returned `state: closed`. The list has no focus refresh of its own.

### Incomplete-schema readiness

Create a separate temporary SQLite file by applying committed SQL migrations 0000 and 0001 only, with no real data. Start the current Next.js server directly against it, deliberately bypassing the normal migration-first startup. `/api/health` returned 200/ok; `/api/profile` returned the generic 500/SERVER_ERROR response. The expected corrected behavior is 503 readiness until all required schema changes exist.

## Load method and limits

Seed each room through real HTTP create/join calls. Each group has three options, eight distinct browser-cookie identities, and no saved preference dimensions. Schedule one GET per participant every three seconds, staggered over that interval, plus one approval per participant during each 30-second run. Consume every response body. A participant skips a scheduled read if its previous request is still pending, matching the current client behavior; neither run skipped any polls.

The 20-group run completed 1,600 polls and 160 votes. The 100-group run completed 8,000 polls and 800 votes. Every measured response was 200. Response durations include loopback HTTP and reading the response body. RSS samples cover only the app server process, sampled every 100 ms, not the load generator or Chromium.

After both runs, set the 100 test rooms' deadlines to a shared past cutoff in the temporary database, then request all 100 simultaneously. Check the winner against each room's stored approval totals/proposal order and check `closedAt` against the fixture cutoff. All 100 matched. Integrity was `ok` and there were no foreign-key errors.

This is one short run per load level, on an unconstrained local host with a warmed second case. It does not model slow clients, hostile bodies, time-preference scoring, hundreds of real browser renderers, large historical archives, multi-day activity, low-memory hosting, or network outages. It does not establish a maximum capacity or service-level guarantee. The review's growth concerns are explicitly based on source inspection where those cases were not measured.
