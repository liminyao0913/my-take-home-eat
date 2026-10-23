# Deployment and recovery

Current hosting target: the existing Render service at **https://lets-eat-ba8e.onrender.com/**, selected October 23, 2026. Local/LAN access remains available for development. The [remediation spec](self-reflect-remediation-tech-spec.md) defines the next implementation; [verification](verification.md#render-baseline-and-self-review-remediation) records what has actually passed.

The initial missing-schema, Origin, and build-command failures were repaired through the Render API with the user's authorization. A two-browser hosted flow now passes. API/SSH inspection confirmed one 1 CPU / 2 GiB instance in Virginia; a 1 GB persistent disk was attached at `/var/data`. The review's application hardening remains separate work; use the verification record for deadline, version, and persistence results.

## Configure the existing Render service

Use the repository at [liminyao0913/my-take-home-eat](https://github.com/liminyao0913/my-take-home-eat). The linked branch remains `master`, and remediation work is on `fix/self-reflect-render`. Automatic deployments are off. Use an explicit tested commit SHA for a manual deployment; a push to either branch does not itself deploy this service.

Set these fields separately in the service settings:

| Field | Value |
| --- | --- |
| Runtime | Node; `.node-version` pins 24.22.1 |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:host` |
| Health Check Path | `/api/health` |
| Environment: `APP_ORIGIN` | `https://lets-eat-ba8e.onrender.com` |
| Environment: `DATABASE_PATH` | `/var/data/lets-eat.sqlite` |
| Persistent disk mount | `/var/data` |
| Instances | 1 |

Do not put `npm run start:host` in the Build Command field: it starts the server without creating the production build. Do not use plain `npm start` as the deployment Start Command: it skips migrations. `start:host` runs committed migrations before starting Next on `0.0.0.0`; Render supplies `PORT`. Use the HTTPS origin without a trailing slash or a `:3000` suffix. [Render web service settings](https://render.com/docs/web-services).

`.env.local not found. Continuing without it.` is expected on Render. Configure values under Environment instead of uploading that local file. Both the Blueprint and the repaired service now set the explicit HTTPS origin above. The app does not automatically use `RENDER_EXTERNAL_URL` when `APP_ORIGIN` is absent. [Render-provided variables](https://render.com/docs/environment-variables).

Verify a paid persistent disk is actually attached at `/var/data`; setting `DATABASE_PATH` alone does not attach storage. The checked-in [render.yaml](../render.yaml) now describes the configured `1c-2g` Virginia instance and 1 GB disk, with automatic deployments off. The existing service was updated directly, not recreated as another Blueprint service. A manually configured service does not automatically synchronize future changes to this file.

Only files under the disk mount survive redeploys. The disk is unavailable to builds/pre-deploy commands, so migrations belong in startup. One instance owns it, and deployments briefly interrupt service. [Render persistent disks](https://render.com/docs/disks). A free/ephemeral deployment can demonstrate the UI but is not the durable SQLite deployment described here.

## Recover the observed deployment

1. Check the current `DATABASE_PATH` and disk mount in the runtime environment. Preserve any existing database and take a consistent backup before changing its path or migrating it. Creating a new empty database would not migrate old meals automatically.
2. Correct the Build/Start fields and environment values above, then redeploy. Verify build output includes a successful `next build` and runtime logs show `Database migrations applied.` before Next is ready.
3. Confirm these read-only checks:

   ```sh
   curl --fail-with-body https://lets-eat-ba8e.onrender.com/api/health
   curl --fail-with-body https://lets-eat-ba8e.onrender.com/api/profile
   ```

   Expect health `{"status":"ok"}` and an anonymous profile response with HTTP 200. A homepage 200 alone is insufficient.
4. Create one labeled test room in a fresh browser, join from another browser, vote, and finish early. Confirm the invite uses the HTTPS hostname and both people see the same result.
5. Complete the real-deadline and restart/persistence gates below before calling the deployment verified.

| Symptom | Check |
| --- | --- |
| `Could not find a production build in .next` | Build must run `npm run build`; start must be a separate phase. |
| `no such table: profiles` or health 503 | Runtime migrations must use the server's actual database path; inspect startup errors and mount permissions. Migrations run during build do not prove runtime schema exists. |
| `WRONG_ORIGIN` on create | Compare the browser's origin to `APP_ORIGIN` exactly, including scheme and any port; redeploy after fixing it. Do not disable the Origin check. |
| Meals disappear after redeploy | Confirm the file lives under an attached persistent mount. A writable directory alone may be ephemeral. |

Health currently checks only the `rooms` table. Even after it returns 200, also check the profile endpoint; review F5 strengthens readiness to verify all required schema. [Render health-check setup](https://render.com/docs/health-checks).

## Resource and operating baseline

Keep one app process and SQLite. The confirmed allocation is 1 CPU / 2 GiB RAM with a 1 GB disk; use those limits when interpreting capacity numbers. The review's 100-group test ran on a much larger local machine; the initial Render target is 20 groups of eight and must be measured under the actual allocation. See the spec for latency/memory targets, quotas, and an isolated load-test procedure.

Use Render logs/metrics for errors, restarts, memory, CPU, and disk growth. Record the deployed commit with each release. The header version link and `/api/version` identify the package version and serving Git commit without touching SQLite. Take backups daily and before schema changes, retain at least seven daily copies outside the service, and verify a restore periodically. This is the operating policy to set up, not a claim that a backup schedule already exists. A Render cron service cannot directly mount this service's disk; run the backup on the owning service through an operator or external scheduler, then transfer the file off-host.

## Back up before schema changes

In the running service's shell, choose a new filename under the persistent mount:

```sh
npm run db:backup -- /var/data/lets-eat-before-migration.sqlite
```

Copy that backup off the service using Render's file-transfer facilities. The command uses SQLite's backup API, including committed WAL data. Do not copy only the live main SQLite file, and do not overwrite the only known-good backup. Keep sufficient free disk space for the temporary copy. Protect backups like the original database: they contain private preferences and credential hashes.

LAN data and Render data are separate. Sharing a repository does not copy the LAN database, and browser cookies do not move between hostnames. Any transfer of real meal data is a separate deliberate migration using a verified backup; no transfer was performed in this documentation change.

## Verify a backup without replacing production

Copy the backup to a separate writable local directory, use a compatible application version, and run:

```sh
DATABASE_PATH=/path/to/restored.sqlite APP_ORIGIN=http://localhost:3001 npm run db:migrate
DATABASE_PATH=/path/to/restored.sqlite APP_ORIGIN=http://localhost:3001 npm run start -- --port 3001
```

Visit a known room path and verify the result and shared inputs. Personal access also requires the corresponding test browser credential; a public result alone does not prove identity restoration. The isolated local browser suite covers both backup restoration and remembered browser identity.

For production recovery, stop the app first, preserve the existing database and its `-wal`/`-shm` companions separately, and install a verified backup as a new file. Point `DATABASE_PATH` to that new file before starting. Never restore over an open database. Use a schema-compatible application version: an application rollback does not reverse migrations. Record the backup time and any writes that recovery would lose.

## Local and hosted release checks

Run against an isolated local database, using the pinned Node version:

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e:release
```

Do not rebuild `.next` underneath a running local production server; use a separate checkout or stop/restart it deliberately. Browser reports are in `playwright-report/` and `test-results/`. The GitHub workflow can include the actual ten-minute case through its `real_deadline` input.

The existing browser suite starts ports 3100/3101 and uses temporary SQLite files; its helpers may edit test deadlines. It is **not** a hosted test runner and must not be redirected wholesale to production. The separate hosted suite is specified, not implemented yet.

At the Render URL, use independent browser sessions and labeled test rooms for create/join/vote/preferences, copy-link, early results, personal history, mobile, and reload continuity. Also wait through one real ten-minute round without modifying its deadline. Keep abuse, load, migration, and restore probes on an isolated environment.

To prove persistence, record a test-room URL and keep the test browser storage, perform a planned restart/redeploy, then reopen it and compare the inputs, identity, history, and frozen result. Low-volume public HTTP testing cannot verify the disk mount or perform this restart by itself. There is no public room-deletion API: shared smoke rooms remain until a separately scoped maintenance cleanup. Cookie-bearing traces/storage remain private, outside Git.

## Local/LAN operation

For local development, use the [README](../README.md#run-locally). The previously running LAN service uses `http://192.168.86.52:3000` and its own ignored `.env.local`; this documentation change does not alter it. For a local production start, build with Node 24, set the exact LAN `APP_ORIGIN`, then run `npm run start:host`. Use the backup procedure above with a local destination before replacing the database or applying schema changes.

Render is now the selected public hosting path. Do not substitute the old raw public HTTP address in invites for this release.
