# Approach and decisions

This is the running decision record for Let's Eat. Keep it updated as product and technical choices are made. Detailed product behavior lives in [docs/plan.md](docs/plan.md).

## Confirmed direction

- Start from zero and clarify product behavior before choosing technology.
- Serve 3–8 friends or coworkers choosing lunch or dinner soon.
- Share one link; require no account or sign-up.
- Let the creator suggest several meals and every participant add more.
- Let people vote and provide preferences; use preferences to choose when nobody votes.
- Favor a small first version and move to a technical spec once the product rules are clear.
- Use SQLite, as explicitly requested.
- Deliver a working product and verify it with end-to-end tests.

## Product baseline after the simplicity pass

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
| Render with a persistent disk as the deployment target. | Keeps the SQLite file across restarts and deploys; this requires a paid disk-backed service. |
| A random HttpOnly guest cookie, with only its hash stored per room participant. | Supports identity and ownership without accounts; the shared link is distinct from the participant credential. |
| Poll the room every three seconds while visible and open. | Sufficient for small groups; avoids maintaining live connections. |
| Enforce the persisted deadline on the server; save the result on the first request after expiry. | No worker or browser timer is required. Closure is effective at the deadline even when snapshot materialization happens later. |
| Immediate SQLite transactions for mutations and finalization. | Serializes competing changes and makes the deadline check and result write atomic. |
| Represent preference fractions in exact integer sixths. | Preserves the simple average while making ties independent of floating-point rounding. |
| Vitest for logic/database tests and Playwright for real browser journeys. | Verify a production build with real SQLite and separate participant sessions; include deadline and restart persistence. |
| Use the existing Git configuration for author and committer identity. | Keep commits attributed consistently with the user's configuration. |

## Validation and next steps

The product plan includes acceptance scenarios for voting, preference fallback, ties, exclusions, identity continuity, the deadline, and frozen results. Product targets are a room created in under a minute, a useful response in about thirty seconds, and resolution in ten minutes.

The technical spec defines the stack, four-table schema, API, deadline semantics, deployment, and implementation sequence. The foundation and room backend are implemented; the complete browser interface is next.

Foundation verification: generated and applied the four-table migration, passed type checking and lint, built Next.js for production, started it, and received a healthy database readiness response. Node 24.22.1 is pinned for the project.

Backend verification: 15 unit tests and 11 integration tests pass, as do type checking and lint. Tests use the committed migrations and temporary SQLite files. They cover scoring, time-zone changes, guest ownership, private inputs, idempotent votes, leaving, immutable results, and a separate worker holding a write lock across the deadline. A late write materializes and commits the result before returning its rejection. Independent connections and reopening the database preserve the saved result.

Successful room mutations return the updated snapshot, including deletions, so the UI can display acknowledged changes immediately. The voter count means people with at least one approval, including approvals on excluded options; excluded approvals are explained separately.

The browser suite remains to be implemented and run. Completion requires passing the browser journeys, verifying the real ten-minute deadline, checking persistence after an application restart, and testing the deployed shared link. Record actual results and any necessary changes here as the work proceeds.
