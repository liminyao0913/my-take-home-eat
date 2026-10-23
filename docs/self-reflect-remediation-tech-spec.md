# Self-review remediation and Render release

Status: implemented and verified locally and on Render, October 23, 2026. Work branch: `fix/self-reflect-render`, starting from `9834f5e`. Implements the findings in [the self-review](feedback/self-reflect/REVIEW.md); it does not implement the broader next-features plan. The user subsequently authorized configuring the existing Render service and adding service version information. Those delivery changes are recorded in verification. The user has now authorized all remediation below, publication of the feature branch, and deployment and verification on Render.

The user has selected Render at **https://lets-eat-ba8e.onrender.com/**. This supersedes the earlier LAN-only delivery decision. Keep localhost development, SQLite, automatic browser identity, and the existing voting rules. Do not add accounts, email, Google discovery, notifications, PostgreSQL, Redis, or a separate backend.

Implementation checkpoint: bounded uploads and admission, transactional room limits, transaction-time credential checks, read-only identity lookup, bounded background expiry cleanup, and a 100 ms HTTP SQLite busy timeout are implemented. All 81 unit/integration tests, TypeScript, and ESLint pass locally. Regressions cover delayed uploads after forgetting, expiry across an external write lock, read availability during contention, participant churn, oversized legacy rounds, and bounded cleanup. Bounded history, startup readiness, headers/logging, dependency review, and the regular browser scenarios are also implemented and locally verified. The constrained 20-group capacity gate and P1 three-browser local validation also pass. The local unaccelerated ten-minute release check passed. The user additionally authorized the P1 invitation-completeness feature: optional headcount, organizer-only missing-invitee confirmation, and preserved automatic deadline. All 30 local browser scenarios are verified across the regular and real-duration runs. Hosted smoke, P1 three-browser validation, invitation completeness, real ten-minute closure with missing invitees, and persistence across an actual Render restart all pass. Current results and operating setup are recorded in [verification](verification.md#remediation-and-invitations-release) and [deployment](deployment.md). F8 retains the documented development-only esbuild advisory exception; the production audit is clean.

## 1. Deployment baseline and immediate recovery

Use one Next.js Node process and one SQLite database on a persistent disk. Render API and SSH inspection confirmed **one `1c-2g` instance in Virginia: 1 CPU and 2 GiB RAM**. With the user's setup authorization, a **1 GB persistent disk** was attached at `/var/data`, preserving the compute allocation. The [Blueprint](../render.yaml) now matches those settings. The earlier 0.5 CPU / 512 MB proposal is superseded.

Configure the **existing service**, without creating another service:

| Setting | Value |
| --- | --- |
| Source | `https://github.com/liminyao0913/my-take-home-eat`, release branch `fix/self-reflect-render`, automatic deploys off |
| Node | `24.22.1`, from `.node-version` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:host` |
| Environment: `APP_ORIGIN` | `https://lets-eat-ba8e.onrender.com` — no trailing slash |
| Environment: `DATABASE_PATH` | `/var/data/lets-eat.sqlite` |
| Disk mount | `/var/data`; verify a disk is actually attached |
| Health Check Path | `/api/health` |
| Instances/processes | One; retain Next's binding to `0.0.0.0` and Render's supplied `PORT` |

The Blueprint and the configured service set `APP_ORIGIN` explicitly. Render also provides `RENDER_EXTERNAL_URL`, but the app does not automatically substitute it for an unset origin. `.env.local` is deliberately untracked; its absence on Render is normal. Render supplies environment variables directly. [Render environment variables](https://render.com/docs/environment-variables).

Initial deployment failures, subsequently corrected through the Render API:

- Home and demo returned 200, but health returned 503 and profile returned 500. The owner's log reports `no such table: profiles`: the runtime database lacks required schema. Check migration execution **and** whether migration and server use the same database path.
- A real browser create request returned 403 `WRONG_ORIGIN`: the running origin configuration did not match the HTTPS address.
- A subsequent owner-supplied deploy log places `npm run start:host` in the **Build Command** field. It runs migrations and starts Next without building `.next`, so deployment fails. Put build and start commands in their separate fields above. Migrations during build do not prepare a runtime-mounted database.

The initial readiness failure was distinct from review F5: health correctly failed here, whereas F5 reproduces a partially migrated database that incorrectly passes. Deployment configuration is now corrected; F5's complete migration/schema check is now implemented and covered by partial-schema regression tests.

Use startup logs to verify `Database migrations applied.` before Next starts. First require health 200 and an anonymous profile GET 200; then exercise create/join. An existing database must be backed up before migration. Do not delete a database, run ad hoc schema SQL, or weaken Origin checks to hide these errors. [Deployment/recovery procedure](deployment.md).

## 2. Resource model and capacity target

Keep a single instance and scale its CPU/memory vertically when measurements justify it. Render disks attach to one instance, are unavailable during build/pre-deploy, and cause a brief deployment interruption. An ephemeral filesystem is insufficient for durable meals. [Render disk constraints](https://render.com/docs/disks).

Initial acceptance target: **20 active groups × 8 participants**, three options each, polling every three seconds, with ordinary votes/preferences and overlapping deadlines. The earlier 100-group loopback run used a 24-CPU, 62.2-GiB workstation; it does not establish capacity on Render. More allocated resources improve headroom but do not correct authorization races, unlimited input, or unnecessary write locks.

Measure a production build under the confirmed CPU/memory allocation, using a disposable database first. Run 20 groups for ten minutes, then a simultaneous-deadline burst. Record request counts, latency percentiles, error codes, event-loop delay, RSS, CPU, database/WAL size, and winner correctness. Release gates: zero unexpected errors or lost accepted writes; p95 ordinary API latency below 1 second; health below 1 second; steady RSS below 75% of allocated memory and no upward trend or restarts. These are targets, not measured hosted results. Raise load to 50/100 groups only after the initial gate passes on an isolated environment.

Use Render's metrics and logs plus application timing; do not infer process memory/CPU from public HTTP responses. Monitor disk usage at 70%/85% and leave space for WAL, migrations, and a temporary backup. The allocation is confirmed. Both the initial remediation and final invitation builds passed 600-second runs under matching enforced 1 CPU / 2 GiB local limits for 20 groups of eight. The capacity runner allows 16 MiB GC/runtime variation between steady-window RSS medians after a two-minute warm-up; record the actual change and full samples rather than claiming long-term leak freedom. This does not measure Render network or disk performance.

## 3. F1 — bound requests, room growth, and admission

Implement shared limits in the existing contract/server layers and show useful errors without losing drafts. Initial defaults:

| Resource | Proposed bound |
| --- | --- |
| JSON body | 128 KiB after decoding; reject unsupported content encodings |
| Body read | 10-second deadline; cancel abandoned/oversized streams |
| Options | 20 current options per room/round; applies to create, add, and new round |
| Participants | 32 distinct participant records per room, including departed people; rejoining the same record remains valid |
| Round history | 100 rounds per room; after that, create a new room rather than grow the archive |
| Service admission | 100 open rounds and 10,000 stored rooms initially; enforce under the write lock |
| Request budget | Single-process global buckets: 300 reads/second, 30 writes/second, 10 new rooms/minute; bursts twice those values |
| Existing credential | 60 writes/minute and 3 creates/minute; cap/expire limiter entries |

The body budget permits the ordinary 20-option payload with the existing field lengths. Count bytes while reading; Content-Length is only an early rejection optimization. Apply admission before expensive parsing/database work. Limit incomplete body readers to 32 concurrently so slow requests cannot accumulate without bound. Exempt health from application rate buckets. Return 413 for body overflow, 408 for body timeout, 429 with `Retry-After` for temporary admission/rate limits, and 409 with an actionable message for persistent room/history capacity. Invalid individual fields retain 400 responses.

Option/participant counts and service quotas must be checked inside the transaction, including concurrent create/join/add requests. Deleting options must not bypass request limits; leaving must not allow unlimited new participant records. Count open rounds by their stored deadline, so lazy finalization does not consume admission forever. Existing oversized records must remain readable and correctly finalizable; do not truncate votes or frozen results. Inspect their sizes before release and include any exceptions in capacity verification.

A bounded in-memory limiter is sufficient for this one-process deployment; its short-term budgets reset on restart, while SQLite capacity checks remain durable. Different browsers can evade per-credential limits, so global admission is also required. Do not trust an arbitrary `X-Forwarded-For` value for a security decision. IP-based limits require a verified Render forwarding contract and spoofing test; they are not assumed by this first implementation. Shared links remain usable without login. These controls bound application work; they do not promise protection from all network-level denial of service.

Test large/chunked/multibyte bodies, misleading lengths, slow/disconnected senders, collection-bound races, participant churn, bucket cleanup, and eight legitimate participants sharing an address. Run abuse cases only against isolated databases, not the live service.

## 4. F2 — authorize at the transaction boundary

In body-bearing routes: check Origin and admission, read the bounded body, validate the schema, then resolve identity. Do not retain an authorization decision across an awaited body read.

Every mutation of existing room or profile data must validate credential expiry/revocation **inside its transaction after acquiring the write lock**, using the current clock, before checking participant ownership and changing rows. Cover votes, preferences, readiness, leave, option changes, finish/new round, profile edits/import/removal, and the response's private snapshot. Token creation for a new browser is separate from permission to edit an existing participant. A forgotten token may never regain its old participant identity.

Retain the same anonymous public room view, legacy adoption rules, and explicit forgetting behavior. Shared contributions remain. Cookie renewal must recheck that the credential is still valid and must not revive a forgotten credential through a cached request result.

Regression: begin a delayed-body vote with a valid credential, complete forgetting elsewhere, then finish the vote. It must return 401 without changes or private inputs. Also expire the credential while a request waits for a write lock, and cover profile writes. Existing fresh-replay, cross-room, and stale-round tests remain required.

## 5. F3/F5 — read paths, maintenance, startup, and readiness

**Reads:** remove unconditional `pruneExpiredProfiles` transactions from identity and profile reads. Use read-only expiry checks. Renew a valid profile credential only when its daily renewal is due, using a conditional write that cannot overwrite revocation. Normal polls with a current credential must not acquire a write lock for identity.

**Cleanup:** use one bounded maintenance pass in the single app process, at most once per minute, outside the synchronous request handler. Delete expired personal child records in batches of at most 100 rows per table; remove parent profiles only after children are cleared, so a large cascade cannot defeat the batch limit. Preserve revocation hashes. Reject expired credentials immediately even before physical cleanup. A due pass may be scheduled from incoming activity; no notification worker or separate service is needed, and idle cleanup does not determine authorization.

**Contention:** keep transactions short. Reduce the HTTP connection's synchronous busy timeout from five seconds to an initial 100 ms and return a retriable 503/`Retry-After` for lock contention. Do not spin or repeatedly retry synchronously. Migration/backup commands use their own connections. Re-run the review's external-writer test: a routine read should stay available; a competing write should either succeed promptly or fail cleanly without holding health for seconds. Explicitly test deadline and expiry checks after a lock is acquired.

**Startup/readiness:** continue migration-first startup; abort startup on migration failure. Validate `APP_ORIGIN` as an exact origin and require an HTTPS non-local origin and an explicit database path on Render. Fail with a clear configuration error instead of silently choosing localhost or a temporary database. Check startup database writability using a small transaction that is rolled back.

`/api/health` must verify the required migration level/schema, including profile tables, and execute a cheap database read. Return 200 only when ready and 503 otherwise, with no internal SQL/path details. It must not prune, migrate, or finalize rooms. Test an empty database, migrations 0000/0001 without 0002, a complete database, and a database access failure. Emit one sanitized startup record containing the release commit, schema version, and configured origin so deployed evidence can be tied to a revision. Render uses the configured health path to assess readiness. [Render health checks](https://render.com/docs/health-checks).

## 6. F4/F6 — bounded history and fresh personal lists

Separate lightweight summaries from details; do not build history cards by calling `RoomService.get` once per entry.

| API/UI boundary | Target behavior |
| --- | --- |
| `GET /api/profile/rooms` | At most 20 summaries: title, role, date/round, state, and winner summary; no option arrays, personal signals, or archive arrays. Keep the existing offset contract; allow `limit=3` for RecentMeals. |
| `GET /api/rooms/:roomId` | Current round, current inputs, and archive count; historical payloads leave the three-second polling response. |
| `GET /api/rooms/:roomId/rounds?beforeRound=…` | Add bounded archive reads to the existing rounds route: ten outcomes at a time. Public room-link access remains unchanged. |
| `GET /api/profile/rooms/:roomId/ideas?beforeRound=…` | Authorized personal reuse details, at most ten rounds per page; hidden or forgotten membership cannot read them. Keep the existing single-idea endpoint. |
| Recommendations | Keep the latest-20-round/180-day ranking semantics, without settling every expired room during each request. |

Paginate/query summaries first. Materialize only the selected page's expired rooms, rechecking credential/room state in each finalization transaction. Recommendations may settle at most 20 most-recent eligible expired rounds per request before selecting the latest 20; use deadline/closed time and the same deterministic tie-break ordering, so older expired rooms cannot displace newer history or require an unbounded scan. Audit query plans and add only indexes justified by these access paths. Keep finalization plus personal signal capture atomic. Test many expired rooms and tie ordering against a reference implementation.

Compute vote counts/reasons and participant response flags in one pass rather than repeatedly filtering the vote array. F1's option/round limits bound new archives and personal signal arrays. Existing legacy data needs the preservation checks described above. Use query-count and response-size assertions for 20 versus 2,000 historical rooms and a 100-round room, plus correctness checks; do not rely only on fast timing on a powerful workstation.

Refresh My meals and RecentMeals on visible focus and relevant successful mutations. Cancel obsolete responses and refresh the first page without duplicating old entries. Keep saved-preference drafts in independent state; refresh must not remount/reset that form. A new round or finish in another tab becomes visible on return. Error/retry states must retain drafts and current list content.

No automatic deletion of shared history is introduced. Room/round admission bounds growth while we define retention explicitly; revocation tombstones remain. At capacity, explain the limit and stop new growth. Backups and disk monitoring are required, rather than treating the 180-day profile expiry as a database retention policy.

## 7. F7/F8 — hosted security and dependency maintenance

Render's HTTPS origin supersedes the old public-HTTP transport boundary. Verify HTTP redirects to HTTPS and that an actual create/join response issues an HttpOnly, Secure, SameSite=Lax cookie. The redirect passed in the initial probe. After deployment repair, a real create/join flow verified the Secure, HttpOnly, SameSite=Lax credential. Frame protection and the application hardening are implemented; the hosted suite verifies response headers. Keep exact Origin validation and private/no-store API responses. Do not accept all forwarded origins to accommodate deployment mistakes.

Add frame protection to HTML responses: CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Test the app, demo, and client navigation; avoid introducing a broad script policy that breaks Next hydration. Do not log cookies, private preferences, full room links, or request bodies. Retain only route templates, status, duration, error code, and a request correlation identifier.

Update Next.js and eslint-config-next together to the compatible patch identified by the review, after checking the registry at implementation time. Re-run build and browser checks. Investigate the development-only esbuild advisory through supported drizzle-kit/toolchain updates; do not apply the audit's suggested older drizzle-kit blindly. Verify migration generation and populated migrations after any tooling change. Keep the production audit and native SQLite version check distinct. No major TypeScript/ESLint/runtime migration is required by this work.

## 8. Local and hosted verification

The current Playwright configuration starts localhost:3100 with a temporary database. Several helpers edit deadlines in that local file; restart/restore tests also control a local process. **Changing its baseURL to Render would be incorrect.**

Keep that suite for decision, race, migration, ownership, abuse, and persistence checks. Add a separate `tests/hosted` suite/config during implementation with a required `HOSTED_BASE_URL`, no `webServer`, no SQLite/process-control imports, one worker, and isolated browser contexts. Fail rather than fall back to localhost when the URL is missing. `npm run test:hosted` is now implemented in `playwright.hosted.config.ts` with the required public-only boundary.

Hosted smoke is low volume and uses only clearly named disposable rooms through normal APIs:

1. Check health/profile readiness, redirect, expected origin, and demo. Stop stateful smoke if readiness fails.
2. Create one labeled test room, copy its exact HTTPS invite, join from another context, add an idea, save distinct preferences, and submit approvals.
3. Verify cross-browser counts, private-input isolation, readiness/early finish, identical result, My meals, returning suggestions, and reload/cookie continuity. Confirm an unrelated Origin is rejected.
4. Run a separate real ten-minute round for release verification, without clock or database edits.
5. After the owner performs a planned restart/redeploy, reuse the same browser storage and test-room link to verify durable identity, inputs, history, and result. Public URL access alone cannot prove a persistent disk is attached.

No public delete-room or clock-control endpoint exists or should be added for tests. Record test-room identifiers in private artifacts; forgetting removes only personal data, so shared test rooms remain unless removed later by a narrowly scoped maintenance action. Do not claim complete cleanup through forgetting. Do not run load/abuse/restore tests against the live URL: use a separate temporary service/database matching the Render allocation.

Expose `/api/version` with the package version and full deployed Git commit, independently of database readiness; show the version in the shared header. Use `RENDER_GIT_COMMIT` for the deployment revision and `null` when unavailable, rather than inventing a local revision. Record the deployed commit, service resource allocation, timestamps, result counts, and screenshots. Keep cookie-bearing storage/traces private and out of Git; commit only sanitized results. Release results are recorded in [verification.md](verification.md#remediation-and-invitations-release).

## 9. Implementation sequence and completion

| Stage | Work | Completion evidence |
| --- | --- | --- |
| 0 — delivered | Correct the existing Render build/start/origin/disk settings | Runtime migrations, health/profile 200, hosted create/join, secure cookies, actual redeploy persistence, and allocation verified in the delivery record. |
| 1 — delivered | F1 input/admission limits and F2 authorization | Isolated abuse, race, expiry, and ownership regressions pass. |
| 2 — delivered | F3 bounded reads/maintenance and F5 readiness | Lock probe, incomplete-schema tests, startup/restart and backup restore pass. |
| 3 — delivered | F4 summaries/pagination and F6 refresh | Large-history bounds, deterministic recommendations, multi-tab freshness, preserved drafts. |
| 4 — delivered | F7 headers/cookies, F8 compatible updates, documentation | Build/audits and existing unit/integration/browser suites pass; docs distinguish targets from evidence. |
| 5 — delivered | Deploy a tested commit and run hosted release checks | Low-volume multi-browser smoke, real deadline, confirmed restart durability, and resource measurements recorded. |

Commit each completed stage on this branch. The user has authorized switching the linked Render branch to `fix/self-reflect-render`; keep automatic deploys off and deliberately deploy tested commit SHAs. Local setup now uses `http://localhost:3000` and a localhost-bound server; update the untracked local origin accordingly. Render configuration and the requested version feature preceded the implemented remediation. Do not mark remaining findings resolved until their acceptance evidence is recorded.
