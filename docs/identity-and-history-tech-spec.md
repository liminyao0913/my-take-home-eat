# Browser identity and history implementation

Implements [the product plan](identity-and-history-plan.md), using the existing Next.js service and SQLite. The configured origin is read from `.env.local`; the user's current LAN origin is retained.

## Storage and identity

Add four tables: `profiles` (name, cuisine/budget defaults), `browser_credentials` (hashed cookie, optional profile ID, expiry, one-time legacy-import eligibility), `profile_rooms` (profile/room membership, participant ID, creator/joiner role, hidden flag), and `profile_rounds` (one personal signal snapshot per profile/room/round).

The existing guest cookie remains the credential. New profiles are created only by successful room creation/joining or an explicit legacy import. Room viewing and the demo create neither profiles nor memberships. A profile ID, display name, or email is never an access credential.

Migration registers existing participant token hashes as legacy credentials, with a 30-day adoption window. It does not infer creator roles or import preferences/history automatically. New profile credentials expire after 180 idle days. Recognized profile activity renews expiry at most once per day; the response cookie uses the same absolute expiry. Requests prune expired profiles and their personal records. Credential hashes remain as minimal revocation records, so replaying a forgotten/expired credential cannot restore old room ownership or trigger legacy import. Deletion does not change shared participants, votes, or frozen results.

## Personal history and closure

Successful creation/joining links the room, reactivating an explicitly hidden history entry only on an explicit join. Removing history hides that membership and deletes its personal recommendation snapshots. Merely viewing a room, polling, or starting another round must not restore hidden history.

Finalization captures active, unexpired, visible profile memberships and their submitted approvals plus any approved group winner they did not block. Store even an empty signal array to count the round in the latest-20 participation window. Capture and the frozen room result commit in the same immediate transaction, on both early and deadline closure. A unique profile/room/round key prevents duplication. New rounds can then delete live options/responses safely.

History reads settle the profile's expired open rooms, then list open rooms first and closed rooms by effective closure time, 20 per page. Current and prior round outcomes remain room context; personal signal snapshots establish personal approvals only. Explicit legacy import links provable memberships and may capture a current closed round when intact inputs establish participation; older aggregate archives never produce invented personal votes.

## API

All responses are private/no-store, identity comes from the cookie, and mutations retain the exact `APP_ORIGIN` check.

| Route | Behavior |
| --- | --- |
| GET /api/profile | Own profile/defaults and legacy-import availability, or an anonymous state. |
| PUT /api/profile | Update default name and cuisine/budget only. |
| DELETE /api/profile | Forget personal data and revoke/clear the browser credential. |
| POST /api/profile/import | Explicit, one-time adoption of existing browser memberships. |
| GET /api/profile/rooms?offset=0 | Paginated own history, including available ideas and round outcomes. |
| DELETE /api/profile/rooms/:roomId | Remove a room from personal history and recommendations. |
| GET /api/profile/rooms/:roomId/ideas/:optionId | Read an authorized past idea into a new draft; omit the old time. |
| POST /api/profile/recommendations | Rank history using submitted cuisine/budget and area; optionally include other areas. |

Create/join accept optional cuisine/budget values explicitly chosen for the new room. Room preference saves accept an optional `remember` boolean; only that flag updates profile defaults. Existing clients continue to work without these fields.

## UI and recommendation rules

Add `/me` for defaults, history, import, removal, and forgetting. The home form welcomes a recognized browser, links to recent meals/settings, and pre-fills its name. Create/join show saved cuisine/budget with visible opt-out and editing. Room preferences add an unchecked remember control. New room and profile edits never rewrite existing room preferences.

Recommendations use the last 20 known completed participation rounds within 180 days, collapse only matching known name/location pairs, and rank by current preference matches, distinct personal-approval rounds, distinct approved group-pick rounds, recency, then stable source order. Offer at most three. Other-area suggestions require an explicit action when an area was supplied. The response includes factual counts/reasons and previous estimated metadata. A suggestion or history idea fills an editable option with a fresh start time; no votes, people, or deadlines are copied.

Keep ordinary creation usable if personalization fails. Preserve drafts on errors and discard stale recommendation responses. The demo stays isolated.

## Verification and rollout

Use unit tests for ranking/counting/unknown data; real SQLite tests for credential expiry/replay, profile isolation, atomic/idempotent snapshots, history ordering/removal/import, and migration preservation. Browser tests cover the complete returning-user journey, a separate browser with the same name, new-round persistence, settings, reuse, network failures, expiry/forgetting, and existing room behavior. Run a production build and the release checks before completion.

Back up the live SQLite file, stop the existing process before replacing `.next`, apply migrations, and verify original shared-room rows. Start the updated app using the current LAN origin and smoke-test that address with independent browser sessions. Record evidence and commit using the user's Git identity.
