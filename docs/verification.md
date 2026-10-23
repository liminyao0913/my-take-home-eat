# Verification

Latest verification: October 23, 2026. The local release used Node.js 24.22.1, Next.js 16.4.2, SQLite 3.53.4, and Playwright Chromium. Render is now the selected public host. Its initial failures below were repaired, and the subsequent hosted smoke passed; the recovery/version checks are recorded separately. The existing LAN service and its configuration were not changed.

## Render baseline and self-review remediation

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

The [deployment guide](deployment.md#recover-the-observed-deployment) gives the correction: build with `npm ci --include=dev && npm run build`, start with `npm run start:host`, set the exact HTTPS `APP_ORIGIN`, and point `DATABASE_PATH` at an attached persistent disk. Subsequent authenticated API/SSH inspection confirmed a 1 CPU / 2 GiB Virginia instance, unset origin/database environment values, an empty fallback SQLite file, no disk, and no health-check path. Those findings informed the recovery recorded below.

Local artifacts are in the ignored `.data/render-readiness-20261023/` directory: the probe script, JSON result, and home/demo/create-error/My meals screenshots. The create-error screenshot was visually inspected. The probe made only labeled test submissions, all rejected; no cleanup or production database edits were performed. No load, credential-race, or destructive test ran against Render.

The preceding [self-review evidence](feedback/self-reflect/EVIDENCE.md) records the unchanged baseline's local tests. Those results did not override the hosted failures. The proposed permanent hosted runner is not yet implemented; the existing suite still owns local temporary databases and processes. The ad hoc hosted probes and the version feature's fresh local checks are recorded below.

### Recovery after authorized Render access

The user supplied SSH access and authorized Render CLI account access to complete setup. API inspection confirmed the misplaced build/start commands, absent environment variables and health path, a `1c-2g` Virginia instance, and no attached disk. SSH confirmed a 2,147,483,648-byte memory limit and an empty fallback SQLite file. A consistent copy of that empty file was saved off-host before configuration changed.

The existing service now has the documented build/start commands, exact HTTPS origin, `/var/data/lets-eat.sqlite`, a new 1 GB disk at `/var/data`, `/api/health`, and automatic deploys off. Compute size and instance count were retained. Deployment of `9834f5e` succeeded at 18:34 UTC; runtime logs confirmed migrations before startup. Subsequent SSH checks found all three migrations, the mounted disk, valid integrity, and no foreign-key errors. The updated Blueprint passed Render CLI validation.

A real Playwright smoke at 18:35 UTC passed creation, full HTTPS clipboard invite, joining from a separate phone context, participant-added options, private/default preferences, concurrent approvals, early finish with identical results, mobile reload continuity, My meals, returning suggestions, and unrelated-Origin rejection. The issued cookie is Secure, HttpOnly, and SameSite=Lax. There were no uncaught browser errors. Two clearly labeled test rooms were created; the second is the real ten-minute preference-only case, initially scheduled to close at 18:45:19 UTC.

Evidence: [render-deployment-20261023.json](feedback/self-reflect/evidence/render-deployment-20261023.json). Private room identifiers, browser storage, screenshots, and scripts stay in `.data/render-live-smoke-20261023/`. A consistent pre-version backup was copied off-host and passed integrity/foreign-key checks; it includes all rows, including a separate user-created room. No real meal data was removed or rewritten, and the LAN database was not copied to Render.

### Version information and local checks

The requested version feature adds a header link and `/api/version`, returning the package version (`0.1.0`) and full `RENDER_GIT_COMMIT`, or `null` if unavailable. The endpoint is uncached and independent of SQLite, so it identifies a release even if readiness fails. Remaining self-review application fixes are still proposed.

Fresh typecheck/lint, 24 unit tests, 27 integration tests, a production build, and all 23 regular browser cases passed with the version change. The regular suite took 1.9 minutes and skipped only its separate ten-minute local case. Build/browser checks used an isolated source copy, leaving the running LAN build intact. Additional checks passed for a 375-pixel version label without overflow, correct JSON/no-store headers, a null local commit fallback, and version availability while health returned 503 against an unmigrated test database.

Hosted version, real-deadline, and post-deployment persistence checks are in progress; they are not implied by the local passes above.

## Browser identity and personal history

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
| LAN smoke | Passed through `http://192.168.86.52:3000` on the host, using independent desktop/phone sessions: creation/join, remembered preferences, shared early result, separate histories, recommendations, fresh new meal, reload, and origin rejection. No browser console errors. Desktop and mobile screenshots inspected. |
| Cleanup | Only the two temporary smoke rooms and their profiles/credentials removed. Original shared rows exactly match the pre-migration backup. No production deadline was edited. |
| Unaccelerated deadline | Passed in 10.0 minutes. Both sessions received the same frozen winner with the original 600,000 ms deadline and one personal approval/group-pick signal each. |
| Extended restart and restore check | Passed. Default name/cuisine/budget, guest ownership, personal history, frozen result, and recommendation counts survived restarting the app and serving the consistent backup. The two release tests passed in 10.2 minutes. |

Current local evidence (ignored by Git):

- Regular browser report: `.data/browser-profiles-regular-report/index.html`.
- Unaccelerated deadline and extended restore report: `.data/browser-profiles-deadline-report/index.html`.
- Final profile UI report: `.data/browser-profiles-final-ui-report/index.html` (also the latest `playwright-report/index.html`).
- LAN smoke script and result: `.data/browser-profiles-lan-smoke.mjs`, `.data/browser-profiles-lan-smoke.json`.
- Screenshots: `.data/browser-profiles-my-meals-mobile.png`, `.data/browser-profiles-lan-home.png`, `.data/browser-profiles-lan-mobile.png`.
- Pre-migration backup: `.data/pre-browser-profiles-20261023.sqlite`; shared-row checksums: `.data/pre-browser-profiles-shared-rows.json`.

The first cleanup checksum assertion compared Python and JavaScript JSON serialization and reported a mismatch. Rechecking with the baseline serializer and direct row comparison confirmed every original row was unchanged; the smoke script now compares rows directly.

All 24 distinct browser scenarios are verified across the regular, full-duration, and final UI runs. The production process was restarted with the final build, and the two-browser LAN smoke passed again with its direct backup comparison. No remote CI or public-address run is claimed for this LAN release.

## UX review improvements

The six review improvements were verified on October 22 at the then-configured public address. They remain part of the current LAN release. See the [review follow-up](feedback/REVIEW.md#implementation-follow-up) for the feature-to-test mapping.

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
| LAN access configuration | Reproduced the localhost/LAN origin mismatch, set the browser-facing origin, and verified room creation, joining, and voting through the LAN address. Unrelated origins still receive 403. |
| Public address configuration | Set `APP_ORIGIN=http://24.130.34.221:3000` and restarted the app on port 3000. Playwright on the app host verified creation, the public invite URL and HTTP copy fallback, joining, vote propagation, and identity/preferences after reload through that URL. Unrelated origins still receive 403. Removed only the temporary verification room. |
| Copy button fix | Reproduced the manual selection field before the fix. Clipboard regressions for unavailable and denied Clipboard API access, plus the existing mobile meal-summary journey, passed. All read actual clipboard contents. Type checking, lint, and a fresh production build passed. After restart, verified that one click on the public HTTP site copies the entire invite URL, shows “Copied ✓”, restores focus, and leaves no text field. |

The full-duration browser test used two isolated browser sessions, retained the original ten-minute deadline, and confirmed that the saved closing time equals that deadline. It did not alter the database deadline or mock the clock. Routine browser cases accelerate only their own room in an isolated test SQLite file; the application has no deadline-changing endpoint.

Browser journeys cover concurrent votes from separate people, preference-only decisions, clearing blocks, all-blocked results, ownership and origin tampering, guest-cookie continuity across rooms, leaving, deterministic ties, closure with all browsers closed, and a phone viewport with keyboard voting and a copied summary. Network failure and retry preserve preference drafts.

Local evidence:

- Full-duration release report: `.data/release-report/index.html` (preserved from the actual release run).
- Copy regressions now run as part of the regular browser suite listed above.
- Browser screenshots and failure traces: `test-results/`.

Use `npx playwright show-report .data/release-report` or `npx playwright show-report` to view the reports. These generated artifacts and all database files are ignored by Git. Test sources and the CI workflow are committed.

Reproduce with the commands in [README.md](../README.md). `npm run test:e2e:release` includes the slow, real-duration case. The regular browser suite skips that one case and tests the remaining journeys with real HTTP and SQLite.
