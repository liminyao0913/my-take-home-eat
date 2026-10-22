# Let's Eat

A shared meal decision room for a small group. The product and implementation are described in [the product plan](docs/plan.md), [the technical spec](docs/tech-spec.md), and [the decision record](APPROACH.md).

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

The health endpoint is /api/health. Apply migrations before starting the app.

## Use it

Create a room with a meal date, area, and one or more place-and-time options. Share its URL with friends; they only need a display name. Everyone can add options, approve several meals, mark an option they cannot do, and save private cuisine, price, or time preferences.

After ten minutes, any option with a block is excluded. Most approvals wins, then preference match, then proposal order. With no votes, preferences pick the meal; with no input, the first eligible proposal wins. The result is saved even if all browsers were closed at the deadline.

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

## Deploy

The current delivery is local; public hosting is deferred. For a future deployment, use the [Render configuration](render.yaml) and [deployment/recovery guide](docs/deployment.md). Deployment requires a connected Render workspace, a source repository, and a paid persistent disk. Keep one app instance and apply migrations at runtime through `npm run start:host`.

## Database changes and backups

Edit src/server/schema.ts, run npm run db:generate, review and commit the generated SQL, then apply it with npm run db:migrate.

Create a consistent backup with:

```sh
npm run db:backup -- /path/to/backup.sqlite
```

Use a persistent directory for deployment, keep the app to one service instance, and retain a backup outside the service before applying schema changes.
