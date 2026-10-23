## Prioritized improvements and validation

| Priority | Finding | Recommended next step |
|---|---|---|
| P1 | **Invitation completeness remains the organizer's judgment.** The warning before early close is useful, but the reviewed flow did not establish an expected participant count. The live test could finalize a plan with 1/1 joined participants, which says nothing about invitees who have not joined. | Offer an optional expected headcount or invitation checklist. Before closing, show “1 joined of 4 expected” where known. Keep an explicit organizer override so a missing participant cannot indefinitely stall a decision. |
| P1 validation | **The product's defining group interaction is not yet independently verified.** The demo and single-person test cannot prove guest access, synchronization, independent votes, or close-versus-vote behavior. | Run at least three isolated browser sessions: organizer and two guests. Test joining, simultaneous contributions, readiness, late arrival, finalization, and refresh after closure. Verify that private preferences remain private across sessions. |

## P1 validation follow-up — October 23, 2026

The three-session local production-browser check now passes in `tests/e2e/group-validation.spec.ts`, using the shared public-only flow in `tests/browser/group-flow.ts`. It verifies anonymous invite viewing, distinct browser identities, simultaneous proposals and independent votes, synchronization, three different private preference sets, and readiness. A guest arriving after two people are ready causes a stale finish to return `409 NOT_READY`. A concurrent finish/vote permits exactly one operation: either closure rejects the late vote, or the accepted vote clears readiness and prevents closure until reconfirmed. All three browsers retain their own inputs and the same result after reload; joining after closure is rejected. SQLite regressions cover both transaction orderings.

The same flow is included in `tests/hosted/service.spec.ts`; its Render result remains pending until the remediation deployment passes. Screenshots and per-session evidence stay in private test artifacts. This also preserves compatibility for rooms that leave the expected headcount blank. The user subsequently authorized the invitation feature below.

## P1 invitation completeness — implementation, October 23, 2026

Implemented an optional **Expected people (including you)** field in Meal details, from 1 to 32. The room shows joined versus expected. All joined participants must still be ready; if fewer than expected have joined, only the organizer can explicitly choose **Finish without missing people**. The server enforces ownership and rechecks readiness inside the write transaction. The ten-minute deadline still resolves automatically, even when invitees or the organizer are absent.

The result and copied summary record the actual attendance and organizer override. Headcount is an expectation, not a join cap. It and the organizer stay with the room across rounds; no editing or organizer transfer is added. Existing rooms retain unknown headcount, and migration only identifies an organizer from an existing creator record. Forgetting or losing the organizer browser identity loses override access; the automatic deadline remains available.

Regression coverage includes headcount validation, guest override rejection (including identical display names), unready participant protection, complete-group finish, deadline closure with missing people, migration preservation, and archived results. The shared browser flow in `tests/browser/invitations-flow.ts` runs locally and in the separate hosted suite. Browser and final hosted results will be recorded after deployment.
