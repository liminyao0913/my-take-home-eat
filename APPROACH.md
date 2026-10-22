# Approach and decisions

This is the running decision record for Let's Eat. Keep it updated as product and technical choices are made. Detailed product behavior lives in [docs/plan.md](docs/plan.md).

## Confirmed direction

- Start from zero and clarify product behavior before choosing technology.
- Serve 3–8 friends or coworkers choosing lunch or dinner soon.
- Share one link; require no account or sign-up.
- Let the creator suggest several meals and every participant add more.
- Let people vote and provide preferences; use preferences to choose when nobody votes.
- Favor a small first version and move to a technical spec once the product rules are clear.

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

## Validation and next decisions

The product plan includes acceptance scenarios for voting, preference fallback, ties, exclusions, identity continuity, the deadline, and frozen results. Product targets are a room created in under a minute, a useful response in about thirty seconds, and resolution in ten minutes.

No stack, database, hosting, or implementation architecture has been selected. The next step is a technical spec covering those choices plus browser identity, shared updates, deadline execution, and tests. Append the rationale here as each choice is made.
