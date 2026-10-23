# Whole-system review

Reviewed October 23, 2026, against commit `0353851`. Scope: application code, SQLite access, browser behavior, dependencies, deployment configuration, tests, and documentation. The findings below describe the unfixed baseline at review time.

Follow-up: the user subsequently selected Render hosting. The [remediation spec](../../self-reflect-remediation-tech-spec.md) maps F1–F8 to implementation and acceptance checks, and [hosted verification](../../verification.md#remediation-and-invitations-release) records delivery. Render HTTPS and Secure cookies now address F7's transport prerequisite; the F1–F7 application fixes are now implemented on `fix/self-reflect-render`, with local regression/browser evidence. F8's compatible patch update is applied; the remaining development-only upstream advisory is documented. Final deployment/capacity acceptance now passes and is recorded in verification, including the subsequently authorized P1 invitation and three-browser checks. The prototype observations and capacity measurements below remain historical evidence for the reviewed deployment. Retired network addresses and setup recommendations have been removed; current operation is documented for localhost and Render.

The service can support several groups on the current machine. Bounded tests with 20 and 100 groups of eight completed without request errors. **Keep SQLite for this small-group workload.** The immediate problems are missing resource limits, an in-flight credential-revocation race, and work that grows without bounds as history accumulates. The present implementation should not be treated as ready for unrestricted public traffic.

All mutation probes and load tests used temporary databases and a separate loopback-only server. The running prototype service was not restarted or reconfigured. Detailed methods and limitations are in [EVIDENCE.md](EVIDENCE.md); measured results are in [review-results.json](evidence/review-results.json).

## Findings and priority

P1 means address before opening the service to untrusted public traffic. P2 means a concrete correctness, reliability, or growth issue to fix next. P3 means maintenance or additional hardening. These are engineering priorities, not CVSS scores.

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| F1 | P1 | No application body-size limits, collection limits, or request throttling | A 2,120,058-byte create request with 200 options was accepted and stored. |
| F2 | P2 | A request authenticated before forgetting can still change a room afterward | A delayed vote returned 200 after forgetting completed; a fresh replay correctly returned 401. |
| F3 | P2 | Ordinary reads acquire a write lock and can block the shared Node process | A 1.2-second external write lock delayed a room read by 1.24 seconds and health by 1.14 seconds. |
| F4 | P2 | History pagination does not bound the work or response size inside each page | Full room snapshots, all previous rounds, and all personal room signals are loaded per history entry. Static finding. |
| F5 | P2 | Readiness can report healthy with an incomplete schema | With migrations 0000/0001 only, health returned 200 while the profile endpoint returned 500. |
| F6 | P2 | Personal meal lists remain stale after focus | The server had a closed result while My meals still displayed Open after a confirmed focus refresh. |
| F7 | P1 for public access | HTTP exposes the durable browser credential to network interception | The reviewed prototype used HTTP; the cookie is Secure only for an HTTPS origin. Known operating limitation. |
| F8 | P3 | One development-tool advisory and an available framework patch need maintenance | Production audit: zero reported advisories. Full audit: four package entries from one esbuild advisory. |

### F1. Bound resource use before allowing untrusted traffic

[Request parsing](../../../src/server/http.ts#L29) reads the complete JSON body. [Create and new-round schemas](../../../src/lib/contracts.ts#L32) have no maximum option count. Creation, joining, and adding options have no room/participant quotas or rate limits. String lengths and preference-array lengths are bounded, which is useful, but these checks do not bound a whole request or a room.

The isolated probe submitted 200 valid options plus a large unknown field. It received 201 and persisted all 200 options. Zod strips the unknown field after parsing; the server still has to receive and parse it. This demonstrates admission of oversized work, not an observed production outage. Repeated anonymous requests can consume disk and the shared process's CPU/memory. Supplying the expected Origin is easy for a non-browser client; Origin checking provides browser CSRF protection, not abuse prevention.

The original [product plan](../../plan.md#L112) intentionally avoided option caps. That trusted-group simplification needs a resource budget before public exposure. Choose explicit limits for body bytes, options per room/round, participants, active rooms, and request frequency. Enforce streamed-body limits as well as any Content-Length check, reject oversized requests with 413, and throttle excess work with 429. Account for friends sharing one network/NAT when setting IP limits. [OWASP DoS guidance](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html) supports bounding input and resource consumption.

Acceptance: oversized and chunked requests are rejected before large parsing/insertion; excessive room/option creation is bounded; legitimate groups sharing an address still work.

### F2. Recheck credentials when the mutation executes

The [vote route](../../../src/app/api/rooms/[roomId]/options/[optionId]/response/route.ts#L9) resolves identity before awaiting the body. The [identity helper](../../../src/server/identity.ts#L9) caches that result for the request. After the body arrives, [participant authorization](../../../src/server/rooms.ts#L34) checks the participant's hash and active flag, but does not recheck credential expiry/revocation. Forgetting intentionally preserves participant rows.

Reproduction: start an authenticated vote with an incomplete JSON body; establish that identity validation ran; forget the browser through another request; then finish sending the vote body. Forgetting returned 200, the delayed vote also returned 200, and its response still contained `me`. A subsequent fresh request using the old cookie returned 401, and a fresh room read had no identity. **This is an in-flight authorization window, not an unrestricted replay or a way to impersonate someone by name.**

Parse a bounded body before resolving identity, and validate the credential again inside the mutation transaction after acquiring the lock. Apply this consistently to room writes. Preserve the shared contributions as promised; deleting participant rows is not the remedy.

Acceptance: a request paused before completion cannot mutate or return private participant inputs after its credential is forgotten or expires. Keep the existing fresh-replay tests too.

### F3. Keep the normal read path free of global cleanup writes

Every [identity resolution](../../../src/server/identity.ts#L14) starts an immediate transaction for global profile cleanup, including anonymous room reads. [ProfileService.get](../../../src/server/profiles.ts#L14) repeats cleanup for profile requests. [The database driver](../../../src/server/db.ts#L8) is synchronous with a five-second lock timeout.

In a controlled test, another connection held a write lock for 1.2 seconds. A direct SQLite read took 0.16 ms, but an HTTP room read took 1,238.8 ms; a health request started 100 ms later took 1,140.38 ms. The waiting read's cleanup transaction blocked the Node event loop. The current single-process deployment normally avoids a competing app writer; this probe models maintenance or a future second process, not a failure seen in the normal load run.

Validate credentials with reads, renew only when due, and perform expiry cleanup in bounded work rather than every poll. Expired credentials must still be rejected immediately. Keep write transactions short and handle lock contention deliberately. SQLite WAL allows readers alongside a writer, but still permits only one writer; moving the same WAL database onto a network filesystem is not a scaling solution. [SQLite WAL documentation](https://sqlite.org/wal.html), [better-sqlite3's synchronous API](https://github.com/WiseLibs/better-sqlite3).

Acceptance: a non-finalizing read does not request a write lock simply to identify its caller; bounded maintenance does not stall unrelated groups or health checks for the full busy timeout.

### F4. Bound history work and data growth

The 20-room page size is not a complete bound:

- [settleRooms](../../../src/server/profiles.ts#L63) materializes every expired visible room for that profile before pagination or recommendation selection.
- [historyRoom](../../../src/server/profiles.ts#L70) calls the full room service for each entry, then fetches all personal signals for that room. The closed-room path performs about seven SELECTs per entry by inspection, or roughly 140 for a full page before profile/list queries.
- [Room snapshots](../../../src/server/rooms.ts#L94) include every archived round on every poll. [Vote aggregation](../../../src/server/rooms.ts#L66) repeatedly scans the vote array for each option and reason.
- [RecentMeals](../../../src/components/recent-meals.tsx#L12) downloads this full history page to show three titles. Recommendations limit the number of rounds, but each stored round can contain an unbounded number of signals.
- Shared rooms, archived results, and revoked credential hashes have no cleanup policy. The 180-day idle profile expiry is not a shared-room retention limit.

Use a small summary query for lists, load/paginate older round details on demand, and bound expired-room materialization. Aggregate counts in one pass or in SQL when room sizes justify it. Define retention before changing deletion behavior; credential tombstones currently prevent revival through old participant records and must not simply be removed.

Acceptance: list/poll response size and work remain bounded for a long-lived room/profile, and old-round detail is fetched only when requested. This review measured fresh, small rooms; it did not establish long-lived-history capacity.

### F5. Make readiness check the required schema

[Health](../../../src/app/api/health/route.ts#L5) only selects an ID from `rooms`. A temporary database with committed migrations 0000 and 0001, but without 0002, returned `200 {"status":"ok"}`. `/api/profile` returned 500 because the profile tables were absent. The spec currently says readiness verifies migration state.

The normal `start:host` command runs migrations first, so this is a missed-migration/startup-path detection gap, not a failure in the running migrated service. Check the required migration version or required schema features without mutating them in the health route.

Acceptance: the incomplete-schema fixture returns 503; a fully migrated database returns 200; responses contain no internal database errors.

### F6. Refresh history independently of profile-form drafts

[MealHistory](../../../src/components/my-meals.tsx#L35) and RecentMeals load once on mount. [useProfile](../../../src/components/use-profile.ts#L24) refreshes profile data on focus, but an unchanged profile ID does not reload either list.

The browser probe opened My meals, finished its room through another request in the same browser context, and triggered focus. The profile request completed, but the card still said Open while the history API said closed. A normal reload corrects it. This can also hide another tab's newly created room or new round.

Refresh the history on visible focus and relevant mutations, or provide an explicit refresh control with clear freshness behavior. Keep this separate from editable saved-preference form state so refreshing does not erase drafts.

Acceptance: closing/creating/restarting a room elsewhere is reflected on return to My meals; unsaved preference edits remain intact.

## Security posture and dependencies

### F7. Require encrypted transport for public access

The reviewed prototype used HTTP. Its bearer cookie grants editing access plus personal history/defaults for up to 180 idle days. [HttpOnly and SameSite are set](../../../src/server/identity.ts#L23), but Secure is conditional on HTTPS. A party able to intercept HTTP traffic can obtain a usable credential; HttpOnly does not encrypt it. [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#transport-layer-security).

This was a transport limitation of the prototype. Public access requires TLS, restricted direct insecure access, and the F1/F2 fixes. Render HTTPS and the later remediation address this finding; the original observation remains evidence for the earlier release.

The inspected HTML response also lacked CSP/frame restrictions. Frame-embedding protection is a sensible additional control before public exposure; no clickjacking or XSS exploit was demonstrated in this review. [OWASP framing guidance](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html).

### F8. Maintain dependencies without treating every newer version as a vulnerability

`npm audit --omit=dev --json` reported **zero production dependency advisories**. The full audit reported four moderate package entries, all tracing to **one** advisory through `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild 0.18.20`. The advisory concerns esbuild's development server; no use of that server was found in this app's production request path. The maintainer lists fixes starting at esbuild 0.25.0. [Maintainer advisory GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).

Investigate a supported toolchain update or upstream fix, and verify migration generation before adopting it. Do not blindly apply the audit's suggested downgrade of drizzle-kit to 0.18.1. The registry also reports Next.js and eslint-config-next 16.4.3 as compatible patch updates from 16.4.2; this review does not establish that the patch fixes a reachable security issue. [Next.js 16.4.3 release](https://github.com/vercel/next.js/releases/tag/v16.4.3). Newer TypeScript, ESLint, and Node type major versions are separate upgrade decisions; Node 24 remains the selected runtime.

Native SQLite was checked separately: the loaded version is 3.53.4, later than the 3.51.3 fix for the documented WAL-reset race. That specific older bug is not a finding here. [SQLite's WAL-reset advisory](https://sqlite.org/wal.html). Audit details are saved in [dependency-audit.json](evidence/dependency-audit.json).

Existing protections worth retaining:

- Random 256-bit browser tokens, hashed storage, random room IDs, HttpOnly cookies, and explicit revocation records.
- Exact Origin checks for writes, room-scoped participant/option ownership, and private/no-store API responses. Existing browser isolation and tampering checks passed again.
- Parameterized Drizzle queries, server-only database modules, React text rendering, and HTTP(S)-only place links with `noopener noreferrer`. The reviewed application does not fetch submitted restaurant URLs on the server.
- Atomic result/signal capture, round-version checks, deterministic scoring, and preservation of shared contributions when personal history is removed.

The shared link intentionally permits viewing/joining, and another browser can create another participant. Those are trusted-group product choices, not proof of verified human identity. No email lookup, login requirement, or public room directory should be introduced as an incidental fix.

## Scalability assessment

One production-mode Next.js process, SQLite/WAL, and separate cookie identities were exercised on the existing 24-logical-CPU, 62.2-GiB host. Each room had three options and eight simulated participants. Every participant polled once per three seconds, staggered across the interval, and submitted one approval during a 30-second run. These were HTTP clients, not hundreds of Chromium instances.

| Active groups | Simulated participants | Requests / second | Poll p95 | Vote p95 | Non-200 responses | Peak server RSS |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 160 | 58.66 | 3.02 ms | 9.51 ms | 0 / 1,760 | 268.5 MiB |
| 100 | 800 | 293.29 | 2.18 ms | 4.05 ms | 0 / 8,800 | 331.7 MiB |

A separate burst materialized 100 simultaneous deadlines: all 100 returned the expected winner and cutoff, with p95 321.51 ms and p99 354.29 ms. SQLite integrity and foreign-key checks passed afterward.

The second load case used a warmed process, which helps explain its lower latencies; it is not evidence that adding users makes the service faster. These short loopback runs establish useful headroom for ordinary small groups on this machine. They do **not** establish maximum capacity, WAN performance, a long-running SLO, performance on Render's proposed small instance, or resilience against oversized rooms, huge histories, disk exhaustion, or hostile traffic.

Scale within the current design by fixing F1/F3/F4 and measuring again. Visible closed rooms currently keep polling to detect new rounds; consider slower polling and error backoff while preserving that behavior. Multiple hosts with independent local SQLite files would diverge, and a shared network WAL file is unsuitable. There is no evidence from this review that the current product needs PostgreSQL, Redis, or a separate API service.

## Code quality and operations

The decision function is separate from persistence, contracts are shared, transactions enforce important boundaries, and tests use real SQLite and independent browser sessions. TypeScript, ESLint, 24 unit tests, 27 integration tests, and all 23 regular browser scenarios passed again. The ten-minute case was deliberately not repeated; its earlier successful release run is recorded in [verification.md](../../verification.md).

The main quality weaknesses are behavioral boundaries rather than missing abstractions: authorization spans the route/body-read/service boundary, history depends on full public-room snapshots, and profile/list refresh lifecycles differ. Fix these with focused tests before cosmetic restructuring. Several components also contain very long JSX lines, and past-idea conversion is duplicated in [CreateRoom](../../../src/components/create-room.tsx#L48); formatting and a small shared conversion helper would make later reviews easier, but are lower priority than the findings above.

The repository supplies backup/restore commands and tested restoration, but its deployment guide concentrates on deferred Render hosting. A reproducible local service/restart procedure, recurring off-host backup policy, disk-space monitoring, and request/error latency visibility are not provided as a complete operating procedure. OS-wide supervision, router/firewall rules, and external backup arrangements were not audited. Document and verify those before relying on the service for sustained use.

The existing tests missed the body-read/revocation interleaving, a missing profile migration at readiness, and personal-list freshness after focus. Passing the release suite established many functional behaviors; it did not establish abuse resistance or capacity.

## Outdated or conflicting documentation

At review time, README described the prototype deployment and browser profiles. The table records the documentation gaps found then; subsequent fixes and current localhost/Render setup are linked above.

| Document | Drift | Suggested correction |
| --- | --- | --- |
| [docs/plan.md:5](../../plan.md#L5), [116](../../plan.md#L116), [165](../../plan.md#L165) | Calls this the existing product, sends reusable preferences to the future plan, says all preferences are room-only, and defers saved profiles. | Link the implemented identity/history extension; distinguish reusable defaults from per-room copies; remove saved profiles from the current deferred list. |
| [docs/tech-spec.md:15](../../tech-spec.md#L15), [22](../../tech-spec.md#L22), [25](../../tech-spec.md#L25) | Says two pages, polling only while open, and Render as the hosting choice. Later text already describes demo/closed-room polling and deferred hosting. | List the current routes including `/me`, describe visible polling after closure, and document localhost setup separately from the selected Render deployment. |
| [docs/feedback/REVIEW.md:11](../REVIEW.md#L11) | The follow-up says the public address remains unchanged, despite a later change of canonical origin. | Mark that follow-up explicitly as historical and point to the current README/verification record. Preserve its dated screenshots and old test counts as historical evidence. |
| [docs/next-features-plan.md:3](../../next-features-plan.md#L3), [180](../../next-features-plan.md#L180) | Broadly calls recommendations unimplemented and still defers recent rooms, participation counts, and early finish, which later releases delivered. | Add a superseded/implemented-elsewhere note with links. Leave discovery, notifications, copying whole rooms, and other deferred work outside scope. |
| [docs/deployment.md:3](../../deployment.md#L3) | Explicitly describes future Render deployment, with no complete procedure for local operation. | Document localhost operation and Render deployment separately. |
| [docs/tech-spec.md:161](../../tech-spec.md#L161) | Promises readiness verifies migration state. | Fix F5 and keep the promise, or explicitly document the current limitation until it is fixed. |

`detail_decisions.md` and the older verification sections are chronological records; `APPROACH.md` is the current overview. Their past-tense milestones are not automatically stale; use a clear current-state pointer rather than rewriting history. No deferred feature implementation is proposed by this documentation review.

## Suggested next work

1. Fix F2 and add delayed-body revocation/expiry regressions. Add F1 limits and abuse tests before considering public access.
2. Fix F3 and F5, then repeat contention and readiness checks. Keep SQLite and verify the exact configured origin.
3. Bound history work and refresh personal lists. Test long-lived history, multiple tabs, and preservation of form drafts.
4. Reconcile the documentation inventory, update compatible tooling deliberately, and document localhost and Render operating procedures.

The HTTP/TLS decision in F7 is a prerequisite to untrusted public access, not a request to change the current deployment as part of this review.
