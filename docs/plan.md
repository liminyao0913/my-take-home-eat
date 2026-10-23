# Let's Eat — simple v1 product plan

Status: product baseline updated for the [UX review](feedback/REVIEW.md), including early completion, repeat rounds, simpler setup, an instant demo, and [invitation completeness](feedback/round2-REVIEW.md). Implementation choices are in [the technical spec](tech-spec.md).

The implemented [identity/history extension](identity-and-history-plan.md) adds browser profiles, reusable cuisine/budget defaults, personal history, and suggestions. The broader [next feature plan](next-features-plan.md) remains deferred; its brainstorming is not the current delivery checklist. Security and capacity boundaries are specified in [self-review remediation for Render](self-reflect-remediation-tech-spec.md), preserving the meal decision rules below.

## 1. Product and audience

Help **3–8 friends or coworkers choose lunch or dinner soon** through one shared link, without signing up.

**Create a room → suggest meals → share preferences and vote → get a decision.**

Assume a small trusted group, one meal date, and one general area. The existing group chat handles discussion and sharing. Success means that creating a room takes about a minute, responding takes about thirty seconds, and a decision arrives within ten minutes.

## 2. Resolve the discussion points with simple defaults

| Question | V1 decision | Why |
| --- | --- | --- |
| Automatic or organizer-confirmed result? | Close automatically ten minutes after creation, or explicitly finish once all joined people are ready. An optional expected headcount requires organizer confirmation if people are missing. | Bounds the wait while distinguishing joined participants from expected invitees. |
| Choose the place and time separately? | Each option is one place at one start time. | Every vote describes a complete meal. |
| Must an option work for everyone? | Exclude any option explicitly marked “Can't do this” by a participant. If none remain, close without a winner. | Respect stated constraints without building an automatic constraint-matching system. |
| Show votes while people respond? | Show approval counts immediately. | The group can see where agreement is forming. |
| How sophisticated should preference scoring be? | Use an equal-weight match score for each person, then take the group average. | Easy to explain and verify; no adjustable weights or fairness formula. |

For exact ties, choose the earliest-added eligible option among those tied. This is predictable and needs no random draw. After closure, a participant can start another round using the same room and link.

## 3. The core journey

### Create

1. Enter a display name and meal date. Defaults suggest a meal an hour ahead in the browser’s time zone. Title, area, a zone override, and expected people (1–32, including the organizer) are optional details.
2. Add a place and start time, or choose to create the room first and add ideas together. Restaurant details are optional.
3. Create the room. Its ten-minute countdown starts now.
4. Copy the single room link into the group chat.

All option start times must be after the deadline, on the selected meal date. Show times in one clearly labeled room time zone. The date and deadline stay fixed within a round. A new round can use another date; the title, area, and time zone remain attached to the room.

### Join and respond

1. Open the link and immediately see the options and countdown.
2. Enter a display name when first contributing.
3. Vote for any acceptable options, add an option, and optionally fill in preferences.
4. Mark a specific option “Can't do this” if it genuinely cannot work; optionally share a constraint tag.
5. Mark “I’m done” when ready. Once every joined participant is ready, anyone in the room can confirm an early finish if everyone expected has joined or no headcount was set. If people are missing, only the organizer can explicitly choose “Finish without missing people.”

The room shows “2 joined of 4 expected” when a headcount is provided. It is an expectation, not a reserved seat list or a join limit. A missing invitee or unavailable organizer never extends the ten-minute deadline. Headcount and organizer identity stay with the room across new rounds; they are not editable in this first version. Clearing or forgetting the organizer's browser identity loses override access. Existing rooms without a headcount retain the original early-finish flow. The result and copied summary record the expected count and any organizer override.

People can do any combination of these actions. There is no required questionnaire. Readiness is optional when waiting for the deadline. Skipping preferences or votes leaves those inputs empty; silence is not agreement.

### Get the result

At the deadline or an explicitly confirmed early finish, close the round and choose using the rules in section 6. Inputs are frozen, and later visitors see the same result until another round starts.

Show the winning place, date, start time, location, price level, and a short reason: “Most votes,” “Best preference match,” “Votes tied; best preference match,” or “Tied; first proposed option selected.” Also show how many participants voted or supplied preferences so limited input is visible.

Provide a copyable summary with the room link. The service does not send messages or make reservations. When all options are excluded while open, show “No viable options right now” with a direct alternative-proposal action. After closure, participants can start another round here with new ideas, preserving names and preferences while clearing votes, constraints, and readiness. Archive the previous result. A winner with no approvals is labeled “Suggested meal” and asks the group to confirm before heading out.

## 4. What the product looks like

Use a mobile-first page with readable cards, a light background, dark text, and one accent color. Keep keyboard access, clear labels, and comfortable touch targets.

The shared page contains:

- **Header:** meal title, date, area, copy-link button, and countdown.
- **People:** a compact response count, expandable names, and each person’s response/readiness status.
- **Your preferences:** a small collapsible form.
- **Options:** meal cards with vote counts, “I'd go,” “Can't do this,” and a visible add-option button.
- **Readiness:** “I’m done,” ready count, and an explicit early-finish confirmation when all joined people are ready.
- **Result:** after closing, a prominent winner or no-winner message and a same-room new-round action.

On mobile, guests see the join form before the options. After joining, voting comes before the collapsed participant list and preferences; a small shortcut opens preferences.

The home page also links to **Try a demo**. Its fabricated options and participant inputs use the same decision function, with immediate results for votes, preference fallback, and all-excluded outcomes. Demo actions stay in the browser and never create real rooms or alter deadlines.

Example card:

~~~text
Noodle House                         3 votes
Today · 12:30 · Downtown
Thai · Mid-range

[I'd go ✓]       [Can't do this]
~~~

An excluded card shows “1 person can't do this” rather than looking like a viable leader. The open room shows live inputs; calculating and displaying preference rankings is only needed when it closes.

## 5. Inputs and participation

### Identity and ownership

- The same link works for the creator and everyone invited. Viewing requires no identity.
- A display name and browser identity are enough to participate. Returning in that browser restores the participant's inputs.
- People can change their own preferences, votes, and exclusion flags while the room is open.
- Each room identity contributes at most one approval per option. Names are not verified, and another browser can create another identity.
- Anyone with the link can join. This is intended for trusted groups.
- A participant can leave before closing, removing their preferences, votes, and flags from the decision. Their proposals remain available to the group.
- Only the organizer can override missing invitees when a headcount was provided. There is no cross-device identity recovery in v1.

### Meal options

Anyone can add an option containing:

| Field | Input |
| --- | --- |
| Place | Restaurant or meeting-place name |
| Location | Optional address or recognizable location description |
| Start time | A time on the room's date, after its deadline |
| Cuisine | Optional cuisine tag, chosen from the same list used for preferences |
| Price level | Optional budget, mid-range, or splurge estimate |
| Link | Optional menu or place link |

Unspecified cuisine and price remain unknown and earn no confirmed match for a supplied preference in that dimension. “Other” is a valid cuisine tag. Entry is manual; no restaurant lookup is required.

Once submitted, option details are fixed. Before the deadline, the author can remove their own option and add a corrected one. Removing it discards its votes and flags; a replacement starts fresh. This avoids editing a meal that people have already approved. Encourage three to five options. Each round now allows up to 20 current options; rooms allow 32 participant identities and 100 rounds. Rejoining an existing identity remains possible at the participant limit. Duplicate detection remains deferred.

### Personal preferences

All three scoring inputs are optional and belong to this room. Users can explicitly save cuisine/budget as browser defaults and copy them into future rooms; time windows stay meal-specific. Updating defaults does not change existing rooms. Blank fields, including an empty cuisine selection, are unanswered:

| Preference | Match rule |
| --- | --- |
| Favorite cuisines | The option's cuisine is in the person's selected set. |
| Preferred price ceiling | The option's price level is at or below the selected level. |
| Preferred start window | The option's start time falls within the selected window, including its endpoints. |

These are **soft preferences**. A preferred price ceiling or time window affects scoring; it does not automatically exclude an option. Detailed preferences are visible only to the person who entered them.

When an option cannot work because of dietary needs, cost, location, or time, the participant marks it “Can't do this.” That flag makes it ineligible for the whole group. No explanation is required. Optional tags are Time conflict, Dietary restriction, Too far, and Over budget. Their aggregate counts help the group propose alternatives. The participant can change the tag or remove their flag. The service does not infer dietary suitability or check restaurant information.

### Votes and exclusion flags

“I'd go” is an approval vote, and each participant can approve several options. Approval counts and exclusion counts are visible to everyone.

For the same participant and option, approval and “Can't do this” are mutually exclusive: choosing one replaces the other. Other people's approvals can remain on an excluded option, but cannot make it win. If the exclusion is removed, those approvals count again.

Changing one’s responses or preferences resets one’s readiness. Adding or removing an option, or someone leaving, resets everyone’s readiness. A new joiner is unready. A response count includes votes, saved preferences, or readiness; it does not establish unanimous approval.

Any new option needs participant review. An unflagged option means that nobody has explicitly ruled it out; it is not a guarantee that every invitee can attend.

## 6. Decision rules

Use only inputs submitted before the round closes. The room closes automatically even if every browser is closed, and the recorded result stays fixed.

1. **Find eligible options:** remove deleted options and any with at least one “Can't do this” flag.
2. **Handle no options:** if none remain, close with no winner. Never silently exclude a person or ignore their flag.
3. **Use votes:** if any eligible option has approvals, the highest approval count wins. Use preference scores only to break a vote tie.
4. **Use preferences:** if no eligible option has approvals, the highest group preference score wins.
5. **Break an exact tie:** among the remaining tied options, select the one added first.

Preference scoring is intentionally small:

- For a participant who supplied preferences, count how many of their supplied preferences an option matches.
- **Personal score = matched preferences ÷ supplied preferences.** All supplied dimensions have equal weight; an unanswered dimension does not count.
- **Group score = average personal score** across participants who supplied at least one preference.
- A participant with no preferences is omitted from the average. If nobody supplied preferences, all options have equal preference scores.

Example: an option matching two of someone's three preferences scores 2/3 for that person. If another person's only preference also matches, the group score is the average of 2/3 and 1, or about 83%. Use the full score for selection; round only for display.

No votes and no preferences therefore selects the first eligible proposal, with the explanation “No votes or preferences to rank these options; first proposed option selected.” If votes exist only on excluded options, explain that those options could not win and apply the preference fallback to the remaining choices.

At the deadline there is no quorum. Use the inputs received, without assuming that everyone invited joined or agreed. Early finish requires all currently joined people to be ready, at least one option, and an explicit confirmation showing the current participant count. If an expected headcount was set and fewer people have joined, require the organizer's explicit missing-invitee confirmation as well. Readiness alone is not an approval vote.

## 7. Boundaries and acceptance checks

Each round has **two states: Open and Closed**. A closed round has either a winner or a no-winner explanation. A participant can start a new round on the same link, with new options and a fresh ten-minute deadline. Old results remain frozen in history. Stale requests from a previous round are rejected.

Defer configurable timers, full meal-duration scheduling, multi-date polls, automatic dietary checks, fairness weights, random tie-breaks, restaurant discovery, travel estimates, reminders, chat, reservations, and payments. Saved browser profiles/history are implemented in the separate extension; verified accounts and cross-device recovery remain deferred.

Before implementation is considered complete, verify:

| Scenario | Expected behavior |
| --- | --- |
| A new person opens the shared link | They can view immediately and contribute with a display name. |
| Anyone adds an option | Other participants see it and can respond. |
| Someone returns in the same browser or toggles a vote | Their identity and inputs persist; votes do not duplicate. |
| An eligible option has strictly more approvals | It wins regardless of preference scores. |
| Votes tie, or nobody votes | Preference averages rank the relevant eligible options. |
| Someone skips preference fields | Only answered fields count; people with no preferences do not affect the average. |
| Scores also tie, including with no preference data | The earliest-added tied option wins consistently. |
| An option receives a “Can't do this” flag | It cannot win, even if it has the most approvals. |
| Every option is flagged or removed | The round closes with no winner; the same group can start another round. |
| All options are excluded before closing | A conflict banner points to adding an alternative. |
| Everyone joined is ready | Show participation status and confirm an early finish; a new unready joiner prevents it. |
| Another round starts | Keep the link, names, and preferences; clear votes and readiness; reject old-round requests. |
| The reviewer chooses Try a demo | Reach a clearly labeled sample result in under one minute with no restaurant entry. |
| An author replaces an option | The replacement inherits no votes or flags. |
| A participant leaves before the deadline | Their preferences, votes, and flags stop influencing the result. |
| Nobody has the page open at the deadline | The room still closes using the inputs received before the cutoff. |
| Someone tries to change inputs after closing | The recorded result stays unchanged. |

Check the flow on separate devices, and ask a small trial group to explain why the result won. Target creation in under a minute and a useful response in about thirty seconds.

## 8. Implementation and verification

The [technical spec](tech-spec.md) defines the UI, backend, SQLite database, deadline handling, deployment, and end-to-end tests. Its deadline design closes the room logically at the cutoff and saves the immutable result on the first subsequent request, so closure does not depend on an open browser. Record decisions and tradeoffs in [APPROACH.md](../APPROACH.md) as implementation proceeds.
