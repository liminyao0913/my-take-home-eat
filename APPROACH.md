# Approach

**Public app: [https://lets-eat-ba8e.onrender.com/](https://lets-eat-ba8e.onrender.com/)**

**Video: [Watch the project video](https://drive.google.com/file/d/1xo7ro_kCBWKp7WUkGobsNhQJT-1KsiYM/view?usp=sharing)**

[Try the instant demo](https://lets-eat-ba8e.onrender.com/demo) · [Localhost and Render setup](README.md) · [Detailed decision log](detail_decisions.md)

## What I built and why

Let's Eat helps 3–8 friends or coworkers choose a meal soon through one shared link, without signing up. Anyone can propose a place and time, approve several options, flag something they cannot do, and supply private preferences. The group gets an explained result after ten minutes, or sooner once everyone who joined is ready and someone confirms.

An optional expected headcount makes missing invitees visible. Finishing early below that count requires the organizer's explicit confirmation; it never extends the automatic deadline. Returning browsers can save cuisine/budget defaults, see personal meal history, and reuse suggestions from their own past approvals and group picks. Another round keeps the same room link. An isolated demo makes the result flow immediately testable.

The priority was a complete, understandable group decision flow: quick participation, clear disagreement, predictable closure, and a result that survives refreshes and restarts.

## Key decisions and tradeoffs

| Decision | Why, and what it costs |
| --- | --- |
| One Next.js/React/TypeScript application for UI and API | One codebase and deployment keeps iteration simple. UI and API work share the same Node process and failure boundary. |
| SQLite with Drizzle and better-sqlite3; one Render instance with a persistent disk | SQLite was an explicit requirement and needs no separate database server. Short transactions serialize changes safely, but writes have one writer and this deployment cannot scale through replicas sharing the file. |
| Browser identity instead of unverified email | A random HttpOnly credential, hashed in storage and Secure on Render, keeps preferences/history private without login. A name or email is not proof of ownership. Clearing cookies, forgetting the browser, or using another device loses that continuity. |
| Approvals first, preference match second, proposal order last | The outcome is deterministic and explainable. Preference matches weight people equally; exact ties favor the first proposal. Any explicit block excludes an option, so sometimes no winner is the correct result. |
| Server deadlines and transactional finalization | The server rechecks time, identity, readiness, and ownership inside the write transaction. The first request after expiry saves the frozen result, effective at the original deadline. No scheduler is needed, but this alone cannot send a notification when everyone has closed the page. |
| Three-second polling while visible | Simple synchronization handles small groups and detects new rounds. Traffic grows with visible tabs, including closed rooms. It is less efficient than push at larger scale. |
| Readiness and invitation completeness are separate from votes | Being ready does not imply approval or that everyone invited has joined. The organizer can explicitly proceed with missing people, and the result records that choice. Organizer access remains tied to the creating browser. |

Verification uses real SQLite and independent browser sessions: 81 unit/integration tests, 30 local browser scenarios across regular and real-duration runs, and hosted group, invitation, deadline, and restart checks. [Release evidence](docs/verification.md#remediation-and-invitations-release).

## What I intentionally left out

- Accounts, email identity, email delivery, and recovery on another device.
- Google/ZIP-code restaurant discovery, live availability, verified dietary information, reservations, and payments. Restaurant details are participants' estimates.
- Chat, push notifications, planning across dates, copying whole rooms, headcount editing, and organizer transfer.
- PostgreSQL, Redis, separate backend services, and more elaborate recommendation or fairness models.

These omissions keep the first product focused. Browser history, manual reuse of a past idea, and another round in the same room are implemented; copying an entire room into a new one is not.

## What breaks first under pressure

The first expected bottleneck is the shared Node process and SQLite writer. Concurrent writes or a long transaction can delay other work; lock contention returns a retryable 503 after the 100 ms busy budget. Polling adds read/serialization work as the number of visible tabs grows. Rate limits reject excess work with 429, and collection limits reject further growth, including at 100 open rounds or 10,000 stored rooms.

The single instance is also an availability boundary: a restart or deployment briefly interrupts all rooms. Persistent storage and verified backups outside the service protect recovery, not uninterrupted service. Archived rooms and retained credential revocation records still require disk monitoring and a future retention policy.

A ten-minute test with 20 groups / 160 participants passed under enforced 1 CPU / 2 GiB limits, with no errors or lost accepted writes and 4.4 ms p95 latency for ordinary requests. That is a constrained local measurement, not a maximum-capacity or Render network-performance claim. [Capacity evidence and limits](docs/feedback/self-reflect/evidence/invitation-capacity-20261023.json). The production dependency audit is clean; one development tool advisory remains documented in the [maintenance notes](docs/deployment.md#dependency-maintenance).

## What I'd build next

1. Add alert routing, longer load tests with large histories, and an explicit archive/retention policy before increasing traffic; scale the single instance vertically when measurements justify it.
2. Add **Plan this again** as an editable draft for a new room, copying meal ideas while clearing participants, votes, and deadlines.
3. Make result arrival more noticeable with an accessible announcement in the page, then consider optional restaurant discovery by ZIP code if manual entry proves to be the main friction.

These are proposed priorities, not delivered features. The broader [next-features plan](docs/next-features-plan.md) remains deferred. The chronology and superseded choices live in [detail_decisions.md](detail_decisions.md).
