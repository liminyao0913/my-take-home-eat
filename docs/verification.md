# Local verification

Verified on October 22, 2026 using Node.js 24.22.1, Next.js 16.4.2, SQLite 3.53.4, and Playwright Chromium. Public hosting is deferred at the user's request.

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

The full-duration browser test used two isolated browser sessions, retained the original ten-minute deadline, and confirmed that the saved closing time equals that deadline. It did not alter the database deadline or mock the clock. Routine browser cases accelerate only their own room in an isolated test SQLite file; the application has no deadline-changing endpoint.

Browser journeys cover concurrent votes from separate people, preference-only decisions, clearing blocks, all-blocked results, ownership and origin tampering, guest-cookie continuity across rooms, leaving, deterministic ties, closure with all browsers closed, and a phone viewport with keyboard voting and a copied summary. Network failure and retry preserve preference drafts.

Local evidence:

- Full-duration release report: `.data/release-report/index.html` (preserved from the actual release run).
- Latest regular-suite report: `playwright-report/index.html`.
- Browser screenshots and failure traces: `test-results/`.

Use `npx playwright show-report .data/release-report` or `npx playwright show-report` to view the reports. These generated artifacts and all database files are ignored by Git. Test sources and the CI workflow are committed.

Reproduce with the commands in [README.md](../README.md). `npm run test:e2e:release` includes the slow, real-duration case. The regular browser suite skips that one case and tests the remaining journeys with real HTTP and SQLite.
