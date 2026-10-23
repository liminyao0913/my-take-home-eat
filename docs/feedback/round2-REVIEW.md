## Prioritized improvements and validation

| Priority | Finding | Recommended next step |
|---|---|---|
| P1 | **Invitation completeness remains the organizer's judgment.** The warning before early close is useful, but the reviewed flow did not establish an expected participant count. The live test could finalize a plan with 1/1 joined participants, which says nothing about invitees who have not joined. | Offer an optional expected headcount or invitation checklist. Before closing, show “1 joined of 4 expected” where known. Keep an explicit organizer override so a missing participant cannot indefinitely stall a decision. |
| P1 validation | **The product's defining group interaction is not yet independently verified.** The demo and single-person test cannot prove guest access, synchronization, independent votes, or close-versus-vote behavior. | Run at least three isolated browser sessions: organizer and two guests. Test joining, simultaneous contributions, readiness, late arrival, finalization, and refresh after closure. Verify that private preferences remain private across sessions. |

## P1 validation follow-up — October 23, 2026

The three-session local production-browser check now passes in `tests/e2e/group-validation.spec.ts`, using the shared public-only flow in `tests/browser/group-flow.ts`. It verifies anonymous invite viewing, distinct browser identities, simultaneous proposals and independent votes, synchronization, three different private preference sets, and readiness. A guest arriving after two people are ready causes a stale finish to return `409 NOT_READY`. A concurrent finish/vote permits exactly one operation: either closure rejects the late vote, or the accepted vote clears readiness and prevents closure until reconfirmed. All three browsers retain their own inputs and the same result after reload; joining after closure is rejected. SQLite regressions cover both transaction orderings.

The same flow is included in `tests/hosted/service.spec.ts`; its Render result remains pending until the remediation deployment passes. Screenshots and per-session evidence stay in private test artifacts. This validates the current joined-participant rule; the optional expected-headcount proposal remains a separate product decision.
