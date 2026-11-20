# Philips CT Insights — plan

**Current state (2026-11-20; read this first):**
- **PCT-0 (decide): done. All 12 §5 recommendations AGREED on
  2026-11-20**, as written (§5). The evidence below is read-only and was
  gathered against prod on 2026-11-20. Nothing was written to the DB,
  Redis or the files by this plan's work. `hhm_rpp_ge` was only read.
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
  - the collector session (PCT-C, §8): the export fix passed 5 Codex
    rounds, was promoted, and has been deployed to prod since 2026-11-20
    19:26 UTC. The legacy `.output` files are unchanged, with complete
    `.csv` files next to them. Reachability is still down; that is network
    work (§8.1);
  - **the parser fix (PCT-1b, §9): plan AGREED 2026-11-20** (Q19–Q26,
    as recommended): the stateless transition rule O2s (0 duplicate
    Events rows and no never-stored row lost on the 5 copies), R2 text,
    then a `config.log` switch to `.csv` that you run after the code
    deploy. Build from 2026-11-24 18:53 UTC;
  - the mapping (PCT-2a): **AGREED 2026-11-20** (§7.7 Q13–Q18, as
    drafted). It becomes `insight/philips_ct/rules.js` in PCT-2;
  - the parser fix (PCT-1b) is built after 2026-11-24 18:53 UTC (Q3) and
    deployed with or after PCT-C's export change (Q4, now deployed). Its
    close-out needs one live capture, so it waits on reachability;
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
| **PCT-1b Ingest integrity** (this repo; planned in §9) | Q4: suffix, `Msg` / flag, whole-file + key dedupe, quiet missing files; tests on masked fixtures from the 5 snapshots (Q18) | DB = MDB on every snapshot, including suffixed, comma and multi-line Events lines (Q17) and on a live capture (keys and content, both tables); 0 duplicates across a reset; `DRY_RUN` rehearsal; Codex review; deployed by you; 5 clean days | build after 2026-11-24 18:53 UTC (Q3); deploy with or after PCT-C's export change |
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

---

## 8. PCT-C: collector session (started 2026-11-20)

**Status:** the export fix is written and tested in `hhm_data_acquisition` on `DEV`, uncommitted,
and waiting for the Codex review. Reachability is still down. Evidence:
`~/philips_ct_evidence/pctc/` (README).

### 8.1 Reachability (Q2 step 1): not code, needs someone with network and site access

- **Still down.** All 9 collected systems time out at TCP connect on port 22, on every 15-minute
  run, as recently as 2026-11-20 15:42 UTC (`pctc/out/02_outcomes_3d.tsv`). Other vendors' systems
  on the same runs connect.
- **The 9 systems:** SME18530, SME18534, SME18535, SME18976, SME18980, SME20598, SME20602,
  SME20605, SME20611. Sites per §5 Q2: Intelas (Holmes Regional, Palm Bay, Memorial ×3) and
  Providence Medford.
- **Ticket text:** "Since about 2026-11-02 the Avante collector cannot open SSH (TCP 22) to the 9
  Philips CT consoles listed above; connections time out. Please check the site VPN tunnels and
  firewall rules for the CT host addresses on file, and whether the consoles' SSH service still
  runs."
- **Narrowed on 2026-11-20** (`pctc/out/10_site_peers.tsv`, `11_site_peers_detail.tsv`; booleans
  and counts only):
  - all 9 CTs use the same VPN entry;
  - at site C000450, a **GE CT on that same VPN connects on every run**, so the tunnel is up;
  - five **Philips CV/IR** systems at the same sites (C000225, C000450, C000515) time out on every
    run, 288 in 3 days, and three more show 26 failures each;
  - those CV/IR failures are **older than the CT outage**: connection errors on every day of the
    45 days checked (`pctc/out/12_cv_failure_onset.tsv`), while the CTs last delivered data on
    2026-10-30 / 2026-11-02.

  So the problem looks Philips-specific, not a tunnel outage. Likely candidates: the route or
  firewall rule for the Philips devices' address range at those sites. The CV/IR problem may be a
  separate, long-standing one.
- **Updated ticket text:** "The site VPN is up (other equipment at the same sites connects). Since
  about 2026-11-02, SSH (TCP 22) to the 9 Philips CT consoles times out. Several Philips CV/IR
  systems at the same sites have also been timing out since at least early October. Please check
  routing and firewall rules for the Philips device addresses, and whether anything changed on the
  Philips network segment or the CT consoles around 2026-11-02."
- **No code depends on this.** The collector fix is already deployed (2026-11-20 19:26 UTC); the
  first run behaved as designed.

### 8.2 The export fix (Q2 step 2) and the reset question (step 3)

- **Script:** `read/sh/Philips/phil_ct_data_grab_1.sh`, the only script the 9 systems use.
- **The legacy `.output` files are unchanged.** They come from the same commands, byte-identical on
  all 5 real copies, so today's parser is unaffected.
- **New: `EALInfo.csv` and `Events.csv`.** Complete exports, one line per row, with commas and line
  breaks kept. They match the database exactly on all 5 copies (179,478 rows), and they are what
  PCT-1b will read.
- **Also new:**
  - every file is replaced atomically, staged and then `mv`d;
  - an export failure keeps the previous files and is reported as an error (exit 1);
  - a lock prevents overlapping grabs;
  - `Data_Logger.ls` lists `D:\Data_Logger\` on each grab, which answers step 3 (is the old
    `Logger.mdb` kept at a reset?) once a system is reachable.
- **Tests:** 10/10 jest tests (synthetic stubs) pass, and 5 mutations are each caught.
- **Review:** `hhm_data_acquisition/REVIEW-PCTC-COLLECTOR-HANDOFF.md`. Codex writes
  `REVIEW-PCTC-COLLECTOR-CODEX.md`.

### 8.3 What's next

1. The Codex review, then fixes.
2. Your commit, then the `DEV` → `STAGING` → `PROD` promotion.
3. Reachability, from 8.1.
4. The first successful grab, checked:
   - the `.csv` row counts equal the database's;
   - `.output` equals the old script's output;
   - read `Data_Logger.ls`.
5. The PCT-C exit criterion: 5 clean days.
6. PCT-1b reads the `.csv` files. From the Codex review: parse the CSV quoting first, then run
   **one left-to-right** unescape pass per field (`\n \r \t \\`). Repeated replace passes would turn
   a literal backslash followed by `n` into a newline. Tests must cover literal backslashes, doubled
   quotes, CRLF, tabs, adjacent escapes, empty text vs NULL, and non-ASCII text.

**Review round 1 (2026-11-20):** Codex found F1–F4 plus one inherited P1 (R1); the review is
`REVIEW-PCTC-COLLECTOR-CODEX.md`. All are fixed on `DEV` (uncommitted), with 26/26 jest tests
passing, every mutation caught, and real-data equivalence rerun. The handoff is updated for
re-review.

**Review round 2 (2026-11-20):** `REVIEW-PCTC-COLLECTOR-CODEX-2.md` found 0 P1 and 3 P2, all in the
optional listing (partial listing installed, TERM-only timeout, a throttle that didn't hold after
failures). All are fixed. Following Codex's recommendation, the main download also has a hard
deadline (600 s + 15 s kill). 38/38 jest tests pass, every mutation is caught, and real-data
equivalence was rerun.

**Review round 3 (2026-11-20):** `REVIEW-PCTC-COLLECTOR-CODEX-3.md` found 0 P1 and 3 P2, verdict
"not ready":
- a failed state-file write could kill the script;
- a TERM-resistant descendant could outlive `timeout`;
- a setting of 0 disabled the deadlines.

All are fixed. The listing runs in a subshell with `touch`-based state; every `lftp` session's
process group is killed when it ends; durations must be 1–86400 s. 50/50 jest tests pass, every
mutation but one is caught (the subshell is now a second layer), and real-data equivalence was
rerun. Ready for round 4.

**Review round 4 (2026-11-20, on `00e94e1`):** `REVIEW-PCTC-COLLECTOR-CODEX-4.md` found 0 P1 and 1 P2
(R4-1: if the collector shell is killed, its process-group cleanup never runs). That was the only
blocker. Fixed: `session()` now runs as a supervising subshell, which survives the shell and cleans
up. A combined regression test was added (51/51 pass, and it fails on the round-3 form), and
real-data equivalence was rerun.

**Review round 5 (2026-11-20):** `REVIEW-PCTC-COLLECTOR-CODEX-5.md` found 0 P1, 0 P2, 0 P3. Verdict:
**ready to promote to STAGING and PROD** once the reviewed fix is committed. What's left for PCT-C:
- your promotion;
- the prod pull;
- reachability (§8.1);
- checking the first successful grab (§8.3).

---

## 9. PCT-1b: the parser fix (planning started 2026-11-20; read-only so far)

**Status:** plan AGREED 2026-11-20 (Q19–Q26, §9.7). No code is changed before 2026-11-24
18:53 UTC (Q3). Everything below was
gathered read-only on 2026-11-20: prod DB through `scripts/q.js`, prod files and
`/home/prod/alert-processor` read, nothing written to the DB, Redis or any file outside the
evidence folder. Evidence: `~/philips_ct_evidence/pct1b/` (README).

**Preconditions checked on 2026-11-20** (`pct1b/out/04_cutover_still_clean.tsv`):
- **The cutover is still clean** (day 1 of 5). `hhm_rpp` has logged no run since 2026-11-19
  18:50:28. `PHILIPS_CT` has run 53 times from `hhm_rpp_philips`, each with the same 56 warn/error
  entries (the missing-file noise, I7). `PHILIPS_MRI_LOG_1-5` warn/error rates match `hhm_rpp`'s
  in the 3 days before (e.g. LOG_1 averages 10.9 vs 10.1).
- **The live crontab can't be read from this user.** The run logs above are the evidence; you
  confirm the crontab at deploy (step 1b.5).
- **The `hhm_rpp_ge` close-out has not happened yet.** MRI monitoring runs until 2026-11-23
  16:48 UTC, then the close-out. PCT-1b needs nothing there; I only read it.

### 9.1 What the five copies say about the `.csv` files

The real collector (`phil_ct_data_grab_1.sh` at `aa68ceb`) was run against each `Logger.mdb`
copy with the stub `lftp` (`pct1b/scripts/build_csv.sh`, `out/01_build_csv.txt`). It gave 179,478
rows: 77,264 EAL and 102,214 Events. A reference decoder (`pct1b/scripts/csvref.py`: quoting
first, then one left-to-right unescape pass) reads them as follows:
- **Header and fields:** every line has exactly the header's field count, and every key matches
  `yyyy/MM/dd HH:mm:ss.SSS` with an optional `__NN`. The highest suffix is `__21`. SME18534 and
  SME18976 have no suffixed rows at all.
- **NULL vs empty text:** NULL is an unquoted empty field. It occurs in EAL `ErrNum`, `File` and
  `Info` (252 rows) and in Events `EAL`. Empty text (`""`) occurs only in `BLOB`, which isn't
  stored. So in real data the two never need telling apart; the decoder still keeps them apart.
- **Hard cases in `Msg`:**
  - commas in 4,468 rows, line breaks in 1,274, backslashes in 959 (Windows paths), trailing
    whitespace in 4,306;
  - no double quotes and no non-ASCII text in any copy, so those cases get synthetic tests.
- **Table order is not time order.** The time steps back up to 20 h between consecutive rows
  (`out/15_table_order.txt`). So file order can't be used to tell the two passes
  of the DST hour apart (§9.5).
- **No unique index in `Logger.mdb`.** `mdb-schema` shows none. Keys were unique in all 5 copies,
  but no copy spans a DST fall-back. The repeated hour could put the same key twice in one file,
  so dedupe counts rows (a multiset) and doesn't assume unique keys.

### 9.2 Who reads `log.philips_ct_eal_events` (inventory, 2026-11-20)

Sources: the catalog, `pg_stat_statements` since 2026-10-23, a code search of `~/hep3`, and
`/home/prod/alert-processor` (`out/02`, `03`, `14`).

| Reader | What it reads | What PCT-1b changes for it |
|---|---|---|
| **alert-processor** (prod cron `24,54`; 1,373 calls) | `SELECT *` of rows with `capture_datetime` in the last 30 min, for `process_log` systems. It tests each row against the system's enabled models: 13 per collected system, all `err_number contains` (27,624 rows, 14,322 enabled) | **Matching: nothing.** Events rows have `err_number` NULL before and after, so they never match. **Volume:** each Events row is still tested and logged as untested (a WARN per model). Events rows per run grow about 2.2× (27,824 vs 12,627 in SME20598's window), so CT rows per run grow about 45%. **Timing:** the CT run must finish before `:24`, or its rows fall outside the next 30-min window. Budget: under 5 minutes (measured: under 1 minute, §9.6) |
| `log.log_recent_files` view | the newest `host_datetime` per system | nothing, except that `host_datetime` in the DST hour becomes deterministic (§9.5) |
| `alert.offline_hhm_conn` | upserted by the EAL ingest with the newest `host_datetime` | same meaning: the newest `host_datetime` among EAL rows inserted in the run, and no upsert when nothing new arrives |
| archive job (`fse_dispatch` `archive-partitions.sql`) | moves whole partitions | nothing |
| the insight layer (PCT-2, future) | `message` whole and the real `eal` flag | what Q4 wants. Events are used from the deploy onward (Q5) |

- **Nothing else reads it:** no functions, triggers or other views. The only grant is the app
  role. The `hhm_parsers` and `staging/HEP3_HHM` copies are old code and not in the prod crontab.
- **Correction to the brief:** the file names come from `config.log` (query `PHILIPS_CT`), not
  `public.systems.hhm_file_config`. That column still holds a stale CT entry on 13 systems; this
  app doesn't read it.

### 9.3 The transition from old-parser rows (the big question)

**The problem, measured.** For every key window of the 5 copies, I fetched what the old parser
stored (`sql/05`; `log` for the 3 recent systems, `archive_log` for the two 2025 copies).
That is 117,274 rows. Every one of them is in its copy (0 stored-only keys). Then I counted what
each option would insert (`scripts/transition.py`, `transition_shape.py`; `out/07`, `out/13`).

Text form "R2" below means: `eal_time` / `event_time` in the old `MM/dd/yy HH:mm:ss` text and
`Info` right-trimmed (Q20).

| Option | Inserted from the 5 copies | Duplicates of stored rows | Never-stored rows lost |
|---|---|---|---|
| **O1** key + content only, R2 text | 69,043 | **6,839** (every old split-`Msg` Events row) | 0 |
| O1 with exact export text (R1) | 179,478 | **117,274** (everything) | 0 |
| **O2** rows captured before the switch match on key only | 62,204 | 0 | 0 |
| **O2s** old split-shape Events rows match on key only (stateless), R2 text | 62,208 | 0 Events; the 4 EAL rows in the note below | 0 |
| O3 high-water key per system and kind | 30,949 | 0 | **31,255** (suffixed rows below the mark) |
| O4 cutover timestamp on device time | 0 | 0 | **62,204** |

- **O2s works because the split shape gives the old rows away.** The old parser put the rest of a
  multi-word `Msg` into `eal`. A new row's `eal` is always `Yes` or NULL. So a stored Events row
  whose `eal` is neither `Yes` nor NULL is an old split row.
  - On the copies, every Events content difference is one of these: 1,969 / 973 / 1,463 / 2,430
    rows, equal to O1's duplicates exactly.
  - Every other stored row (EAL, and Events with a one-word `Msg`) is already byte-equal in R2
    text: 110,435 rows.
- **Note: 4 rows were revised between grabs.** On SME18535 and SME18976, two pairs of EAL rows
  stored by the old parser have garbled (`ā࿈噌䱁`) or NULL `Info`. The later copy has the real
  text (`MP-Ctrl- Direction Changed.`, `TapeSw pressed`, …) (`out/08`). Each was captured about
  8 minutes after it was logged, so the scanner was probably still writing its memo field. Under
  Q6 the corrected row is kept as a second row with the same key. Whole-file parsing will see the
  same thing now and then, for both kinds (Q25).
- **Why not O2:** it needs a stored boundary: a Redis key set by the first run, or an env value
  you set at deploy. Losing or mis-setting it makes rows match the wrong way. O2s needs no state
  and gives the same result on the copies, apart from the 4 revised rows.
- **Why not O3 / O4:** they drop rows nothing ever stored. For O4 that is the whole first buffer,
  and suffixed rows are about half the Events.
- **In practice the overlap may be empty.** A scanner in use resets its buffer within 2.3 days,
  and all 9 have been unreachable since 10-30 / 11-02. But if reachability returns before this
  deploys, the old parser stores more rows from the same buffers, so the rule is needed.
- **The 2025 copies** (SME17372, SME18976): their stored rows are in `archive_log`, which the
  dedupe doesn't read. If a long-silent system came back with a buffer that old, its rows would be
  stored again in `log`. That's unlikely (the buffer resets), and the insight layer dedupes on the
  key anyway. Accepted.

### 9.4 Switching from `.output` to `.csv`

- **Today:** `config.log` has 26 `EALInfo.output` rows (`regex_models {ct_eal_v_2}`) and 25
  `Events.output` rows (`{ct_events_v2}`). SME17372 has no Events row. 9 of these systems are
  collected (`out/06`). No other app reads these `config.log` rows; the collector writes every file
  for every collected system on its own.
- **Proposed (Q21):**
  - the new code reads only names ending in `.csv`. A `.output` name is skipped, with one WARN
    per run;
  - after the code is deployed you run one `UPDATE` (draft below) that changes `file_name` and
    `regex_models` on those 51 rows;
  - **order: code first, then config.** The old code with a `.csv` name would be wrong: its EAL
    regex half-matches a CSV line. For rollback, config first, then code;
  - a configured file that doesn't exist is skipped silently (I7). Until reachability returns,
    that's every system: no rows, no errors.

  ```sql
  -- draft; you run it after the PCT-1b deploy. Rollback: swap the names back.
  UPDATE config.log l SET file_name = 'EALInfo.csv', regex_models = '{ct_eal_csv}',
         last_updated_by = 'PCT-1b', last_updated_at = now()
  FROM systems s JOIN config.acquisition ac ON ac.system_id = s.id
  WHERE l.system_id = s.id AND s.manufacturer = 'Philips' AND s.modality LIKE '%CT'
    AND ac.run_group = 1 AND l.file_name = 'EALInfo.output';          -- expect 26
  -- same for Events.output -> Events.csv, '{ct_events_csv}'           -- expect 25
  ```
- **Redis (Q22):**
  - the shared keys `<SME>.EALInfo.output` / `<SME>.Events.output` are no longer read or written,
    and keep their last offsets. `hhm_rpp` no longer runs CT (§1.1), and the new code never uses
    those names;
  - **rollback needs them reset:** before going back to the old code, set each to its current
    `.output` size, or the old parser re-reads a partial tail. The commands go in the deploy notes;
  - new keys `<SME>.EALInfo.csv` / `<SME>.Events.csv` hold `{size, sha256}` of the last file fully
    ingested. An identical file is skipped (an idle scanner gives byte-identical exports every
    grab). This is only an optimisation: if a key is lost, the next run re-reads the file and
    dedupe inserts nothing.
- **The `.output` files (Q26):** the collector keeps writing them and nothing reads them.
  `log.saved_files` stops getting them, because `gzip_n_save` saves the configured names. After 5
  clean days, a separate small collector step (PCT-C2, `hhm_data_acquisition`) removes the legacy
  exports.

### 9.5 Design

New code under `jobs/Philips/CT/`. The byte-offset path is removed: `eal_parser.js`,
`events_parser.js`, and the CT use of `data_acquisition/Philips_CT.js`.

| Piece | What it does |
|---|---|
| `csv.js` | **Decode.** A CSV state machine over the whole text: quoted fields, `""` → `"`, records end at LF or CRLF outside quotes. Then one left-to-right unescape pass per field: `\n \r \t \\`; any other backslash pair is kept as is. An unquoted empty field is NULL; `""` is empty text. Malformed quoting throws |
| `rows.js` | **Build rows.** Checks the exact header of each table. Splits the key into `host_date` and `host_time` (suffix kept, I1). EAL columns as today. Events: `message` = `Msg` whole (line breaks and trailing whitespace kept), `eal` = `EAL` (`Yes` / NULL) (I3). R2 text (Q20). BLOB dropped |
| `time.js` | **`host_datetime`** from the wall clock and the site time zone, `America/New_York` when NULL (as today). **The repeated DST hour always takes the earlier offset** (luxon 3.6 `getPossibleOffsets()`), so the stored instant no longer depends on when the parser ran (§1.5; `out/16_luxon_dst.txt`). Non-existent spring-forward times move forward, as luxon does now |
| `ingest.js` | **Per file, in one transaction:** `pg_advisory_xact_lock(system, kind)`; read the stored rows of that system and kind with `host_datetime` within the file's span ±1 day; a multiset diff on (key, content) with the O2s rule; insert what's left in batches of 5,000; commit. Kind: Events if any Events column is set, else EAL. Content: the 20 text columns, without `host_datetime`, `capture_datetime`, `id` and `status`, so a time-zone or DST fix never creates a duplicate. `capture_datetime` = when the file's processing starts |
| `index.js` | **Per configured file:** skip if missing (silent) or not `.csv` (WARN). Skip if the Redis hash is unchanged. Otherwise ingest, then update the hash, then `gzip_n_save` as today. The EAL ingest upserts `alert.offline_hhm_conn` |

- **Fail closed (Q24):** a wrong header, bad quoting, a wrong field count or a malformed key is an
  ERROR for that file. Nothing from it is inserted and its hash isn't updated, so the next run
  tries again. Nothing is dropped silently.
- **DRY_RUN:** today's guard refuses `db.tx`. Under `DRY_RUN=1`, `ingest.js` skips the
  transaction and lock, runs the read as a plain `SELECT`, and records the inserts as now. Redis
  writes are skipped by the existing proxy.
- **Not changed:**
  - `scan_seconds` (CT never wrote `logfile_event_history_metadata`);
  - the table and its indexes;
  - the other Philips jobs.
- **Node 16:** prod runs v16.20. The code avoids anything newer. Tests use `node --test`, which
  works on 16.20 and is what `hhm_rpp_ge` uses, so no new dependency.
- **Fixtures (Q18):** rows from the 5 copies chosen to cover suffixed, comma, multi-line, NULL
  `Info`, coded, twin and `Series … cancelled` rows. A scan found no IP, MAC, host, serial or AE
  title in any copy (`out/12`); the fixture builder still masks those patterns and fails if any
  remain. System ids become `SME00001…`.
  - The folder must be lower-case `__tests__/fixtures/philips_ct/`: the repo's `.gitignore`
    ignores any path component named `Philips_CT`.
  - Raw copies and the generated `.csv` files stay in `~/philips_ct_evidence/`.

### 9.6 Performance (measured 2026-11-20)

- **Decode + diff in Node 16** (`scripts/bench_parse.js`, `out/10`): at most 232 ms decode +
  224 ms diff for the largest file (3.33 MB, 30,949 rows). Heap under 100 MB.
- **The stored-rows read** (`sql/06`, `out/09`, `out/11`):
  - on the server, 18–69 ms (index scans on `(system_id, host_datetime)`, with no partition
    pruning needed);
  - end to end for the busiest system's padded 3-day window (87k rows, both kinds, full
    content), 1.9 s. Key plus an md5 of the content halves that, but the full read is kept: it
    avoids an SQL/JS hash-equivalence risk.
- **Per run, worst case** (all 9 systems changed): about 9 × (2 × 0.5 s + 2 × 1–2 s) ≈ 30 s. An
  unchanged file costs one sha256 (milliseconds).
- **Inserts:** the first parse of a full buffer inserts up to about 31k rows per file. The old
  parser did the same on every reset ("Reading entire file"). The batches go in one transaction
  per file.
- **December partition:** every `log.*` table ends at `…_2026_11` today. Creating the 2026-12
  partition is routine fleet-wide work, but no CT insert can land in December without it.

### 9.7 Questions — AGREED 2026-11-20

You accepted every recommendation below as written on 2026-11-20. Each answer is marked
**AGREED**; the reasoning is kept as it was.

19. **The transition from old rows. AGREED: O2s (§9.3).** Old split-shape Events rows
    match on key only. Everything else matches on key plus content, as in Q6. It needs no stored
    state, and on the 5 copies it gives 0 duplicated Events rows and loses nothing that was never
    stored. Not chosen:
    - O1 (6,839 duplicates);
    - O2 (the same result but needs a stored boundary);
    - O3 / O4 (lose 31k / 62k never-stored rows).
20. **Text form of the unchanged columns. AGREED: R2:**
    - `eal_time` and `event_time` in the old `MM/dd/yy HH:mm:ss` text;
    - `Info` right-trimmed, as the old parser did (the device pads it to a fixed width), with an
      all-blank `Info` stored as NULL.

    Everything else is stored exactly: `Msg` whole, NULL vs `""` kept. Each column then stays
    uniform across old and new rows, and new EAL rows equal old ones byte for byte (77,260 of
    77,264; the other 4 are the revised rows). "DB = MDB" in the exit criteria means equal apart
    from these two documented forms. Not chosen: R1 (exact export text), which makes O2s
    impossible for EAL and mixes two formats in two columns.
21. **Switching files. AGREED: the `config.log` `UPDATE` in §9.4, which you run after
    the code deploy.** The code refuses `.output` names. Not chosen: mapping `.output` → `.csv` in
    code without a DB write. That's one step fewer, but the config would no longer say what is
    read.
22. **Redis. AGREED:**
    - leave the `.output` offset keys as they are, with a reset step in the rollback notes;
    - add the `<SME>.<file>.csv` hash keys to skip unchanged files.

    Not chosen: no Redis at all. That works, but it re-reads every unchanged file and its stored
    rows on every run, about 20–30 s and tens of MB of reads per run for nothing.
23. **The DST hour. AGREED: the earlier offset, deterministic (§9.5), with
    `host_datetime` kept out of the dedupe content.**
    - Keys and days stay on the wall clock (Q8).
    - Old rows aren't corrected (Q5).
    - Second-pass rows get an instant 1 h early, one hour a year per system. No field
      disambiguates the two passes: table order isn't time order (§9.1), and `TStampNum` is also
      wall clock.
24. **A malformed file. AGREED: fail closed for that file** (ERROR, nothing inserted,
    retried next run). Not chosen: skipping bad rows, which would drop rows silently.
25. **Rows revised between grabs (§9.3 note). AGREED: keep both rows, as Q6 says. The
    insight layer's rule (prefer the latest capture per key outside the DST hour) is decided in
    PCT-2.** 4 of 117,274 stored rows so far.
26. **The `.output` files. AGREED:** the collector keeps writing them and the parser
    ignores them until 5 clean days after the PCT-1b deploy. Then PCT-C2, a separate small
    `hhm_data_acquisition` step reviewed like PCT-C, removes the legacy exports.

### 9.8 Steps and exit criteria

| Step | Content | Exit | Earliest |
|---|---|---|---|
| **1b.0 Plan** | this section | Q19–Q26 answered and recorded as AGREED | **done: AGREED 2026-11-20** |
| **1b.1 Build** | `csv.js`, `rows.js`, `time.js`, `ingest.js`, `index.js`; masked fixtures; tests under `__tests__/` (`node --test`) | **Decoder:** literal backslashes, `\\n` vs `\n`, doubled quotes, CRLF, tabs, adjacent escapes, a trailing lone backslash, empty vs NULL, non-ASCII. **Rows:** header and key checks, suffix, `Msg` / flag, R2. **Time:** DST both ways, NULL zone. **Ingest** (DB stubbed): multiset diff, O2s, re-run, reset, fail closed, missing file silent, `.output` refused, hash skip. Each test is checked to fail under a matching mutation. No test opens the network or a real DB; every child process is bounded | after 2026-11-24 18:53 UTC, once you confirm the cutover closed |
| **1b.2 Exactness** | throwaway PostgreSQL 14 (local `initdb`, socket only) with the table's DDL; the real parser code; the 5 copies' `.csv` files | **DB = MDB** for every copy, both tables: the multiset of (key, content) equals an independent reference (plain `mdb-export` → Python) modulo R2. That includes the suffixed, comma and multi-line Events rows and the 43 `Series … cancelled` lines. **0 inserted on a re-run. 0 duplicates across a simulated reset** (half a buffer, then the full one, then a disjoint one). **Transition rehearsal:** old rows from `sql/05` loaded first, then each copy: inserted = the O2s column of §9.3 | after 1b.1 |
| **1b.3 DRY_RUN** | `DRY_RUN=1` from the dev checkout against prod (read-only sessions) | (a) prod's files as they are: every CT file skipped silently, 0 writes, 0 CT errors. (b) `DEV_FILE_PATH` pointing at the copies' `.csv` for SME20598 / SME18534 / SME18535: the planned inserts equal the O2s numbers against the real stored rows, run time recorded. The parity check doesn't apply: `hhm_rpp` no longer runs CT, and MDB is the reference (1b.2) | after 1b.2 |
| **1b.4 Review** | `REVIEW-PCT1B-PARSER-HANDOFF.md` → Codex → `REVIEW-PCT1B-PARSER-CODEX.md`; fixes recorded here | the review closed; then commit with your OK | after 1b.3 |
| **1b.5 Deploy** (you) | confirm `crontab -l` has no `hhm_rpp … philips_ct` line; promote `DEV` → `STAGING` → `PROD`; pull in `/home/prod/hhm_rpp_philips`; the `config.log` `UPDATE`; watch the next `:18` / `:48` run | the first run: `PHILIPS_CT` warn/error 56 → 0 (all files missing, silent), nothing inserted | after 1b.4, and with or after PCT-C (done) |
| **1b.6 Monitor** | 5 clean days; and once a CT system is reachable, its first `.csv` grab | 5 clean days of runs. **On the first live capture:** DB = that grab's `Logger.mdb` (keys and content, both tables), 0 duplicates on the following runs, and the alert-processor run after it still in its window. Close-out needs the live capture (§6), so it waits on reachability (§8.1) | after 1b.5 |
