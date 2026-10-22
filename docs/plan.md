# Let's Eat — product brainstorm and proposed plan

Status: product discovery. This document proposes the first version for discussion; it does not choose a technology stack or start implementation. “Let's Eat” is a working name.

## 1. What we know

The first audience is **3–8 friends or coworkers choosing lunch or dinner soon**. This was confirmed during brainstorming.

The requested experience is:

- One shareable link, with no account or sign-up required.
- An organizer can suggest several options, and every participant can add more.
- Everyone can provide personal preferences and vote.
- The service helps the group reach a decision quickly.
- If nobody votes, an algorithm scores the options using people's preferences and chooses a winner.

Working assumptions to discuss: people know one another, are meeting in roughly the same area, and are deciding on one meal on one date. This is a lightweight decision tool for an existing group chat.

## 2. Brainstorm: what kind of product should this be?

| Direction | What it feels like | Main benefit | Tradeoff |
| --- | --- | --- | --- |
| Quick meal huddle | “Here are three ideas. What works? We decide in ten minutes.” | Very little effort; gives the conversation an ending. | Depends on someone suggesting places. |
| Preference matchmaker | “Tell us what you like, and we'll find common ground.” | Helps people who dislike voting or proposing restaurants. | Too many questions could slow everyone down. |
| Dinner planner | “Find a date, time, and place that fit everybody.” | Useful when availability is the main obstacle. | Scheduling can become the whole product. |

**Recommended direction:** a quick meal huddle with a small amount of preference matching. Keep the useful part of scheduling: each proposed meal has a specific time, and people can say when they are available.

The product promise: **“Share one link. Find a meal that works. Get on with your day.”**

The main hypothesis is that the problem is often coordination and reluctance to choose, rather than a lack of restaurant information. We should test that before building restaurant discovery.

### Ideas that give the product personality

- **“I'm flexible” is a valid response.** Someone can participate without inventing an opinion. Their stated requirements still matter.
- **A decision clock ends the discussion.** A visible deadline makes silence understandable: preferences will decide if votes do not.
- **A choice comes with a reason.** “Most votes,” “Best fit for the preferences shared,” or “Tied options; selected by draw.”
- **Vote on complete meals.** “Noodle House at 12:30” is actionable; winning separate polls for a restaurant and time might produce an incompatible combination.
- **Show the compromise when stuck.** “Every option conflicts with someone's availability. Add a later time.” Do not silently ignore a requirement.

Ideas to revisit later: a “surprise us” button, a one-tap rematch for tomorrow, or rotating whose favorite gets priority across recurring lunches. These need evidence before joining v1.

## 3. The core journey

### Organizer: create and share in under a minute

1. Give the meal a short name, such as “Lunch near the office.”
2. Set the date, general area, and approximate meal length. Default to today and 60 minutes; allow changes.
3. Add at least one place-and-time option. Encourage two or three; do not require researching a long list.
4. Set the decision deadline. Propose ten minutes from creation, adjustable and always before the earliest proposed meal starts.
5. Create the room and copy its link into the existing group chat.

The organizer joins with a display name and can submit preferences and votes like anyone else. The room uses one currency and a clearly displayed local time zone.

### Participant: contribute in about thirty seconds

1. Open the same link and immediately see the proposed meals and deadline.
2. Enter a display name when first contributing. No email, password, or account.
3. Pick any useful action: vote, add an option, share preferences, or tap “I'm flexible.”
4. See the current state and return through the same link whenever needed.

Preferences are optional and skippable. The interface offers quick choices first, with extra detail available when someone needs it. Returning in the same browser should restore the person's identity and inputs for that room.

### The group: finish with an actionable result

The deadline ends voting and applies the decision rules automatically, even if the organizer has left. The organizer can also choose **“Decide now.”** Before ending early, show how many joined participants have not responded.

The result names the place, date, start time, estimated cost, location, and why it won. Offer a copyable message such as:

> Lunch is set: Noodle House, 12:30 today, about $18 each. Chosen with 4 votes. Details: [room link]

Copying this message is explicit; the service does not send messages to the group itself. Choosing a restaurant does not book a table or guarantee space.

## 4. What the product looks like

A mobile-first page with a warm, casual feel: light background, dark readable text, and one clear accent color. It should feel comfortable when opened from a chat on a phone.

The shared room has five parts:

1. **Meal header:** name, date, area, and “Deciding in 08:42.”
2. **People strip:** initials and simple states such as “responded” or “waiting.” Show “4 people joined,” without implying that everybody invited has opened the link.
3. **Your response:** compact preference summary, an edit action, and “I'm flexible.”
4. **Option cards:** place, time, estimated cost, cuisine, location, suitability status, vote count, and an “I'd go” toggle. An “Add an option” action stays easy to find.
5. **Decision area:** current leader or preference recommendation while open; a prominent result card after deciding.

Example card:

```text
Noodle House                         3 votes
Today · 12:30–13:30 · about $18/person
Downtown · Thai · vegetarian options reported

[I'd go ✓]          [View details]
```

Before finalization, label the result “Current leader” or “Suggested by preferences.” Never make a provisional recommendation look like a finished decision.

Keep the main screen short. Put detailed preferences in an expandable panel and the scoring explanation behind “Why this option?” Make status understandable through words as well as color, and support keyboard use and readable touch targets.

## 5. Product features and rules

### A. One shared room, no sign-up

- Everyone uses the same shared URL. Viewing does not require joining.
- A display name creates a participation identity for this room; it is not a verified identity.
- A returning participant can edit their own votes, preferences, and proposals. Reopening the page must not create another vote.
- Organizer controls remain available in the browser that created the room. Cross-device identity and organizer recovery are outside the first version.
- Anyone holding the link can view and join. Design for a small trusted group; do not describe the room as a secure or anonymous ballot.
- People can choose “I'm no longer joining.” Their votes and preferences then stop affecting the decision.

### B. Anyone can propose a complete meal

Each option represents **one place at one start time** on the room's meal date. Two times at the same restaurant are two options, so availability stays unambiguous. The room's meal length determines the end time.

Required details: place name, location or neighborhood, and start time after the decision deadline. Useful optional details: estimated total cost per person, cuisine tags, a menu or place link, dietary suitability information, and a short note such as “Five-minute walk from the office.”

Manual entry is sufficient for v1. Unknown details remain visibly unknown. The service does not need a restaurant catalog to help people decide.

Encourage a shortlist of three to five options without preventing further suggestions. Warn when someone adds the same place and time again. New options get a “New since your response” marker.

The proposer can edit or withdraw their option; the organizer can withdraw duplicates or unsuitable proposals. Changing the place, time, price, or dietary suitability clears that option's existing votes and asks people to reconfirm. Changing the room's date or meal length similarly clears votes for affected options. Typo and note edits preserve votes. Withdrawing an option removes its votes from the result.

### C. Lightweight personal preferences

Separate **requirements** from **nice-to-haves**. “I would prefer Thai” must behave differently from “I cannot attend before 12:30.”

| Category | Quick input | Optional requirement |
| --- | --- | --- |
| Food | Favorite or less-preferred cuisines | Dietary needs; a specific option that cannot work |
| Budget | Preferred spend per person | Maximum estimated spend |
| Time | Preferred start window | Availability covering the entire meal |
| Area | Preferred neighborhoods from the proposed choices | Areas the person cannot reach |

Only explicitly stated requirements exclude an option. Soft dislikes reduce fit without vetoing it. Someone can express a requirement without completing the rest of the form.

Preferences belong to this meal in v1; there is no profile setup. Other people see aggregate explanations, while a person's detailed budget, dietary reasons, and individual fit scores remain private to them.

If an option lacks information needed to check a stated requirement, mark it **“Needs confirmation.”** The affected participant can confirm that it works for them, or someone can supply the missing details. It cannot be finalized automatically while that check remains unresolved. Dietary information is attributed to participant input; the interface must not claim that the service has verified a restaurant's safety.

“I'm flexible” is an explicit abstention: it withdraws the person's existing votes, preserves their preferences and requirements, and counts as a response. The interface makes that effect clear. Casting a new vote replaces the abstention. Ordinary silence does not mean agreement or availability.

### D. Voting that allows agreement

Use **approval voting**: each person can tap “I'd go” on as many options as they would actually attend. A single-choice ballot would force people to choose between several acceptable meals and could split support.

- Each room identity contributes at most one vote per option. Without verified accounts, v1 cannot prevent someone from joining again in another browser.
- Votes can be toggled until the room is decided.
- Vote counts and supporters are visible while the room is open; the tradeoff is possible influence from early votes.
- Preferences and votes are independent. Someone may submit either, both, or neither.
- A positive vote never silently overrides a requirement. Resolve any conflict before counting that person's vote on the option.
- A vote on an option that cannot meet the group's requirements cannot make that option eligible to win.

### E. A deadline and a stable result

The room has three main states: **Open**, **Decided**, and **Needs input**.

- **Open:** proposals, preferences, votes, and recommendations can change.
- **Decided:** the selected meal and its explanation are frozen. Late arrivals see that result.
- **Needs input:** the deadline has arrived, but there is no eligible option. Explain what must change and let people revise their inputs or add options.

Do not end early just because all currently joined people have responded; other invitees may still be opening the link. The organizer can deliberately end early.

At the deadline, use the information actually submitted. Show “Based on 3 of 5 joined people's responses” where applicable. There is no mandatory quorum in v1; otherwise a silent participant could prevent a quick decision indefinitely.

If the room needs input, rerun the rules when a relevant input changes. Once an eligible option exists, decide automatically and explain the result.

After a decision, changes that could alter the outcome require the organizer to **reopen** the room with a new deadline. Mark the old result as superseded. Preserve unchanged inputs and votes; changes to an option still require its votes to be reconfirmed.

## 6. How the winner is chosen

These are proposed product rules and initial weights, not an implementation design. The explanation must be understandable without reading a formula.

### Step 1: respect requirements

An eligible option must fit every active participant's declared requirements and have no unresolved requirement checks. A start time that has already passed is also ineligible.

Unknown preferences from a silent participant are not invented. If no option is eligible, show **Needs input** with concrete reasons. Do not quietly drop someone from the group or relax their constraints.

### Step 2: use votes when available

If any eligible option has positive votes, the option with the most approvals wins. Preferences break a tie in vote count; they do not overturn a clear voting winner.

Votes attached only to ineligible or withdrawn options do not count. If that leaves no eligible votes, explain this and use the preference fallback.

### Step 3: use preference fit when there are no eligible votes

Compute a fit score for each eligible option for each participant who supplied at least one soft preference:

| Preference | Proposed weight |
| --- | --- |
| Cuisine fit | 40% |
| Preferred spending level | 30% |
| Preferred meal time | 20% |
| Preferred area | 10% |

For a starting model, map each dimension to **preferred = 100**, **acceptable = 50**, or **would rather avoid = 0**. A cuisine explicitly listed as less-preferred scores 0; an unlisted cuisine is acceptable. Budget and time preferences use the person's chosen target range: inside is preferred, outside but still allowed is less-preferred. A preferred area scores 100; another reachable area is acceptable.

Omit dimensions a person did not answer and redistribute their remaining weights proportionally. If an option lacks information about an answered soft preference, use neutral fit of 50 for that dimension and disclose that the recommendation has incomplete information. Missing information needed for a hard requirement remains a blocker under Step 1.

Combine the individual scores using:

**Group fit = 70% × average individual fit + 30% × lowest individual fit.**

This favors a broadly good choice while giving some weight to the person least well served. It does not give a soft dislike the power of a hard veto. People without soft preferences are excluded from this calculation; their requirements still apply.

Illustrative scores for three people:

| Option | Individual fits | Average | Lowest | Group fit |
| --- | --- | --- | --- | --- |
| Pizza at 12:15 | 100, 100, 20 | 73.3 | 20 | 57.3 |
| Grain bowls at 12:30 | 80, 70, 70 | 73.3 | 70 | 72.3 |

With no votes, grain bowls win because they fit the group more evenly. Individual scores stay private; the result can say “Best overall fit, with fewer preference conflicts.” These weights are a hypothesis to test, not a claim of objective fairness.

### Step 4: handle missing preferences and exact ties honestly

- If nobody supplies soft preferences, all eligible options have equal preference fit. Requirements still narrow the choices.
- Break an exact tie remaining after votes and preference fit with a fair draw among the tied options. If only one option remains, select it directly.
- Keep any displayed draw result stable for the same tied set. Refreshing must not reroll it, and the final result stays frozen.
- With no votes and no soft preferences, label the outcome “No votes or preferences distinguish these options; selected by draw.” Never call it a personalized recommendation.

Every final result shows its decision basis, the response count, and any relevant missing information. Main-screen explanations use plain language; numerical details can sit behind “Why this option?”

## 7. First-version boundary

**Build first:** create a room, share its link, join by name, propose place-and-time options, enter requirements and preferences, cast approval votes, see updated group activity, resolve at a deadline, explain the result, and reopen when necessary.

**Keep out of v1:** accounts, persistent preference profiles, automatic restaurant discovery, maps-based travel calculations, reservations, payments, delivery ordering, an in-app group chat, outbound reminders, multi-date scheduling grids, recurring-group history, and cross-device identity recovery.

The open room should show changes without requiring people to coordinate refreshes. The exact technical approach belongs in the next discussion.

## 8. How we validate the product before and during building

1. **Validate the concept:** walk through the flow with a few groups that recently struggled to choose a meal. Check whether the actual obstacle was suggestions, preferences, availability, or getting someone to commit.
2. **Validate the interaction:** sketch the create, open-room, preference, and result screens. Ask people to propose, vote, and find the deadline without instructions.
3. **Validate the rules:** walk through the scenarios below using sample inputs. Everyone should understand why the outcome occurred.
4. **Discuss technical choices:** once the product direction is agreed, decide how to support shared state, browser identity, deadlines, storage, and deployment.
5. **Build and try a complete meal:** test the full flow on separate devices, then use it with a real small group.

Proposed success targets to test:

- A new organizer can create a useful room and copy its link in under one minute.
- A participant can provide a useful response in about thirty seconds.
- A typical group reaches a decision within the proposed ten-minute window.
- At least four of five trial participants can explain why the selected option won without assistance.
- In trials, record whether anyone was excluded by an overlooked stated requirement and whether the group actually followed the result.

Product acceptance scenarios:

| Scenario | Expected behavior |
| --- | --- |
| The creator shares a link with a new participant | They can view immediately and contribute using only a display name. |
| A participant adds another place and time | Everyone sees the new option and can vote for it. |
| Someone returns or changes a vote | Their existing identity is restored in that browser; votes do not duplicate. |
| Several feasible options receive votes | Most approvals wins; preference fit only breaks a tie. |
| No one votes, but people enter preferences | The highest group fit wins, with an explanation. |
| No one votes or shares preferences | Eligible options tie; use a clearly labeled, stable draw. |
| All votes point to an option that violates a requirement | Exclude that option and explain why; rank remaining eligible options. |
| A requirement needs facts that no option supplies | Keep the room in Needs input until the affected checks are resolved. |
| No option fits everyone's availability | Show the conflict and ask for another time or changed personal availability. |
| Only some joined participants respond | Decide from submitted information and show incomplete participation. |
| The organizer leaves before the deadline | The room still resolves, or enters Needs input if it cannot. |
| A voted-for option changes materially | Clear its votes and visibly request reconfirmation. |
| Someone leaves the meal | Their votes and preferences stop affecting the pending result. |
| Someone visits after the decision | Show the frozen result; a new round requires explicit reopening. |

## 9. Discussion points before technical choices

The audience and core requested features are confirmed. The following remain proposals:

1. **Automatic decision at the deadline:** recommended for speed; an alternative is to prepare a recommendation and require the organizer to finalize it.
2. **Complete place-and-time options:** recommended for v1; separate restaurant and time selection could be useful later if groups find repeated cards confusing.
3. **Requirements must fit everyone who is still joining:** recommended; choosing the largest possible subset would be a different product rule and needs explicit agreement.
4. **Visible approval votes:** recommended for simplicity; hiding counts until a response is submitted could reduce influence from early voters.
5. **Preference fairness:** start with the average-plus-lowest-score formula, then use examples and trial feedback to judge whether it matches the group's idea of a good compromise.

The next conversation should settle these product choices before selecting frameworks or infrastructure.
