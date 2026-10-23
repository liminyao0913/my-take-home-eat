# Deployment and recovery

The public service is [Let's Eat on Render](https://lets-eat-ba8e.onrender.com/). Local setup uses **http://localhost:3000 only**. Both use Node 24.22.1, one Next.js process, and SQLite; their databases and browser identities are separate. See [verification](verification.md) for measured release evidence and [the remediation spec](self-reflect-remediation-tech-spec.md) for limits and acceptance gates.

## Localhost setup

On a new checkout:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

On an existing checkout, preserve `.env.local` and set `APP_ORIGIN=http://localhost:3000` and `DATABASE_PATH=.data/lets-eat.sqlite`. Development and production startup bind to localhost, apply committed migrations, and validate configuration/schema/writability before listening. No LAN address, router change, or public IP is needed.

For production mode, stop the running local process before replacing its build:

```sh
npm run db:backup -- /path/to/a-new-backup.sqlite
npm ci
npm run build
npm start
```

Do not run `next build` over a live process's `.next` directory. Tests can use an isolated source/build copy. For another localhost port, set `APP_ORIGIN` to that exact origin and pass the same port to `npm start -- --port 3001`.

On the current workstation, `lets-eat-local.service` is enabled in the systemd user manager. It runs this checkout's production build with the pinned binary `~/.local/share/lets-eat/node24/bin/node`, applies migrations and startup checks, binds only to `127.0.0.1:3000` through `--hostname localhost`, and restarts after failure. Its unit is in `~/.config/systemd/user/`; user lingering is enabled. The local database and existing `.env.local` remain on this machine.

```sh
systemctl --user status lets-eat-local.service
journalctl --user -u lets-eat-local.service
# Stop before installing/building a replacement, then start after checks:
systemctl --user stop lets-eat-local.service
npm run db:backup -- /path/to/a-new-backup.sqlite
npm ci
npm run build
systemctl --user start lets-eat-local.service
curl --fail-with-body http://localhost:3000/api/health
```

## Render settings

Use the existing service `srv-dbdq644ipgvc739okdj0`, with repository [liminyao0913/my-take-home-eat](https://github.com/liminyao0913/my-take-home-eat) and release branch `fix/self-reflect-render`. Automatic deployments stay off; push the branch and deploy a deliberately selected tested commit. This does not merge the feature branch into `master`.

| Field | Value |
| --- | --- |
| Runtime | Node 24.22.1, pinned by `.node-version` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:host` |
| Health Check Path | `/api/health` |
| `APP_ORIGIN` | `https://lets-eat-ba8e.onrender.com` |
| `DATABASE_PATH` | `/var/data/lets-eat.sqlite` |
| Persistent disk | 1 GB, mounted at `/var/data` |
| Compute | One `1c-2g` instance: 1 CPU / 2 GiB, Virginia |

Build and Start are separate fields. `start:host` applies migrations, runs readiness/writability checks, and binds to `0.0.0.0` using Render's `PORT`. Local `npm start` also applies migrations, but its localhost binding is unsuitable for Render. Never put a server start command in the Build field. [Render web service settings](https://render.com/docs/web-services).

Set environment values in Render; do not upload `.env.local`. Its absence on Render is normal. Startup requires an explicit HTTPS non-local `APP_ORIGIN`, with no trailing slash or `:3000`, and an absolute `DATABASE_PATH`. It does not substitute `RENDER_EXTERNAL_URL` or silently fall back to localhost. [Render environment variables](https://render.com/docs/environment-variables).

Only an attached persistent disk provides durable storage. The directory name alone is insufficient. The disk is unavailable during build/pre-deploy, belongs to one service instance, and causes a brief deployment interruption. Keep migrations in startup and do not add replicas sharing this SQLite file. The [Blueprint](../render.yaml) records the settings; a manually configured service does not automatically synchronize Blueprint edits. [Render disks](https://render.com/docs/disks).

## Readiness and release identity

```sh
curl --fail-with-body https://lets-eat-ba8e.onrender.com/api/health
curl --fail-with-body https://lets-eat-ba8e.onrender.com/api/profile
curl --fail-with-body https://lets-eat-ba8e.onrender.com/api/version
```

Health returns `{"status":"ok"}` only when required migrations, schema, indexes, and a cheap database read succeed. It never migrates, prunes profiles, or finalizes rooms. A homepage 200 alone does not establish readiness. Startup additionally verifies write access with a rolled-back transaction and logs a sanitized record containing origin, schema version, and release commit.

The header links to `/api/version`: package version and `RENDER_GIT_COMMIT`, or `null` in a normal local run. It works independently of SQLite. Request logs contain route templates, status, duration, error code, and generated request IDs; they exclude room links, cookies, bodies, and preferences. HTTP lock contention returns 503 with `Retry-After: 1` after the 100 ms busy budget.

| Symptom | Check |
| --- | --- |
| Production build missing | Build with `npm run build`; start in a separate phase. |
| Health 503 or missing `profiles` | Check runtime migration logs, database path, persistent mount, and permissions. |
| `CONFIG_INVALID` | Use an exact origin and explicit persistent SQLite path on Render. |
| `WRONG_ORIGIN` | Browser origin must exactly equal `APP_ORIGIN`; retain the Origin check. |
| 413 / 408 / 429 | Request too large, upload timed out, or temporary admission budget exhausted; use the message/Retry-After. |
| Capacity 409 | Follow the room/round/participant limit message; expired rounds do not consume open-room admission. |
| Lost meals after redeploy | Verify the attached mount and database path before creating any replacement file. |

## Backups, disk monitoring, and recovery

Before a schema change, take a new consistent backup and copy it off-host. The backup command includes committed WAL data:

```sh
npm run db:backup -- /var/data/lets-eat-before-migration.sqlite
```

Run that command in the owning Render service's shell, then transfer the file through Render SSH/SFTP. Never copy only a live main SQLite file, overwrite the sole good backup, or restore over an open database. Protect backups as private data.

An external backup command automates the SSH backup, off-host transfer, SHA-256 comparison, SQLite integrity/foreign-key checks, and retention of the latest **seven distinct daily copies**:

```sh
RENDER_SSH_HOST=srv-dbdq644ipgvc739okdj0@ssh.virginia.render.com npm run db:backup:render
```

It requires the operator's existing Render SSH access and verified host key. It does not copy private SSH keys into Render or bypass host verification. Backups default to `.data/backups/render/` (directory 0700, files 0600). A successful rerun on the same UTC date keeps that day's verified copy. Temporary remote copies are removed after transfer; production data is untouched.

On the current operator machine, `lets-eat-render-backup.timer` is enabled for **04:15 America/Los_Angeles daily**, with persistent catch-up and user lingering enabled. Its service uses the pinned Node binary in `~/.local/share/lets-eat/node24/bin/node` and this checkout's backup script. The first off-host backup was verified October 23; seven daily copies accumulate over subsequent days. The machine must be powered and network-connected; missed schedules run when it returns, without inventing backups for missed days.

```sh
systemctl --user list-timers lets-eat-render-backup.timer
systemctl --user status lets-eat-render-backup.service
journalctl --user -u lets-eat-render-backup.service
```

The backup job measures Render disk usage, records **warning at 70% / critical at 85%**, and returns a nonzero scheduler status at either threshold. It checks available headroom before making a temporary copy. Review those logs and Render CPU/memory/disk metrics; allow room for WAL, migrations, and backup copies. No email sender is required.

Verify a restore in a separate writable directory using a compatible application build:

```sh
DATABASE_PATH=/path/to/restored.sqlite APP_ORIGIN=http://localhost:3001 npm start -- --port 3001
```

Check a known shared room, result, and corresponding test browser's identity/defaults/history. The local release tests exercise application restart and backup restoration. For real recovery, stop the service, preserve its current database/WAL/SHM, restore a verified backup into a new file, and point `DATABASE_PATH` to it before restarting. Application rollback does not reverse migrations; record the backup time and writes that recovery would lose.

## Local and hosted release checks

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:release -- --grep 'unaccelerated ten-minute'
```

The local suite owns localhost ports 3100/3101 and temporary databases. It includes real HTTP upload/collection races, a P1 three-browser group journey, and the invitation headcount/organizer override flow. Fixtures refuse non-test database paths. Do not redirect this suite to Render.

The separate hosted suite requires an explicit HTTPS target and starts no server or SQLite fixture:

```sh
HOSTED_BASE_URL=https://lets-eat-ba8e.onrender.com HOSTED_ARTIFACT_DIR=.data/hosted/release npm run test:hosted
HOSTED_BASE_URL=https://lets-eat-ba8e.onrender.com HOSTED_ARTIFACT_DIR=.data/hosted/release RUN_HOSTED_DEADLINE=1 HOSTED_DEADLINE_ONLY=1 npm run test:hosted
```

Readiness, profile, redirect, headers, and commit checks run before stateful tests. Regular hosted checks use labeled rooms and independent browser contexts for copied invites, contributions, private preferences, readiness/results, history/recommendations, and P1 late-arrival/close-versus-vote behavior. The invitation case verifies the expected count, guest override rejection, explicit organizer confirmation, copied attendance note, and mobile layout. The deadline case waits a real ten minutes with two joined of four expected and no database or clock edits. Set `EXPECTED_COMMIT` when verifying a specific deploy.

After a deliberate Render restart/redeploy, reuse the same artifact directory:

```sh
HOSTED_BASE_URL=https://lets-eat-ba8e.onrender.com HOSTED_ARTIFACT_DIR=.data/hosted/release HOSTED_RESUME=1 npm run test:hosted
```

Saved browser states prove continuity of identities, private inputs, history, recommendations, and the frozen result. Artifacts contain credentials and private room identifiers: keep the directory private and out of Git. Hosted test rooms remain in shared history; forgetting is not a delete-room operation.

For capacity, use an already-built checkout and Linux systemd user services:

```sh
npm run test:capacity
# Or keep the running local build intact:
CAPACITY_BUILD_DIR=/path/to/isolated/built/checkout npm run test:capacity
```

This runner creates its own localhost:3200 process and temporary SQLite file, verifies enforced 1 CPU / 2 GiB limits, and runs 20 groups of eight with three-second polling for ten minutes. It records requests, latency, accepted writes, health, CPU/RSS/event-loop delay, DB/WAL size, restart/OOM state, and a simultaneous-deadline burst. It stops the temporary service and removes its database afterward. Memory comparisons exclude the first two minutes and allow 16 MiB of GC/runtime variation between steady-window medians; inspect the full samples for a sustained trend. The evidence describes a constrained local service, not Render network or disk performance. Actual Render behavior is verified separately through the public URL; never run this load/abuse script against the live service.

## Dependency maintenance

Next.js and eslint-config-next are 16.4.3. The production audit reports zero advisories. The full audit still has four moderate entries for one development-only esbuild advisory through stable drizzle-kit 0.31.11; no affected esbuild development server is used here. Track the [upstream loader issue](https://github.com/drizzle-team/drizzle-orm/issues/5304) and [maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99). Do not apply npm's suggested downgrade to drizzle-kit 0.18.1. Migration generation and populated migration tests must pass after any toolchain update. Native SQLite is checked separately from npm audit.
