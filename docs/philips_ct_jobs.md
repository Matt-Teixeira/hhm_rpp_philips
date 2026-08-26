# Philips CT job flow

## How to run
- Local: `npm run philips_ct` (or `node index.js PHILIPS_CT`).
- Docker (dev tree): `RUN_USER=<you> docker compose run --rm app_tools node index.js PHILIPS_CT` — see `CLAUDE.md` "Running".

## What the job targets
- Startup entrypoint (`index.js`) loads system metadata from `data_acquisition/on_boot_queries.js` under the `PHILIPS_CT` query (Philips systems with a CT modality and `run_group = 1`). Each record supplies `id`, `time_zone_id`, `debian_server_path`, and a `log_config` array describing every log file to ingest.
- `jobs/Philips/index.js` routes CT systems to `jobs/Philips/CT/index.js` with a generated `job_id` and a shared `run_log`.

## Per-system execution (`jobs/Philips/CT/index.js`)
- Iterates each `log_config` entry (typically `dir_name: eal` and `dir_name: events`).
- Builds a `Philips_CT` acquisition instance (`data_acquisition/Philips_CT.js`) for the file and dispatches to the parser:
  - `eal` → `jobs/Philips/CT/eal_parser.js`
  - `events` → `jobs/Philips/CT/events_parser.js`
- After parsing, archives the raw log via `util.gzip_n_save` using `sysConfigData.debian_server_path` and the capture timestamp.

## Data acquisition (`data_acquisition/Philips_CT.js`)
- Target file path: `${process.env.DATA_STORE_DEV}/${system.id}/${file_name}`.
- Tracks file growth in Redis (`getRedisFileSize`, `updateRedisFileSize`) and the current filesystem size (`getCurrentFileSize`), then computes `delta`.
- If `delta` is 0, the parser exits early; if negative or missing prior size, reads the entire file; otherwise tails only the new bytes (`tail.sh`).
- Provides helpers for last-modified timestamps and regex matching (`philips_re`) via `getMatchBlocks()`.

## Parsing and persistence
- Both parsers use `generateDateTime` to combine `host_date`/`host_time` with the site timezone and stamp rows with `capture_datetime`.
- `eal_parser.js`:
  - Collects matches for the EAL log, normalizes quoted fields, maps to `philips_ct_eal_events_schema`, and inserts with `pgp.helpers.insert` into `log.philips_ct_eal_events`.
  - Updates Redis with the new file size and upserts `alert.offline_hhm_conn` using `build_upsert_str`.
- `events_parser.js`:
  - Collects matches for the Events log, maps them (also to `philips_ct_eal_events_schema`), inserts into `log.philips_ct_eal_events`, and updates Redis.
- Logging: all steps log to `run_log` via `System.addLogEvent`, using logger enums from `utils/logger/enums`.

## Typical file expectations
- `EALInfo.output` (dir `eal`): critical/error traces.
- `Events.output` (dir `events`): system event transitions.
- Both use regex models named in `log_config.parsers`; database column targets come from `log_config.pg_tables`.
