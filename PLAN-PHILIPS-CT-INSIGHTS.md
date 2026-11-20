# Philips CT Insights — plan

**Current state (2026-11-20; read this first):**
- **PCT-0 (decide): done. All 12 §5 recommendations AGREED on
  2026-11-20**, as written (§5). The evidence below is read-only and was
  gathered against prod on 2026-11-20. Nothing is built, nothing is committed, nothing was written
  to the DB, Redis or the files. `hhm_rpp_ge` was only read.
- **No Philips CT system sends data today.** The last row arrived on
  2026-11-02 15:48 UTC (SME20598). The collector reaches none of its 9
  systems: every SSH connection times out (§1.3). Collection comes first.
- **The ingest drops about half of the Events file** (a parser regex,
  §3.2 I1), and the collector drops another 4–7% of it (I2). The EAL file
  is ingested exactly (21,570 of 21,570 rows, field for field, §3.1).
- **The cutover from `hhm_rpp` is done:** all 17 Philips jobs run from
  `hhm_rpp_philips` since 2026-11-19 18:53 UTC. Each job's first run
  there started after its last `hhm_rpp` run had ended, so no job ran in
  both apps at once (§1.1). No parser change until it closes out (§5 Q3).
- **Freeze:** `hhm_rpp_ge` stays read-only until the GE MRI close-out
  (after the 2026-11-23 21:25 UTC check). The schema and C1-Philips work
  there (§4) waits for it.
- **Next (§6):**
  - a separate collector session (PCT-C) in `hhm_data_acquisition`:
    reachability first (network or site work), collector code only after
    your go-ahead (Q2);
  - the mapping (PCT-2a): **AGREED 2026-11-20** (§7.7 Q13–Q18, as
    drafted). It becomes `insight/philips_ct/rules.js` in PCT-2;
  - the parser fix (PCT-1b) is built after 2026-11-24 18:53 UTC (Q3) and
    deployed with or after PCT-C's export change (Q4);
  - the schema (PCT-1) waits for the GE MRI close-out and for PCT-C to
    show data (Q7, Q11).

  No insight code is built until a system reports again (Q1).

Companion: `PLAN-PHILIPS-CT-INSIGHTS-CODES.md` (codes, templates and the
proposed mapping, PCT-2a §7). Evidence: `~/philips_ct_evidence/` (`README.md` maps each
section below to its script and output).

---

## 1. What the data supports (verified against prod, read-only, 2026-11-20)

### 1.1 The cutover from `hhm_rpp`: done, clean

- **Done on 2026-11-19, job by job, and sequential.** For every one of
  the 17 jobs, the first `hhm_rpp_philips` run started 2–5 minutes after
  the last `hhm_rpp` run ended (`out/33_cutover_handover.tsv`,
  `out/32_cutover_detail.tsv`):

  | Job | Last `hhm_rpp` run ended (UTC) | First `hhm_rpp_philips` run started |
  |---|---|---|
  | `PHILIPS_CV` | 15:48:06 | 15:53:28 |
  | `PHILIPS_CT` | 16:48:07 | 16:52:55 |
  | `PHILIPS_MRI_MONITOR_1-5`, `RMMU_1-5` | 17:48:27 (latest) | 17:52:53 (earliest) |
  | `PHILIPS_MRI_LOG_1-5` | 18:50:28 (latest) | 18:52:55 (earliest) |

  The first run of each job came outside the cron minutes, presumably
  started by hand right after the crontab edit. From the next slot on,
  each job runs only from `hhm_rpp_philips`, at the usual :18 / :48 (logs
  :19 / :49). Because the apps share Redis offsets and never ran at the
  same time, no rows were inserted twice. `hhm_rpp` has logged no run
  since 18:50:28.
- **Prod checkout:** `/home/prod/hhm_rpp_philips` is on `PROD` at
  `84bc822` (= `origin/PROD`). The crontab backup taken before the edit is
  `/home/prod/crontab.backup.2026-11-19T1408Z`. The live crontab can't be
  read from this user; the run logs above are the evidence.
- **`PHILIPS_CT` behaves the same in both apps:** 56 warn/error entries
  on every run, before and after (`out/29_cutover_ct_runs.tsv`). They are
  all "file missing" errors from the 17 systems with no file (§1.3). CT
  had no data to insert on either side of the cutover.

### 1.2 Coverage: 0 systems current

| Philips CT | Count |
|---|---|
| In inventory (`public.systems`, modality `CT` 46, `PET/CT` 1) | **47** |
| Configured for the parser (`config.acquisition.run_group = 1`, `config.log` has `EALInfo.output`; all but SME17372 also `Events.output`) | **26** |
| Collected by the collector (`systems.process_log = true`; all 9 also `show_on_website`) | **9** |
| Files on disk under `/home/prod/hhm_data_acquisition/files/<id>/` | 13 (4 folders empty, 9 missing) |
| Any row since 2025-03 (`archive_log` + `log`) | 12 |
| Any row since 2026-05 (the fleet-wide data start) | **3** |
| Current (row in the last 2 days) | **0** |

Last device time per system with rows since 2025-03
(`out/17_history_coverage.tsv`, `out/04_files_on_disk.tsv`):

| System | Model | `process_log` | Last row (UTC) | File on disk last changed |
|---|---|---|---|---|
| SME20598 | Brilliance 64 | yes | **2026-11-02 15:26** | 2026-11-02 |
| SME18534 | Brilliance 64 | yes | **2026-10-30 21:01** | 2026-10-30 |
| SME18535 | Ingenuity 128 | yes | **2026-10-30 20:08** | 2026-10-30 |
| SME20605 | Brilliance 64 | yes | 2026-03-19 | 2026-03-19 |
| SME20602 | Ingenuity Core 128 | yes | 2026-03-17 | 2026-03-17 |
| SME20611 | Ingenuity Core 128 | yes | 2026-03-08 | 2026-03-08 |
| SME18530 | Ingenuity 128 | yes | 2026-03-05 | 2026-03-05 |
| SME17374 | Brilliance | no | 2026-02-06 | 2026-02-06 |
| SME17372 | Brilliance 64 | no | 2025-10-31 | 2025-10-31 |
| SME18976 | Brilliance 16 | yes | 2025-10-31 | 2025-10-31 |
| SME00410 | Brilliance 64 | no | 2025-10-30 | 2025-10-30 |
| SME18980 | Brilliance iCT | yes | 2025-10-27 | 2025-10-27 |

- The other 14 configured systems have no row since 2025-03, although
  Redis still holds a file offset for most of them, so they reported
  before that. SME17375 has a file on disk from 2026-02-06 but no row in
  that period.
- **The 9 collected systems are 2 customers:** Intelas (Holmes Regional
  ×3, Palm Bay ×1, Memorial Biloxi / Physician Clinics / Diamondhead ×3)
  and Providence Medford ×2.
- **The 17 configured systems with `process_log = false`** (also
  `show_on_website = false`) are never collected, but the parser still
  tries them every run.
- **For comparison:** GE CT had 27 of 75 configured systems current, GE CV
  2 of 18, and GE MRI 6 of 46. Philips CT has 0 of 26.

### 1.3 The gap is upstream: the collector reaches no scanner

The collector is `hhm_data_acquisition` (`npm run philips_ct` →
`jobs/hhm/philips/philips_ct.js` → `read/sh/Philips/phil_ct_data_grab_*.sh`).
The dev and prod copies of these files are identical.

- **Selection:** `sql/system/get_hhm_data.sql` picks systems with
  `process_log = true`, not `run_group`. That is why 9 are tried and 26 are
  configured.
- **What it does on each run, per system:**
  1. `lftp`/`sftp` downloads `D:\Data_Logger\Logger.mdb`, an Access (JET4)
     database on the scanner.
  2. It truncates `EALInfo.output` and `Events.output` and writes them
     again from scratch, using `mdb-export | sort`.
  3. If the download fails, the script exits before step 2, so the old
     files stay as they are.
- **Outcome, last 30 days** (`out/05_collector_outcomes.tsv`; stderr
  reduced to a class, IPs masked):

  | Systems | Result |
  |---|---|
  | SME18530, SME18976, SME18980, SME20602, SME20605, SME20611 | every attempt failed (2,878 of 2,878): `connect to host … port 22: Connection timed out` |
  | SME18534, SME18535, SME20598 | failing since 2026-10-30 / 10-30 / 11-02, same error |

  These are TCP connect timeouts: network, VPN or site firewall, or the
  scanner's SSH service. They are not credentials and not code: no
  commit has touched the Philips CT collector files since 2026-09-01.
- **`log.saved_files`** (48 h) holds 98 copies of each stale file with a
  single distinct content each (`out/30_saved_files.tsv`), so it holds no
  file rotation evidence. The last real files on disk were copied to
  `~/philips_ct_evidence/mdb/` (5 systems, including their
  `Logger.mdb`). They are the ground truth used in §3.

### 1.4 The source: one Access database, two files, one table

- **`Logger.mdb`** has two tables (`out/07_mdb_vs_output.txt`):
  - `EALInfo`: `DTime`, `Controller`, `DataType`, `LogNumber`,
    `TmStamp`, `ERR_TYPE`, `ErrNum`, `vxwErrNo`, `File`, `Line`,
    `Param1`, `Param2`, `Info`, `EalTime`.
  - `Events`: `Type`, `Level`, `Module`, `TStampNum`, `DataTime`, `Msg`,
    `EAL` (text(6): `Yes` or empty), `BLOB` (binary OLE), `EventTime`.
- **It is a rolling buffer that resets.** One file holds 3.5 hours to
  2.3 days (21,570 EAL + 27,824 Events rows on SME20598, 20 h). When it
  fills up, the scanner starts a new, empty file (§3.3).
- **EAL and Events describe the same events.** Every EAL row has exactly
  one Events twin with the same timestamp key and `EAL = Yes`, and vice
  versa: a key-for-key match on all 5 snapshots (`out/34_twin_check.txt`). EAL holds the gantry
  controller detail; Events holds the state machine and the GSE/GLC
  application messages.
- **Ingest:** `jobs/Philips/CT/eal_parser.js` and `events_parser.js`
  (regexes `ct_eal_v_2`, `ct_events_v2` in `parse/parsers.js`) both
  insert into **one table, `log.philips_ct_eal_events`**. It has 27
  columns, all text except `host_datetime`, `capture_datetime`, `status`
  and `id`, with monthly partitions on `capture_datetime`. EAL rows have
  `data_type` set; Events rows have `module` set.
  - `log.philips_ct_eal` and `log.philips_ct_events` exist but are empty.
  - Rows since 2026-05: **11.6M** (`out/09_dups_history.tsv`). Archived
    2025-03 → 2026-04: about 39M (estimate) in `archive_log`.
  - Ids reach about 51.25M. Index `(system_id, host_datetime DESC)`; the
    key is `(id, capture_datetime)`.

  | System | EAL rows / days | Events rows / days | Device days |
  |---|---|---|---|
  | SME20598 | 4,438,373 / 133 (33k a day) | 2,518,411 / 141 | 2026-04-30 → 11-02 (gap 2026-08 → 09) |
  | SME18534 | 1,631,066 / 125 (13k a day) | 2,358,885 / 125 | 2026-04-30 → 10-30 |
  | SME18535 | 455,682 / 47 | 219,917 / 47 | 2026-04-30 → 10-30 (gap 2026-06 → 09) |

- **What the columns hold** (2026-10 partition, `out/20_column_profile.tsv`):
  - EAL: `data_type` is always `ERROR` and `log_number` always 0.
    `err_type` is `FATAL` on 98% of rows, including every routine gantry
    line, so it is not a severity. The content is in `info` (99.3% set).
    `err_number`, `file`, `line`, `param_1/2` and a non-zero `tm_stamp`
    are set only on the 0.8% of rows that carry a code (`WARN` / `NORMAL`
    / `ESTOP`).
  - Events: `type` is one of `INFO` (Gantry states), `EVENT_MINOR` /
    `EVENT_MAJOR` (GSE), `ERROR_WARNING` (mostly GLC trace), `ERROR_NORMAL`,
    `ERROR_FATAL` or `ERROR_BLOB`. `level` is 0 or 4. `time_stamp` is set
    on every row. `eal` is `Yes` on 77%; on the rest it holds the second
    half of the message (§3.2 I3).
  - `host_datetime` is never NULL; `status` is never true.
- **Existing consumers:**
  - 27,624 `alert.models` rows (14,322 enabled, 17 systems) on
    `err_number contains …`;
  - `alert.offline_hhm_conn`, upserted by the EAL parser only;
  - the `log.log_recent_files` view (`system_id`, `host_datetime`).
  - No Philips CT `scan_seconds`: the CT parsers don't write
    `public.logfile_event_history_metadata`.
  - `insight_writer` has no SELECT on the table.

### 1.5 Time

- **`host_datetime` is the device's local wall clock**, converted with
  `sites.time_zone_id` (`DataTime` without its `__NN` suffix, luxon).
  - Events `time_stamp` equals the local wall clock in seconds since
    0001-01-01 on 100% of rows. It is the same kind of value as GE's
    `epoch`.
  - EAL `tm_stamp` is a counter, set only on coded rows.
- **Site time zone is NULL** for SME20598, SME20602, SME20605 and
  SME20611. The parser then falls back to `America/New_York`, which
  happens to be right for those Florida sites.
- **Clocks are within about 1.5 minutes of the server**
  (`out/23_clock_vs_grab.txt`): newest row vs the grab that fetched it,
  October 2026.
  - SME18534 runs about 1.3 min ahead (at most 86 s).
  - SME18535 is at most 53 s ahead.
  - SME20598 is never ahead outside the DST hour.
  - The gantry logs `GantryDateTimeSyncReq` (3,947 rows), so it syncs its
    clock from the host.
- **Lag:** capture minus newest row, p50 about 20 min (collector at :00 /
  :30, parser at :18 / :48).
- **The DST fall-back hour is stored inconsistently** (2026-11-01,
  SME20598, `out/24_dst.txt`).
  - luxon resolves the repeated 01:xx hour with the offset at parse
    time, so the stored instant depends on when the parser ran.
  - 577 rows parsed before the change were stored as EDT; 3,122 rows
    parsed after it as EST.
  - The same wall-clock key appears twice on 1,254 EAL keys that day.
  - So days and keys must come from the wall clock, as in GE CT, not from
    `host_datetime`.

### 1.6 What the text supports (2026-05 →, 3 systems)

- **Inventory** (`PLAN-PHILIPS-CT-INSIGHTS-CODES.md`):
  - EAL: 3,765 templates; the top 178 cover 97% of rows.
  - Events: 250 templates; the top 57 cover 97%. These counts are biased
    by I1.
  - Error codes (`err_number`): 123 codes and 52,787 rows; the top 29
    cover 97%.
  - **98 of the 123 codes have a label in `kdb.philips_ct`** (Avante's
    Philips CT knowledge base, 1,354 entries with manufacturer and FSE
    notes). The two largest codes have no entry.
- **No field is encoded or obfuscated.** The Events `BLOB` column is
  binary and is never exported by the collector. Nothing is proposed for
  it.
- **Signals per area.** "Complete" means taken from EAL, which is
  ingested exactly. "Lossy" means taken from Events (I1, I2).

| Area | Signal | Notes |
|---|---|---|
| Shots (exposures) | EAL `Gen Shot<kV>x<mA><spot>` (once per shot), `GXray EXP=<ms>`, `XrayOn-to-XrayOn=<ms>`, `Call GrantShot` | complete; ~60k shots in 6 months. `EXP` matches the measured X-ray-on time (`SyncOn` → `End DmcIsrComm`) |
| Studies | Events `GSE … STUDY_STARTED was sent to GPC` / `STUDY_ENDED`, `GantryStartStudyBkst`; EAL `StudyReady IX:# ID:# CT:#` | Events lossy. `StudyReady` is complete but 2–3× `STUDY_STARTED` (85 vs 35 in one 20 h window): meaning to confirm |
| Series | Events `Series # Complete`, `Series # Ready` | lossy |
| Tube | Events `received tube heat data: prct_heat= #` (before each shot), `Tube Heat is #`; EAL `Gen Idle: Gen=0x6D Tube=13 Gan=BRILL`, `Orion Tube Type: 13`; `Postheat Timeout, sent FILAMENT_OFF_ANS`; `Rotor stopped and MDC closed` | no cumulative counter and no serial: `Tube=` is the tube type, constant all period |
| Power-up / shutdown | EAL `Ctrl Powered Up. Serial Connection OK.` (220 rows, 160 sys-days), `gpcStartup: #`; Events `CStateShutdown`, `Save NVRAM Log … PowerOnReset` | which one is a gantry boot: to confirm |
| E-stop | EAL `HSS-ESTOP state`, `ESTOPcausedHVGfault`, code `S_LIFESYNCMGRTASK_LIFESYNC_FAIL` (ESTOP); Events `GantryEstopOpenedBkst` | |
| Errors | EAL codes (WARN 51,757 rows, NORMAL 1,006, ESTOP 19); Events `ERROR_*` | e.g. slip ring / RCOM communication, couch limits and vertical HW fault, generator monitor, main drive contactor, I2C heater comm |
| Environment / cooling | EAL `PumpOn T#=#`, `HC# # #.# C`, `Temp fil #.#`, `FlowSwitch #`, `HSS oilflow delay`, `DC rail #V` | numbers extractable; meaning to confirm |
| Inventory | Events `GLC Version:: GANTRY_5.3.23.1696`; EAL `EE Version`, `GenVersion`, `DMC System Version` | software per system (5.3.17.4922 / 5.3.23.1696) |
| Warm-up | Events `GSE sending TubeWarmupNeededBkst`, `No TubeWarmupNeeded` | 118 / 20 rows, lossy |

**Not in this log:**
- patients (no patient field, and none is wanted);
- operator aborts (no abort wording; at best a proxy, see §2);
- DICOM transfer;
- air calibration;
- humidity;
- host process restarts (this is the gantry controller's log, not the
  host's).

**Problems already visible** (data ends 2026-11-02; for field service,
not judged here):

| System | Signal |
|---|---|
| SME18534 | `S_DMC_I2C_COMM2HEATERNOT_OK` 12,594 rows; `S_DMC_DPU_RCOM_COMMUNICATION` 3,656 rows on 112 days; `S_DMC_RCOM_COMMUNICATION` 3,415 |
| SME20598 | `S_FDOM_PROFILE_FRAME_ISR_TBL_END_DEFAULT_MA_USED` 14,645 rows on 132 days; `S_MPS_WAITING_FOR_MAIN_DRIVE_TO_CLOSE` 1,894 on ~23 days; `S_MP_POSLOOP_MAX_MIN_ACCEL_ERROR` 1,264 on 5 days |

---

## 2. The GE CT catalog mapped to Philips CT

GE CT catalog: `hhm_rpp_ge/PLAN-CT-INSIGHTS.md` §4 (metrics) and §5 / §14
(findings). Ratings:
- **S** = supported from complete (EAL) data;
- **P** = partial (lossy source until PCT-1b, or meaning to be confirmed
  by field service);
- **N** = not possible from this log.

| GE metric / finding | Philips CT | From |
|---|---|---|
| `tube.mas_total` (cumulative counter) | **N** | no counter in the log |
| per-shot mA·s, mA·s/day | **P** | EAL `Gen Shot<kV>x<mA>` × `GXray EXP=<ms>` / 1000. Meaning to confirm; only a sum over collected shots, not lifetime |
| `tube.replacement`, `tube_replaced` | **N** | no serial, no counter; `Tube=` is the type |
| `tube.identity` | **S** (type only) | `Gen Idle: … Tube=#`, `Orion Tube Type: #` |
| `exam.start`, exams/day | **P** | Events `STUDY_STARTED` (lossy; history undercounted for good). It brackets studies exactly on complete data; EAL `StudyReady` is per series, not per study (§7.3) |
| `exam.series`, images/exam | **P** / **N** | Events `Series # Complete` (lossy); no image counts |
| scans / shots per day, kV and mA mix, focal spot | **S** | EAL `Gen Shot…`, `GXray EXP=` (new vs GE) |
| busy-hour profile | **S** | shots by device-local hour |
| `scan.abort.operator` / `.system`, `abort_rate_high` | **P** after PCT-C + PCT-1b | Events `Series # cancelled, due to GANTRY_CANCEL_SOURCE_<CTBOX\|HOST\|NORMAL_ERROR>` (§7.4). Comma lines, so never ingested today |
| `scan.safe_state`, `safe_state_recurrent` | **S** as E-stop | `HSS Off!ESTOPdetect`, `GantryEstopOpenedBkst`, ESTOP-type codes; not the start-up lines (§7.2) |
| `error.ermes` | **S** | EAL `err_number` (123 codes) with `kdb.philips_ct` labels |
| `system.boot`, boots/week | **P** | EAL `Ctrl Powered Up…`: one per gantry power-up (§7.2), to confirm |
| `system.shutdown` | **P** | Events `CStateShutdown` (lossy), EAL `Gen ShutdownWait` |
| `process.restart`, `process_restart_loop` | **N** | gantry log, no host processes |
| `service.mode` | **P** | `GantryAppDiagModeAns` (diag mode), to confirm |
| `prep.*` (warm-up, fast cal, air cal), `prep_noncompliance` | **P** | warm-up needed / not needed (lossy); a morning kV × spot sweep of shots outside studies (§7.5), to confirm |
| `service.calibration` | **N** | |
| `inventory.product` | **S** | gantry software version; model from `public.systems` |
| rotor (`tube.rotor_*`, `tube_rotor_instability`) | **P** | `Rotor stopped and MDC closed`, `S_ROTOR_STOP_ANODE_NO_MORE_SPINNING`, `ANODE BY PASS` |
| `env.*`, `env_out_of_tolerance` | **P** | pump / oil / heat-exchanger temperatures, flow switch, DC rail |
| `das.link_errors` | **S** | `S_DMC_SLIP_RING`, `S_DMC_RCOM_COMMUNICATION`, `S_DMC_DPU_RCOM_COMMUNICATION` |
| `xfer.dicom_send`, `env.humidity`, `ui.start_scan_button` | **N** | |
| downtime | **N** in v1 | idle time can't be told apart from collection gaps and buffer resets (§3.3) |
| `tube_usage_spike` | **P** | from per-shot mA·s, once confirmed |
| error storm (CV, MRI) | **S** | coded EAL rows per day vs own baseline |
| **New in Philips** | **S** / **P** | tube heat % before each shot (P, lossy); generator kV/mA/spot mix (S); couch limits and couch vertical HW fault (S); gantry state timings, e.g. series prep → ready (P); clock-sync events (S) |

---

## 3. Ingest integrity (investigated 2026-11-20, read-only)

### 3.1 What is right

- **EAL is exact.** Checked on SME20598's last `Logger.mdb` window
  (2026-11-01 14:49 → 11-02 10:26 local):
  - all 21,570 keys are present in the DB, none twice
    (`out/08_db_vs_mdb_sme20598.txt`);
  - rebuilding each `EALInfo.output` line from the parsed DB columns
    gives all 21,570 lines back (`out/31_rebuild_eal.txt`). The only
    differences: the parser trims the padding inside `Info` (by design),
    and the DB stores NULL for both `""` and an empty field.
- **A natural key exists.** `DataTime` / `DTime` (`yyyy/MM/dd
  HH:mm:ss.SSS`, with a `__NN` suffix when several rows share a
  millisecond) is unique within each table of each `Logger.mdb` (all 5
  snapshots). In the DB that is `(system_id, kind, host_date,
  host_time)`, where kind = EAL or Events.
- **Duplicates are rare** (`out/09_dups_history.tsv`, 2026-05 →):
  - SME20598: 6,280 exact extra EAL rows and 3,348 Events rows
    (0.14%);
  - SME18534: 105 Events rows; SME18535: 2.
  - 87 keys repeat with different content: the DST hour (§1.5) and
    buffer resets. Dedupe on key plus content, as GE did.
  - Ten captures re-read data already stored. A probable cause: the parser
    read an output file while the collector was rewriting it in place (no
    temp file and `mv`). Not verified, because no snapshot survives.
- **Redis** (`GET` only, `out/11_redis_offsets.tsv`): every offset
  equals the current file size, so nothing is pending.

### 3.2 What is wrong

| # | Where | Defect | Size |
|---|---|---|---|
| **I1** | parser (`ct_events_v2`) | `host_time` must end in `\.\d{3}"`, so every Events row whose `DataTime` has a `__NN` suffix is never ingested | **14,603 of 27,824 Events rows (52%)** in the SME20598 window; 0 suffixed Events rows exist in the DB. All Events history is affected, and the files are gone, so the loss is permanent |
| **I2** | collector | `awk -v FS=","` reorders the Events CSV, so a `Msg` containing a comma shifts the columns and the `sed` filter drops the row. A `Msg` with a line break (5% of non-relay rows, §7.4) is also lost. `tr -cd` also deletes characters (`( ) % # * …`) from the rest | 4–7% of Events rows dropped (1,420 of 27,824 on SME20598; 1,122 of them have a comma); 5–9% of messages altered |
| **I3** | parser (`ct_events_v2`) | `Msg` is split at its first space: `message` gets the first word, `eal` the rest; the real `EAL` flag survives only when it is `Yes` | 23% of Events rows have message text in `eal`. Can be rebuilt as `message ‖ ' ' ‖ eal` |
| **I4** | design | the reset loss (§3.3) | about 1–2% of EAL rows (estimate) |
| **I5** | parser | the byte-offset tail assumes an append-only file. The collector rewrites a sorted full export every time; `Events.output` is sorted by its `MM/dd/yy HH:mm:ss` text, then `Type` (810 out-of-order lines in one snapshot), and that order breaks at year end. It works today only because a growing buffer exports append-like | latent; tail boundaries can split or skip a line |
| **I6** | parser | `\s` in `ct_events_v2` can match a newline, so a few rows merge with the next line (templates such as `…"   #/#/# #:#:#`) | small |
| **I7** | parser | the 17 configured systems with no file throw an ERROR on every run (`getLastModifiedTime` on a missing file) | 56 log entries per run, noise |
| **I8** | data | 4 Intelas sites have no `sites.time_zone_id` (default `America/New_York` is right for them) | none today |

The EAL parser is not affected by I1–I3: its regex allows the suffix and
its fields are comma-safe for every row seen.

### 3.3 How the file "rotates": the buffer resets, and the tail is lost

- **Seen on SME20598, capture 2026-11-01 20:18 UTC**
  (`out/12_negative_delta.tsv`):
  - the parser logged `Delta is negative value: -2321013. Reading entire
    file.`;
  - the new export starts at 14:49:50 local, mid-scan;
  - the previous capture ended at 14:28:00 local.
- **What is lost:** the rows the old buffer received between the last
  grab and the reset are never collected.
- **Resets since 2026-05, with the gap they leave** (estimates;
  `out/16_reset_gaps.tsv`):

  | System | Resets | Median gap | p90 | Estimated EAL rows lost |
  |---|---|---|---|---|
  | SME20598 | 188 | 16 min | 28 min | ~81k (1.8%) |
  | SME18534 | 82 | 12 min | 29 min | ~26k (1.6%) |
  | SME18535 | 20 | 20 min | 42 min | ~5k (1.1%) |

  The estimate is the gap (capped at 30 min) × the system's rate in the
  2 h before.
- **Only 1 reset overlapped old content**, so a reset is a new, empty
  database, not a pruned one. It is not like GE gesys's carried-over
  tail.
- **The fix is in collection, not the parser:** check whether the
  scanner keeps the old database when it resets (a question for PCT-C).

### 3.4 Does a 1b-style fix come first? Yes, and collection before that

- I1 halves every Events-based metric. Studies, series and tube heat are
  Events-based (§2).
- PCT-1b (parser, this repo), in short:
  1. accept the `__NN` suffix;
  2. keep `Msg` whole and the `EAL` flag separate;
  3. parse the whole file each time it changes and drop already-stored
     keys before insert (GE's `drop_already_ingested` pattern), instead of
     the byte-offset tail;
  4. skip missing files quietly.

  It can be built and tested now against the 5 `Logger.mdb` snapshots,
  with no deploy until after the cutover close-out.
- PCT-C (collector, other repo) fixes I2 and the in-place write, and is
  where I4 can be closed, if at all.
- **Not proposed:** cleaning the existing rows. The rare duplicates are
  deduped by the insight layer on the key. Lost Events rows can't be
  recovered.

---

## 4. Design options

### 4.1 The pipeline (same method as GE)

- **The architecture is unchanged:**
  - facts (extract) → daily derive → findings (rules replayed with
    `state.js`) → `api.*` views → viewer;
  - a stage at the end of `npm run philips_ct`, so no new cron line;
  - its own kill switch (`INSIGHT_PHILIPS_CT_ENABLED`, off by default),
    an advisory lock, an id watermark, 50k batches, a stage deadline, and
    skip-not-fail.
- **Facts: `insight.philips_ct_facts`,** one row per (log row × metric).
  - Key: `(system_id, kind, data_time, metric_key)`. `data_time` is the
    raw `DataTime` with its suffix; kind is EAL or Events.
  - Exact copies are deduped on key plus content.
  - The device day comes from `host_date` (wall clock).
  - The EAL↔Events twin (§1.4) is joined on `data_time`, so no event is
    counted twice.
- **Classification** is a reviewed mapping of templates and codes (CV and
  MRI style), with `kdb.philips_ct` as the label source where it has an
  entry. Every template above the cut maps to a rule or a reviewed ignore
  list.
- **Prefixes** (shared tables): metrics `pct.*`, findings `pct_*`
  (matches `^[a-z][a-z0-9_]*$`), `findings.source = 'philips_ct'`. Jobs
  `philips_ct_extract`, `philips_ct_derive`, `philips_ct_findings`. Views
  `api.philips_ct_*`.
- **Viewer:** "Philips CT Insights — Internal" in
  `sme_reports/philips_ct/`, on the shared `insights/` core, as CT and CV.

### 4.2 Where the code lives (Q7)

What constrains it:
- **One migration history.** `insight.schema_migrations` (001–009) and
  its runner live in `hhm_rpp_ge`. The runner refuses non-contiguous
  versions and takes the advisory lock `insight_schema_migrations`. A
  second runner on the same table would fight over version numbers.
- **The runner's scope.** Its scanner (`migrations/lib/sqlscan.js`) and
  catalog check (`lib/catalog.js`) allow writes only to `insight.*` and
  `api.ge_c[tv]_*`. `api.philips_ct_*` needs a change there.
- **The ingest runs here.** The Philips CT run is in this repo's
  `index.js`, and the stage has to run at its end.
- **Shared helpers.** `insight/db.js` (the `insight_writer` pool) and
  `insight/stage_wrapper.js` are in `hhm_rpp_ge`.
- **Credentials.** This repo's prod `.env` was made without the
  `INSIGHT_*` lines (README, cutover step 1).

| Option | What | For | Against |
|---|---|---|---|
| **A. All here** | runner, migrations and runtime in `hhm_rpp_philips` | one repo per vendor | a second runner on the same `insight` schema: version collisions, or a second version table and two scanners guarding one schema; copies the whole runner |
| **B. All in `hhm_rpp_ge`** | the Philips insight code lives with GE's | one `insight` codebase | the stage must run in the Philips process: either a new cron line (against the rule) or `hhm_rpp_philips` requiring files from another checkout at run time |
| **C. Split (AGREED, Q7)** | schema in `hhm_rpp_ge`: migration 010 (`philips_ct` tables and `api.philips_ct_*` views) through the one runner, the scanner allowlist for `api.philips_ct_*`, and the C1-Philips verifier change. Runtime in `hhm_rpp_philips/insight/philips_ct/` (rules, extract, derive, findings, stage), with vendored, byte-identical copies of `db.js` and `stage_wrapper.js`, pinned by a checksum test | one schema history and one guarded runner; the stage runs where the ingest runs; no cross-checkout `require` | two repos to keep in step: the runtime checks `schema_migrations ≥ 10` before it runs, and the vendored helpers can drift (the checksum test catches it) |

**C1-Philips (in `hhm_rpp_ge`, before any Philips row is written):**
- GE CT's three verifiers count shared catalog rows by exclusion, so any
  `pct.` / `pct_` row makes them fail:
  - `insight/verify_facts.js` and `insight/derive/verify.js`:
    `metric_key NOT LIKE 'cv.%' AND NOT LIKE 'mri.%'`;
  - `insight/findings/verify.js`: `left(finding_key,3) <> 'cv_' AND
    left(…,4) <> 'mri_'`.
- AGREED (Q11): switch them to positive selection, from the CT rule
  registry's own keys.
- The CV and MRI stages also fingerprint the non-own part of
  `finding_catalog` within a run. A Philips catalog write can only trip
  them if it lands during one of their runs, so catalog rows go in by
  migration only.
- **Grant:** `SELECT` on `log.philips_ct_eal_events` for
  `insight_writer`. You run it, as for GE.

---

## 5. Questions — AGREED 2026-11-20

You accepted every recommendation below as written on 2026-11-20. Each
answer is marked **AGREED**; the reasoning is kept as it was.

1. **Build the insight pipeline now, or collection first? AGREED:
   collection first, then the parser fix; no insight build until data
   flows again.**
   - 0 systems are current, and the Events ingest loses about half its
     rows.
   - Unlike GE CV, which went ahead on 2 live systems, nothing would run
     here.
   - Until then, only read-only work: the mapping drafts (PCT-2a) can use
     the 6 months of history.
2. **Open a separate collector session (PCT-C) in
   `hhm_data_acquisition`? AGREED: yes, in this order:**
   1. Restore reachability for the 9 collected systems. All of them time
      out at TCP connect, so this is network or site work (Intelas: Holmes
      Regional, Palm Bay, Memorial ×3; Providence Medford). Someone with
      VPN and site access has to look, not code.
   2. Fix the Events export:
      - no `awk` column reorder on commas;
      - no `tr` stripping;
      - a real CSV export;
      - written to a temp name and then `mv`d into place.

      The parser change (PCT-1b) must ship in step with it.
   3. Check whether the scanner keeps the old `Logger.mdb` at a reset
      (list `D:\Data_Logger\`). If it does, collect it to close I4.
3. **When does the cutover count as closed for parser changes?
   AGREED: 5 clean days after the last job moved, so 2026-11-24
   18:53 UTC.** CT has had no data across the whole cutover, so a CT
   parser change carries little data risk. But the rule is "no parser
   change while the cutover is in progress", and this keeps it simple.
4. **The parser fix (PCT-1b): what it changes. AGREED: all four §3.4
   items in one change.**
   1. The suffix regex (I1).
   2. `Msg` whole in `message`, the flag in `eal` (`Yes` or NULL) (I3).
      This changes what new Events rows hold in `log.*`. The only readers
      are `alert.models`, which use EAL `err_number`, and a view that
      reads `system_id` / `host_datetime`.
   3. Whole-file parse with key-based dedupe instead of the byte tail
      (I5, and the I6 merged lines).
   4. Quiet skip for missing files (I7).

   Evidence: the 5 `Logger.mdb` snapshots must ingest exactly (DB rows =
   MDB rows, both tables), plus a `DRY_RUN` rehearsal, then deploy. Not
   chosen: only the regex. That leaves the sort-order and year-end tail
   bugs, and the collector change in Q2 makes them worse.
5. **History. AGREED: the insight layer uses EAL history from 2026-05
   (3 systems), and Events data only from the PCT-1b deploy onward.**
   - EAL history is exact apart from the reset gaps (about 1–2%).
   - Events history is permanently about half missing, so counts from it
     would be wrong without anyone noticing.
   - No backfill from `archive_log`.
6. **Natural key. AGREED: `(system_id, kind, data_time)`, deduped on
   key plus content** (DST and reset collisions keep both rows), as GE.
7. **Where the code lives. AGREED: option C (§4.2).** Schema,
   scanner allowlist and C1-Philips in `hhm_rpp_ge` after the MRI
   close-out; runtime in `hhm_rpp_philips/insight/philips_ct/`.
8. **Time. AGREED: device wall clock (`host_date`, or `time_stamp`
   for Events) for days and keys, not `host_datetime`** (§1.5, DST). List
   the 4 NULL site time zones for whoever owns `public.sites`; don't fix
   them in code.
9. **Classification. AGREED: a reviewed template-and-code mapping
   with `kdb.philips_ct` labels, cut at ~97% of rows** (178 EAL + 57
   Events templates, 29 codes). The long tail is counted in one
   `pct.error` / `pct.event` metric with its raw template or code.
10. **Metric scope v1. AGREED:**
    - **v1:** the **S** rows of §2: shots, kV/mA/spot mix, busy hours, error
      codes, E-stops, slip-ring / RCOM communication, couch faults,
      software inventory, tube type.
    - **Behind field-service confirmation:** the **P** rows: studies,
      per-shot mA·s, boots, temperatures, rotor, warm-up.
    - **Not attempted:** the **N** rows (aborts, tube replacement,
      downtime, patients).
11. **Shared tables and prefixes. AGREED: `pct.` / `pct_` /
    `philips_ct`, and C1-Philips with positive selection, shipped and
    rehearsed in `hhm_rpp_ge` before migration 010 is applied.**
12. **Field service (non-blocking; collected for Phase 7, as for GE).
    AGREED: these go to field service.** They aren't your calls:
    - does `Gen Shot<kV>x<mA>` × `GXray EXP` give mA·s per shot?
    - is a study `STUDY_STARTED` or `StudyReady`?
    - which line marks a gantry boot?
    - what do `PumpOn T#=#`, `HC# # #.# C` and `Temp fil` measure?
    - what do the `Gen Shot` mode letters `O` / `-` / `Z` / `D` mean? (§7.1)
    - is `HSS Off!ESTOPdetect` / `GantryEstopOpenedBkst` the E-stop
      button, or also a normal power-off? (§7.2)
    - what are `INVERTER FAULT CK#`, `Close Hor Timeout` and
      `ANODE BY PASS`? (§7.6)
    - what does the daily calibration / warm-up look like in the log?
      (§7.5)
    - are the SME18534 heater-I2C / RCOM codes and the SME20598 FDOM /
      main-drive codes known problems?

---

## 6. Phases (exit criteria in the CV style; each phase planned in detail when it starts)

| Phase | Content | Exit | Earliest |
|---|---|---|---|
| **PCT-0 Decide** | this plan; §5 answered | your answers recorded as AGREED | **done 2026-11-20** |
| **PCT-C Collection** (separate session, `hhm_data_acquisition`) | Q2: reachability for the 9 systems; Events export without loss; atomic write; the reset question | at least 1 system grabbed on 5 consecutive clean days; on a fresh `Logger.mdb`, output rows = MDB rows for both tables; outputs written atomically; comma and multi-line `Msg` lines arrive (Q17); review closed | network work now; code after your go-ahead |
| **PCT-1b Ingest integrity** (this repo) | Q4: suffix, `Msg` / flag, whole-file + key dedupe, quiet missing files; tests on masked fixtures from the 5 snapshots (Q18) | DB = MDB on every snapshot, including suffixed, comma and multi-line Events lines (Q17) and on a live capture (keys and content, both tables); 0 duplicates across a reset; `DRY_RUN` rehearsal; Codex review; deployed by you; 5 clean days | build after 2026-11-24 18:53 UTC (Q3); deploy with or after PCT-C's export change |
| **PCT-2a Mapping** | `PLAN-PHILIPS-CT-INSIGHTS-CODES.md` grows into the reviewed mapping (rules, ignore list, `kdb` labels) | mapping agreed (§7.7 Q13–Q18) | **done: AGREED 2026-11-20** |
| **PCT-1 Schema** (`hhm_rpp_ge`) | C1-Philips; scanner and catalog allowlist for `api.philips_ct_*`; migration 010; the writer grant | tests; local rehearsal; Codex review; you apply | after the MRI close-out (2026-11-23), and only once PCT-C shows data |
| **PCT-2 Extract** | `insight/philips_ct/` rules + extract + backfill (EAL from 2026-05, Q5) | dry run = independent SQL per system × metric; review closed | after PCT-1 and PCT-1b |
| **PCT-3 Derive** | daily (wall-clock days), capabilities, shots / studies, inventory | verifiers pass; review closed | after PCT-2 |
| **PCT-4 Findings** | replay the history, propose rules with evidence, agree, build | replay drift 0; stored = recomputed; review closed | after PCT-3 |
| **PCT-5 Stage** | `run_philips_ct_insight` after `PHILIPS_CT`, `INSIGHT_PHILIPS_CT_ENABLED`, the hook in this repo's `index.js`, `INSIGHT_*` in the prod `.env` | 5 clean days; ingest unchanged with the switch off and on; replay = incremental | after PCT-4 |
| **PCT-6 Viewer** | "Philips CT Insights — Internal" | as CT §16.4 | after PCT-5 |

**Checkpoints for your go-ahead:**
- ~~the §5 answers~~ (AGREED 2026-11-20);
- before any collector change;
- before the parser change;
- before each migration;
- before each deploy;
- before every commit or push, in any repo.

**Ground rules carried over** (GE CT §9–§10, unchanged):
- prod DB read-only for ad-hoc work;
- writes only as `insight_writer`;
- `scan_seconds` untouched;
- no `.env` reads;
- no credentials, hosts or IPs in evidence or fixtures;
- `hhm_rpp_ge` and `/home/prod/*` untouched until you say so.

---

## 7. PCT-2a: the mapping (2026-11-20, read-only) — AGREED 2026-11-20

**Deliverable:** `PLAN-PHILIPS-CT-INSIGHTS-CODES.md`, regenerated. It replaces
the Phase 0 inventory with the proposed mapping: v1 metrics, watch list,
all codes, every rule, totals, the tail, and the templates above the 97%
cut with their rule. The draft classifier is
`~/philips_ct_evidence/pct2a/mapping.js` (44 EAL rules, 46 Events rules,
123 codes). It becomes `insight/philips_ct/rules.js` once agreed.
Evidence and generator: `~/philips_ct_evidence/pct2a/` (README).

**Inputs:**
- **DB:** 2026-05 → 2026-11-02, 3 systems, deduped on key plus content
  (Q6): 6,466,092 uncoded EAL rows, 52,747 coded rows, 1,182,407 Events
  rows, and 3,911,351 relay rows (ignored).
- **MDB:** every row of the 5 `Logger.mdb` snapshots. This is the only
  complete Events data, with `Msg` whole as PCT-1b will store it.

**Checks:**
- Raw text and masked template classify identically: 0 differences on
  116,493 raw DB rows (1% sample) and 179,478 MDB rows.
- Rules cover 99.97% of uncoded EAL rows and 99.99% of Events rows.
- All 123 codes are reviewed, and every rule fires.

### 7.1 Shots (v1: `pct.shot`, `pct.xray_ms`)

- **One regex parses every shot line.** There are 59,729 deduped
  `Gen Shot<kV>x<mA><spot><mode>*` lines.
  - kV: 120 (66.5%), 80 (14.1%), 100 (12.1%), 140 (7.3%).
  - Spot: L 85.5%, S 14.5%.
  - Mode letter: `O` 85.7%, `-` 11.6%, `Z` 2.7%, `D` 2 rows. The
    letter's meaning is a field-service question.
- **Exposure times pair with shots.** 59,619 shots (99.8%) are followed
  within 2 shot lines and 120 s by `GXray EXP=<ms>`, a median 0.7–3.9 s
  later. The line is logged when the exposure ends. 74 `EXP` lines have
  no shot.
- **mA·s is a candidate, not v1.** mA × `EXP` / 1000 sums to 32.4 M over
  6 months (SME20598 22.8 M, SME18534 7.5 M, SME18535 2.1 M). Whether that
  is the tube's mA·s is a field-service question (Q12).
- **Busy hours** come from `pct.shot` by device hour. 17.3% of all shots
  fall in hour 07, much of it a morning calibration sweep (§7.5).

### 7.2 E-stop and power-up

- **Most "E-stop" lines are start-up.** `HSS-ESTOP state`,
  `ESTOPcausedHVGfault`, `OkRhostEstopStatus` and Events
  `GantryEstopClosedBkst` come about 1 minute before
  `Ctrl Powered Up. Serial Connection OK.`
  - 188 of 223 `HSS-ESTOP state` episodes fall within 10 minutes before a
    power-up.
  - The median gap since the last shot is 15 hours.
  - They are the power-up sequence, not E-stop presses. They emit nothing.
- **E-stop opened** shows up in two lines:
  - EAL `HSS Off!ESTOPdetect`: 44 episodes on 31 system-days.
  - Events `GantryEstopOpenedBkst… in <state>`: 56 episodes.

  Both come a median 16–18 minutes after the last shot. A power-up follows
  a median 2–7 minutes later, and no shot ever happens between an E-stop
  and the next power-up. 30 episodes appear in both lines. Events is lossy
  (I1), so EAL history alone undercounts.
- **ESTOP-type codes** (19 rows, 5 codes, e.g.
  `S_LIFESYNCMGRTASK_LIFESYNC_FAIL`) are system-initiated stops.
- **Proposal: `pct.estop` is the union of all three**, merged into
  10-minute episodes in derive.
  - Dims: `loop_open`, `opened:<state>`, `system:<code>`.
  - History before PCT-1b uses EAL and codes only, labelled a lower bound.
- **Power-up:** `Ctrl Powered Up…` has 220 rows (207 episodes, 160
  system-days). 202 of the 207 `GantryEstopClosedBkst` episodes fall
  within 10 minutes before one. It goes on the watch list as `pct.power_up`; until then
  it counts as `pct.event` (dim `powered_up`).

### 7.3 Studies

- **On complete MDB data:**
  - `STUDY_STARTED` equals `GantryStartStudyBkst` one for one (109 of
    109).
  - Every study is closed by `STUDY_ENDED`.
  - 583 of 705 shots fall inside a study. Most of the rest are SME17372's
    morning sweep (§7.5).
- **`StudyReady … ID:n` is not a study.** The ID goes up per series, about
  2–3 per study (85 for 35 studies on SME20598), so EAL can't count
  studies.
- **So `pct.study` comes from Events only, from PCT-1b on** (Q5 holds).

### 7.4 Events lines the DB has never seen

- **Three causes keep Events lines out of the DB** (on the MDB data):
  - the `__NN` suffix (I1);
  - a comma (I2);
  - **a line break inside `Msg`**: 1,274 of 24,950 non-relay Events rows
    (5.1%). The collector works line by line.

  A line can be lost to more than one cause. The line break is part of
  I2's "other" drops and of I6.
- **Signals that exist only there:**
  - `Series # cancelled, due to GANTRY_CANCEL_SOURCE_<CTBOX|HOST|NORMAL_ERROR>, in state …`:
    43 in the 5 snapshots (CTBOX 37, HOST 5, NORMAL_ERROR 1). This is the
    operator-versus-system abort split GE has, so §2's "aborts: N" becomes
    **P after PCT-C and PCT-1b**.
  - `GantryShotEndAns status != ok`: 53.
  - `STUDY_ON` / `STUDY_OFF`: 231.
  - `Host restarted`: 5.
- **What it means for PCT-C and PCT-1b:**
  - PCT-C's export has to keep commas and line breaks. Q2's "real CSV
    export" covers that.
  - PCT-1b has to parse quoted multi-line fields.
  - The classifier already flattens line breaks before matching.

### 7.5 Morning calibration sweep

- **On SME17372's snapshot**, 116 shots fall outside any study, between
  06:42 and 07:00, spread evenly over kV × spot (17 each). That looks like
  the daily calibration or warm-up, GE's `prep.*`.
- **In EAL history**, the day's first 20-minute burst covers at least 6
  kV × spot combinations on:
  - SME18534: 69 of 124 days, about 95 shots, around 07:00;
  - SME18535: 10 of 47 days;
  - SME20598: 3 of 132 days. It scans round the clock, so "first burst"
    doesn't find the sweep there.
- **Proposal: watch list (`pct.daily_cal`)**, defined once field service
  says what the sweep looks like. Shot counts and busy hours should then
  exclude it.

### 7.6 Codes and templates

- **The 123 codes by category:**

  | Category | Codes | Rows |
  |---|---|---|
  | hardware | 75 | 26,661 |
  | reliability | 24 | 19,709 |
  | noise | 20 | 6,020 |
  | service | 4 | 357 |

  Named metrics among them: `pct.slipring_comm` (4 codes, 7,510 rows) and
  `pct.couch_fault` (21 codes, 711 rows).
- **Calls for you to check:**
  - `S_DMC_I2C_COMM2HEATERNOT_OK` (12,695 rows, mostly SME18534) is
    hardware in `pct.error`, not slip-ring communication.
  - The two FDOM "default mA used" codes (15,690 rows) are reliability:
    dose modulation falling back.
  - Couch limits, tape switch, jogging and "series delay" are noise.
  - The numeric codes `2` and `33816580` are unknown; they're filed under
    reliability.
- **Uncoded EAL rows:** 79% trace, 16% telemetry, 1.3% noise. The signals
  are shots, inventory, E-stop, power-up, and a few rare fault lines that
  go to `pct.event`:
  - `INVERTER FAULT CK#`: 138 rows on 3 systems;
  - `Close Hor Timeout`: 84;
  - generator and starter fault lines (`Gen Fault`, `HSSFlt`,
    `XRAYOnCheckFailed`, …): 18.
- **Events rows (non-relay):** 69% trace, 14% noise (voice prompts), 10%
  utilization (series, studies), 5% telemetry (tube heat %).
- **The tail** is 264 EAL templates (2,015 rows, 0.03%). It counts as
  `pct.event` with dim `tail:<template>` (Q9).

### 7.7 Questions — AGREED 2026-11-20

You accepted every recommendation below as written on 2026-11-20. Each
answer is marked **AGREED**; the reasoning is kept as it was.

13. **The v1 metric set and dims (codes doc §1). AGREED: as
    drafted.**
    - `pct.shot` (dim `<kV>/<spot>/<mode>`);
    - `pct.xray_ms`;
    - `pct.error` (dim = code);
    - `pct.estop`;
    - `pct.slipring_comm`;
    - `pct.couch_fault`;
    - `pct.inventory` (dim `<key>=<value>`);
    - `pct.event`.
14. **E-stop. AGREED: the §7.2 definition.** The union of loop-open,
    opened and ESTOP-type codes, merged into 10-minute episodes. Start-up
    lines are excluded, and history before PCT-1b is labelled a lower
    bound.
15. **Code categories (codes doc §3). AGREED, including
    the §7.6 calls.** A later field-service change is a versioned rules
    change, as on GE.
16. **What emits `pct.event`. AGREED:** reliability, hardware and
    service rules without a named metric, plus the tail. Telemetry, trace
    and noise emit nothing in v1 (viewer only).
17. **New watch-list items. AGREED: add them, and make "these lines
    arrive" part of the PCT-C and PCT-1b exit criteria.**
    - `pct.series_cancel` (operator / system), `pct.shot_not_ok` and
      `pct.daily_cal` join the watch list.
    - `pct.series_cancel` is a v1.1 candidate after 30 days of data.
18. **PCT-1b fixtures. AGREED:** build them from the 5 snapshots'
    rows (suffixed, comma and multi-line lines included), masked as the
    rules require. Keep them in the evidence folder; commit only the
    masked fixtures.
