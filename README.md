# Let's Eat

A shared meal decision room for a small group. The product and implementation are described in [the product plan](docs/plan.md), [the technical spec](docs/tech-spec.md), and [the decision record](APPROACH.md).

Browser continuity, saved preferences, personal history, and meal suggestions are described in the [identity/history plan](docs/identity-and-history-plan.md) and [implementation spec](docs/identity-and-history-tech-spec.md).

The [self-review remediation spec](docs/self-reflect-remediation-tech-spec.md) covers the next security, scalability, and reliability fixes for Render. Those fixes are proposed; see [verification](docs/verification.md#render-baseline-and-self-review-remediation) for the current hosted results.

## Run locally

Use Node.js 24 (the pinned version is in .node-version), then:

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Open http://localhost:3000. SQLite data is stored in .data/lets-eat.sqlite. Set DATABASE_PATH and APP_ORIGIN in .env.local when using another location or origin.

For a production build:

```sh
npm run build
npm run db:migrate
npm run start
```

The health endpoint is /api/health. Apply migrations before starting the app. The header links to `/api/version`, which returns the package version and deployed Git commit without requiring the database. The commit is `null` when `RENDER_GIT_COMMIT` is unavailable, as in a normal local run.

### Open it from another computer

Set `APP_ORIGIN` in `.env.local` to the LAN or public address people will open, including its port, for example `http://192.168.1.10:3000`. Restart the app after changing it. Use that same address in every browser, including on the computer running the app.

For a production build, `npm run start:host` binds to all network interfaces on port 3000. Share the configured URL with participants. If the browser address differs from `APP_ORIGIN`, writes are rejected with “Open this room on its original site before making changes.”

## Use it

Choose **Try a demo** on the home page to vote and see a sample result immediately, including preference-only and all-excluded examples. The demo never saves data to real rooms.

Create a room with a name, meal date, and a place/time idea, or create it empty and add ideas together. Secondary restaurant details are optional. Share its URL with friends; they only need a display name. Everyone can add options, approve several meals, mark an option they cannot do with an optional constraint reason, and save private cuisine, price, or time preferences.

Mark **I’m done** when ready. Once everyone who joined is ready, any participant can confirm an early finish; otherwise the round closes after ten minutes. Any option with a block is excluded. Most approvals wins, then preference match, then proposal order. With no votes, preferences pick the meal; with no input, the first eligible proposal wins. A no-approval winner is labeled as a suggestion. The result is saved even if all browsers were closed at the deadline.

If all ideas are excluded, add an alternative while the round is open. After closure, **Start another round in this room** keeps the link, participants, and preferences, with new ideas and cleared votes. Previous results remain in round history.

Creating or joining remembers your name and rooms in this browser, without an email address or login. Check **Remember cuisine and budget for future meals** when saving room preferences, or edit defaults in **My meals**. Future create/join forms offer those defaults with an opt-out and room-specific edits. Time windows stay with their original meal.

**My meals** lists created/joined rooms, results, and previous rounds. Reuse a past idea in an editable new draft, or remove a room from personal history and suggestions without changing the shared room. Returning creators see up to three ideas based on known past approvals and approved group picks. Area matching uses the recorded area label, not distance; restaurant details are past estimates.

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

These tests control local processes and temporary databases. Do not redirect the whole suite to Render. The [deployment guide](docs/deployment.md#local-and-hosted-release-checks) describes low-volume hosted checks; a separate automated hosted suite is planned in the remediation spec.

## Deploy

Render is now the selected public host: [https://lets-eat-ba8e.onrender.com/](https://lets-eat-ba8e.onrender.com/). The missing-schema and Origin configuration errors were repaired, and a two-browser hosted meal flow passed. See [verification](docs/verification.md#render-baseline-and-self-review-remediation) for release evidence and remaining hardening work. The existing service uses:

| Render setting | Value |
| --- | --- |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:host` |
| `APP_ORIGIN` | `https://lets-eat-ba8e.onrender.com` |
| `DATABASE_PATH` | `/var/data/lets-eat.sqlite` |
| Persistent disk mount | `/var/data` |
| Health Check Path | `/api/health` |

Keep one instance. The [Render configuration](render.yaml) matches the configured Virginia service: 1 CPU / 2 GiB RAM and a 1 GB persistent disk, with manual deployments. A manually created service does not automatically inherit that file. Build and Start are separate fields; migrations run during startup. Set environment values in Render, without uploading `.env.local`.

Local/LAN development remains supported. The existing LAN service uses [http://192.168.86.52:3000](http://192.168.86.52:3000) and a separate local SQLite file. Its data and browser identities do not automatically move to the Render hostname.

## Database changes and backups

Edit src/server/schema.ts, run npm run db:generate, review and commit the generated SQL, then apply it with npm run db:migrate. Use this migration script: it handles SQLite table rebuilds without cascading away existing votes and checks foreign keys afterward.

Create a consistent backup with:

```sh
npm run db:backup -- /path/to/backup.sqlite
```

Use a persistent directory for deployment, keep the app to one service instance, and retain a backup outside the service before applying schema changes.
