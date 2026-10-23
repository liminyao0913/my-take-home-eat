# Approach and decisions

This is the running decision record for Let's Eat. Keep it updated as product and technical choices are made. Detailed product behavior lives in [docs/plan.md](docs/plan.md).

The current work is [self-review remediation and Render hosting](#self-review-remediation-and-render-hosting). Earlier sections retain the original decisions and verification history.

The broader brainstorming in [docs/next-features-plan.md](docs/next-features-plan.md) remains deferred. It is not the current release checklist; separately implemented features are documented in the identity/history plan.

The separate [identity and history plan](docs/identity-and-history-plan.md) records the October 23 discussion about remembered users, reusable preferences, personal room history, and suggestions for new meals. Work on the broader next-features plan remains deferred.

## Confirmed direction

- Start from zero and clarify product behavior before choosing technology.
- Serve 3–8 friends or coworkers choosing lunch or dinner soon.
- Share one link; require no account or sign-up.
- Let the creator suggest several meals and every participant add more.
- Let people vote and provide preferences; use preferences to choose when nobody votes.
- Favor a small first version and move to a technical spec once the product rules are clear.
- Use SQLite, as explicitly requested.
- Deliver a working product and verify it with end-to-end tests.
- Host publicly on Render at `https://lets-eat-ba8e.onrender.com`, using SQLite on one persistent disk. Local/LAN development remains supported; this supersedes the earlier local-only/public-IP hosting decisions.

## Original product baseline after the simplicity pass

These defaults resolve the brainstorming questions in favor of simplicity. They are working choices for the technical spec, not claims that every detail was separately approved.

| Decision | Reason and tradeoff |
| --- | --- |
| One room represents one meal date and general area. | Keeps scheduling focused; multi-date planning is deferred. |
| Each option combines a place and start time. | A winning option is immediately actionable; the same place at another time is a separate option. |
| Everyone enters options manually with a cuisine and price level. | Avoids restaurant integrations and missing-data scoring; inputs are participants' estimates. |
| Close automatically after a fixed ten-minute window. | One completion path, with no dependency on an organizer being present; there is no early finish or adjustable timer. |
| Show approval counts and let people approve multiple options. | Makes common ground visible; early votes may influence later voters. |
| Collect only cuisine, price-level, and start-time preferences. | Three optional inputs keep participation short; they are soft preferences, not automatic vetoes. |
| Use an explicit “Can't do this” flag for actual constraints. | An option with any flag cannot win. This preserves a simple exclusion rule but requires people to review each option themselves. |
| Score each person by the fraction of supplied preferences matched, then average across people with preferences. | Each person has equal influence; removes category weights and the earlier least-satisfied-person formula. |
| Votes take precedence, then preference score, then earliest-added option. | Produces an explainable and stable result; an exact tie favors the first proposal. |
| Freeze option details; authors can remove and replace their own options. | Avoids vote-reconfirmation workflows. Replacements start with no votes or flags. |
| Keep each room to one round: Open → Closed. | No reopening, retry state, or automatic recovery flow. If every option is excluded, a new room is needed. |
| Restore identity within the same browser, with no special organizer controls after creation. | Supports editing one's own inputs without account setup; identities are unverified and there is no cross-device recovery. |
| Allow a participant to leave, removing their decision inputs while keeping their proposals. | A person who is no longer attending should not influence the result. |
| Show live inputs and a final explanation, with no provisional preference rankings. | Keeps the open-room interface and scoring behavior small. |

## Deliberate limits

- “No exclusion flags” does not prove unanimous availability. Silent invitees may not have checked the options.
- A deadline may produce a no-winner result when all options are excluded or removed. We will not ignore constraints merely to produce a winner.
- The service does not verify dietary suitability, restaurant availability, or price estimates.
- The fallback uses a simple average. More sophisticated fairness rules should wait for evidence.
- Sign-up, profiles, discovery, reservations, payments, reminders, in-app chat, and recurring-group history are outside v1.

## Technical choices

The implementation details and verification gates are in [docs/tech-spec.md](docs/tech-spec.md).

| Decision | Reason and tradeoff |
| --- | --- |
| Next.js App Router, React, and TypeScript for the UI and backend. | One repository and deployment; Route Handlers expose the room API. |
| Tailwind CSS with semantic HTML and ordinary React state. | Keeps the small interface accessible without adding a component or global state framework. |
| SQLite through Drizzle and better-sqlite3. | Honors the database choice, provides migrations and typed queries, and needs no database server. |
| One Node.js 24 app with a local persistent database file. | Fits SQLite's storage model; run one service instance and keep transactions short. |
| Use the existing computer with public access on port 3000; retain Render with a persistent disk as a future deployment option. | The user initially chose local delivery, then supplied the public address for that computer. The prepared Render configuration remains available for future managed hosting. |
| A random HttpOnly guest cookie, with only its hash stored per room participant. | Supports identity and ownership without accounts; the shared link is distinct from the participant credential. |
| Poll the room every three seconds while visible, including after closure. | Sufficient for small groups; closed-room polling lets people see a new round start on the same link. |
| Enforce the persisted deadline on the server; save the result on the first request after expiry. | No worker or browser timer is required. Closure is effective at the deadline even when snapshot materialization happens later. |
| Immediate SQLite transactions for mutations and finalization. | Serializes competing changes and makes the deadline check and result write atomic. |
| Represent preference fractions in exact integer sixths. | Preserves the simple average while making ties independent of floating-point rounding. |
| Vitest for logic/database tests and Playwright for real browser journeys. | Verify a production build with real SQLite and separate participant sessions; include deadline and restart persistence. |
| Use the existing Git configuration for author and committer identity. | Keep commits attributed consistently with the user's configuration. |

## Validation and next steps

The product plan includes acceptance scenarios for voting, preference fallback, ties, exclusions, identity continuity, the deadline, and frozen results. Product targets are a room created in under a minute, a useful response in about thirty seconds, and resolution in ten minutes.

The technical spec defines the stack, four-table schema, API, deadline semantics, deployment, and implementation sequence. The foundation, room backend, and complete browser interface are implemented.

Foundation verification: generated and applied the four-table migration, passed type checking and lint, built Next.js for production, started it, and received a healthy database readiness response. Node 24.22.1 is pinned for the project.

Backend verification: 16 unit tests and 11 integration tests pass, as do type checking and lint. Tests use the committed migrations and temporary SQLite files. They cover scoring (including a tie that floating-point sums would misorder), time-zone changes, guest ownership, private inputs, idempotent votes, leaving, immutable results, and a separate worker holding a write lock across the deadline. A late write materializes and commits the result before returning its rejection. Independent connections and reopening the database preserve the saved result.

Successful room mutations return the updated snapshot, including deletions, so the UI can display acknowledged changes immediately. The voter count means people with at least one approval, including approvals on excluded options; excluded approvals are explained separately.

The interface uses a warm paper background, green controls, and clear meal cards. Browser-local defaults suggest a meal an hour ahead. Polling does not replace unsaved preferences or option drafts; mutations invalidate older reads. The countdown uses server time, while all admission and closure checks remain on the server.

Release browser verification: all 10 scenarios passed against the production build and actual SQLite in 10.9 minutes. The unaccelerated round kept its original 600,000 ms deadline and chose the same winner in two browser sessions. Application restarts preserved identity, options, votes, and the frozen result. A consistent live backup also restored that same result in another process. The suite covers concurrent votes, preference fallback, blocks, ownership/origin checks, identity continuity, ties, offline closure, and mobile keyboard use.

The final production build passed, then the expanded regular browser suite passed all 10 of its runnable cases in 51.3 seconds (the already-verified ten-minute case was intentionally skipped). Its additional network-failure test verifies draft preservation, successful retry, and reload persistence. In total, all 11 distinct browser scenarios have been verified. Final UI changes pause deadline-triggered refreshes while hidden and explain the group-wide block rule beside the voting controls, including on mobile.

The Render Blueprint validates against its official schema. Its startup command was exercised locally against a fresh database: migrations, readiness, origin handling, and room creation passed. CI configuration is provided; no remote CI run is claimed.

The user initially chose local delivery when asked about the deployment repository. Managed hosting is deferred and is no longer a completion requirement for this implementation. Future deployment configuration and recovery instructions remain in `render.yaml` and `docs/deployment.md`. No remote or paid resources have been created; subsequent public access uses the existing computer, as recorded below.

Local delivery is complete. The production server was started at `http://localhost:3000` using `npm run start:host`, with the database at `.data/lets-eat.sqlite`. Detailed commands and evidence are in [docs/verification.md](docs/verification.md). Every repository commit uses the user's configured author and committer identity, Limin Yao <isabel0913@gmail.com>.

## Local network access

Opening the app from another computer exposed a configuration mismatch: without `.env.local`, the allowed origin defaulted to `http://localhost:3000`, while the browser used the host computer's LAN address. The create-room form consequently returned `403 WRONG_ORIGIN`.

Set the local `APP_ORIGIN` to the user's browser-facing LAN URL and restarted the production server. Keep that machine-specific setting in the ignored `.env.local`; use the same URL in all browsers. The origin check and application code are unchanged. README and `.env.example` now explain the network configuration and restart requirement.

Verified the original form failure, then successful creation, joining from a separate browser, and vote propagation at the LAN address. An unrelated origin still receives 403. Removed only the temporary test room after verification; existing rooms were preserved.

## Public address on the existing computer

The user supplied `http://24.130.34.221` and clarified that the app should keep port 3000. The canonical address is therefore `http://24.130.34.221:3000`. Set `APP_ORIGIN` to that exact URL in the ignored `.env.local` and restarted the production server, still bound to all interfaces on port 3000 with the same SQLite database. Participants should use this address in their browsers and invite links.

Confirmed that the public URL reaches the app and reproduced `403 WRONG_ORIGIN` before updating the setting. After restarting, Playwright verified room creation, an invite link containing the public address and port, joining and vote propagation across separate browser sessions, and saved preferences and guest identity after reload. The initial HTTP copy fallback exposed the correct invite URL in a manual selection field. Unrelated origins still receive 403. These checks ran from the app host through its public address; only the temporary verification room was removed afterward.

## Copy invite link

Clicking the copy button should copy the complete link immediately and show “Copied ✓”, with no “Select and copy” field. The shared copy control uses the Clipboard API where available and a temporary offscreen text selection with `document.execCommand("copy")` when it is unavailable or denied. The temporary field is removed and focus restored after the attempt. If copying fails, show an error instead of claiming success. This also applies to copying the meal summary.

Reproduced the visible field on the public HTTP site and added a failing browser regression before changing the component. Verified actual clipboard contents for unavailable and denied Clipboard API cases, and reran the mobile meal-summary journey. Type checking, lint, and the production build passed. After restarting, a browser check through `http://24.130.34.221:3000` confirmed that a single click copies the full invite URL without a visible field; the check removed only its temporary room.

## Next feature brainstorm

The user requested a new plan covering restaurant suggestions from a ZIP code, concurrent groups, result notifications, copying rooms, saved preferences, and other useful additions. They confirmed that meals soon remain the main flow. Email was considered and then dropped at their request because it requires sender/service setup; the plan collects no email addresses.

Recommendations for discussion:

- Use a short Google Places list alongside manual proposals. The environment has a `GMAP_KEY` variable; no paid API call or credential change was made during planning. Keep the key on the server, account for field costs and attribution, and separate place references from restricted provider content.
- Keep SQLite and the existing independent-room model. Use 20 concurrent rooms of eight participants as an initial load-test target, not a capacity claim.
- Add an in-page result popup first. Closed-page push is a later option requiring HTTPS, permission, supported devices, and durable deadline/delivery processing. The current public HTTP address remains unchanged.
- “Plan this again” opens an editable new-room draft. Copy meal setup while resetting people, votes, blocks, private preferences, subscriptions, and the deadline.
- Offer reusable cuisine and budget defaults for the same browser, applied explicitly to each new room. Availability remains specific to a meal; saved defaults never rewrite other room inputs.
- Prioritize duplicate-place warnings and directions; consider recent rooms, calendar export, and QR invites afterward.

The new plan includes failure behavior, rollout order, acceptance checks, and official references for the external-service constraints. These are product recommendations to resolve in the next technical spec, with no application or deployment changes in this planning step.

## UX review scope clarification

The user narrowed item 6 of [the UX review](docs/feedback/REVIEW.md) to experiencing the result flow quickly. The current HTTP address and port are accepted because DNS is not configured; changing the deployment URL is outside this item. The recommendation is a clearly labeled demo with sample inputs and an immediate result action, reachable from the home page in under one minute. Demo actions remain separate from real rooms and their ten-minute deadline. This records the requested improvement; the demo is not yet implemented.

## UX review implementation

The requested review improvements supersede the original single-round, deadline-only baseline above. Restaurant discovery, reusable profiles, email, and other next-release brainstorm items remain deferred.

- Keep hard vetoes: a meal that someone cannot attend should not win through popularity. Optional constraint tags help others change the time, location, or budget; ordinary tastes belong in preferences.
- Explicit approvals remain the strongest signal. Preferences resolve approval ties or rank options when no eligible meal has approvals. A winner with no approvals is a recommendation, not a confirmed plan. Unspecified restaurant cuisine or price earns no confirmed match for that preference dimension.
- Keep the ten-minute deadline starting when a room or new round is created. This bounds the wait without needing an organizer to return. Add explicit “I'm done” readiness and an early-finish confirmation once every currently joined participant is ready. Only joined people count; silent invitees may still be missing. No automatic finish on the last ready response, so an organizer can still distribute the link.
- Changing one's inputs clears one's readiness. Adding/removing an option or leaving clears everyone's readiness so they review the changed choices. A new participant joins unready. Participation status distinguishes a response from readiness.
- When everything is excluded, invite another proposal immediately. After closure, any existing participant can start another round using the same link, with a new date and new ideas. Keep people and preferences, archive the frozen result, and clear votes, reasons, and readiness. Requests identify their round so an old tab cannot change a newer round by accident.
- Require only a name, date, and a place/time idea on the main creation path; allow an empty room too. Secondary details are optional. Keep joining ahead of voting for guests and voting ahead of supporting information for participants on mobile.
- Provide an isolated, labeled demo with fabricated options, participant inputs, immediate results, and an all-excluded example. It uses the real decision function without creating rooms or changing their deadlines.

Backend milestone: 17 unit and 17 integration tests pass, including early finish, readiness changes, optional reasons, round history, stale requests, and a populated original-schema migration. The migration preserves identities, preferences, existing votes/results, and option ID continuity. UI and release verification are still in progress.

UI milestone: all six review improvements are implemented. The demo shares meal cards, result presentation, and scoring with real rooms while keeping its state entirely in the browser. Result wording distinguishes an approved group pick from a no-approval suggestion. Existing callers with no round header default to round 1, so they cannot accidentally mutate a later round.

All 17 regular browser scenarios passed against the production build, including the five new review journeys and the existing restart/backup, private preferences, constraints, origin/ownership, mobile, network-retry, and clipboard checks. The new recovery test exposed duplicate React keys on sibling forms; distinct keys fixed the duplicated forms and the regression now asserts only one add-idea form remains. Type checking, lint, and production build pass. The unaccelerated deadline check and public smoke test are in progress.

Before applying migration 0001 to the running host, saved a consistent SQLite backup. Compared checksums over every original column before/after migration: all 4 rooms, 7 participants, 5 options, and 3 responses were preserved exactly, and SQLite integrity/foreign-key checks passed. Restarted the updated production app at the same public address and port.

Public verification passed from the app host through `http://24.130.34.221:3000`: the isolated demo, minimal setup, HTTP invite copy, two-session joining/constraints, an alternative proposal, early finish, same-link new round with preserved preferences/history, stale-round and unrelated-origin rejection, and mobile reload persistence. Inspected desktop/home/result and phone screenshots. Removed only the smoke test's temporary room and rechecked the original data checksums successfully.

Final release verification is complete: the unaccelerated ten-minute test passed in 10.0 minutes. Two sessions received the same winner, the original 600,000 ms deadline stayed unchanged, and the saved closing time equaled that deadline. Combined with the regular suite, all 18 browser scenarios are verified. Reports and deployment evidence are listed in [docs/verification.md](docs/verification.md); all six review improvements are delivered on the existing public host.

## Browser identity and personal meal history plan

The user requested a separate plan for persistent preferences, each person's room history, and recommendations when creating another meal. They clarified that any email identifier would be unverified, with no verification messages, and asked to keep this work separate from `next-features-plan.md`.

After comparing email-only lookup with browser continuity, the user selected **automatic browser identity, with history tied to that browser**. A different computer/browser starts a separate profile. Email lookup, verification, and device recovery are outside this first release. The service recognizes possession of the browser credential, not a verified real-world person.

The proposed product adds remembered cuisine/budget defaults, a personal **My meals** view, and up to three editable suggestions from known past approvals and approved group picks. Defaults are saved explicitly and visibly applied when creating/joining a new room; time windows, votes, constraints, and readiness stay meal-specific. Historical suggestions never become automatic votes or change the group's decision algorithm.

The plan also defines forgetting a browser, removing a room from personal history, empty-history behavior, and a migration boundary: existing round archives contain aggregate results, so missing individual votes must not be invented. Future personal recommendation records must be captured before another round deletes its old options/responses. SQLite remains the storage choice. The plan compares other identity options and notes the current HTTP transport limitation without changing hosting.

This step creates documentation only. The identity/profile implementation and technical spec remain future work; [docs/identity-and-history-plan.md](docs/identity-and-history-plan.md) contains the proposed flows, ranking rules, staged delivery, and acceptance checks.

## Implementing browser identity and history

The user authorized implementation of the separate identity/history plan and changed `APP_ORIGIN` to the LAN address `http://192.168.86.52:3000`. Preserve that setting and use it for release checks. The broader next-features plan remains deferred.

[The implementation spec](docs/identity-and-history-tech-spec.md) defines four additional SQLite tables: browser profiles, hashed credentials, personal room membership, and per-round recommendation signals. Existing guest cookies can adopt legacy memberships explicitly; names and emails never link profiles. Expired/forgotten credentials remain revoked through minimal hash records, preventing old participant records from silently recreating personal access.

Defaults contain name, cuisine, and budget. Saving room preferences changes defaults only when explicitly requested. Creation/joining copies the selected cuisine/budget into that meal without carrying a time window. Personal history removal and forgetting do not alter shared room contributions or frozen results.

Finalization captures each active profile's submitted approvals and approved group picks in the same transaction as the room result, before another round can remove live responses. Recommendations rank current preferences, distinct approval/group-pick rounds, and recency; they do not infer visits or fabricate missing legacy votes. Unknown metadata earns no confirmed preference match. Empty participation rounds count toward the latest-20 history window.

Backend milestone: 24 unit tests and 27 real-SQLite integration tests pass. Coverage includes profile isolation, explicit defaults, atomic capture/rollback, round/restart persistence, pagination, removal, forgetting, expiry, credential replay, and one-time legacy adoption. The populated migration test confirms existing shared data is retained without creating profiles or importing history automatically. UI and release verification are next.

The returning-user UI now includes `/me`, saved-default editing, explicit legacy import, history removal, forgetting, and editable reuse of past ideas. Creation and joining visibly offer saved preferences; room-only edits remain separate. Recommendation failures and stale replies preserve manual drafts. A browser profile is also established when an existing legacy participant explicitly remembers preferences.

UI milestone: type checking, lint, and the production build pass. All 23 regular browser scenarios pass, including six new profile/history journeys and the existing voting/round/clipboard/mobile checks. The new tests exercise separate same-named browsers, explicit defaults and overrides, fresh timing and votes, same-room round history, manual no-vote reuse, one-time legacy import, forgetting/expiry/replay, area filtering, and stale/failed recommendation requests. The My meals phone layout was visually inspected.

Before applying migration 0002, saved `.data/pre-browser-profiles-20261023.sqlite`. Checksums of all original columns match after migration for 4 rooms, 7 participants, 5 options, 3 responses, and the empty round archive. Integrity and foreign-key checks pass, and no profiles were created automatically. The updated production process uses the preserved LAN origin. Full-duration deadline and LAN smoke verification are in progress.

LAN release verification passed at `http://192.168.86.52:3000` from the app host with independent desktop/phone browser sessions: creation, joining, explicit saved defaults, two-person early result, separate histories, returning name and suggestions, creating a fresh meal, reload continuity, and unrelated-origin rejection. The new desktop and phone screenshots were inspected. Removed only the two smoke rooms and their profiles/credentials; exact original shared rows still match the backup, and database integrity/foreign-key checks pass. The normal ten-minute deadline test is still running in an isolated test database.

The unaccelerated deadline passed in 10.0 minutes with the original 600,000 ms duration. Both sessions received the same winner and one personal approval/group-pick signal each. The extended restart/backup-restore check also passed: default name/cuisine/budget, ownership, history, result, and recommendation counts survived. These checks used an isolated test database. The last UI refinement gives failed past-idea loads an explicit retry and preserves partially entered option details when adding the recovered idea.

Final delivery: rebuilt production after the retry refinement, passed lint/TypeScript, and reran all six profile browser journeys successfully in 18.6 seconds. All 24 distinct browser scenarios are verified across the regular and release runs. Restarted the final build on the unchanged LAN origin and reran the two-browser smoke successfully; exact original rows still match the backup after cleanup. The completed implementation, usage, lifecycle limits, and evidence are documented in the identity/history plan/spec, README, and verification record. The broader next-features plan remains unchanged.

## Whole-system self-review

The user requested a review before fixes, covering scalability, vulnerabilities, code quality, and outdated documentation. [The review](docs/feedback/self-reflect/REVIEW.md) records prioritized findings and [reproduction evidence](docs/feedback/self-reflect/EVIDENCE.md). Application code, dependencies, migrations, and the running LAN deployment were not changed.

Fresh checks passed TypeScript, lint, 24 unit tests, 27 SQLite integration tests, and 23 regular browser scenarios. Bounded isolated HTTP runs with 20 and 100 groups of eight had no request errors; 100 simultaneous test deadlines produced the expected results. These short loopback measurements support retaining SQLite for the current LAN-first scope, not a maximum-capacity claim.

The review reproduced oversized request/option admission, an in-flight vote succeeding after browser forgetting, read/health delays behind identity-cleanup write locks, stale personal history after focus, and readiness returning healthy without the profile migration. It also identifies unbounded history work, the known HTTP credential exposure boundary, one development-tool advisory, and specific documentation conflicts. Recommended fixes and acceptance checks are documented for discussion; the broader next-features plan remains deferred.

## Self-review remediation and Render hosting

The user requested a new branch and technical spec for fixing the self-review findings, and selected an existing Render service at `https://lets-eat-ba8e.onrender.com/`. Created `fix/self-reflect-render` from `9834f5e`. [The remediation spec](docs/self-reflect-remediation-tech-spec.md) covers F1–F8, resource budgets, bounded SQLite/history work, authorization and readiness regressions, and separate local/hosted release checks. The initial step specifies the review fixes. The user subsequently authorized repairing Render configuration and adding version information; those changes are recorded below, while the remaining review implementation follows the spec. The broader next-features plan remains deferred.

Keep one Node service and SQLite on a persistent disk. Authenticated Render API/SSH inspection confirmed 1 CPU / 2 GiB RAM in Virginia. The authorized setup adds a 1 GB persistent disk at `/var/data`; the Blueprint now reflects this allocation. The workstation's 100-group result is not a hosted capacity claim. Target 20 groups of eight first, measure under the actual allocation, and scale vertically if necessary. The selected HTTPS hostname supersedes the earlier public-IP/LAN-only delivery choice; the existing local service and `.env.local` remain untouched.

Direct HTTPS/browser verification reached the home page and passed all three demo outcomes. The runtime returned health 503/profile 500; a valid create request returned 403 `WRONG_ORIGIN`. The owner supplied a `no such table: profiles` log and then a failed deployment with `npm run start:host` mistakenly placed in the Build Command field. Documented separate build/start commands, runtime migration on the mounted disk, and the exact HTTPS origin. No room was created by that rejected baseline submission. After the user authorized setup, the configuration was repaired and a separate two-browser hosted smoke passed; see the continuation below.

Updated README, deployment/recovery, product/core/profile specs, historical review pointers, and verification to distinguish the current Render target from earlier releases and proposed fixes. [Hosted evidence](docs/verification.md#render-baseline-and-self-review-remediation) records the observed failures and remaining cookie, multi-user, deadline, and restart gates. The standard local Playwright suite must not be pointed at Render because it changes temporary database deadlines and controls local processes; a separate low-volume external suite is specified for implementation.

Operational continuation: the user supplied SSH access and authorized the Render CLI. Corrected build/start commands and environment settings through the API, attached a 1 GB disk, configured `/api/health`, and disabled automatic deploys. Kept the existing Virginia 1 CPU / 2 GiB instance and linked `master` branch. The original empty database was backed up off-host. Deployment of `9834f5e` succeeded, all three migrations ran, and the disk mount/integrity were verified. The hosted desktop/phone smoke then passed creation through early result, saved defaults, history, suggestions, HTTPS clipboard, secure cookies, and Origin protection. A real ten-minute no-vote room is running separately.

The user also requested version information. Added a shared-header version link and an uncached, database-independent `/api/version` response with package version and full Render commit; a local run without commit metadata reports `null`. Typecheck, lint, 24 unit, 27 integration, the isolated production build, 23 regular browser cases, and targeted version/mobile checks pass. Saved a consistent off-host backup before deploying this feature; hosted revision/persistence checks follow. These small changes do not implement the remaining self-review remediations.

Final hosted verification passed after deploying `e84208b` from this branch by explicit SHA, without merging to `master`. `/api/version` returns `0.1.0` and the full serving commit; health is 200. Both browser identities, defaults, options, private preferences, and the frozen early result survived the real Render redeploy. The no-vote room closed at its original ten-minute deadline with the same preference-selected winner for both contexts, including history/reload. The desktop/phone version and result screens were checked. Two labeled shared smoke rooms remain; real user data and the LAN host were not changed. Actual Render load testing and recurring off-host backups remain future operating work. The complete evidence is in [verification](docs/verification.md#render-baseline-and-self-review-remediation).

## Implementing the self-review remediation

The user authorized the full remediation spec, feature-branch publication/deployment, and local plus Render verification. Local setup now targets localhost only; LAN access is not a delivery requirement. Work continues on `fix/self-reflect-render`. Implementation proceeds through request/authorization boundaries, SQLite maintenance/readiness, bounded history and refresh, dependency/header maintenance, then isolated capacity and hosted release verification. Preserve the existing SQLite data and browser identities through migrations and deployments. The broader next-features proposal remains deferred.

The first remediation commit adds bounded streaming JSON and request budgets, durable room limits, transaction-time revocation checks, and bounded expiry maintenance outside request reads. Regressions first reproduced a delayed-body write after forgetting; the fix now rejects it. An external SQLite writer leaves ordinary room/profile reads available and produces a retryable 503 for competing writes within the 100 ms lock budget. Local unit/integration, type, and lint checks pass; hosted verification follows the completed application changes.

History now returns bounded summaries, with archive and personal reuse details fetched ten rounds at a time. Room polls carry only the current round and archive count. Recommendation materialization examines at most 20 recent eligible expired rounds; deadline and personal-recency indexes remove the sorts observed in query-plan inspection. Identifier tie-breaking uses the same binary order in SQLite and the recommendation function. My meals and Recent meals refresh on visible focus and successful mutations, cancel obsolete responses, and retain separate preference/meal drafts. Tests cover 2,000 rooms, all 100 rounds, summary query/size bounds, reference ranking, and tab freshness. The isolated production-build browser suite passed 25 tests (the real ten-minute release check is a separate pending gate).

Startup now validates the exact origin and Render's explicit HTTPS/disk settings, applies migrations, verifies required schema/indexes, and rolls back a writability probe before listening. Health checks migration completeness without cleanup writes. Production responses include frame protection; request logs retain only route templates, status, duration, error code, and generated correlation IDs. Next.js and eslint-config-next are updated together to 16.4.3. A clean install, migration generation (no drift), populated migration regression, production build, 74 unit/integration tests, and the browser scenarios pass, including actual slow-upload and concurrent collection-limit probes.

The production dependency audit remains clean. The full audit has four moderate entries for one development-only esbuild advisory through stable drizzle-kit 0.31.11. Registry inspection found no newer stable drizzle-kit; upstream tracks the deprecated loader in [issue 5304](https://github.com/drizzle-team/drizzle-orm/issues/5304). Keep the stable generator and record this exception rather than downgrade to 0.18.1 or adopt a major prerelease solely to silence the audit. The affected esbuild serving API is not used by this application or its migration commands; see the [maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99). Native SQLite is 3.53.4.

Hosted checks now have a separate HTTPS-only Playwright configuration and public-API/browser suite, with independent identities, a real deadline case, and saved-state continuity checks after a planned restart. Missing HOSTED_BASE_URL fails immediately. The capacity runner owns a temporary database and a localhost systemd user service with verified 1 CPU / 2 GiB cgroup limits, measures ten minutes of 20 groups of eight, and records latency, writes, health, runtime, and deadline-burst evidence outside Git. Hosted execution and capacity acceptance are still pending.

The user requested the P1 validation in `docs/feedback/round2-REVIEW.md`. A shared public-only Playwright flow now checks three isolated browsers, anonymous invite access, simultaneous proposals/votes, private preferences, readiness, late arrival, finish-versus-vote ordering, and reload after closure. The local production-browser case passes; separate SQLite regressions cover both serialization orders. The same flow is part of the hosted suite. No expected-headcount feature is added by this validation request.

The 600-second capacity run passed under verified `cpu.max=100000 100000` and `memory.max=2147483648`: 20 groups, 160 participants, 33,560 ordinary requests, 160 deadline-burst reads, 2,040 accepted writes, zero errors/lost writes/missed polls/restarts/OOMs. Ordinary p95 was 4.177 ms, deadline-burst p95 242.606 ms, health maximum 121.638 ms, steady RSS maximum 232,632,320 bytes. Steady-window median RSS changed by 3.3 MiB within the measured runtime variation. The disposable service/database were removed; sanitized evidence is committed. These are constrained local measurements, with actual Render network behavior checked separately.

The off-host Render backup verified SHA-256, SQLite integrity, and foreign keys for the existing five-room database. A daily operator-side systemd timer is enabled at 04:15 America/Los_Angeles, retains seven dated daily copies, and records disk warning/critical thresholds at 70%/85%. User lingering keeps the scheduler available after logout; the operator machine must remain powered and connected. The current disk usage is 1.7%.

The user then authorized the P1 invitation-completeness feature. Add optional expected headcount at creation (including the organizer), joined-versus-expected status, and a server-enforced explicit organizer override when invitees are missing. Preserve readiness for everyone present and automatic ten-minute closure. Persist organizer ownership with the room, migrate only provable historical creators, and freeze attendance/override notes in results and copied summaries. Headcount stays with the room across rounds; editing, transfer, and an invitation checklist are deferred to keep this change small. Tests cover authorization, migration, deadline behavior, and the shared local/hosted UI flow. The earlier unaccelerated localhost ten-minute test also passed.

Invitation implementation `c248d63` passed all 81 unit/integration tests, lint/type checks, migration generation, the production build, and all 29 regular browser scenarios. Desktop confirmation and mobile result screenshots were inspected. The local production service is now supervised by a systemd user unit bound only to localhost; a pre-migration backup and comparison confirmed every original shared field was preserved. Pushed the feature branch and deployed `c248d63` to Render. SSH verification against a separate pre-deploy off-host backup confirmed preservation across all nine application tables, five migrations, and valid SQLite integrity/foreign keys. Hosted group/invitation, real deadline, and restart continuity tests follow.

The three regular hosted checks passed (44.5 seconds), including the P1 group and invitation flows. A trace from the first attempt exposed a test race: a direct read overtook the second vote request. Both writes returned 200; tests now wait for server-backed UI state. Private Playwright artifacts in `.data` are also excluded from lint. Render was deliberately restarted while a separate real-deadline room remained open; a changed instance ID confirmed replacement, and both saved browser contexts retained identity, preferences, votes, history, recommendations, and frozen result. GitHub Actions passed for deployed application commit `c248d63`.

Final release acceptance passed. The invitation build completed the constrained 20-group/160-person ten-minute run with 34,280 requests, 2,040 accepted writes, and no errors/lost writes/missed polls/restarts/OOMs; p95 ordinary latency was 4.422 ms. All 30 local browser scenarios pass across regular and actual ten-minute runs. On Render, the two-of-four expected group closed at the original deadline with the same two-approval result for both browsers after an actual instance restart. The final revision remains `c248d63`; later commits change tests, lint ignores, and documentation only. Both application and test-harness GitHub Actions runs passed. Current deployment instructions, completed review follow-ups, sanitized release/capacity evidence, and historical documentation labels are reconciled. Localhost service and the daily verified off-host backup timer remain enabled; broader next-features work remains deferred.
