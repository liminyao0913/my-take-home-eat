# Browser identity and history implementation

Implements [the product plan](identity-and-history-plan.md), using the existing Next.js service and SQLite. Local configuration can use `.env.local`; the selected Render host uses dashboard environment variables and `APP_ORIGIN=https://lets-eat-ba8e.onrender.com`. Deployment status is in [verification](verification.md). The behavior below describes the implemented baseline; the [remediation spec](self-reflect-remediation-tech-spec.md) records the implemented transaction-time credential validation, bounded cleanup, and paginated history reads. Local setup uses localhost only.

## Storage and identity

Add four tables: `profiles` (name, cuisine/budget defaults), `browser_credentials` (hashed cookie, optional profile ID, expiry, one-time legacy-import eligibility), `profile_rooms` (profile/room membership, participant ID, creator/joiner role, hidden flag), and `profile_rounds` (one personal signal snapshot per profile/room/round).

The existing guest cookie remains the credential. New profiles are created only by successful room creation/joining, an explicit legacy import, or explicitly remembering preferences from an existing room. Room viewing and the demo create neither profiles nor memberships. A profile ID, display name, or email is never an access credential.

Migration registers existing participant token hashes as legacy credentials, with a 30-day adoption window. It does not infer creator roles or import preferences/history automatically. New profile credentials expire after 180 idle days. Recognized profile activity renews expiry at most once per day; the response cookie uses the same absolute expiry. Normal reads check expiry without a write lock. At most once per minute, a maintenance timer deletes up to 100 expired children per table and removes a parent only after its children are gone. Expired credentials lose access immediately, independent of cleanup. Credential hashes remain as minimal revocation records, so replaying a forgotten/expired credential cannot restore old room ownership or trigger legacy import. Deletion does not change shared participants, votes, or frozen results.

Creating a profile with a valid legacy credential adopts that credential into the normal 180-day lifecycle. Its one-time import remains available until used, but creating the profile does not import older memberships automatically.

## Personal history and closure

Successful creation/joining links the room, reactivating an explicitly hidden history entry only on an explicit join. Removing history hides that membership and deletes its personal recommendation snapshots. Merely viewing a room, polling, or starting another round must not restore hidden history.

Finalization captures active, unexpired, visible profile memberships and their submitted approvals plus any approved group winner they did not block. Store even an empty signal array to count the round in the latest-20 participation window. Capture and the frozen room result commit in the same immediate transaction, on both early and deadline closure. A unique profile/room/round key prevents duplication. New rounds can then delete live options/responses safely.

History first selects a page ordered by open state and effective closure time, then settles only expired rooms on that page (up to 20). Summary reads do not call full room snapshots or load archived arrays. Current and prior round outcomes remain room context; personal signal snapshots establish personal approvals only. Explicit legacy import links provable memberships and may capture a current closed round when intact inputs establish participation; older aggregate archives never produce invented personal votes.

## API

All responses are private/no-store, identity comes from the cookie, and mutations retain the exact `APP_ORIGIN` check.

| Route | Behavior |
| --- | --- |
| GET /api/profile | Own profile/defaults and legacy-import availability, or an anonymous state. |
| PUT /api/profile | Update default name and cuisine/budget only. |
| DELETE /api/profile | Forget personal data and revoke/clear the browser credential. |
| POST /api/profile/import | Explicit, one-time adoption of existing browser memberships. |
| GET /api/profile/rooms?offset=0&limit=20 | Up to 20 lightweight room/result summaries; `limit=3` serves Recent meals. |
| GET /api/profile/rooms/:roomId/ideas?beforeRound=… | Private reuse details for at most ten rounds. Hidden/forgotten memberships are inaccessible. |
| GET /api/rooms/:roomId/rounds?beforeRound=… | Public archived outcomes, ten rounds per page. |
| DELETE /api/profile/rooms/:roomId | Remove a room from personal history and recommendations. |
| GET /api/profile/rooms/:roomId/ideas/:optionId | Read an authorized past idea into a new draft; omit the old time. |
| POST /api/profile/recommendations | Rank history using submitted cuisine/budget and area; optionally include other areas. |

Create/join accept optional cuisine/budget values explicitly chosen for the new room. Room preference saves accept an optional `remember` boolean; only that flag updates profile defaults. Existing clients continue to work without these fields.

## UI and recommendation rules

Add `/me` for defaults, history, import, removal, and forgetting. The home form welcomes a recognized browser, links to recent meals/settings, and pre-fills its name. Create/join show saved cuisine/budget with visible opt-out and editing. Room preferences add an unchecked remember control. New room and profile edits never rewrite existing room preferences.

Recommendations materialize at most 20 recent eligible expired rounds before selecting the last 20 completed participation rounds within 180 days, using the same deadline/closure and binary room-ID tie order in SQL and ranking. Recommendations collapse only matching known name/location pairs, and rank by current preference matches, distinct personal-approval rounds, distinct approved group-pick rounds, recency, then stable source order. Offer at most three. Other-area suggestions require an explicit action when an area was supplied. The response includes factual counts/reasons and previous estimated metadata. A suggestion or history idea fills an editable option with a fresh start time; no votes, people, or deadlines are copied.

Keep ordinary creation usable if personalization fails. Preserve drafts on errors and discard stale recommendation responses. The demo stays isolated.

## Verification and rollout

Use unit tests for ranking/counting/unknown data; real SQLite tests for credential expiry/replay, profile isolation, atomic/idempotent snapshots, history ordering/removal/import, and migration preservation. Browser tests cover the complete returning-user journey, a separate browser with the same name, new-round persistence, settings, reuse, network failures, expiry/forgetting, and existing room behavior. Run a production build and the release checks before completion. My meals and Recent meals refresh on visible focus and relevant successful mutations; obsolete responses are cancelled and preference drafts remain independently mounted.

For localhost releases, back up SQLite and stop the existing process before replacing `.next`, then start with the migration/readiness checks and verify original rows. Render releases follow the separate [deployment/recovery guide](deployment.md), using runtime migrations and the HTTPS origin. Record evidence and commit using the user's Git identity.
