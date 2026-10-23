# Verification

Latest completed verification: October 23, 2026, on `fix/self-reflect-render`. Current setup uses **localhost:3000** locally and **https://lets-eat-ba8e.onrender.com** publicly, with separate SQLite databases. The stack is Node 24.22.1, Next.js 16.4.3, SQLite 3.53.4, and Playwright Chromium. Earlier prototype, deployment-recovery, and version-only observations below are historical records, not current setup instructions.

## Remediation and invitations release

The self-review application fixes F1–F7 are implemented, along with the compatible Next.js patch for F8. P1 group validation and invitation completeness were subsequently authorized and implemented. The broader next-features plan remains deferred.

Local evidence for invitation commit `c248d63`: 81 unit/integration tests, TypeScript, ESLint, migration generation with no drift, and a production build pass. All 29 regular browser scenarios pass (2.2 minutes), including the P1 three-browser and invitation journeys, HTTP limits, privacy, history refresh, and actual local restart/backup restoration. Desktop confirmation and 375-pixel result screenshots were visually inspected. The final application also passed the separate unaccelerated ten-minute local decision test: all 30 local browser scenarios are verified across the regular and full-duration runs. Capacity, hosted smoke/P1, restart continuity, and both real-deadline checks pass.

The pre-invitation Render backup contains five rooms, passes integrity and foreign-key checks, and matches its remote SHA-256. It is retained privately in `.data/backups/pre-invitations-c248d63/`. The local production systemd service is enabled and healthy on localhost only; migration retained all original shared fields across five rooms, eight participants, six options, three responses, and the empty archive. Integrity and foreign-key checks pass. The independent daily off-host backup timer is enabled for 04:15 America/Los_Angeles retaining seven dated daily copies and checking disk thresholds; see [deployment](deployment.md). Render deployment `dep-dbds9lbl550s7387m5eg` is live at `c248d636327fc45d11285e1c8aff7d7d4895c7b6`. SSH verified all five migrations and the original values in all nine application tables against the pre-deployment backup (five rooms / seven participants / nine options / four responses). Integrity and foreign-key checks passed; runtime cgroups confirm 1 CPU / 2 GiB and disk usage is 1.67%. No existing shared or personal data was reset.

The first constrained capacity run passed with 20 groups / 160 participants for 600 seconds, no errors, lost writes, missed polls, restarts, or OOMs. Ordinary p95 was 4.177 ms, simultaneous-deadline p95 242.606 ms, and steady RSS maximum 232,632,320 bytes. [Sanitized measurements](feedback/self-reflect/evidence/remediation-capacity-20261023.json) distinguish these local resource-constrained results from hosted network/disk behavior. The final invitation build passed its own 600-second run: 34,280 requests, 2,040 accepted writes, no errors/lost writes/missed polls/restarts/OOMs. Ordinary p95 was 4.422 ms, deadline-burst p95 301.683 ms, health maximum 120.863 ms, and steady RSS maximum 229,404,672 bytes (218.8 MiB). Steady-window median RSS increased 9.8 MiB, within the predeclared 16 MiB runtime allowance; this short run does not establish long-term memory behavior. [Final-build capacity evidence](feedback/self-reflect/evidence/invitation-capacity-20261023.json).

Hosted checks on the deployed application now pass: two-browser smoke (16.8 s), P1 three-browser group interaction (16.8 s), and invitation completeness with mobile layout and copied attendance (9.4 s), 44.5 s total. The first hosted smoke asserted before the second vote finished; traces confirmed both writes returned 200. The test was corrected to wait for saved state, with no application change. Private generated reports are excluded from ESLint so repeat verification does not lint bundled trace-viewer assets.

A deliberate Render restart replaced instance `m7wz5` with `g5gtj`; health recovered and the saved-browser persistence test passed (4.0 s). Both identities, private inputs, saved preferences, personal history, suggestions, and the exact frozen result survived. The separate real ten-minute hosted case also passed (10.1 minutes), spanning that restart with two joined of four expected. Both browsers received the same two-approval winner at the unchanged original deadline; `closedEarly=false`, `invitationOverride=false`, and a post-deadline vote was rejected. [GitHub Actions for the deployed application](https://github.com/liminyao0913/my-take-home-eat/actions/runs/40020195643) and [the subsequent test-harness commit](https://github.com/liminyao0913/my-take-home-eat/actions/runs/40021134946) also passed. The latter changes tests and lint ignores only; the serving application remains `c248d63`.

The full dependency audit retains four moderate package entries for one development-only esbuild advisory through the latest stable drizzle-kit; the production audit is clean. The affected esbuild server is not used. [Recorded maintenance exception](deployment.md#dependency-maintenance).

[Sanitized release evidence](feedback/self-reflect/evidence/invitations-render-release-20261023.json) records the serving commit, settings, P1 results, deadline timestamps, preserved data, restart, and backup policy. Private artifacts are `.data/hosted/invitations-c248d63-verified/` (regular and restart runs), `.data/hosted/invitations-c248d63-deadline/`, `.data/local-invitations-regular-report/`, and `.data/local-invitations-deadline-report/`. No hosted clock or database deadline was modified. Five labeled test rooms remain, including the first smoke attempt; no real rooms were deleted. The temporary capacity process/database were removed, while the local production service and daily backup timer remain enabled.

## Render baseline and self-review remediation

**Historical checkpoint, before the remediation release above.** Statements about unimplemented fixes, the linked `master` branch, and unchanged prototype settings describe that earlier deployment.

Work branch: `fix/self-reflect-render`, based on `9834f5e`. The [technical spec](self-reflect-remediation-tech-spec.md) defines proposed fixes for F1–F8 and the hosted release gates. The user subsequently authorized Render setup and a small version feature. The service settings/Blueprint were corrected; the requested header version and `/api/version` are separate from the proposed review fixes. No dependency, migration, or local environment change was made.

The URL was tested directly from the development machine through curl and headless Playwright Chromium, using real HTTPS requests, a desktop viewport, and a 375-pixel phone viewport. The latest complete baseline probe started at **2026-10-23 18:22:55 UTC**. [Sanitized results](feedback/self-reflect/evidence/render-baseline-20261023.json).

| Hosted check | Observed result |
| --- | --- |
| HTTPS home | 200; create form visible. |
| HTTP entry | 301 to the HTTPS hostname. |
| `/api/health` | 503, `{"status":"unavailable"}`. |
| Anonymous `/api/profile` | 500, generic `SERVER_ERROR`. |
| Demo | Vote winner, preference-only winner, and all-excluded result passed; zero room API requests during the demo. |
| One valid create submission | 403 `WRONG_ORIGIN`; exact error visible, name/place drafts preserved. No test room was created. |
| My meals on phone viewport | Error/retry state visible after profile failure; no horizontal overflow. Personal history could not be tested. |
| Browser runtime | No uncaught page errors in the completed probe. Server/API failures above remain failures. |
| Secure identity cookie, join/vote, saved defaults/history, real deadline | Not verified on Render: creation/readiness failed and no identity cookie was issued. |
| Restart durability and resource capacity | Not verified on Render; requires runtime disk/settings access and a planned restart, plus an isolated capacity environment. |

The owner supplied a runtime log with `SqliteError: no such table: profiles`, confirming missing schema in the database used by the app. A subsequent supplied deploy log checked out `9834f5e` from `master` but ran `npm run start:host` in the **Build Command** field; it failed because `.next` had no production build. That log identifies a failed deployment attempt, not proof of the revision currently serving requests.

The [deployment guide](deployment.md#readiness-and-release-identity) gives the correction: build with `npm ci --include=dev && npm run build`, start with `npm run start:host`, set the exact HTTPS `APP_ORIGIN`, and point `DATABASE_PATH` at an attached persistent disk. Subsequent authenticated API/SSH inspection confirmed a 1 CPU / 2 GiB Virginia instance, unset origin/database environment values, an empty fallback SQLite file, no disk, and no health-check path. Those findings informed the recovery recorded below.

Local artifacts are in the ignored `.data/render-readiness-20261023/` directory: the probe script, JSON result, and home/demo/create-error/My meals screenshots. The create-error screenshot was visually inspected. The probe made only labeled test submissions, all rejected; no cleanup or production database edits were performed. No load, credential-race, or destructive test ran against Render.

The preceding [self-review evidence](feedback/self-reflect/EVIDENCE.md) records the unchanged baseline's local tests. Those results did not override the hosted failures. The proposed permanent hosted runner is not yet implemented; the existing suite still owns local temporary databases and processes. The ad hoc hosted probes and the version feature's fresh local checks are recorded below.

### Recovery after authorized Render access

The user supplied SSH access and authorized Render CLI account access to complete setup. API inspection confirmed the misplaced build/start commands, absent environment variables and health path, a `1c-2g` Virginia instance, and no attached disk. SSH confirmed a 2,147,483,648-byte memory limit and an empty fallback SQLite file. A consistent copy of that empty file was saved off-host before configuration changed.

The existing service now has the documented build/start commands, exact HTTPS origin, `/var/data/lets-eat.sqlite`, a new 1 GB disk at `/var/data`, `/api/health`, and automatic deploys off. Compute size and instance count were retained. Deployment of `9834f5e` succeeded at 18:34 UTC; runtime logs confirmed migrations before startup. Subsequent SSH checks found all three migrations, the mounted disk, valid integrity, and no foreign-key errors. The updated Blueprint passed Render CLI validation.

A real Playwright smoke at 18:35 UTC passed creation, full HTTPS clipboard invite, joining from a separate phone context, participant-added options, private/default preferences, concurrent approvals, early finish with identical results, mobile reload continuity, My meals, returning suggestions, and unrelated-Origin rejection. The issued cookie is Secure, HttpOnly, and SameSite=Lax. There were no uncaught browser errors. Two clearly labeled test rooms were created; the second exercised the real ten-minute preference-only case described below. Those shared test rooms remain; no public room-deletion endpoint was added.

Evidence: [render-deployment-20261023.json](feedback/self-reflect/evidence/render-deployment-20261023.json). Private room identifiers, browser storage, screenshots, and scripts stay in `.data/render-live-smoke-20261023/`. A consistent pre-version backup was copied off-host and passed integrity/foreign-key checks; it includes all rows, including a separate user-created room. No real meal data was removed or rewritten, and the prototype database was not copied to Render.

### Version information and local checks

The requested version feature adds a header link and `/api/version`, returning the package version (`0.1.0`) and full `RENDER_GIT_COMMIT`, or `null` if unavailable. The endpoint is uncached and independent of SQLite, so it identifies a release even if readiness fails. Remaining self-review application fixes are still proposed.

Fresh typecheck/lint, 24 unit tests, 27 integration tests, a production build, and all 23 regular browser cases passed with the version change. The regular suite took 1.9 minutes and skipped only its separate ten-minute local case. Build/browser checks used an isolated source copy, leaving the running prototype build intact. Additional checks passed for a 375-pixel version label without overflow, correct JSON/no-store headers, a null local commit fallback, and version availability while health returned 503 against an unmigrated test database.

The version feature was pushed on `fix/self-reflect-render` and deployed explicitly at **`e84208ba2a714cc08536ab3ef856144b003a8e34`**. Render confirmed it live at 18:45 UTC. The linked branch remains `master`, with automatic deploys off; deploying that explicit commit does not merge the feature branch.

Hosted checks after deployment passed:

- `/api/version` returned `0.1.0` and the exact deployed commit with `Cache-Control: no-store`; `/api/health` returned 200/ok.
- The header showed the version and matching commit tooltip; the 375-pixel room/result page had no horizontal overflow. The screenshot was visually inspected.
- Both saved browser contexts retained their participant IDs, saved defaults, options, private preferences, and the exact frozen early result across the actual Render redeploy.
- The second room retained its original **600,000 ms** duration and deadline. With all room pages closed before expiry and no votes, both contexts later saw `Deadline Thai`, selected on preferences. `closedAt` was exactly **18:45:19.676 UTC**, `closedEarly` was false, and history/reload retained that result. No clock or database deadline was modified.

The final public-URL check completed at **18:46:02 UTC**. Sanitized results are in the deployment evidence JSON; private context state, the post-deploy script, local version probe, and screenshots remain in `.data/render-live-smoke-20261023/`. The full local browser report was preserved there from the isolated build. A recurring off-host backup schedule and capacity/load measurement on the Render allocation remain pending; the verified backup was a manual pre-deployment copy. This operational release does not claim that the remaining self-review application findings are fixed.

## Browser identity and personal history

**Historical prototype release evidence.** Current local setup uses localhost only.

The separate [identity/history plan](identity-and-history-plan.md) is implemented. No work from the broader next-features plan is included.

| Check | Outcome |
| --- | --- |
| TypeScript, ESLint, production build | Passed with the personal routes and UI. |
| Unit tests | 24 passed, including recommendation ranking, distinct-round counts, metadata, branches, areas, and the latest-20/180-day limits. |
| SQLite integration tests | 27 passed, including profile isolation, explicit defaults, atomic capture/rollback, new rounds, persistence, pagination, hidden history, legacy adoption, expiry, and revocation. |
| Regular browser suite | 23 passed in 1.8 minutes; the unaccelerated case runs separately. |
| Final UI refinement | After adding retry for a failed past-idea load, rebuilt production and reran all six profile browser journeys: 6 passed in 18.6 seconds. The retry preserves even an unfinished location-only draft and gives the reused option the new draft's time. Lint and TypeScript pass. |
| Returning-user flow | Create → explicitly save defaults → approve → close → My meals → change default name → add a past suggestion → create a fresh room. Existing inputs/results stay unchanged; new room has fresh timing, one participant, no choices, and the original ten-minute duration. |
| Identity and privacy | Same-named browsers have separate profiles. Invite viewing/demo creates no profile. Foreign history/idea access is rejected. Forgetting and server expiry revoke old cookies while preserving shared results and participants. |
| History and reuse | Created/joined/left status, one entry across new rounds, previous outcomes, explicit removal/rejoin, and one-time legacy import verified. No-vote results can be manually reused but produce no recommendation signal. |
| Network and areas | Failed suggestion requests can be retried without losing manual inputs; old replies are discarded after area changes. Other past areas require an explicit action. |
| Production migration | Consistent backup made before migration 0002. All original rows retained exactly: 4 rooms, 7 participants, 5 options, 3 responses, and the empty round archive. No automatic profiles/import. Integrity and foreign-key checks pass. |
| Prototype smoke | Passed on the original HTTP host, using independent desktop/phone sessions: creation/join, remembered preferences, shared early result, separate histories, recommendations, fresh new meal, reload, and origin rejection. No browser console errors. Desktop and mobile screenshots inspected. |
| Cleanup | Only the two temporary smoke rooms and their profiles/credentials removed. Original shared rows exactly match the pre-migration backup. No production deadline was edited. |
| Unaccelerated deadline | Passed in 10.0 minutes. Both sessions received the same frozen winner with the original 600,000 ms deadline and one personal approval/group-pick signal each. |
| Extended restart and restore check | Passed. Default name/cuisine/budget, guest ownership, personal history, frozen result, and recommendation counts survived restarting the app and serving the consistent backup. The two release tests passed in 10.2 minutes. |

Current local evidence (ignored by Git):

- Regular browser report: `.data/browser-profiles-regular-report/index.html`.
- Unaccelerated deadline and extended restore report: `.data/browser-profiles-deadline-report/index.html`.
- Final profile UI report: `.data/browser-profiles-final-ui-report/index.html` (also the latest `playwright-report/index.html`).
- Prototype smoke script and result: `.data/browser-profiles-lan-smoke.mjs`, `.data/browser-profiles-lan-smoke.json`.
- Screenshots: `.data/browser-profiles-my-meals-mobile.png`, `.data/browser-profiles-lan-home.png`, `.data/browser-profiles-lan-mobile.png`.
- Pre-migration backup: `.data/pre-browser-profiles-20261023.sqlite`; shared-row checksums: `.data/pre-browser-profiles-shared-rows.json`.

The first cleanup checksum assertion compared Python and JavaScript JSON serialization and reported a mismatch. Rechecking with the baseline serializer and direct row comparison confirmed every original row was unchanged; the smoke script now compares rows directly.

All 24 distinct browser scenarios are verified across the regular, full-duration, and final UI runs. The production process was restarted with the final build, and the two-browser prototype smoke passed again with its direct backup comparison. No remote CI or public-address run is claimed for this prototype release.

## UX review improvements

The six review improvements were verified on October 22 at the then-configured public address. They remain in the product; this section records the earlier HTTP prototype release. See the [review follow-up](feedback/REVIEW.md#implementation-follow-up) for the feature-to-test mapping.

| Check | Outcome |
| --- | --- |
| TypeScript, ESLint, production build | Passed with the new routes and UI. |
| Unit tests | 17 passed, including unknown restaurant fields and preference scoring. |
| SQLite integration tests | 17 passed, including readiness, reasons, early finish, repeat rounds, stale-round rejection, persistence, and populated original-schema migration. |
| Regular production-build browser suite | 17 passed in 1.4 minutes; the actual ten-minute case runs separately. |
| Unaccelerated deadline | Passed in 10.0 minutes. Two browser sessions received the same winner; the original 600,000 ms deadline was retained and the saved closing time equaled that deadline. All 18 browser scenarios are now verified. |
| Quick demo | Home → vote → result in under one minute without room API requests; vote, preference-only, and all-excluded outcomes verified. |
| Early finish | Three browser sessions; a newly joined unready participant prevents finishing; explicit confirmation freezes the same result for everyone without changing the stored deadline. |
| Recovery and repeat rounds | Constraint reasons synchronize; the alternative action focuses a single form; a new round retains link, identities, preferences, and history, clears responses/readiness, and rejects stale writes. A closed second browser detects the new round through polling. |
| Mobile | At 375 pixels, join comes before options for guests; voting precedes supporting panels after joining; preferences remain accessible; no horizontal overflow. |
| Restart and restore | Existing browser scenario passed again with the migrated schema and production build. |
| Production migration | Consistent backup saved before migration. Checksums over all original columns matched for 4 rooms, 7 participants, 5 options, and 3 responses; integrity and foreign-key checks passed. |
| Public URL smoke | Playwright on the app host exercised the public HTTP URL in two independent sessions: demo, creation, invite copy, join, constraints, alternatives, early result, same-link new round, private preference retention, reload persistence, stale writes, and origin protection. Desktop/phone screenshots inspected. |
| Smoke cleanup | Removed only the temporary test room; all original-data checksums still matched. No production deadline was edited. |

Current local evidence (ignored by Git):

- Regular browser report: `.data/ux-review-regular-report/index.html`.
- Full-duration deadline report: `.data/ux-review-deadline-report/index.html` (also the latest `playwright-report/index.html`).
- Public smoke assertions and outcome: `.data/ux-review-public-smoke.mjs` and `.data/ux-review-public-smoke.json`.
- Screenshots: `.data/ux-review-home.png`, `.data/ux-review-demo-result.png`, `.data/ux-review-public-mobile.png`.
- Pre-migration backup: `.data/pre-ux-review.sqlite`; original-column checksums: `.data/pre-ux-review-checks.json`.

## Original release and earlier fixes

| Check | Outcome |
| --- | --- |
| TypeScript and ESLint | Passed. |
| Unit tests | 16 passed: votes, preference scoring, exact ties, exclusions, and room-zone/DST conversion. |
| SQLite integration tests | 11 passed using fresh temporary files and the production migrations. |
| Production build | Passed. |
| Full release browser suite | 10 passed in 10.9 minutes, including the normal ten-minute round. |
| Final regular browser suite | 10 passed in 51.3 seconds, including network recovery; the previously verified ten-minute case was intentionally skipped. |
| Application restart | Open room inputs and guest identity survived; the closed result survived another restart. |
| Backup restoration | A backup of the running database served the same room, identity, and frozen result in a new process. |
| Deployment startup command | Applied migrations to a fresh local database, passed readiness, and accepted room creation using the configured origin. |
| Render Blueprint | Validated against Render's official JSON Schema. No deployment performed. |
| Origin configuration (historical) | Reproduced a browser/server origin mismatch and verified its configuration fix through creation, copied invites, joining, voting, and reload continuity. Unrelated origins still received 403. Retired addresses and setup instructions are omitted; current setup uses localhost and Render. |
| Copy button fix | Reproduced the manual selection field before the fix. Clipboard regressions for unavailable and denied Clipboard API access, plus the existing mobile meal-summary journey, passed. All read actual clipboard contents. Type checking, lint, and a fresh production build passed. After restart, verified that one click on the public HTTP site copies the entire invite URL, shows “Copied ✓”, restores focus, and leaves no text field. |

The full-duration browser test used two isolated browser sessions, retained the original ten-minute deadline, and confirmed that the saved closing time equals that deadline. It did not alter the database deadline or mock the clock. Routine browser cases accelerate only their own room in an isolated test SQLite file; the application has no deadline-changing endpoint.

Browser journeys cover concurrent votes from separate people, preference-only decisions, clearing blocks, all-blocked results, ownership and origin tampering, guest-cookie continuity across rooms, leaving, deterministic ties, closure with all browsers closed, and a phone viewport with keyboard voting and a copied summary. Network failure and retry preserve preference drafts.

Local evidence:

- Full-duration release report: `.data/release-report/index.html` (preserved from the actual release run).
- Copy regressions now run as part of the regular browser suite listed above.
- Browser screenshots and failure traces: `test-results/`.

Use `npx playwright show-report .data/release-report` or `npx playwright show-report` to view the reports. These generated artifacts and all database files are ignored by Git. Test sources and the CI workflow are committed.

Reproduce with the commands in [README.md](../README.md). `npm run test:e2e:release` includes the slow, real-duration case. The regular browser suite skips that one case and tests the remaining journeys with real HTTP and SQLite.
