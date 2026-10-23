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
- Run on the existing computer with SQLite; use the public address on port 3000 as subsequently requested. Managed hosting remains deferred.

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
| Use the existing computer with public access on port 3000; retain Render with a persistent disk as a future deployment option. | The user initially chose local delivery, then supplied the public address for that computer. The prepared Render configuration remains available for future managed hosting. |
| A random HttpOnly guest cookie, with only its hash stored per room participant. | Supports identity and ownership without accounts; the shared link is distinct from the participant credential. |
| Poll the room every three seconds while visible and open. | Sufficient for small groups; avoids maintaining live connections. |
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
