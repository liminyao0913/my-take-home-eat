# Verification

Latest verification: October 23, 2026 using Node.js 24.22.1, Next.js 16.4.2, SQLite 3.53.4, and Playwright Chromium. The user's LAN origin `http://192.168.86.52:3000` is preserved; managed hosting remains deferred.

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
