# CLAUDE.md

> **Migrated to the fleet dev/release paradigm 2026-08-26.** Conventions:
> `data_acquisition/docs/migration_CLAUDE.md` Part 1. Dev clone:
> `~/apps/hhm_rpp_philips`; `/opt/apps/hhm_rpp_philips` is build output
> produced ONLY by `build-release.sh`. Cutover verified over a full day of
> cron cycles (2026-08-26 13:45 → 2026-08-27 13:15 UTC, `util.app_run_logs`):
> all 18 families at unchanged cadence (48 runs/family, delete_old_files 47),
> every run `svc | RELEASE_SHA=534ad92`, zero `dev-tree`, zero failed;
> outcome mix and warn band match the pre-cutover baseline (partial ratio
> 27.8% both eras, avg warn/err per success run 10.4 both eras).

**hhm_rpp_philips** is a Node.js parser: it incrementally reads Philips
equipment log files (fetched to `/opt/resources/acqu_files/<SME>/` by
data_acquisition every 30 min), parses new content since the last run, and
bulk-inserts to PostgreSQL. CT/CV jobs also archive raw machine files as gzip
blobs into `log.saved_files` (~381 kB/row), which this app itself purges on a
48-hour retention (`delete_old_files` — see audit DB-05). Run-once by design —
triggered on a schedule, not a long-running service.

## Run arguments (job families)

| argv | what it does | status |
| --- | --- | --- |
| `PHILIPS_CT` | CT eal/events parsing + `gzip_n_save` → `log.saved_files` | **live** — `:15/:45` |
| `PHILIPS_CV` | CV eventlog parsing | **live** — `:15/:45` |
| `PHILIPS_MRI_MONITOR_1`–`5` | MRI monitor deltas (Redis size cursor) | **live** — `:15/:45` |
| `PHILIPS_MRI_RMMU_1`–`5` | MRI rmmu history/magnet/cryogenic | **live** — `:15/:45` |
| `PHILIPS_MRI_LOG_1`–`5` | MRI logcurrent (`--max-old-space-size=4096`) | **live** — `:15/:45` |
| `delete_old_files` | `log.saved_files` 48 h batched retention (advisory-locked) | **live** — `:05/:35` |
| `file_dt` | update file datetimes | **dead** — no cron entry, no runs in record; stays dead (standing decision) |
| `reset_daily_system_totals` | daily totals reset | **dead** — no cron entry, no runs in record; stays dead |

The `_1`–`_5` suffixes are run groups from `data_acquisition/on_boot_queries.js`
(each family's boot query selects its systems). Incremental mechanism: Redis
keys per `<SME>.<file>` hold the last-read cursor (file size or line), advanced
**after** a successful insert — overlapping runs of the same family would
double-process, so cron entries must use `flock -n`.

## Schedule (matt-teixeira's USER crontab — `crontab -l`)

**Deviation from Part 1, deliberate:** this app's schedule pre-dates the
paradigm and lives in matt-teixeira's user crontab, like hhm_rpp_ge and
incident-engine. Standing decision: existing user-crontab schedules are
hardened **in place**; consolidation into the shared svc crontab is the
separate follow-up data_acquisition BACKLOG 6f, not part of this migration.

Current state (pre-cutover): 19 entries in the "PHILIPS RPP (preserved
verbatim)" block — 18 read families at `15,45 * * * *` (sleep offsets 0–50 s)
plus `delete_old_files` at `05,35`. They are **unhardened**: relative `docker`,
`bash -lc "npm run …"` indirection, no `flock`, no `-T` (except the delete
entry), no `.out` capture. Hardening lands at cutover with cadences and sleep
offsets unchanged. Baseline (7 days to 2026-08-26): all 18 families at 322–323
runs each — the schedule is live and healthy.

## KNOWN WARTS (deliberate — do not "fix" casually)

- **Shared image.** Compose runs `image: hhm_rpp:${IMAGE_TAG}` — owned and
  built by **hhm_rpp_ge** (`hhm_rpp_ge/docker/Dockerfile`); philips and siemens
  have no Dockerfile on purpose. Do NOT retag or rebuild it from this repo.
  Since ge's migration (2026-08-26): ge dev trees build `hhm_rpp:<username>`,
  ge's release builds `hhm_rpp:svc`. This app runs `IMAGE_TAG=svc`. Once
  philips is cut over, no consumer needs the legacy `staging` alias — retiring
  it is ge-repo follow-up.
- **No entrypoint log-dir repair.** The gosu entrypoint is baked into ge's
  image and only drops privileges — it cannot `mkdir`/chown the log dir.
  Substitute: `build.sh` and `preflight-check.sh` create `./utils/logger/logs`
  host-side so Docker never creates the bind source root-owned.
  `/opt/run-logs/hhm_rpp_philips` is pre-created `svc:docker 2775` on the host.
- `index.js` references a `DESIGN.md` (run_outcome/v1 contract) that was never
  committed. The contract's authority is the comments in `index.js` itself;
  ops-dashboard and incident-engine consume the exit codes and the
  `run_outcome` event — **never regress to exit-0-on-failure, and never
  reshape event 0's `note.argv`** (ops-dashboard derives the job label from
  `verbose_log->0->'note'->'argv'->>2`).
- **Legacy Azure + VNS3 credentials kept in `.env`** (owner decision
  2026-08-26, keep-and-document): the commented `PG_*` Azure block and the
  `VNS3_*` lines are inert — `utils/db/pg-pool.js` prefers the `PGHOST` family
  and nothing reads `VNS3_*`. They stay as an operator reference. Do not
  uncomment the `PG_*` block: with `PGHOST` unset, pg-pool's fallback would
  silently point runs at the Azure host.
- **`:15/:45` container pileup.** CT + CV + the five MONITOR entries share
  second 0 of the minute (7 containers at once, then rmmu/log staggered 5–50 s
  behind). Pre-existing behavior, works, left unchanged at cutover
  (minimal-change hardening — owner-approved 2026-08-26).
- Museum code retained pending post-cutover cleanup (deferred by decision,
  needs per-item sign-off): `utils/vpn/`, `utils/config-processor/`,
  `utils/units/`, non-philips SQL under `utils/db/sql/`,
  `utils/db/pg-pool copy.js`, `read/exec-move_to_archive.js` +
  `read/sh/move_to_archive.sh` (only caller is commented out),
  `TUNNEL_RESET_APP` (points at a script that does not exist), the `pm2`
  dependency, and raw `console.log` debug dumps in job files that bypass
  `LOGGER_MODE`. NOT museum: `util/gzip_file.js` (`gzip_n_save`) is live —
  CT jobs write `log.saved_files` through it.

## Running

```bash
bash preflight-check.sh          # expect ZERO warnings
bash build.sh                    # deps in-tree + dev log dir + image check

# Development — from the dev tree (~/apps/hhm_rpp_philips), as yourself
RUN_USER=<you> docker compose run --rm app_tools node index.js PHILIPS_CT
# LOG families keep their heap flag:
RUN_USER=<you> docker compose run --rm app_tools node --max-old-space-size=4096 index.js PHILIPS_MRI_LOG_1

# Production — from the release copy, RUN_USER omitted (entrypoint defaults to svc)
cd /opt/apps/hhm_rpp_philips && docker compose run --rm app_tools node index.js PHILIPS_CT

# Release
bash build-release.sh            # refuses on a dirty tree; stamps RELEASE_SHA
```

Run logs: dev → `./utils/logger/logs/`, release → `/opt/run-logs/hhm_rpp_philips/`
(`<app>-log.<USER_ID>.<run_id>.json`; read with `cat`, never open in an editor).
A dev run is a REAL run — same staging DB, same Redis cursors, same source
files as production. Running a read family off-schedule consumes that family's
delta, so the next cron tick logs "not grown" for those systems (normal,
self-heals on the following capture).

### Dev-phase verification (2026-08-26, pre-cutover)

- `preflight-check.sh`: 45 ok, **0 warnings**, 0 errors on the dev clone.
- Dev round-trip: `delete_old_files` and `PHILIPS_MRI_MONITOR_3` as
  matt-teixeira — logs landed in `./utils/logger/logs/` tagged
  `.matt-teixeira.`, boot note recorded `RELEASE_SHA=dev-tree`, honest
  `run_outcome` (`success exit=0`), rows in `util.app_run_logs`; nothing new
  in `/opt/run-logs/hhm_rpp_philips`.
- Clean-tree guard negative test: untracked file → refused, exit 1, release
  dir untouched (guard sits above the wipe).
- Tar excludes verified by `tar -tf` diff: zero tracked files dropped;
  `package.json`/`package-lock.json` ship.
- Kill test (`SIGTERM` mid-run, `PHILIPS_MRI_MONITOR_1`): handler flushed both
  sinks once and exited honestly — `run_outcome failed exit=1`, DB row carries
  `fatal.code=E_SIGNAL`, compose exit 1. **Test-harness caveat worth keeping:**
  ge's entrypoint `exec`s gosu so node is PID 1, and PID 1 silently IGNORES a
  signal that arrives before `process.on()` registration (module-load phase,
  first ~0.5 s) — two early attempts "passed" the TERM into that window and the
  runs completed untouched. A real kill test must wait for node's own output
  before signalling.

## Environment / secrets

- `.env` is gitignored; `.env.example` is the tracked record of required keys.
- PG + Redis credentials come from root-only `/opt/resources/secrets/`; this
  app **is registered** in the host rotation script
  (`rotate-envs-20260817.sh`), which rewrites both
  `/opt/apps/hhm_rpp_philips/.env` and `~/apps/hhm_rpp_philips/.env` when a
  secret rotates — both copies must keep values matching the reference.
- Pre-migration `.env` backup: `~/env-backups/hhm_rpp_philips.env.pre-migration-2026-08-26`.
