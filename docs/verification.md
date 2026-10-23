# Verification

Verified on October 22, 2026 using Node.js 24.22.1, Next.js 16.4.2, SQLite 3.53.4, and Playwright Chromium. The existing computer now serves the app through its public address on port 3000; managed hosting remains deferred.

## UX review improvements

The six review improvements are implemented and running at the existing public address. See the [review follow-up](feedback/REVIEW.md#implementation-follow-up) for the feature-to-test mapping.

| Check | Outcome |
| --- | --- |
| TypeScript, ESLint, production build | Passed with the new routes and UI. |
| Unit tests | 17 passed, including unknown restaurant fields and preference scoring. |
| SQLite integration tests | 17 passed, including readiness, reasons, early finish, repeat rounds, stale-round rejection, persistence, and populated original-schema migration. |
| Regular production-build browser suite | 17 passed in 1.4 minutes; the actual ten-minute case runs separately. |
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
