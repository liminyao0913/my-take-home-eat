# Let's Eat — technical specification

Status: implementation specification. Current progress and verification results are recorded in [APPROACH.md](../APPROACH.md). This spec implements [the product plan](plan.md).

Identity/history extension: [the separate implementation spec](identity-and-history-tech-spec.md) adds browser profiles, reusable cuisine/budget defaults, personal history, and creator suggestions. Its credential lifecycle and private APIs supersede the original guest-only behavior below; group voting rules remain the same.

Delivery update: the user selected **local delivery** during implementation. Complete the app, local release tests, ten-minute deadline check, and restart/restore verification. The Render setup below is retained for a future deployment; hosted checks are deferred.

## 1. What we need and what we choose

Build **one full-stack TypeScript application backed by a SQLite file**. UI, backend, and database are distinct responsibilities, but the UI and backend ship together and SQLite runs inside the app process.

| Responsibility | Choice | Reason |
| --- | --- | --- |
| UI and routing | Next.js 16 App Router, React, TypeScript | One application for the two pages and their server endpoints. |
| Styling | Tailwind CSS and semantic HTML controls | A small responsive interface without a component framework. |
| Backend | Next.js Route Handlers in the Node.js runtime | Same-origin JSON APIs, shared types, and one deployment. |
| Database | SQLite, as requested | Persistent storage without a separate database server. |
| Database access | Drizzle ORM with better-sqlite3 | Typed schema and queries, SQL migrations, and local transactions. |
| Validation | Zod | Validate every request on the server and share input contracts with forms. |
| Time conversion | Intl for display; @js-temporal/polyfill on the server | Convert the room's local meal times into unambiguous instants. |
| Shared updates | Fetch the room every three seconds while visible and open | Enough for a small group without a connection service. |
| Runtime and packages | Node.js 24 LTS and npm | Pin the runtime and commit package-lock.json for repeatable installs. |
| Automated tests | Vitest plus Playwright | Test decision logic and database behavior, then the complete browser journey. |
| Hosting | One Render Node web service with a persistent disk | One deployed app and a durable local database file. |

Next.js supports custom HTTP endpoints through [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) and deployment as a [Node.js server](https://nextjs.org/docs/app/getting-started/deploying). Drizzle supports the [better-sqlite3 driver](https://orm.drizzle.team/docs/sqlite/get-started-sqlite).

Use stable package releases compatible with this stack, record the exact resolved versions in the lockfile, and avoid prereleases. Node 24 is an [LTS release](https://nodejs.org/en/about/previous-releases); the existing workspace has Node 18.19.1 and must be upgraded before building. Current [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation) exceed that installed version.

Render's persistent disks require a paid service, support one service instance, and are available at runtime rather than during builds. Those constraints fit this deployment choice; local development needs only Node and a writable directory. See [Render persistent disks](https://render.com/docs/disks).

## 2. Architecture and code boundaries

~~~mermaid
flowchart LR
    B["Browsers: creator and participants"] --> UI
    subgraph APP["One Node.js application"]
        UI["Next.js / React UI"] --> API["JSON Route Handlers"]
        API --> S["Room service and decision function"]
        S --> DB[("SQLite file on persistent disk")]
    end
~~~

Keep the implementation in one repository:

~~~text
src/
  app/
    page.tsx                   # Create a room
    r/[roomId]/page.tsx         # Shared room and its final result
    api/                       # Route Handlers
  components/                  # Forms, option cards, people, result
  lib/
    contracts.ts               # Zod inputs, enums, response types
    decision.ts                # Pure selection and scoring
    time.ts                    # Room date/time conversion
  server/
    db.ts                      # SQLite connection and configuration
    schema.ts                  # Drizzle table definitions
    identity.ts                # Guest cookie and token hashing
    rooms.ts                   # Transactions and room operations
drizzle/                       # Committed SQL migrations
scripts/                       # Migration, backup, and test runners
tests/
  unit/
  integration/
  e2e/
~~~

Route Handlers parse requests and map errors to HTTP responses. The room service owns authorization, persistence, and deadline checks. The decision function takes a snapshot and returns a result without accessing the database or clock.

Database modules are server-only. Keep form drafts in React state and use ordinary fetch calls; a global state library, separate API server, WebSockets, cache server, and job queue are unnecessary for v1.

## 3. UI behavior

There are three page routes:

- **/**: display name, date, and a place/time idea, with a room-first option. Secondary meal and restaurant details live in optional disclosures. Detect the browser's IANA time zone, show it, and store it with the room. Successful creation redirects to the shareable room.
- **/r/[roomId]**: header and copy-link action, participation count, inline join form before voting for guests, meal cards, readiness controls, collapsed participant statuses and preferences, and the result/new-round form after closure. Voting precedes supporting panels on mobile.
- **/demo**: fabricated options, participant responses, and preferences held only in component state. Shared meal cards, result rendering, and the pure decision function demonstrate votes, preference fallback, and all-excluded results immediately. No room API calls, cookie changes, database writes, or deadline changes.

Use the same page for Open and Closed. A closed page disables contributions to that round and displays the saved outcome; active participants can start another round using the same link. Anonymous visitors can view either state.

Implementation details that matter:

- Save preferences explicitly, keeping unsaved form text intact during polling.
- Submit an intended response such as “approve,” “block,” or “clear”; disable that control while its request is pending.
- Update visible vote counts after the server acknowledges a change, then refresh the room.
- Avoid overlapping polls, discard stale fetch responses after mutations, and refresh on tab focus. Pause polling when hidden. Continue visible polling after closure so everyone sees a new round start. Key draft forms by round to discard drafts belonging to the previous round.
- Every room response includes server time and the deadline. Use these to display the countdown; refresh when it reaches zero. The server decides whether a write is accepted.
- Show validation errors beside fields. Preserve drafts after network errors and indicate when shared data may be stale.
- Render server-provided names and notes as text. Open optional place links using safe link attributes.
- Provide accessible labels, keyboard-operable controls, visible focus, and mobile layouts without horizontal scrolling.

The result includes the selected meal or no-winner reason, the decision basis, participant/voter/preference counts, and a copyable summary.

## 4. Guest identity and ownership

The shared URL identifies the room, not an individual participant.

1. On create or join, reuse an active registered guest cookie. If absent, malformed, expired, or revoked, issue a cryptographically random 256-bit guest token in an HttpOnly, SameSite=Lax cookie with Path=/. Browser profiles have a 180-day idle lifetime enforced both in the cookie and on the server; see the identity/history extension for renewal and legacy adoption. Use Secure when the configured app origin is HTTPS.
2. Store only a SHA-256 hash of that token on the room's participant record.
3. Resolve the caller from the cookie and room ID on each request. Never accept a participant ID from the request body as proof of ownership.
4. Enforce one participant per room and token hash. Repeated join requests restore the same active participant.
5. Leaving marks the participant inactive, clears their preferences, and deletes their responses in one transaction. Their proposals remain. Rejoining before closure reactivates that same record with cleared inputs.

The cookie supports participation in several rooms and now links to a browser profile, without a login or email account. Duplicate display names are allowed. Clearing the cookie or using another browser creates another identity.

Generate room IDs from at least 128 random bits and use them directly in /r/[roomId]. Anyone holding that link can view and join, as specified in the product plan.

All writes check the request Origin against APP_ORIGIN and require an active participant except for create and join. Only an option's author may remove it. Scoped lookups must verify that both the participant and option belong to the requested room.

## 5. Database model and storage

The shared-room model uses five application tables, with four additional personal-data tables described in the identity/history extension. Store timestamps as integer UTC epoch milliseconds, the meal date as YYYY-MM-DD, and the room time zone as an IANA identifier.

| Table | Main columns | Constraints |
| --- | --- | --- |
| rooms | id, title, meal_date, area, time_zone, created_at, deadline_at, round, result_json, resolved_at | Random text primary key. Round defaults to 1. Result and resolved_at are null until materialization. Initial deadline is created_at + 600,000 ms; subsequent deadlines are new-round creation time + 600,000 ms. |
| participants | id, room_id, token_hash, display_name, active, ready, cuisines_json, max_price_level, preferred_start_minute, preferred_end_minute, created_at | UUID text primary key; unique (room_id, token_hash); room foreign key. Ready defaults to false. Cuisines default to an empty JSON array; other optional preference fields are nullable. |
| options | id, room_id, author_id, place_name, location, start_at, cuisine, price_level, link, created_at | INTEGER PRIMARY KEY AUTOINCREMENT, room and author foreign keys. ID defines proposal order and is never reused after deletion. Cuisine and price may be null; location may be empty. |
| responses | participant_id, option_id, choice, reason | Composite primary key (participant_id, option_id); foreign keys; choice is approve or block. An optional reason tag belongs only to a block. Clearing deletes the row. Deleting an option cascades to its responses. |
| room_rounds | room_id, round, meal_date, result_json | Composite primary key (room_id, round), room foreign key; immutable prior-round result snapshots. |

Use check constraints for price levels 1–3, allowed response choices, valid preference-minute ranges, and both-or-neither time-window endpoints. Server validation checks cuisine membership and same-room relationships. Index room_id on participants and options, and option_id on responses.

Cuisine choices come from one shared constant used by the option form, preference form, and validation. Include Other. Price levels are budget=1, mid-range=2, splurge=3.

Store the final result as a structured JSON snapshot: winner ID and meal details or no-winner outcome, reason, relevant totals, and the effective closing time. Do not include personal preferences or token hashes in that public result.

### SQLite setup

- Development path: .data/lets-eat.sqlite, ignored by Git.
- Production path: /var/data/lets-eat.sqlite on the persistent disk.
- Tests: a fresh temporary directory and SQLite file, isolated from both.
- Initialize connections with foreign_keys=ON, journal_mode=WAL, synchronous=FULL, and a 5,000 ms busy timeout.
- Reuse a server connection; avoid creating a new connection for each query.
- Generate and commit migrations, then apply them through scripts/migrate.mjs. For table rebuilds it disables foreign keys before the migrator transaction, then enables and checks them afterward. Migration 0001 also preserves the option autoincrement high-water mark; a populated original-schema migration test checks votes, identities, preferences, frozen results, and ID continuity. Lazy connection initialization prevents the build from creating or migrating a database.
- Keep transactions short and synchronous. Perform request parsing and any asynchronous work before entering a better-sqlite3 transaction.

SQLite permits one writer at a time. WAL allows concurrent readers, but the database and its WAL files must stay on the same host. This app deliberately runs as one service instance. See [SQLite transactions](https://sqlite.org/lang_transaction.html) and [WAL behavior](https://sqlite.org/wal.html).

## 6. API contract

All endpoints use JSON. Successful room mutations return the updated snapshot, including deletions. Response objects expose explicit public fields rather than serializing database rows.

| Method and route | Input / effect |
| --- | --- |
| POST /api/rooms | Name, title, date, area, time zone, initial options. Atomically create the room, creator, and zero or more options; return room ID and shared path. |
| GET /api/rooms/:roomId | Public room snapshot plus the caller's own preferences and response choices, if recognized. Materialize the result if due. |
| POST /api/rooms/:roomId/participants | Join using display name, or restore/rejoin the same cookie identity. |
| PUT /api/rooms/:roomId/preferences | Replace the caller's three preference inputs; empty inputs clear previous values. |
| POST /api/rooms/:roomId/options | Add one immutable place/time option with optional restaurant details; reset everyone’s readiness. |
| DELETE /api/rooms/:roomId/options/:optionId | Remove the caller's own option and its responses. |
| PUT /api/rooms/:roomId/options/:optionId/response | Set choice to approve, block, or null. An optional reason is allowed only for block. Repeated identical requests must not increase counts. Reset the caller’s readiness. |
| DELETE /api/rooms/:roomId/participants/me | Leave and clear the caller's decision inputs. |
| PUT /api/rooms/:roomId/participants/me/ready | Set the caller’s ready boolean; no automatic closure. |
| POST /api/rooms/:roomId/finish | Require at least one option and all active participants ready; finalize immediately. |
| POST /api/rooms/:roomId/rounds | After closure/expiry, supply a meal date and at least one new option. Archive the old result, clear options/responses/readiness, retain people/preferences, increment round, and start a fresh deadline atomically. |
| GET /api/health | Readiness check that verifies the database is accessible and migrated; expose no private data. |

The room snapshot contains room metadata, serverNow, state, active participant names and responded/ready flags, option details and aggregate vote/reason counts, result, previousRounds, and an optional me object. Only me contains private preferences and the caller’s own choices and reason tags. A participant counts as responded when they have a response, saved preferences, or readiness; the flag does not imply approval. Set Cache-Control: private, no-store on room responses and disable fetch caching.

Use 400 for invalid input, 401 for missing participation identity, 403 for a forbidden ownership action, 404 for a missing or incorrectly scoped resource, and 409 ROOM_CLOSED for contributions rejected after closure. Round-scoped writes carry X-Room-Round (legacy requests default to 1); a mismatch returns 409 STALE_ROUND. An early finish with unready participants returns 409 NOT_READY, and without options returns 409 NO_OPTIONS. Restarting an open round returns 409 ROUND_OPEN. Return a stable error code, a useful message, and field errors where appropriate.

Creation is all-or-nothing. Validate nonempty names, bounded text lengths, supported cuisine and price values, valid dates and time zones, optional initial options, and optional HTTP/HTTPS links. A new round requires at least one new idea. Location, cuisine, and price are optional; title defaults to “Let’s grab a bite” and area can be empty. Place links are displayed, not fetched by the backend.

Convert option times from the room's date and zone into UTC on the server. Require the local date to match the room and the instant to be later than its deadline. Preferred time windows are local minutes on that same date, with inclusive endpoints and no overnight wrap. Reject invalid or ambiguous local option times rather than silently moving them. [Temporal's time-zone conversion rules](https://tc39.es/proposal-temporal/docs/zoneddatetime.html) provide the needed disambiguation behavior.

## 7. Deadline, transactions, and result selection

### Closure without a background worker

The persisted deadline and server clock determine whether a room is open. An explicit early finish also closes a round. At or after deadline_at, all new contributions to that round are rejected, whether or not any browser was open at the deadline.

The first request after expiry computes and stores the result. This is **lazy materialization**: the room closes logically at its deadline, while resolved_at records when the immutable snapshot was actually written. No notification or other side effect needs to happen at the exact deadline in v1.

A restart does not extend the round. An expired room cannot become writable simply because result_json is still null. Every GET returns Closed and a materialized result once expired.

### Atomic write and close rules

Use a short SQLite BEGIN IMMEDIATE transaction for every room mutation and every finalization. For an existing room:

1. Acquire the write transaction, load the room, check X-Room-Round, and then read the current server time.
2. If a result already exists, return it and reject any attempted contribution.
3. If the deadline has passed, load the current inputs, calculate and persist the result, and return a closed outcome.
4. Otherwise, resolve ownership and apply the requested mutation.
5. Commit before sending the response.

A mutation is admitted when the time check inside the acquired transaction succeeds. A request waiting for a lock must check the clock after the wait. Work arriving at or after the cutoff loses, including a request whose browser countdown is stale.

When a late mutation causes finalization, commit the result and then return HTTP 409. Do not throw inside the transaction and accidentally roll back the result. Database errors still roll back the entire transaction.

Routine reads use a consistent read snapshot. If a read detects expiry, end that read transaction and finalize in an immediate transaction, rechecking the room. Do not try to upgrade an old read snapshot into a writer.

This uses SQLite's [immediate transaction behavior](https://sqlite.org/lang_transaction.html) to serialize competing updates and finalizations. It requires no in-memory timers or locks that would be lost on restart.

### Early finish and another round

Any active participant can confirm early finish once all currently joined people are ready and there is at least one option. The UI displays the joined/ready count and explains that absent invitees do not count. Check these conditions under the write lock so a new unready joiner or changed input prevents closure. Store closedEarly=true and the actual close time; do not rewrite the deadline. A deadline result records closedEarly=false and closedAt=deadline_at. Legacy result snapshots may omit the flag.

Saving preferences or changing a response/reason resets the caller’s readiness. Adding/removing options or someone leaving resets everyone’s readiness. New joiners are unready. Readiness is not a vote.

Starting another round is a separate immediate transaction requiring an active participant and a closed or expired current round. Validate the new date/options before modifying data, finalize the old round if needed, archive its frozen result, delete old options/responses, reset readiness, and insert the new options/deadline. Keep active identities and preferences. Competing restart requests cannot both succeed because the expected round is checked under the lock.

### Exact preference scoring

The pure decision function receives only active participants and existing options and responses:

1. Exclude every option with any active participant's block.
2. Count approvals from active participants.
3. For each participant with at least one supplied preference, let k be the number of supplied dimensions and m the number that match. Unknown restaurant cuisine/price does not earn a match for a supplied dimension; it does not exclude the option.
4. Give that person 6 × m / k match units. Because k is 1, 2, or 3, these are exact integers.
5. Sum match units across participants. Since the participating preference count is the same for every option, this ranks options exactly like the product's average score.
6. Order eligible options by approval count descending, match units descending, and option ID ascending.
7. Select the first option, or return no winner if there are none.

For display, group match percentage is 100 × total units / (6 × number of people with preferences). If nobody supplied preferences, use equal scores and label the fallback honestly. Never round before deciding a tie.

Record whether votes won outright, preferences broke a vote tie, preferences selected without eligible votes, or first-proposed order broke the remaining tie. Explain when approvals were ignored because their options were blocked. A winner with zero approvals is labeled a recommendation. Once stored, return this round’s result unchanged, including when archived.

## 8. Development and deployment

### Local development

Upgrade the workspace to Node 24 and pin it in the repository runtime configuration. Install dependencies, copy .env.example, apply migrations, and run the development server. SQLite does not require Docker, a database daemon, or the sqlite3 CLI.

Environment variables:

| Name | Purpose |
| --- | --- |
| DATABASE_PATH | SQLite file location; different values for development, tests, and hosting. |
| APP_ORIGIN | Canonical scheme and host for same-origin checks, cookie security, and share links. |
| PORT | Application port when supplied by the host. |

Provide these npm scripts during implementation: dev, build, start, lint, typecheck, db:generate, db:migrate, db:backup, test:unit, test:integration, and test:e2e. Test commands must select an isolated database explicitly.

### Deploy one app with one disk

Use a Render Node web service pinned to Node 24 with a persistent disk mounted at /var/data. Set DATABASE_PATH to the file under that mount and APP_ORIGIN to the HTTPS service URL.

Build with npm ci and npm run build, including the development dependencies needed by the build. At runtime, apply committed migrations and then start Next.js, binding the supplied PORT. Ship the migration runner and SQL files with the app. Database creation and migrations run at startup, where the disk is accessible, rather than in the build or a pre-deploy step.

Run one app instance. Render documents that disk-backed services have a brief interruption during deploys and cannot mount that disk across multiple service instances. See [disk lifecycle and limits](https://render.com/docs/disks#disk-limitations-and-considerations).

Provide a consistent SQLite backup command using the database backup API. Take a backup before schema-changing deployments, copy it off the service, and verify restoration against a separate file. Include the database's WAL state through the backup API rather than copying only the live main file.

A release must verify that an existing room and finalized result survive a server restart or redeploy. A successful build without persisted room data is not the completion criterion.

## 9. Test strategy

The goal is a working product. The tests below are implementation requirements, not completed verification.

### Unit tests: decision rules and time validation

Use Vitest for small, explicit examples with expected winners:

- A clear approval winner beats an option with better preferences.
- Preference scores break a vote tie and choose correctly when there are no approvals.
- Unanswered dimensions and people with no preferences do not distort the average.
- Different fractions that are mathematically equal still tie exactly.
- A block excludes the most popular option; all blocked or no options yields no winner.
- Clearing a block restores the option's existing approvals.
- The earliest remaining proposal wins an exact tie.
- Price comparisons and inclusive time windows match the product rules.
- Room-zone conversions and invalid local times are handled correctly.

### Integration tests: real SQLite

Use temporary files and the production migrations and room service. Verify:

- Room creation is atomic, and its deadline is exactly ten minutes after its stored creation time.
- Repeated joins and response PUTs do not duplicate participants or votes.
- Another participant cannot remove someone else's option; cross-room IDs cannot bypass scoping.
- Public snapshots contain neither someone else's preferences nor any token hash.
- Removing an option clears its responses; leaving clears personal inputs and preserves proposals.
- Invalid or partial preference windows fail without modifying existing inputs.
- Competing finalizers produce one stored result.
- A write admitted before the cutoff is included; a write admitted at or after it is rejected.
- A lock wait that crosses the cutoff cannot admit a late write. Use separate connections/processes for this check so the test does not block itself.
- Closing and reopening the database preserves rooms and finalized snapshots.

### End-to-end tests: real browsers, app, and database

Use Playwright against a production build started by its [webServer configuration](https://playwright.dev/docs/test-webserver). Use a fresh SQLite file and separate [browser contexts](https://playwright.dev/docs/api/class-browsercontext) for participants so identities do not share cookies. Do not mock room APIs or database operations.

| Journey | What must be observed |
| --- | --- |
| Three-person voting flow | Create with two options; share the URL; two other contexts join; one adds an option; people approve; counts propagate; the correct winner and reason appear in all contexts. |
| Preference fallback | People save different and partially filled preferences without voting; the calculated winner is shown consistently. |
| Constraints and no winner | Block a popular option and observe its exclusion; in another room block every option and observe a closed no-winner result. |
| No input and exact ties | Finalization selects the first eligible proposal consistently across reloads and visitors. |
| Identity and ownership | Reload preserves the caller's inputs; another context cannot alter them; switching approve/block remains exclusive; leaving removes the caller's influence. |
| Deadline and offline interval | Close every page before expiry, wait past the deadline, then reopen. The room is closed, rejects edits, and shows the correct result. |
| Persistence and restart | Stop and restart the app against the same file; the shared link, identity, options, and any saved result still work. |
| Mobile and keyboard use | Complete the core flow at a phone viewport and with keyboard controls; labels, validation, and copyable result are usable. |

In the multi-user journey, issue some approvals concurrently through the separate browsers and assert both are retained. Add real HTTP tampering checks through Playwright's request client for ownership and after-deadline rejection.

For routine tests, create rooms through the UI and then let a test-only database fixture move only that test room's deadline to a few seconds ahead or into the past. The test server and fixture must use the same isolated temporary file, and the fixture must refuse a non-test path. Do not add a public time-travel endpoint, change the product's ten-minute constant, or rely on a mocked browser clock to expire the server.

Before the first release, also run one unaccelerated end-to-end journey using the real ten-minute deadline. The hosted smoke test uses that normal duration and verifies the actual public link from separate sessions.

Run the browser suite with one worker initially. Keep Playwright traces, screenshots on failure, and the HTML report. Use assertions that wait for observable outcomes rather than arbitrary sleeps.

### CI and final evidence

Run lint, type checking, unit tests, integration tests, a production build, and the browser suite in CI. Install the required browsers and system dependencies as described in [Playwright's CI guide](https://playwright.dev/docs/ci).

Before claiming completion, record the commands and outcomes, the deployed URL, the end-to-end report location, the restart check, and any remaining limitations. If hosting is not yet available, report the local verification separately and leave the public-deployment check pending.

## 10. Implementation sequence and definition of done

| Step | Deliverable | Verification gate |
| --- | --- | --- |
| 1. Foundation | Node setup, Next app, SQLite schema and migrations, environment example, health endpoint | Fresh database migrates; production build starts and reports healthy. |
| 2. Shared room | Create/join, guest identity, add/remove options, shared-page polling | Two browser contexts see the same persisted room and preserve identity on reload. |
| 3. Decision inputs | Preferences, approvals, blocks, leaving, ownership checks | Relevant unit and integration tests pass; UI actions agree across contexts. |
| 4. Closure | Atomic deadline checks, scoring, stored result and explanation | Preference/vote/tie cases pass; late writes fail; closure survives offline intervals. |
| 5. Complete UI and E2E | Responsive forms, errors, final summary, full browser suite | All required browser journeys pass against the production build and real SQLite. |
| 6. Local release | Running local app, backup/restore instructions, release browser suite | Local link works across sessions; normal deadline, application restart, and backup restoration are verified. Public hosting is deferred. |

Commit each coherent milestone using the repository's configured Git identity. Update APPROACH.md when implementation reveals a necessary change to these decisions.

Done for the agreed local delivery means the product runs locally through a shared room link, its data survives a restart, its decision rules match the product plan, and its end-to-end checks have actually passed.
