## Prioritized improvements and validation

| Priority | Finding | Recommended next step |
|---|---|---|
| P1 | **Invitation completeness remains the organizer's judgment.** The warning before early close is useful, but the reviewed flow did not establish an expected participant count. The live test could finalize a plan with 1/1 joined participants, which says nothing about invitees who have not joined. | Offer an optional expected headcount or invitation checklist. Before closing, show “1 joined of 4 expected” where known. Keep an explicit organizer override so a missing participant cannot indefinitely stall a decision. |
| P1 validation | **The product's defining group interaction is not yet independently verified.** The demo and single-person test cannot prove guest access, synchronization, independent votes, or close-versus-vote behavior. | Run at least three isolated browser sessions: organizer and two guests. Test joining, simultaneous contributions, readiness, late arrival, finalization, and refresh after closure. Verify that private preferences remain private across sessions. |
