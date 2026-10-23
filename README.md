# Let's Eat

**Public app: [https://lets-eat-ba8e.onrender.com/](https://lets-eat-ba8e.onrender.com/)**

[Try the instant demo](https://lets-eat-ba8e.onrender.com/demo) · [Run on localhost](#run-locally) · [Deploy on Render](#deploy-on-render)

A shared meal decision room for a small group. Read [what was built and why](APPROACH.md), the [detailed decision log](detail_decisions.md), [product plan](docs/plan.md), and [technical spec](docs/tech-spec.md).

Browser continuity, saved preferences, personal history, and meal suggestions are described in the [identity/history plan](docs/identity-and-history-plan.md) and [implementation spec](docs/identity-and-history-tech-spec.md).

The [self-review remediation spec](docs/self-reflect-remediation-tech-spec.md) records the security, scalability, and reliability work on `fix/self-reflect-render`; see [verification](docs/verification.md#remediation-and-invitations-release) for the current hosted results.

## Run locally

Use Node.js 24.22.1 (pinned in [.node-version](.node-version)). On a fresh checkout:

```sh
git clone https://github.com/liminyao0913/my-take-home-eat.git
cd my-take-home-eat
git checkout fix/self-reflect-render
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Local development and production commands bind to localhost. `.env.example` provides `APP_ORIGIN=http://localhost:3000` and `DATABASE_PATH=.data/lets-eat.sqlite`; no external database or API key is needed. On an existing checkout, edit `.env.local` instead of overwriting it and preserve the SQLite file.

For a production build, stop any running local server before rebuilding:

```sh
npm run build
npm run start
```

Development and production startup apply migrations and validate configuration, required schema, and database writability before listening. `/api/health` checks the required migration level and schema and returns 503 if the service is not ready. The header links to `/api/version`, which returns the package version and deployed Git commit without requiring the database. The commit is `null` when `RENDER_GIT_COMMIT` is unavailable, as in a normal local run.

## Use it

Choose **Try a demo** on the home page to vote and see a sample result immediately, including preference-only and all-excluded examples. The demo never saves data to real rooms.

Create a room with a name, meal date, and a place/time idea, or create it empty and add ideas together. Secondary restaurant details are optional. Under **Meal details**, the creator can set expected people (including themselves). Share its URL with friends; they only need a display name. Everyone can add options, approve several meals, mark an option they cannot do with an optional constraint reason, and save private cuisine, price, or time preferences.

The room shows joined versus expected when a headcount was set. Mark **I’m done** when ready. Once everyone who joined is ready, any participant can confirm an early finish if the expected group is present. If people are missing, only the organizer can explicitly finish without them. Leaving the headcount blank keeps the usual joined-person rule. The round still closes automatically after ten minutes. Any option with a block is excluded. Most approvals wins, then preference match, then proposal order. With no votes, preferences pick the meal; with no input, the first eligible proposal wins. A no-approval winner is labeled as a suggestion. The result is saved even if all browsers were closed at the deadline.

If all ideas are excluded, add an alternative while the round is open. After closure, **Start another round in this room** keeps the link, participants, and preferences, with new ideas and cleared votes. Previous results remain in round history, loaded ten rounds at a time. Each room supports 20 current options, 32 participant identities (including departed people), and 100 rounds. The service admits up to 100 open rounds and 10,000 stored rooms.

Creating or joining remembers your name and rooms in this browser, without an email address or login. Check **Remember cuisine and budget for future meals** when saving room preferences, or edit defaults in **My meals**. Future create/join forms offer those defaults with an opt-out and room-specific edits. Time windows stay with their original meal.

**My meals** lists created/joined rooms and result summaries, with details loaded on demand. Personal lists refresh when you return to the tab without resetting preference drafts. Reuse a past idea in an editable new draft, or remove a room from personal history and suggestions without changing the shared room. Returning creators see up to three ideas based on known past approvals and approved group picks. Area matching uses the recorded area label, not distance; restaurant details are past estimates.

Another browser or a different site hostname starts fresh. **Forget this browser** deletes personal defaults/history and revokes access to editing old participant inputs; shared contributions remain. Remembered access expires after 180 idle days, and cookie removal can end it sooner. Existing users can explicitly choose **Add existing meals from this browser**; this imports only provable memberships presented by the current site's cookie, without guessing old personal votes or saving old preferences as defaults.

## Verify it

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start a production server on port 3100 and use a fresh temporary SQLite file. The restart/restore test also uses port 3101. They exercise separate browser sessions, real HTTP endpoints and actual storage; they never use the development database. On a fresh Linux CI machine, install browsers with `npx playwright install --with-deps chromium`.

Use `npm run test:e2e:release` to include an actual ten-minute round. Open `playwright-report/index.html` for the report. The [GitHub workflow](.github/workflows/verify.yml) runs the checks on pushes and pull requests and retains browser evidence.

These tests control local processes and temporary databases. Do not redirect the whole suite to Render. The separate hosted suite uses normal public APIs and isolated browser identities:

```sh
HOSTED_BASE_URL=https://lets-eat-ba8e.onrender.com HOSTED_ARTIFACT_DIR=.data/hosted/release npm run test:hosted
```

It fails if the URL is missing. See the [deployment guide](docs/deployment.md#local-and-hosted-release-checks) for the real ten-minute case and saved-browser checks after restart. `npm run test:capacity` owns a temporary localhost service/database and requires Linux systemd user services; it measures 20 groups of eight under enforced 1 CPU / 2 GiB limits. Never point a load test at the public service.

## Deploy on Render

The public service is **[https://lets-eat-ba8e.onrender.com/](https://lets-eat-ba8e.onrender.com/)**. Create a Node web service from this repository, or update the existing service, and attach its persistent disk before starting it. Use the following settings; a new service must use its own HTTPS origin. See the [deployment and recovery guide](docs/deployment.md) for supervision, backups, troubleshooting, and release checks.

| Render setting | Value |
| --- | --- |
| Branch | `fix/self-reflect-render` |
| Node | `24.22.1`, pinned in `.node-version` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:host` |
| `APP_ORIGIN` | `https://lets-eat-ba8e.onrender.com` |
| `DATABASE_PATH` | `/var/data/lets-eat.sqlite` |
| Persistent disk mount | `/var/data` |
| Health Check Path | `/api/health` |

Keep one instance. The [Render configuration](render.yaml) matches the configured Virginia service: 1 CPU / 2 GiB RAM and a 1 GB persistent disk, with manual deployments. A manually created service does not automatically inherit that file. Build and Start are separate fields; migrations and startup checks run at runtime on the mounted disk. `start:host` binds to `0.0.0.0` using Render's `PORT`; local `npm start` binds to localhost. Set environment values in Render, without uploading `.env.local`.

The release branch is `fix/self-reflect-render`; automatic deployment remains off. Local access is `http://localhost:3000`, with a separate SQLite file. Local data and browser identities do not automatically move to Render.

After deployment, confirm `/api/health` returns 200 and `/api/version` reports the intended commit, then run the hosted checks above. [Verified release results](docs/verification.md#remediation-and-invitations-release).

## Database changes and backups

Edit src/server/schema.ts, run npm run db:generate, review and commit the generated SQL, then apply it with npm run db:migrate. Use this migration script: it handles SQLite table rebuilds without cascading away existing votes and checks foreign keys afterward.

Create a consistent backup with:

```sh
npm run db:backup -- /path/to/backup.sqlite
```

Use a persistent directory for deployment, keep the app to one service instance, and retain a backup outside the service before applying schema changes.
