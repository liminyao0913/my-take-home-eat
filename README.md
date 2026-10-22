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

## Database changes and backups

Edit src/server/schema.ts, run npm run db:generate, review and commit the generated SQL, then apply it with npm run db:migrate.

Create a consistent backup with:

```sh
npm run db:backup -- /path/to/backup.sqlite
```

Use a persistent directory for deployment, keep the app to one service instance, and retain a backup outside the service before applying schema changes.
