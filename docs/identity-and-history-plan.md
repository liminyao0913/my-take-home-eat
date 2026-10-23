# Remembered users, preferences, and meal history

Status: implemented and verified on the LAN host, October 23, 2026. Render is now the selected public host; the hosted core flow, real deadline, and redeploy persistence also passed. See the [implementation spec](identity-and-history-tech-spec.md) and [verification record](verification.md) for delivery details and remaining hardening work.

This is a separate feature plan. It covers recognizing returning users, reusable preferences, a personal room history, and suggestions when creating a meal. The broader `next-features-plan.md` is outside this work.

## 1. Direction and decisions

Help a returning person start the next meal with less typing: remember what they like, show their previous rooms, and offer a few familiar places they can propose again.

**Confirmed in this discussion:**

- Use automatic browser identity instead of email lookup. The user selected keeping history tied to the browser.
- No sign-up or login screen. A different browser or computer starts a separate identity.
- If email is reconsidered, the user wants an unverified identifier with no verification messages. Email verification is not part of this plan.
- Continue using SQLite and the existing shared-room flow.
- Plan first; the user subsequently authorized implementing this separate plan.

**First release:** a remembered browser profile, reusable cuisine/budget defaults, **My meals**, and up to three history-based suggestions in the create-room form. Device transfer and account recovery are deferred.

## 2. Identity options

A display name or email tells us what someone calls themselves. A browser-held secret lets the service recognize the same returning browser. These serve different purposes; a typed email alone does not prove who is using it. OWASP distinguishes identifiers from authentication and recommends verifying an email when it is used as an account username. Here, the user has chosen browser continuity instead. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

| Option | Everyday experience | Another computer | Tradeoff and decision |
| --- | --- | --- | --- |
| **Automatic browser identity** | Enter a name when first creating or joining; return without another identity step. | Starts fresh. | Reuses the current guest-cookie approach. Best fit for the selected scope. |
| **Unverified email lookup** | Type the same email to load its saved profile. No mail is sent. | Works by typing the email. | Anyone who knows the email can retrieve the same history and room links, and potentially change that profile. Not selected. An email must never silently grant control of an existing participant’s votes. |
| **Private recovery code** | Same automatic browser flow; optionally save a generated secret once. | Paste the secret to restore the profile. | Avoids email infrastructure, but introduces credential storage, recovery, and revocation. A later option if device switching becomes important. |
| **Private personal link / QR** | Save or scan a link that grants profile access. | Opens the profile on the other device. | Easy to confuse with the public room invite. Prefer a short-lived pairing flow if added later, rather than a permanent profile-access link. |
| **Passkey** | Device confirmation when registering or restoring access; no typed password. | Depends on available passkey/device support. | An optional future authentication method requiring a secure context. The selected Render HTTPS host removes the former HTTP transport obstacle, but passkeys remain outside scope. [MDN WebAuthn](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API) |
| **Name, IP address, or browser fingerprint** | Attempts to guess who is returning. | Unreliable. | Names collide, people share networks, and device characteristics change. Do not use these as the access credential. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#adaptive-or-risk-based-authentication) |

The selected option recognizes a browser, not a verified real-world person. Sharing a browser profile also shares access to its saved meals. Clearing cookies, using a private window, changing browsers, or switching the site's hostname can lose continuity. Browser cookie lifetime and removal are controlled partly by the browser. [MDN cookie guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)

## 3. What the user sees

### First meal

1. Enter a display name and create or join a room as today.
2. The service automatically establishes a browser profile when that action succeeds. Merely viewing a room or trying the demo does not add it to personal history.
3. Show a small explanation: **“Your meals are remembered in this browser.”** Link to the personal settings controls without adding an onboarding screen.
4. Offer **“Remember cuisine and budget for future meals”** when saving room preferences. This is optional and starts unchecked.

The display name can be prefilled next time and changed for a particular room. Changing a default name does not rename people in old rooms.

### Returning home

Keep **Create a meal room** prominent. Add a compact personal area:

- **Welcome back, Alex** and **My preferences**.
- **My meals**, with open rooms first and recent closed rooms below.
- **Ideas from your past meals** inside the create form, after the date and optional area are chosen.

A suggestion card contains the place, known location/cuisine/price, one reason, and **Add to this meal**. Example: **“Little Thai — you approved it in two previous rounds; matches your saved cuisine and budget.”** Show counts only when those records actually exist.

### Shared browser or lost identity

Provide **Forget this browser** in personal settings. It clears the profile’s saved defaults, personal history links, and recommendation records, and removes its browser credential. Explain before confirming that old shared-room contributions remain and this browser will lose the ability to edit those old participant inputs. A fresh browser identity can join an open room normally.

There is no name/email-based recovery in the first release. If all browser credentials are lost, the service cannot recognize the old owner. Someone can still open a room using its shared link, but that link does not restore the previous participant identity or personal profile.

## 4. Reusable preferences

Keep reusable defaults distinct from the inputs submitted to a particular meal.

| Value | Remember for future meals? | Application rule |
| --- | --- | --- |
| Display name | Yes. | Prefill; allow a room-specific name. |
| Cuisine choices | On explicit save. | Offer them when creating or joining a new room. |
| Preferred price ceiling | On explicit save. | Offer it when creating or joining a new room. |
| Preferred time window | No. | Ask for this meal; dates and schedules change. |
| Approvals, vetoes, veto reasons, readiness | No. | Fresh input for each new room/round; never copy these from history. |
| Area | No automatic profile default in this release. | Use the new meal’s area to narrow suggestions when supplied. |

When defaults exist, the create/join form shows a compact **“Use my saved preferences: Thai · up to $$”** control, checked by default and editable before submission. Submitting with it checked copies those values into this room; unchecking starts with empty room preferences. Nothing is submitted merely by viewing the room.

Saving preferences within a room updates that room only. Checking **“Remember cuisine and budget for future meals”** also updates the reusable defaults, including explicit clearing of them. Editing personal defaults later does not rewrite any existing room or frozen result. The settings page explains: **“Used for future meals; existing rooms keep their saved preferences.”**

The existing same-room new-round flow continues to retain that room’s preferences and asks people to review their time window. Reusing a room is distinct from creating a new room with reusable defaults.

## 5. Personal room history

**My meals** contains rooms this browser profile created or explicitly joined. Opening an invite link alone does not create a history entry. Keep demo fixtures out of real history and recommendations.

Each room appears once, with:

- Title, date, area when known, and **Open**, **Decided**, or **No winner** status.
- Latest round number and outcome; previous rounds are available by expanding the room entry.
- **Created by you** or **Joined by you** when known; **You left** when applicable.
- **Open room**, **Use a past idea**, and **Remove from my history** actions.

Show open rooms first; order closed rooms by their latest round closure. Start with 20 entries and allow loading older ones. A room starting another round updates its existing entry rather than making duplicates.

Leaving a room retains its history entry, marked as left, but does not rejoin the user. Removing a room from personal history also excludes that room’s records from future recommendations. It does not delete the shared room or change anyone’s votes/results. It stays removed after refresh; explicitly joining that room again may add it back.

Call past outcomes **“The group’s pick”** or **“Suggested meal”** according to the existing result rules. A selected restaurant is not evidence that anyone actually ate there. Do not show visit counts or claim personal attendance.

**Use a past idea** inserts editable place details into a new-room draft. The user selects the new date/time and reviews restaurant information. It copies no participants, approvals, vetoes, readiness, or time preferences; the new ten-minute deadline begins only on creation.

## 6. Recommendations for a new room

Recommendations help the creator propose options. The existing group decision rules still choose the winner after people respond.

### Candidate pool

Use the creator’s last 20 completed, known participation rounds within the previous 180 days. These are proposed starting limits, not usage-based tuning claims. Include:

- Options the creator explicitly approved, whether or not they won.
- Group winners with at least one approval in those rounds, provided the creator did not block that option in that round.

A no-vote fallback or no-winner result supplies no group-pick signal. An explicit personal approval can still supply a personal signal, including when the round had no winner. Someone else’s unrelated room supplies neither. All of the user’s known outcomes can appear in history and be manually reused.

Collapse repeated places only when their normalized name and known location match; names alone are insufficient to identify a restaurant branch. When location is missing, keep uncertain records separate or deduplicate only the same source option. Do not add external restaurant lookup in this feature.

When the creator supplies an area, first use candidates from history with the same normalized area label. Explain that this is a recorded area match, not a distance calculation. If there are no matches, offer **Show other past areas** rather than silently suggesting distant places. With no area, show known locations on the cards so the creator can judge relevance.

### Simple, explainable ranking

Rank the candidate pool in this order:

1. **Current preference match:** fraction of answered cuisine/budget preferences matched, using the values the creator has chosen for this new room. Saved defaults provide the initial values; edits take precedence, and unchecking their use leaves this step tied unless new preferences are supplied. Unknown restaurant fields earn no confirmed match.
2. **Personal approvals:** number of distinct qualifying rounds in which the creator approved the place, descending.
3. **Approved group picks:** number of qualifying rounds in which it won with at least one approval, descending.
4. **Recency:** most recent qualifying round first; use stable source order for an exact tie.

Return up to three distinct candidates. One round contributes at most once to each count for a place; refreshes, retries, and multiple copies of an option must not inflate it. A personal approval and a group win can both be recorded, but they remain separate ordered signals rather than an unexplained combined score.

Use the latest available manually entered details and label them as previous estimates. Historical price/cuisine details may be wrong or stale. Do not imply current opening hours, availability, dietary suitability, or travel time.

### Behavior and limits

- Explain the actual reason: **“You approved this twice”**, **“A previous group pick”**, or **“Matches your saved cuisine and budget.”** Distinguish personal approval from a group outcome.
- Clicking **Add to this meal** creates an editable draft option. Use the new meal’s date and a valid new start time; never reuse an expired timestamp.
- The creator may accept several suggestions, ignore them, or type a different option. Creating an empty room remains available.
- Once added, a suggestion behaves exactly like any other proposal. It receives no automatic approval or preference bonus in the group’s final scoring.
- Historical vetoes stay with their original rounds. They are not permanent dietary diagnoses or new-room vetoes.
- With no usable history, show a short empty state and the normal manual form. Do not invent personalized recommendations.
- If history cannot load, keep manual creation working and offer retry. Do not discard the creator’s draft.

## 7. Existing data and implementation boundaries

Before this feature, the service issued a random HttpOnly guest cookie lasting 30 days on create/join and stored its hash on room participant records. Preferences were room-specific. Closed round results were archived, but starting another round deleted its old options/responses; a result snapshot contains aggregate counts, not a complete per-person voting history. This is the legacy migration boundary. See [identity.ts](../src/server/identity.ts), [schema.ts](../src/server/schema.ts), and [rooms.ts](../src/server/rooms.ts).

The [implementation spec](identity-and-history-tech-spec.md) covers these changes in SQLite:

- A stable internal browser-profile ID, saved defaults, and the credential association. The profile ID itself must not grant access; possession of the browser credential is required.
- A per-profile room index with origin/participation status, personal removal state, and round references.
- Minimal personal recommendation records captured from submitted choices when a round closes, before later rounds remove the old options/responses. Keep enough place metadata and provenance to explain each suggestion.
- Atomic, idempotent capture for both early and deadline closure. Existing room results and the recommendation records must agree even after a restart or concurrent requests.

On first use after the feature is enabled, offer **Add existing meals from this browser** using only participant records matching the presented guest credential. Do not link profiles by matching display names or email strings. Import known room memberships; do not automatically promote old room preferences into reusable defaults.

Legacy adoption is a one-time path. It must not revive forgotten/expired profiles or removed history entries by repeatedly scanning old participant records. Include that boundary in the migration and expiry tests.

Older archived results may be displayed as room context, but they do not establish the user’s participation or personal approval in each past round. Do not reconstruct missing individual votes from aggregate counts or current membership. Only use legacy recommendation signals when the surviving records establish the relevant participation and response; otherwise begin collecting those signals from this release onward. Unknown creator roles should be displayed as **Joined**, without inventing authorship.

Implemented lifecycle: remembered browser access lasts 180 days of inactivity, with matching server-side expiry. Recognized activity renews access at most once a day. Requests remove expired personal profiles/defaults/recommendation records; shared-room data remains. Cookie removal can end access sooner. Minimal revoked credential hashes prevent old participant records from reviving expired or forgotten identities. Existing credentials have a 30-day adoption window after migration; no history is imported automatically.

Personal profile/history endpoints must not expose one person’s collection through a room snapshot, a guessed profile ID, or a display-name query. A room invite still grants the existing room access only.

The original LAN address uses HTTP, which does not protect browser-held secrets against network interception; HttpOnly is not transport encryption. The user subsequently selected Render HTTPS hosting. Verify its Secure cookie and exact origin behavior through the [hosted release checks](deployment.md#local-and-hosted-release-checks); the original HTTP prototype is not the public release target. [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

## 8. Delivery order and acceptance

| Stage | Deliverable | Acceptance check |
| --- | --- | --- |
| 1. Browser profile | Automatic continuity, editable default name, forget action, expiry behavior. | Same browser returns without logging in; a separate browser with the same name sees a separate profile. Viewing a room or demo alone creates no history. |
| 2. Saved preferences | Explicitly remembered cuisine/budget; visible application on create/join. | Defaults survive restart and prefill future meals. Unchecking applies none. Existing rooms/results and meal-specific time windows remain unaffected. |
| 3. My meals | Created/joined rooms, rounds, outcomes, safe removal, migration of provable legacy membership. | Separate profiles see only their own collection; same-room rounds do not duplicate entries; leaving/removal behaves as described; missing old personal votes remain unknown. |
| 4. Recommendations | Candidate collection, deterministic ranking, reason text, editable insertion. | Known history produces the expected three suggestions; missing metadata, ties, duplicates, areas, stale times, no-vote outcomes, and cold starts are covered. Suggestions add no votes. |
| 5. End-to-end release | Production build with actual SQLite and independent browser sessions. | Create → save defaults → close → return → inspect history → create using a suggestion. Verify reset/expiry, network retry, cross-profile access rejection, migration, restart persistence, and existing voting/round behavior. |

Product targets: a returning person can draft a meal from a past idea in under 30 seconds, explain why it was suggested, and create/join without an email or login step. These are targets to verify, not measured claims.

## 9. Settled implementation decisions

The identity direction is automatic browser identity and no email lookup. Four additional SQLite tables hold profiles, hashed browser credentials, personal memberships, and per-round signals. Finalization and personal signal capture are atomic. Private APIs support defaults, paginated history, one-time adoption, removal, forgetting, and recommendations. Automated SQLite and browser tests cover these boundaries; release evidence is recorded separately.

Keep the first release focused on browser continuity, saved cuisine/budget, room history, and creator suggestions. Revisit device transfer only if users need it; it should require proof from an existing browser or a saved private credential, not merely a matching email or name.
