# Let's Eat — next feature plan

Status: product proposal, October 22, 2026. The user confirmed that **meals soon** remain the main flow and chose to **drop email notifications** because they require a sending service and sender setup. Other recommendations below are discussion defaults, not implemented features.

Scope note, October 23: this brainstorming plan remains deferred. Browser defaults/history/recommendations were delivered through the separate [identity extension](identity-and-history-plan.md); recent meals, participation counts, early finish, and repeat rounds were implemented elsewhere. Its older cookie-lifetime and “future” statements are historical proposals, not current behavior. Discovery, notifications, and copying whole rooms remain out of scope.

The [v1 plan](plan.md) describes the current product. This proposal extends it while keeping one shared link, no accounts, small groups of 3–8, a ten-minute decision window, and SQLite.

## 1. Recommended direction

**Find a few nearby places → share a room → vote → see the result → reuse the setup next time.**

| Request | Recommendation |
| --- | --- |
| Organizer supplies a default meal or several options | Keep manual entry and add restaurant discovery from a ZIP code. One option is valid; encourage three to five. |
| Several groups use the service together | Keep each room independent on the existing SQLite service and verify a concrete concurrency target. |
| Notify people when a decision is made | Add an in-page result popup now. Consider optional browser push after HTTPS. Collect no email addresses. |
| Copy a room | Offer “Plan this again,” opening an editable draft with a new date and a fresh room link. |
| Persist each person's preferences | Offer saved cuisine and budget defaults in the same browser. Keep availability, votes, and exclusions specific to each room. |
| Other useful features | Prioritize duplicate-place warnings, directions, and a small recent-rooms list. Defer features that turn this into a social network or scheduling system. |

An organizer starts a suggestion, not a privileged vote. Retain the current rule: exclude blocked options, then compare approvals, preference scores, and proposal order. Google search ranking never replaces the group's decision rules.

## 2. Starting a room and finding places

### Two ways to propose a meal

**“I have a place in mind.”** Keep the current form for a restaurant, cafeteria, park, or other meeting place. The organizer can submit one option or add several. A single option still gets the full voting window; a block can produce no winner.

**“Find places near a ZIP code.”** Start with five-digit US ZIP codes as the proposed location scope. ZIP is the only required *location* input. A display name and a meal date/time still belong in the room setup, with the current convenient defaults and an editable title.

The discovery flow:

1. Enter a ZIP code and click **Find places**. Make the request on submission rather than on every keystroke.
2. Show up to six restaurants with their name, address, and **View on Google Maps** link. Describe them as near the ZIP; do not promise an exact postal boundary or walking distance.
3. Offer **Use the first three** or let the organizer select individual places. Show the selection before publication. If fewer than three exist, use the available choices.
4. Set one shared start time, with a per-option override available. Review each selected option's cuisine and price estimate for preference scoring.
5. Click **Create room**. Only then does the ten-minute countdown start. Searching and reviewing do not consume voting time.

The organizer's first published option is the starting suggestion. With no votes or preferences, the existing first-eligible-option rule applies. It never overrides a block. Allow ordering the draft before publication so this fallback is visible and intentional.

Participants can use the same ZIP search from **Add a meal idea**, alongside manual entry. They normally search the room's ZIP; adding a proposal does not silently change the room's area. A search that finishes after the deadline cannot add an option.

Example discovery screen, using illustrative place names:

~~~text
Find a place nearby
ZIP code [94107]                    [Find places]

[ ] Noodle House     100 Example St     [Google Maps]
[ ] Taco Corner     200 Example St     [Google Maps]
[ ] Garden Cafe     300 Example St     [Google Maps]

[Use the first three]             [Use selected places]
[Add a place manually]
~~~

### What Google supplies, and what the group decides

Use **Google Places API (New), Text Search**, with a location-specific restaurant query. Start with a list rather than an embedded map. Text Search supports field masks and result limits; the exact request belongs in the follow-up technical spec. [Google Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search)

Keep the first version economical: names, addresses, place IDs, and Maps links are enough for discovery. Photos, reviews, star-rating filters, travel-time calculations, and personalized search ranking can wait. Google price and opening-hours fields increase the request's billing tier; requesting them should be an explicit product/cost choice. [Google field tiers](https://developers.google.com/maps/documentation/places/web-service/text-search)

For the initial integration, the proposer supplies the cuisine category and rough price level used by our scoring algorithm. Keep these as participant estimates, just as in v1. Missing provider metadata must not silently become “budget” or a matching cuisine. This adds two quick choices per selected place but preserves the current scoring rules and avoids making closure depend on a live Google response.

If we later want Google to fill those fields automatically, define missing-value behavior, field costs, and permitted retention first. Clicking “confirm” on imported data does not by itself turn Google content into unrestricted user-authored data.

An “open now” indicator is not proof that a restaurant will be open at the selected meal time. For now, let people inspect the Maps page and use “Can't do this” for a real constraint. Avoid automatic dietary suitability claims or restaurant availability guarantees.

### Integration boundaries

- The local environment contains a variable named `GMAP_KEY`. Its value stays on the server, outside source control and browser responses. Key presence has been checked; API enablement, billing, and restrictions have not been tested.
- Enable Places API (New) and use a restricted server key. Send only discovery inputs to Google, such as ZIP and restaurant query; participant names and private preferences are unnecessary. [Google API key guidance](https://developers.google.com/maps/api-security-best-practices)
- Use explicit field masks, bounded result counts, search rate limits, and a project request quota. Room polling must not trigger another Places search. Billing must be enabled; avoid relying on an assumed free allowance. [Google usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- Show Google Maps attribution on Google-sourced cards and provide the required public terms/privacy pages. Persist place IDs and the group's own inputs separately from provider display content. Places content has storage restrictions; place IDs have an explicit retention exception. Do not copy Google responses into our permanent option/result snapshots or a restaurant catalog by default. [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- The technical spec must define how provider display data is fetched, attributed, and refreshed within those rules. Live display changes must never recalculate a closed decision. Retain the winning place ID, chosen time, and the group's decision independently of provider availability.
- For an invalid ZIP, empty results, quota exhaustion, or a provider outage, preserve the draft and offer **Try another ZIP** and **Add manually**. A Google failure must not block existing rooms, votes, or result finalization.

Before release, exercise real searches for representative ZIP codes, including a sparse area and one with leading zeros. Treat the ZIP as text. Avoid adding geocoding, exact-radius search, or a map until the initial search quality shows a need.

## 3. Several groups at the same time

The current data model already supports multiple rooms. Options, participants, responses, and results belong to a room, and one browser can participate in several rooms. We should strengthen and measure this behavior rather than introduce organizations or permanent group accounts.

**Proposed first capacity target: 20 simultaneous rooms with eight active people each.** This is a test target, not a measured capacity claim. At the current three-second polling interval, 160 visible browsers generate about 53 room reads per second before mutations.

Keep one application service and SQLite on a local persistent disk. WAL permits readers alongside a writer, but SQLite still serializes writes. That makes short transactions and realistic load tests important. [SQLite WAL documentation](https://www.sqlite.org/wal.html)

Implementation principles:

- Scope every read and mutation to its room and the caller's participant identity. A person joining room A gains no authority over room B.
- Keep saved preference defaults separate from each room's submitted preference snapshot. Editing a default must not change several active rooms at once.
- Keep Google requests and any future push delivery outside database transactions. A slow provider must not hold the database write lock.
- Continue pausing polling in hidden tabs and stopping after closure. Add small polling jitter if tests show synchronized bursts.
- Bound search usage separately from room voting. Apply guest-level limits plus a generous shared-IP limit so coworkers behind one network are not mistaken for one person.
- Measure latency, errors, write-lock waits, and provider usage. Upgrade the current host or optimize demonstrated bottlenecks before adding infrastructure.

The initial test should sustain the target load for a full ten-minute round, including simultaneous joins, votes, preference updates, and a burst of deadlines. Proposed gates: room API p95 under 500 ms on the test host, active-page updates within five seconds, no lost acknowledged writes, no room-data crossover, and consistent frozen results. Record the hardware and results before making a capacity claim.

SQLite remains the database choice. Multiple application machines sharing its file over a network filesystem are outside this plan. A larger capacity target should trigger a measured follow-up design, not an automatic database substitution.

## 4. Result notifications

### Start with an in-page popup

When an open room becomes closed, show a small, dismissible **“Your meal is decided”** popup above the persistent result card. Include the chosen place/time and **View result**. Use **“No option worked this round”** for a no-winner result.

Keep it accessible and nonblocking: announce the update, support keyboard dismissal, and preserve the person's focus. Do not open a separate browser window. The full result remains on the page after the popup disappears.

Show the announcement once per room/result in a browser, rather than after every poll or reload. Returning from a hidden tab triggers a refresh; if the person has not seen the result, announce it then. Someone opening an already-closed room sees its result immediately.

### What happens if the person leaves?

| Situation | Next-release behavior |
| --- | --- |
| Room is visible | Show the popup as soon as the result is fetched. |
| Tab is hidden or the connection drops | Refresh and show the result when the page becomes active or reconnects. Immediate background delivery is not promised. |
| Page is closed | Show the result when the person returns. The current HTTP site cannot deliver an OS notification by itself. |
| Someone wants to tell the group elsewhere | Use the existing **Copy meal summary** action and their group chat. |

**Email is dropped from scope.** We will not ask people for an address or set up an email sender.

### Optional browser push later

Push is the option to revisit if people need a notification while the page is closed. It does not require an email account, but it needs a secure HTTPS origin, a service worker, a subscription, and explicit user permission. Browser/OS support and settings affect delivery; on iOS/iPadOS, the supported flow includes a web app added to the Home Screen. [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [WebKit push support](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)

Offer **Notify me when this room decides** only in a supported environment, after the person has joined. Ask permission on that click, never at page load. Permission denial leaves normal participation working. Subscriptions are opt-in per room, remain private, and are canceled when someone leaves. Reusing a browser permission must not automatically subscribe someone to future or copied rooms.

The existing HTTP address on port 3000 stays the current deployment. HTTPS and its endpoint configuration are a separate prerequisite to releasing push; this plan does not change that address.

Push also requires a backend change: today a request materializes the result after the deadline. A small supervised worker on the same host would periodically find due rooms, finalize through the same transaction logic, and record notification jobs in SQLite. A sender then delivers outside the transaction, retries temporary failures, and removes expired subscriptions. Durable job IDs and client notification tags reduce duplicate announcements. Restarts must resume pending work; stale notifications after the meal start should expire. Do not promise exactly-once or guaranteed OS delivery.

Keep this worker and delivery queue out of the first popup-only release. The current request-driven finalization is sufficient for showing an in-page result.

## 5. Copying a room

Add **Plan this again** to both open and closed rooms. Anyone with the room link can use it to start an independent room, without becoming an administrator of the original.

Open a draft first:

| Bring into the draft | Start fresh |
| --- | --- |
| Editable title, ZIP/general area, and room time zone | Room ID, share link, and countdown |
| Current, nondeleted meal proposals in their original order | Participants and option ownership |
| Participant-authored option details and Google place references | Approvals, blocks, private preferences, and result |
| Suggested meal times, clearly requiring review | Notification subscriptions and delivery state |

The person copying selects a new meal date, checks that every time is after the new deadline, and can remove or replace proposals. Flag times that would be in the past or invalid because of a time-zone transition. Re-fetch provider details where permitted; copying a room must not duplicate stale Google content into permanent storage.

Previously blocked places may be reconsidered because this is a new group decision. Show that their old exclusions do not carry over in the draft review. Removed options stay removed.

The copier becomes the proposer of the new room's initial options. Only **Create room** starts its countdown. The original stays unchanged, and its old link continues to show its original state. Other people join the new room through its new link; copying does not enroll them automatically.

## 6. Remembering preferences without accounts

**Today:** preferences are already persisted in SQLite within each room. Returning with the same guest cookie restores them. There is no reusable preference profile for a future room.

**Recommendation:** add an optional **Remember my usual preferences on this browser** setting.

| Value | Reuse across meals? |
| --- | --- |
| Favorite cuisines | Yes, when the person chooses to remember them. |
| Usual price ceiling | Yes, as an editable starting point. |
| Available start-time window | No; ask for this meal's availability. |
| Votes and “Can't do this” flags | No; they apply to a specific proposal and round. |
| Notification opt-in | No; subscribe separately for each room if push is added later. |

Store the defaults in SQLite under the existing guest identity hash. In a new room, show a short summary such as **“Usual preferences: Thai or Italian, up to $$”**, with **Use for this meal** and **Edit**. Applying them writes a separate room snapshot; merely viewing the room does not affect the score.

Editing a room's preferences affects that room. Updating remembered defaults is an explicit separate action and affects future suggestions. A preference change never rewrites a closed result or another room's inputs.

Provide **Forget saved preferences**. This removes the reusable defaults and explains that already-submitted room inputs have their own history. For a simple initial retention policy, expire saved defaults after 30 days of inactivity, aligned with the existing guest-cookie lifetime.

“Remembered” means this browser on this site. Clearing cookies, using private browsing, switching computers, or changing the site's origin can lose access. Display names are not identifiers. Cross-device recovery and account syncing remain future topics; email is not introduced indirectly for this purpose.

## 7. Other features worth adding

| Feature | Value | Recommendation |
| --- | --- | --- |
| Duplicate-place warning | Keeps votes from splitting across accidental duplicates. | Add with Google discovery. Compare place ID plus start time; the same restaurant at another time remains a valid separate option. Point to the existing card instead of merging votes automatically. |
| Directions on the winning card | Helps the group act immediately. | Add a Google Maps link using the place ID or manual location. Maps URLs do not require a Maps API key. [Maps URLs guide](https://developers.google.com/maps/documentation/urls/get-started) |
| Recent rooms in this browser | Makes it easier to return and use “Plan this again.” | Good follow-up. Show a short list of rooms this guest joined, without a public room directory or permanent group accounts. |
| Add to calendar | Makes the chosen date/time easy to save. | Follow-up after the result and copy flow are solid. Keep it a download/action rather than a calendar-account integration. |
| QR invite code | Convenient when coworkers are physically together. | Optional small enhancement; the shared link remains the main entry point. |
| Visible participation count | Helps people notice incomplete input. | Consider “4 of 6 joined people have responded.” Count only joined participants and never imply that absent invitees agreed. |
| Early finish | Could shorten an easy decision. | Defer. A shared link does not tell us whether everyone expected has joined; this also introduces organizer authority and deadline races. |
| Dietary notes and richer filters | Could improve suitability. | Revisit after real use. Keep explicit blocks and restaurant checking; do not infer allergy safety from cuisine or search metadata. |

Continue to defer chat, reservations, payments, social feeds, automatic recurring meetings, long-range scheduling, and complex fairness algorithms. The existing group chat handles conversation.

## 8. Delivery order

| Milestone | Scope | Completion check |
| --- | --- | --- |
| A. Make repeat use easier | Room copy, remembered cuisine/budget defaults, in-page result popup | New rooms start clean; applying defaults is explicit; the popup is accessible and does not repeat. |
| B. Find nearby options | ZIP discovery, participant search, manual fallback, duplicate warning, Maps actions | Real ZIP searches are useful; provider failure leaves the room usable; Google data handling and cost controls are documented and verified. |
| Across A and B | Independent groups and load verification | Meet the proposed 20-room target with no lost writes or room crossover. |
| C. Reach people after they leave, if needed | HTTPS, optional web push, durable deadline worker and delivery jobs | A subscribed test device receives the result with every room page closed; denial, unsubscribe, restart, and retry cases behave correctly. |

Before implementation, extend the technical spec with the selected milestones. Likely additions are optional room ZIP/place-reference fields, reusable guest defaults, and a create-from-room flow. Only milestone C adds notification subscriptions and jobs. Keep SQLite; do not add a queue service or a separate database merely to support these features.

## 9. Verification plan

These are future acceptance checks, not claims that the features already exist.

| Scenario | Expected behavior |
| --- | --- |
| Organizer starts with one manual option or a ZIP shortlist | Both produce a normal room; the timer begins only after creation. |
| ZIP is invalid, has leading zeros, or has few results | Input is handled correctly; a useful correction or manual path is available. |
| Google is slow, unavailable, or over quota | Drafts survive; existing rooms can vote and finalize without Google. |
| Two people add the same Google place/time | The duplicate is identified without combining unrelated votes; another time stays valid. |
| Several rooms have overlapping participants | Inputs, private preferences, and results stay scoped to the correct room. |
| Target concurrent load and simultaneous deadlines | Accepted writes persist and every participant gets the same result for their room. |
| A result appears during voting, after reconnect, and after reload | The result remains visible; the popup is announced once rather than on every fetch. |
| A closed or open room is copied | The new link, date, timer, ownership, and votes are independent; the original is unchanged. |
| Saved defaults are applied, edited, or forgotten | Only explicitly applied room preferences affect scoring; other rooms and closed results remain intact. |
| Another browser visits | It cannot retrieve the first browser's saved defaults or automatically inherit its identity. |
| Future push: all pages closed, permission denied, or subscription removed | Opted-in supported devices can be notified; denied or canceled subscriptions receive no new sends. |
| Future push: worker or sender restarts near the deadline | One frozen decision survives; pending jobs resume with bounded retries and expired jobs are skipped. |

Use controlled Google responses for routine browser tests and the load run, then a small real-provider check for the configured key and attribution. For push, test real supported devices as well as automated permission/error cases. Retain the existing preference, block, deadline, persistence, and clipboard regressions.

## 10. Choices for the next technical discussion

- Are six discovery results and a suggested three-place shortlist the right size?
- Is US ZIP discovery sufficient for the first integration?
- Accept participant-entered cuisine/price estimates initially, or spend more effort on Google-derived metadata and its storage/missing-value rules?
- Does the in-page result announcement meet the immediate need, or is closed-page push worth the HTTPS and device setup?
- Accept the proposed 20-room capacity target, then measure on the current host?

The main product direction is settled for this draft: meals soon, no accounts, SQLite, one shareable room link, and no email notifications.
