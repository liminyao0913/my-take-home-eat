# Deployment and recovery

The user selected local delivery; this guide is for a future deployment. The repository includes a [Render Blueprint](../render.yaml) for one Node.js web service with a 1 GB persistent disk. It uses SQLite only. Applying this Blueprint creates paid resources; review the selected service and disk cost in Render before creating them. The Blueprint itself has not yet been deployed.

## First deployment

1. Put the repository in a Git remote accessible to your Render workspace.
2. Create a Blueprint using this repository and review `render.yaml`. Choose a unique service name if `lets-eat` is already in use.
3. Deploy. The build installs locked packages and builds Next.js. The runtime startup applies committed migrations before starting the server, with `/api/health` as its readiness check.
4. The startup command uses `RENDER_EXTERNAL_URL` as `APP_ORIGIN`. For a custom domain, explicitly set `APP_ORIGIN` to its canonical HTTPS origin, with no trailing slash.
5. Open the public URL in two separate browser sessions, create and join a room, add options, and vote. Wait the full ten minutes and confirm the same result in both sessions.
6. Restart the service and reopen that room. The result, proposals, and participant identity should remain unchanged. Record the URL and evidence in `APPROACH.md`.

The app listens on Render's supplied `PORT`. The database lives at `/var/data/lets-eat.sqlite`. Keep the disk mounted and the service at one instance. A disk-backed deploy briefly interrupts service; migrations must run at startup because the disk is unavailable during the build and pre-deploy steps. These settings follow the [Blueprint reference](https://render.com/docs/blueprint-spec), [default environment variables](https://render.com/docs/environment-variables), and [persistent disk requirements](https://render.com/docs/disks).

Automatic deployment is off so schema changes can be reviewed and backed up before deployment. This does not disable the first Blueprint deployment.

## Back up before schema changes

In the running service's shell, choose a new filename under the persistent mount and run:

```sh
npm run db:backup -- /var/data/lets-eat-before-migration.sqlite
```

Copy that backup off the service using the host's file-transfer facilities. The command uses SQLite's backup API, including committed data still in the WAL. Do not copy only the live main SQLite file. Avoid overwriting a backup you still need.

## Verify a backup without replacing production

Copy the backup to a separate writable local directory and run this same application version against it on another port:

```sh
DATABASE_PATH=/path/to/restored.sqlite APP_ORIGIN=http://localhost:3001 npm run db:migrate
DATABASE_PATH=/path/to/restored.sqlite APP_ORIGIN=http://localhost:3001 npm run start -- --port 3001
```

Visit a known room path and verify its saved result. The browser suite also makes a backup of a running SQLite database, starts another application process against the backup, and checks the same room and result.

To recover production, stop the app first, preserve the existing database and its `-wal`/`-shm` companions separately, and install the verified backup as a new file. Start with `DATABASE_PATH` pointing to that new file. Never restore over a file held open by the application. Use a schema-compatible application version; migrations only move forward.

## Release checks

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e:release
```

The release browser suite includes the normal ten-minute deadline. Regular `npm run test:e2e` skips only that slow case; routine deadline tests change a room's deadline directly in an isolated test database. No production API can change a deadline.

Read `playwright-report/index.html` for the latest results. Failed browser cases retain traces and screenshots in `test-results/`. The GitHub workflow runs the same checks and uploads the browser evidence; enable its `real_deadline` input for the slow release case.
