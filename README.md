# hhm_rpp_philips

Philips parsers split out of `hhm_rpp`: CT, CV, and MRI (monitor, RMMU, logcurrent).
Reads the files `hhm_data_acquisition` writes under `debian_server_path`, inserts parsed
rows into Postgres, and keeps per-file progress in Redis.

`utils/` (db pool, logger, SQL helpers) is part of this repo, not a separate checkout.

## Jobs

| npm script | prod cron (UTC) |
|---|---|
| `philips_ct`, `philips_cv` | `18,48` |
| `philips_mri_monitor_1`..`5` | `18,48` (+0/5/10/15/20s) |
| `philips_mri_rmmu_1`..`5` | `18,48` (+0/5/10/15/20s) |
| `philips_mri_log_1`..`5` | `19,49` (+25..45s) |

`delete_old_db_files` and `reset_daily_system_totals` also exist here but still run from
`hhm_rpp` in prod (they are not Philips-specific).

## .env

Same keys as `hhm_rpp_ge/.env`. Prod values:

```
APP_NAME='hhm_rpp_philips'
LOGGER='prod'
DEV_ENV='prod'          # 'dev' rewrites debian_server_path to $DEV_FILE_PATH/files/<SME>
PG_DB / PG_HOST / PG_USER / PG_PW   (prod)
PG_SSL_PATH=./utils/db/BaltimoreCyberTrustRoot.crt.pem
REDIS_IP=<prod redis>
```

## Testing without writing anything

| env var | effect |
|---|---|
| `DRY_RUN=1` | Every read happens (Postgres, Redis, files); no writes. Postgres sessions are opened read-only (`default_transaction_read_only=on`), so the server rejects writes even if the app's own check misses one. Skipped writes go to `dry_run_output/<JOB>.<ts>.sql`, with a summary printed at exit. Redis SET/DEL/LPUSH are skipped; GETs pass through. |
| `ONLY_SME=SME01138,SME19034` | Limits the run to those systems. |

```
DRY_RUN=1 ONLY_SME=SME01138 npm run philips_mri_monitor_1
DRY_RUN=1 npm run philips_cv
```

A dry run does not advance Redis offsets, so running it again processes the same data again.

### Parity check against hhm_rpp

`tooling/parity_check.js <dry-run file> <since>` counts prod rows with
`capture_datetime >= since` for the dry run's systems, per table, next to the dry run's count.
It is read-only.

## Prod rollout

`hhm_rpp` keeps running the Philips jobs until step 5. **Never have both apps running the
same job:** they share Redis keys (`<SME>.<file>`), so a double run inserts duplicate rows.
Sharing the keys is also what makes switching over and back clean: each app picks up where
the other stopped.

1. **Install** (as `prod`):
   ```
   cd /home/prod && git clone git@github.com:Matt-Teixeira/hhm_rpp_philips.git
   cd hhm_rpp_philips && git checkout <branch> && npm ci
   cp ../hhm_rpp_ge/.env .env   # then set APP_NAME='hhm_rpp_philips'; drop INSIGHT_* lines
   ```
   Do not copy a dev `.env`: it has `DEV_ENV=dev` and the dev Redis.

2. **Smoke test** (safe at any time):
   ```
   DRY_RUN=1 ONLY_SME=SME01138 npm run philips_mri_monitor_1
   ```
   Expect the `DRY_RUN SUMMARY` and no `read-only transaction` or `DRY_RUN:` errors.

3. **Parity dry run.** Acquisition writes files at `:00/:30`; `hhm_rpp` parses them at
   `:18/:48`. A dry run between those times (e.g. `:10`) uses the same prod Redis offsets
   and files, so it previews exactly what `hhm_rpp` is about to insert:
   ```
   for j in philips_ct philips_cv philips_mri_monitor_1 philips_mri_rmmu_1 philips_mri_log_1; do
     DRY_RUN=1 npm run $j > /tmp/dry_$j.out 2>&1; done
   ```

4. **Compare.** After `hhm_rpp` has finished (~`:25`), using that run's start time:
   ```
   node tooling/parity_check.js dry_run_output/PHILIPS_CV.<ts>.sql 2026-11-19T13:18:00Z
   ```
   Expect `OK` on every table. Philips CT currently compares only `log.saved_files`,
   because none of the CT `.output` files are being updated by acquisition.

5. **Cut over.** Right after a `:18/:48` run (logs finish by about `:21`):
   ```
   crontab -l > ~/crontab.backup.$(date -u +%FT%H%MZ)
   crontab -e
   ```
   In the 17 Philips lines (`philips_ct`, `philips_cv`, `monitor_1-5`, `rmmu_1-5`,
   `log_1-5`), change `cd /home/prod/hhm_rpp` to `cd /home/prod/hhm_rpp_philips`.
   Leave `delete_old_db_files` and `reset_daily_system_totals` on `hhm_rpp`.

6. **Verify** after the first real run:
   ```sql
   SELECT inserted_at, json_array_length(warn_error_logs) AS warn_err
   FROM util.app_run_logs
   WHERE app_name = 'hhm_rpp_philips'
   ORDER BY inserted_at DESC LIMIT 20;
   ```
   You should see 17 runs every half hour, at a warn/error rate like `hhm_rpp`'s before
   cutover. New rows should be landing in `log.philips_cv_eventlog`,
   `mag.philips_mri_monitoring_data_agg`, `mag.philips_mri_rmmu_*`, and
   `log.philips_mri_logcurrent`.

7. **Rollback:** `crontab ~/crontab.backup.<ts>`. Because Redis state is shared, `hhm_rpp`
   resumes from wherever this app stopped.

Optional: rotate this app's run logs like `hhm_rpp`'s:
`59 3 * * * /home/prod/hhm_rpp_philips/utils/logger/stamp_compress.sh hhm_rpp_philips prod`
