# Philips CT Insights — plan

**Current state (2026-11-24; read this first):**
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
- **GE MRI close-out: done 2026-11-23** (`hhm_rpp_ge` MRI-5). The schema
  and C1-Philips work there (§4) still waits for PCT-C to show data.
- **Rechecked 2026-11-24 14:40 UTC:** all 9 CTs still time out (288 of
  288 runs in 3 days each); no CT row since 2026-11-02. The cutover is
  still clean (`PHILIPS_CT` 56 warn/error on every run; `hhm_rpp` has run
  no Philips job since 2026-11-19 18:50).
- **Next (§6):**
  - the collector session (PCT-C, §8): the export fix passed 5 Codex
    rounds, was promoted, and has been deployed to prod since 2026-11-20
    19:26 UTC. The legacy `.output` files are unchanged, with complete
    `.csv` files next to them. Reachability is still down; that is network
    work (§8.1);
  - **the parser fix (PCT-1b, §9):** Q19–Q26 were AGREED 2026-11-20.
    Then Codex's design review (round 1) found 3 P1 and 6 P2 issues, all
    accepted (§9.9). The revised design replaces O2s with rule P, which
    projects new rows through the old pipeline and reproduces 117,270 of
    117,274 stored rows. It adds durable retention of bad input, a
    deploy drain, a reconciled rollback and a commit deadline before the
    alert processor runs. **Q27–Q33 AGREED 2026-11-24** (as recommended).
    Codex round 2 found 2 P1 and 5 P2 issues in how they were to be
    built (§9.10). The design is revised again: every changed snapshot is
    spooled until committed and saved, the rollback preserves the whole
    published set under the collector's lock, the alert window rests on
    a measured assumption with re-stamp recovery, and NULL time text is
    an ambiguous class. **Q34–Q37 AGREED 2026-11-24** (as recommended).
    Codex round 3 found 2 P1 and 4 P2 issues (§9.11). Revised again:
    only old-form time text marks an old row; each attempt has an
    identity (inserted ids, and its `log.saved_files` row as a receipt
    in the same transaction); coverage is proved from the reader's run
    log per attempt, else re-stamped by row id. **Q38–Q40 AGREED
    2026-11-24** (as recommended). Codex round 4 found no P1 and 4 P2
    issues (§9.12), three of them in that proof and its re-stamps.
    Revised: coverage is delivered by construction (phase, a guard
    before `COMMIT`, a clock check) instead of proved afterwards, an
    unknown outcome is decided by the recorded row ids, and a late
    commit is repaired by hand. **Q41–Q44 AGREED 2026-11-24** (as
    recommended). Codex round 5 accepted that narrowing and found no P1
    and 3 P2 issues (§9.13): a reader timing contract per nominal slot,
    no automatic outcome decision once a partition may be archived, and
    a crash gap in completion. **Q45–Q47 AGREED 2026-11-24** (as
    recommended); next is Codex round 6.
    The build waits for the review to close;
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

**Status:** Q19–Q26 were AGREED on 2026-11-20. Then Codex's design review (round 1, §9.9) found
3 P1 and 6 P2 issues. The design below is revised for them, and **Q27–Q33 (§9.7) were AGREED
on 2026-11-24, as recommended**. Round 2 (§9.10) found 2 P1 and 5 P2 issues in how those
answers were to be built; the design is revised again, and **Q34–Q37 (§9.7) were AGREED on
2026-11-24, as recommended**. Round 3 (§9.11) found 2 P1 and 4 P2 issues; revised again, and
**Q38–Q40 (§9.7) were AGREED on 2026-11-24, as recommended**. Round 4 (§9.12) found no P1 and 4 P2
issues; revised again, and **Q41–Q44 (§9.7) were AGREED on 2026-11-24, as recommended**. Round 5 (§9.13)
accepted Q41's narrowing and found no P1 and 3 P2 issues; revised again, and **Q45–Q47 (§9.7) were
AGREED on 2026-11-24, as recommended**. Where an answer changes an agreed one, it is marked as superseded. No code is changed
before 2026-11-24 18:53 UTC (Q3). Everything below was gathered read-only on 2026-11-20: prod DB through `scripts/q.js`, prod files and
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
- **Keys are primary keys in `Logger.mdb`** (corrected after review round 1, finding 9).
  `mdb-schema <copy> postgres` shows `PRIMARY KEY (DTime)` on `EALInfo`, `PRIMARY KEY (DataTime)`
  on `Events`, and an `EALInfo.DTime → Events.DataTime` foreign key, on all 5 copies
  (`out/17_mdb_schema_keys.txt`). The default `mdb-schema` output doesn't show them.
  - So a key can't repeat within one file.
  - It can repeat **across snapshots**: the DST fall-back hour, a reset, or a clock change. What
    the scanner does on the second pass of a repeated hour is unknown (a suffix, a rejected
    insert, or something else), and no copy covers one.
  - Dedupe still counts rows (a multiset), because stored history can hold duplicates. The DST
    tests use sequential snapshots.

### 9.2 Who reads `log.philips_ct_eal_events` (inventory, 2026-11-20)

Sources: the catalog, `pg_stat_statements` since 2026-10-23, a code search of `~/hep3`, and
`/home/prod/alert-processor` (`out/02`, `03`, `14`).

| Reader | What it reads | What PCT-1b changes for it |
|---|---|---|
| **alert-processor** (prod cron `24,54`; 1,373 calls) | `SELECT *` of rows with `capture_datetime` in the last 30 min, for `process_log` systems. It tests each row against the system's enabled models: 13 per collected system, all `err_number contains` (27,624 rows, 14,322 enabled) | **Matching: nothing.** Events rows have `err_number` NULL before and after, so they never match. **Volume:** each Events row is still tested and logged as untested (a WARN per model). Events rows per run grow about 2.2× (27,824 vs 12,627 in SME20598's window), so CT rows per run grow about 45%. **Timing:** a row is tested only if some alert-processor CT query sees it committed while its `capture_datetime` is still inside that query's 30-min window (`capture_datetime > NOW() - 30 min`, `NOW()` on the DB clock). A commit after the `:24` query's snapshot, with a capture time before it, is never tested. The coverage rule, its measured assumption and the recovery are in §9.5 `coverage.js` (Q31, revised by Q36). `alert.detections` has no cross-run dedupe (its key includes `run_id`), so a row tested twice gives two detections |
| `log.log_recent_files` view | the newest `host_datetime` per system | nothing, except that `host_datetime` in the DST hour becomes deterministic (§9.5) |
| `alert.offline_hhm_conn` | upserted by the EAL ingest with the newest `host_datetime` | same meaning, made robust (Q32): upserted in the same transaction as the EAL insert, and never moved backwards (`GREATEST`), so a replay or an older backlog can't make a system look offline |
| archive job (`fse_dispatch` `archive-partitions.sql`) | moves whole partitions | nothing |
| the insight layer (PCT-2, future) | `message` whole and the real `eal` flag | what Q4 wants. Events are used from the deploy onward (Q5) |

- **Nothing else reads it:** no functions, triggers or other views. The only grant is the app
  role. The `hhm_parsers` and `staging/HEP3_HHM` copies are old code and not in the prod crontab.
- **Correction to the brief:** the file names come from `config.log` (query `PHILIPS_CT`), not
  `public.systems.hhm_file_config`. That column still holds a stale CT entry on 13 systems; this
  app doesn't read it.

### 9.3 The transition from old-parser rows (the big question)

**The problem.** The DB holds 11.6M rows from the old parser (`out/19`). Its Events rows have
`Msg` split: the first word in `message`, the rest in `eal`. A whole-file `.csv` parse reads rows
the old parser already stored, in a different shape. Plain key+content dedupe would store them
twice.

**Round 1 measured four options and agreed O2s.** For every key window of the 5 copies, I
fetched what the old parser stored (`sql/05`): 117,274 rows (`log` for the 3 recent systems,
`archive_log` for the two 2025 copies). Every one of them is in its copy (`out/07`, `out/13`).

| Option | Duplicates of stored rows | Never-stored rows lost | Status |
|---|---|---|---|
| O1 key + content only | 6,839 | 0 | rejected |
| O2s old split-shape rows match on key only | 0 on the copies | 0 on the copies | **agreed (Q19), then withdrawn**: suppresses a changed row at an old key (finding 1) |
| O3 high-water key | 0 | 31,255 | rejected |
| O4 cutover timestamp | 0 | 62,204 | rejected |

**Why O2s fails (review finding 1).** Suppose an old row at key K says `Ready Now`, and a later
buffer has K with different content, `Fault Raised`. Q6 says to keep both, but O2s's key-only
match swallows the new row. The same would happen to any new row whose `EAL` is a value other
than `Yes` or NULL. The 5 copies never exercise this case.

**Round 2: rule P, a projection of the old pipeline (Q27).** A stored row matches an incoming
row at the same key in one of two ways:
- **(a) an old-parser row equals the projection.** The projection replays, from the decoded
  `.csv` row:
  1. the plain `mdb-export` record (quotes doubled, NULL empty, datetime `MM/dd/yy HH:mm:ss`);
  2. for EAL: `awk 'NF>2'`, then the real `ct_eal_v_2` regex, `remove_dub_quotes` and
     `''` → NULL;
  3. for Events: the collector's `tr -cd` set, the `awk -F,` reorder, the `sed '^"dd/'` filter,
     then the real `ct_events_v2` regex.
- **(b) a new-parser row equals the new representation exactly.**

Each stored row is consumed at most once (a multiset).

**Provenance from the time text, in one direction only (revised for round-3 findings 1 and 3,
Q38; replaces Q37's ambiguous class).** New rows store `eal_time` / `event_time` as the export's
`YYYY-MM-DD HH:MM:SS` (Q28), or NULL when the source field is NULL (the MDB columns are nullable;
the copies have 0 NULL). `rows.js` rejects any other time text as a bad record. So **no new row
ever has old-form time text**, and that is the only direction rule P relies on:
- **old form** `MM/dd/yy HH:mm:ss` → an old-parser row, matched only by the projection (a). All
  6,525,121 EAL and 5,097,213 Events rows in `log` today (`out/19`);
- **anything else** (new form, NULL, other text) → treated as a new-parser row, matched only by
  the exact new representation (b).

**The reverse is not true, and the cost is a duplicate, never a suppression.** The old EAL regex's
`eal_time` capture is `.*?`, so a quoted field containing a comma shifts or ends the match. Both
reproduced with the repo's regex: an `Info` containing `","` gives `eal_time` NULL (round 2,
`out/22`); `File = 'f,part'` with a date-looking `Info` stores that `Info` text, in new form, as
`eal_time` (round 3). Such an old row is treated as new; the incoming row doesn't match it and is
**stored again, once, in the new form**. Bound: 0 of 6,525,121 stored EAL rows have non-old-form
time (`out/19`), and 0 of the 77,264 EAL rows in the copies project to one (`out/23`). Only the old
parser during a rollback could create one, from a row with a comma inside a quoted field. The
Events regex requires a dated `event_time`.

What this fixes (round-3 finding 1): a projection can match only an old-form row, so the only
suppression left is the accepted loss of the old pipeline (below). A new-parser row, NULL time
included, is matched only by an identical new row, so any revision of it is kept, in any order.
Kept:
- no boundary to set, lose or move;
- it still holds if a rollback lets the old parser store more rows (§9.4).

**The projection, checked on the copies** (`scripts/legacy_projection.js`, `out/18`):
- **A. The rebuilt plain record equals the real `mdb-export` record** on every EAL row. For
  Events it does too, except the `ERROR_BLOB` rows: the plain export prints BLOB text that
  `-b strip` removes. BLOB comes after the fields the old regex stores, so it doesn't change the
  projection.
- **B. The projection equals 117,270 of the 117,274 stored rows** at the same key.
  - That includes 873 rows that the old regex merged with the next line (I6). With `EAL` NULL it
    ran into the next line of the sorted file and stored that line's event time in `eal`. For
    those rows the projection is exact on every column except `eal`, which must be a
    `MM/dd/yy HH:mm:ss` value.
  - The other 4 rows are the EAL rows revised between grabs (`out/08`): garbled or NULL `Info`
    in the stored row, the real text in the later copy. Rule P keeps the corrected row as a
    second row, which is what Q6 wants.

**Inserts on the 5 copies under rule P** (`out/18`, "rule P"):

| Seeded with | Inserts | Stored rows matched | What it is |
|---|---|---|---|
| `log` only (what the runtime reads) | **113,552** | 65,926 | the **expected total for the 1b.2 rehearsal**. The two 2025 copies insert in full (83,675), because their stored rows are in `archive_log` (accepted: those buffers are long gone) |
| all saved history (`log` + `archive_log`) | 62,208 | 117,270 | the transition study: 62,204 never-stored rows + the 4 revised rows |

**What rule P can't promise.** The old representation was lossy, so the projection can't tell
apart two source rows that differ only in what the old pipeline destroyed. That needs the same
key, with content differing only in characters `tr` stripped, in the words after the first space
when `eal` is a merged I6 time, or in BLOB. In that case the later row matches the old one and
isn't stored. No such pair exists in the copies.
- **The other direction:** an old row the projection can't reproduce is simply not matched, so
  the new row is stored next to it (a duplicate in the old shape). That happened 0 times on the
  copies.
- **Neither case can be counted** from lossy rows alone (round 2). The ingest logs what it can
  observe, per run and file: rows matched under (a), of which I6 wildcard matches; under (b);
  and rows inserted, of which those at a key that already holds a stored row (a revision, or
  the deliberate duplicate above). The I6 wildcard applies only to an old-form stored row
  whose every other projected column matches; a date-shaped `eal` alone is not enough.

### 9.4 Switching from `.output` to `.csv`, deploying, and rolling back

- **Today:** `config.log` has 26 `EALInfo.output` rows (`regex_models {ct_eal_v_2}`) and 25
  `Events.output` rows (`{ct_events_v2}`). SME17372 has no Events row. 9 of these systems are
  collected (`out/06`). No other app reads these rows; the collector writes every file for every
  collected system on its own.
- **The switch (Q21, agreed):**
  - the new code reads only names ending in `.csv`. A `.output` name is skipped, with one WARN
    per run;
  - after the code deploy you run one `UPDATE` changing `file_name` and `regex_models` on those
    51 rows;
  - a configured file that doesn't exist is skipped silently (I7). Until reachability returns,
    that's every system.

  ```sql
  -- draft; you run it in step 1b.5. Rollback: swap the names back.
  UPDATE config.log l SET file_name = 'EALInfo.csv', regex_models = '{ct_eal_csv}',
         last_updated_by = 'PCT-1b', last_updated_at = now()
  FROM systems s JOIN config.acquisition ac ON ac.system_id = s.id
  WHERE l.system_id = s.id AND s.manufacturer = 'Philips' AND s.modality LIKE '%CT'
    AND ac.run_group = 1 AND l.file_name = 'EALInfo.output';          -- expect 26
  -- same for Events.output -> Events.csv, '{ct_events_csv}'           -- expect 25
  ```
- **Deploy with a drain (Q30; review finding 3).** Each cron run is a fresh process that loads
  its config once at start, so the barrier is "no CT process running":
  1. right after a `:18` / `:48` run has finished (about `:21`), check that
     `pgrep -af 'index.js PHILIPS_CT'` prints nothing;
  2. pull the new code;
  3. run the `UPDATE`, all before the next cron start.

  If a cron start falls between steps 2 and 3, the new code sees `.output` names and skips them:
  harmless. The old code never meets `.csv` names. Nothing old can still be running, so the two
  parsers never write at the same time.
- **Rollback: preserve the whole published set, under the collector's lock (Q30, revised by Q35;
  round-2 finding 1).** Setting an `.output` offset to the end of the file skips every row in it
  that the new parser hasn't handled. A collector publish is five separate `mv -fT`s
  (`Logger.mdb`, `EALInfo.output`, `Events.output`, `EALInfo.csv`, `Events.csv`, in that order;
  `phil_ct_data_grab_1.sh` lines 152–162), and a failure leaves whatever prefix was published. So
  an `.output` can be newer than the `.csv` beside it, and then no `.csv` holds its rows. And
  publish identity can't be read from mtimes. So:
  1. **Stop CT:** comment out the CT cron line and wait until `pgrep -af 'index.js PHILIPS_CT'`
     is empty.
  2. **Check (read-only):** `node tooling/philips_ct_rollback.js check` prints per system and
     file what `apply` would do.
  3. **Apply (you run it):** `node tooling/philips_ct_rollback.js apply`. Per system, all while
     holding the collector's own lock (`flock -n <dir>/.grab.lock`, held by a grab from its
     start until after its publish; a grab that finds it taken exits 75 and changes nothing):
     - wait for a running grab to release the lock (up to its 615 s deadline);
     - copy the five published files, whatever their state, to
       `retained/philips_ct/<SME>/rollback_<utc>/` with `manifest.json` (name, size, sha256);
       `fsync` each file and the folder; read each copy back and compare its sha256;
     - per `.output`, prove coverage from content: **covered by `Logger.mdb`** if the
       collector's legacy commands, run on the preserved `Logger.mdb`, give the preserved
       `.output` byte for byte; or **covered by `.csv`** if the preserved `.csv` is complete
       (its sha256 is the done-hash, nothing pending in the spool) and the `.output` rebuilt
       from it (the plain records of §9.3 A, then the legacy steps) is byte-identical. Events
       rows with `ERROR_BLOB` can't be rebuilt from the `.csv` (BLOB is stripped), so they need
       the `Logger.mdb` route;
     - only for a covered `.output`: `SET <SME>.<file>.output <size of the preserved copy>`.
       Then release the lock.

     An `.output` that can't be preserved, verified or proved covered keeps its offset; the tool
     prints `UNCOVERED` with the evidence and exits nonzero, and the rollback of that system
     waits for your decision (it takes two consecutive partial publishes, both logged by the
     collector as errors).
  4. **Restore:** the old `config.log` names, then the previous `PROD` commit, then the cron line.
  5. **After the fix (replay):** `PHILIPS_CT_REPLAY retained/philips_ct/<SME>/rollback_<utc>/`
     ingests both preserved `.csv` files **and** a fresh `-e` export of the preserved
     `Logger.mdb` (the collector's exact `mdb-export -e -b strip -T '%Y-%m-%d %H:%M:%S'` and
     `tr -d '\000'`). Rows the old parser stored in the meantime have old-form time and are matched
     by projection (Q38); an old row without old-form time (a comma-shifted capture) is stored
     once more in new form, the accepted duplicate. Otherwise the replay adds only what is missing.
- **Redis (Q22, agreed):**
  - the `.output` offset keys are no longer read or written, and keep their last values until
    a rollback resets them (above);
  - new keys `<SME>.EALInfo.csv` / `<SME>.Events.csv` hold `{size, sha256}` of the last file
    **completed** (Q34, Q39): committed (its `log.saved_files` row is in the same
    transaction), DELIVERED or marked `late` (Q41), and, with bad lines, retained. An identical file is skipped only if nothing for it is pending in the
    spool. A lost key means one more diff and no insert.
- **The `.output` files (Q26, agreed):** the collector keeps writing them and nothing reads them.
  `log.saved_files` stops getting them. After 5 clean days, PCT-C2 removes the legacy exports.

### 9.5 Design (revised after review rounds 1–4)

New code under `jobs/Philips/CT/`. The byte-offset path is removed: `eal_parser.js`,
`events_parser.js`, and the CT use of `data_acquisition/Philips_CT.js`.

| Piece | What it does |
|---|---|
| `csv.js` | **Decode.** Records are physical lines. That's the dialect's guarantee: `-e` escapes every line break inside a field, and all 179,478 rows of the copies are one line each. A trailing CR is dropped (CRLF). Each line is parsed for quoting (`""` → `"`), then gets one left-to-right unescape pass per field (`\n \r \t \\`; any other backslash pair is kept). An unquoted empty field is NULL; `""` is empty text. A line with bad quoting is a bad record, not a fatal error |
| `rows.js` | **Validate and build.** Exact header per table. Per record: field count; key `yyyy/MM/dd HH:mm:ss.SSS[__NN]`, a real calendar date and time (luxon `isValid`; `2026/02/30` is rejected); for Events, at least one stored Events column set (review finding 5). Output: `host_date` / `host_time` (suffix kept), `message` = `Msg` whole, `eal` = `EAL` as given. **Q28 text:** `eal_time` / `event_time` = the export's `YYYY-MM-DD HH:MM:SS`, `Info` right-trimmed (`/\s+$/`, all-blank → NULL), everything else exact. Each built row is checked to classify back into its own kind |
| `legacy.js` | **Rule P's projection** (§9.3), using the repo's real `ct_eal_v_2`, `ct_events_v2` and `remove_dub_quotes`, plus the collector's `tr` set and `awk` reorder |
| `time.js` | **`host_datetime`** from the wall clock and the site zone (`America/New_York` if NULL, as today). The repeated DST hour takes the earlier offset (Q23, agreed). **An invalid zone string** gives `host_datetime` NULL and an ERROR (Q33); the candidate read covers NULL |
| `ingest.js` | **Per file, one transaction:** see the steps below the table |
| `spool.js` | **Durable pending work, retention and replay** (Q29, extended by Q34; round-2 findings 2, 6, 7): see below the table |
| `save.js` | **Archival inside the ingest transaction** (Q39 → Q42; round-2 finding 6, round-3 finding 2, round-4 finding 1): gzip the spooled bytes and `INSERT` them into `log.saved_files` in the same transaction as the rows, with the attempt's exact capture time (a plain `INSERT`, never `ON CONFLICT DO NOTHING`). Its key `(system_id, file_name, capture_datetime)` makes it the attempt's **receipt**, a cross-check: `delete_old_files` (in `hhm_rpp` and in this app) removes `log.saved_files` rows after 48 h, so an unknown outcome is decided by the recorded row ids (Q42). The shared `util/gzip_file.js` doesn't await or return its insert (line 64) and swallows errors, so the CT path doesn't use it. The other Philips jobs keep it (out of scope; `hhm_rpp_ge` fixed its copy on 2026-11-23) |
| `coverage.js` | **The alert window** (Q31 → Q36 → Q40 → Q41; round-2 findings 3, 4; round-3 findings 4–6; round-4 findings 2–4): the phase, the clock check, the guard before `COMMIT`, DELIVERED or `late`; see below the table |
| `index.js` | **Per system:** take the system's spool lock; process its pending and `late` spool entries **even when the configured file is missing now**. **Per configured file:** missing → silent skip; not `.csv` → WARN. Read the file **once into a buffer** and sha256 it. Unchanged hash and nothing pending → skip. Otherwise **spool it first**, then process the system's pending entries oldest first. Replay entry point: `node index.js PHILIPS_CT_REPLAY <retained file or rollback folder>` |

**`ingest.js`, one attempt per spool entry, one transaction (revised for round-3 finding 2 and
round 4, Q39 → Q42, Q43):**
0. **Fencing:** the whole run's work on a system (attempts, outcome checks, completion)
   holds `flock -n spool/philips_ct/<SME>/.lock`. Cron, manual runs and replays all take it; if
   it's busy, the system waits for the next run. So one worker owns an entry at a time.
1. **Session and identity:** the ingest connection sets `idle_in_transaction_session_timeout`
   = 2 min and uses TCP keepalives (Q43), so a transaction whose client has gone ends on the
   server. The run measures the host/DB clock (Q41) and ingests nothing if offset + round trip
   is over 10 s (snapshots still spool). A new attempt uuid is written to the entry's
   `state.json` as `attempting` before `BEGIN`.
2. **Lock without waiting:** `pg_try_advisory_xact_lock(system, kind)` is the first statement.
   If busy, roll back; the entry stays pending.
3. **Capture time:** `clock_timestamp()::text`, kept as text end to end (microseconds; never a
   JS `Date`, which node-postgres truncates to milliseconds). It must be inside the phase
   (`coverage.js`), checked on this exact value; otherwise roll back.
4. **Candidate read** (round-1 finding 4): `system_id = $1 AND (host_datetime within the file's
   span ±2 days OR host_datetime IS NULL) AND host_date = ANY(file dates) AND <kind predicate>`.
   This is complete for every accepted key: a stored `host_datetime` is either NULL or the raw
   key read in some IANA zone (−12 h to +14 h, plus a 1 h DST fold). The span comes from the raw
   keys' wall-clock values, never from the computed `host_datetime`, so an invalid zone (every
   incoming `host_datetime` NULL) still bounds the read and finds earlier non-NULL rows.
5. **Match and insert:** a multiset match under rule P, then inserts in batches of 5,000 with
   `RETURNING id`.
6. **EAL only:** upsert `alert.offline_hhm_conn` with `GREATEST(stored, newest inserted
   host_datetime)` (Q32).
7. **Save** the exact bytes to `log.saved_files` at the capture time (`save.js`): the receipt.
8. **Before `COMMIT`:** the guard (Q41): read the DB time `t0`; at or after the phase end
   (`N_next − 2 min`) → roll back, the entry stays pending. Then write `state.json` as
   `committing` (attempt id, capture text, `t0`, `pg_backend_pid()`, the inserted ids, the EAL
   ids separately), `fsync`ed. `COMMIT` is only ever sent after this.
9. **`COMMIT`**, then read the DB time `t1` (the commit's upper bound) and record `committed`;
   `coverage.js` classifies it DELIVERED or `late`.

**An unknown outcome** (an error or lost connection at `COMMIT`, or a crash; the next run finds
the entry not `committed`):
- `attempting` → `COMMIT` was never sent, so the transaction can't commit: aborted.
- `committing` → on a new connection under Read Committed, as **separate statements** (round 4,
  addition 6): `SET lock_timeout = '10min'`; `SELECT pg_advisory_xact_lock(system, kind)`; then a
  **fresh** `SELECT` of the recorded ids at the exact capture text, and of the receipt. Never the
  lock wait and the read in one statement, and never a snapshot taken before the wait. The
  original transaction took that lock first, so getting it means the original has ended. Then
  decide by the **recorded ids** (Q42 → Q46; round-4 finding 1, round-5 finding 2):
  - **Preconditions for an automatic decision** (Q46): it is within 24 h of `t0`, and the
    partition whose bound holds the capture text is still attached to
    `log.philips_ct_eal_events` (the catalog: `pg_inherits` and the partition bound). The
    archive job (`fse_dispatch` `odd-jobs/archive-partitions.sql`) detaches the month six months
    back, `philips_ct_eal_events` included, and moves it to `archive_log`; a detached partition
    hides committed ids from the parent. Without both preconditions: no automatic decision. The
    entry stays **unknown**, with an ERROR, for the manual check below;
  - no ids recorded (the attempt inserted nothing), handled first: the receipt decides, and
    either way nothing was inserted, so a new attempt is safe (it diffs again and saves again);
  - every recorded id present (counted against the recorded list, not the rows returned) →
    **committed**. The receipt should be there too; if it's gone, WARN (the 48 h cleanup), not a
    different outcome;
  - no recorded id present → **aborted**: sequence ids are never reused, and nothing deletes
    from this table (checked: only DDL for the old `philips_ct_eal` / `philips_ct_events` tables
    drops anything). Sequence advance proves nothing: a rolled-back insert consumes ids too;
  - some present, or the receipt present with ids missing → a contradiction: ERROR, and the
    entry stops for you. It is never replaced by a fresh attempt.

  A committed attempt's `t1` is the DB time when the lock was obtained.
- **Manual check** (Q46): `tooling/philips_ct_outcome.js check <SME> <entry>` (read-only)
  searches the active table and the `archive_log` partitions for the capture month for the
  recorded ids and the receipt, and prints the answer. `resolve` records it in `state.json` only
  when its own check is complete: every id found → committed; none found, with every partition
  that could hold the capture text searched → aborted; anything else → it stays unknown.
- The lock times out → still **unknown** (Q43; round 4, addition 5). The run logs the recorded
  pid's `pg_stat_activity` row (state, `xact_start`, `wait_event`). That system's ingest waits,
  because ordering matters, but its snapshots still spool. WARN after 30 min unknown; ERROR after
  2 h, with the diagnostics, for you. A backend still in `COMMIT` is left to finish; one idle in
  its transaction is ended by the 2 min timeout. Nothing is terminated automatically.
- **Horizon** (Q46): automatic decisions only within 24 h of `t0`; after that, an ERROR every run
  and the manual check, never a later automatic "aborted". The receipt cleanup is at 48 h and the
  archive at six months, both outside the horizon. A pid is diagnostic only; it never authorises
  terminating a backend (pids are reused).
- Another transaction at the same capture time can't confuse this: the receipt's key includes
  the file, attempts of one system and kind are serialized by the advisory lock, and rows are
  identified by id, not by capture time.

- **The kind predicate** is identical in SQL and JS: Events if
  `num_nonnulls(type, level, module, time_stamp, message, eal, event_time) > 0`, else EAL.

**`coverage.js`, the alert window (Q31 → Q36 → Q40 → Q41; round-2 findings 3–4, round-3
findings 4–6, round-4 findings 2–4, round-5 finding 1).** A row with capture time `c` and commit time `t` is read by
an alert-processor CT query with snapshot `s` iff `t < s` and `s − 30 min < c`. The reader runs
from this host's cron at the nominal minutes N (`:24`, `:54`). Coverage is **delivered by
construction and checked at commit**, not proved afterwards from the reader's log (Q41 replaces
Q40's proof, automatic re-stamps and journal):
- **Phase** (unchanged): the capture text strictly inside `(N + 6 min, N_next − 2 min)`: after
  `:30:00` and before `:52:00`, after `:00:00` and before `:22:00`. The cron runs at `:18` and
  `:48` are inside.
- **Guard:** the last statement before `COMMIT` reads the DB time; at or after `N_next − 2 min`
  → roll back (step 8).
- **Reader timing contract S** (Q45; round-5 finding 1; replaces Q41's assumptions K and D):
  every scheduled alert-processor run's CT snapshot has a DB time within **`[slot − 60 s,
  slot + 5 min]`** of its nominal slot, everything included: cron, wrapper, Node bootstrap,
  connection queue and clock error. A run outside S is treated like a missed or failed run: the
  reader's contract, monitored in 1b.6 (`sql/13`), not proved per attempt. Measured (`out/24`,
  `out/26`): over 14 days every run started 1.3–2.8 s after its slot (host clock) and ended by
  52.9 s (DB clock). The snapshot lies between the two, so well inside S.
- **Clock check:** the reader's cron runs on this host's clock, so a run ingests only if the
  measured host/DB offset + round trip is at most 10 s (step 1). This host runs chrony against
  `metadata.google.internal` (2026-11-24: synchronised, offset in microseconds). Each run compares
  its offset with the previous run's; a change of more than 10 s → WARN naming the attempts
  committed between the two samples, for you to check. A sample is never used to certify an
  earlier timestamp (round-4 finding 4). This check keeps S plausible; S itself is what the
  classification relies on.
- **Classification** from `t1` (the DB time read after `COMMIT` returns, or the barrier time
  for a resolved unknown):
  - `t1` **before `N_next − 90 s`** → **DELIVERED**. Under S, for the three adjacent slots: the
    reader at N took its snapshot by N + 5 min, before `c` (after N + 6 min) and so before the
    commit: not read. The reader at N_next takes its snapshot at N_next − 60 s or later, after
    `t1`, and its window's lower bound (at most N + 5 min) is below `c`: read. The reader at
    N_next + 30 min has a lower bound of at least N_next − 60 s, above `c` (before
    N_next − 2 min): not read. So exactly one scheduled reader reads the rows. (Codex's
    216-case boundary grid under S, round 5: 0 failures.);
  - otherwise → **`late`**: a `COMMIT` that took over 30 s, or an unknown outcome resolved after
    its window. The entry stays in the spool as `late`, with its ids and capture, and the
    done-hash is set (the rows are in). It's an ERROR every run until you repair it with
    `tooling/philips_ct_restamp.js` (Q44, below). Expected never: the measured ingest takes
    under 1 s (§9.6).
- **What isn't checked: whether the reader succeeded** (Q41). A missed or failed alert-processor
  run loses its 30-minute window for every log table it reads, CT included. That's the alert
  processor's contract, not the parser's; 1b.6 monitors it. Measured (`sql/11`, `out/24`, labels
  corrected by `sql/12`, `out/25`): 14 days, 672 slots, one run each, starts 1.3–2.8 s after the
  minute, at most 51 s long, and **0 `ERROR` entries of any function** in 672 runs. The logger
  stores `INFO` / `WARN` / `ERROR`, and `sql/11` compared `'E'`, so its zero proved nothing until
  rerun (round-4 finding 3).
- **Deadline, as a resource control only:** before each statement the run reads the DB time and
  rolls back at the phase end; `SET LOCAL statement_timeout` = the time left bounds each
  statement. PostgreSQL 14 disables `statement_timeout` before `COMMIT`, which is why the
  classification uses `t1`.
- **Not changed:** the alert processor. A checkpoint in its reader (its own ticket) would turn
  DELIVERED into "evaluated" and remove contract S.

**`tooling/philips_ct_restamp.js <SME> <entry>`, `late` repair (Q44; round-4 finding 2).** You
run it during the phase. It takes the system's spool lock and follows the ingest protocol:
1. writes `restamp.json` in the entry, `fsync`ed: an operation id, the EAL ids, the old capture
   text;
2. opens a transaction: the advisory lock, `$new = clock_timestamp()::text` inside the phase,
   then `UPDATE log.philips_ct_eal_events SET capture_datetime = $new WHERE id = ANY($ids) AND
   capture_datetime = $old`. The row count must equal the id count, else roll back. Then the
   guard, and `restamp.json` → `committing` with `$new`, `t0` and the pid, `fsync`ed; then
   `COMMIT` and `t1`;
3. **an unknown outcome** (a run finds `restamp.json` `committing`): the same barrier and the
   same preconditions and horizon as an ingest (Q46), then a fresh read of the ids, counted
   against the recorded list. All at `$new` → that operation committed. All at `$old` → aborted.
   Any other mix → ERROR. Finding the same operation committed is not another re-stamp. The
   operation id is kept through reconciliation, and an unresolved intent is never overwritten;
4. classifies `t1` like an ingest: DELIVERED → the entry completes; `late` → it stays `late`, and
   a further repair is a new operation whose old capture is this one's `$new`.

`capture_datetime` is the partition key, so across a month boundary the `UPDATE` moves rows
between partitions; ids don't change. A `late` row that was in fact read is read again after a
re-stamp, giving two detections (counted; accepted).

**`spool.js`, durable pending work, the audit record, retention and replay (Q29 → Q34 →
Q39 → Q41; round-2 findings 2, 6, 7; round-3 finding 5; round 4, addition 4).** The collector replaces each file
every grab, and the buffer resets. So a changed snapshot is copied to local disk before anything
can fail, and stays there until its obligations are met:
- **Spool:** the buffer goes to `spool/philips_ct/<SME>/<file>/<utc>_<sha12>` in the app
  directory (gitignored): temp name, `fsync`, rename, `fsync` the folder. Its `state.json` moves
  `spooled` → `attempting` → `committing` → `committed` → `complete` (or `late`), each write atomic and
  `fsync`ed the same way. An identical sha256 already pending isn't written again.
- **Processing:** each run takes a system's pending entries oldest first. Rule P's multiset
  match makes any order and any repeat idempotent: a repeat inserts nothing, and an older
  snapshot after a newer one inserts only rows really missing (a revision is kept, Q6).
- **Completion** (Q47; round-5 finding 3): an entry is done when its attempt has committed
  (rows and receipt in one transaction), it's DELIVERED, and, with bad lines, its retention is
  written. Then, in this order, each step idempotent and keyed by the attempt id:
  1. the **audit copy**: `state.json`'s content written to
     `done/philips_ct/<SME>/<yyyy-mm>/<attempt id>.json` (temp name, `fsync`, rename, `fsync` the
     folder). If that file already exists with the same content, the step is skipped;
  2. the done-hash;
  3. `state.json` → `complete`, `fsync`ed;
  4. the snapshot bytes deleted, then `state.json`, then the folder.

  `state.json` stays in the entry until last, so the bytes are never left without it. A run that
  finds `complete` finishes step 4. One that finds `committed` redoes steps 1–3 from the recorded
  attempt, with no new attempt and no new save, and redoes the classification from the recorded
  `t1`. A `late` entry keeps its folder (bytes, state, any `restamp.json`) until repaired. No
  obligation outlives its spool entry, so nothing has to be read back from a log (Q41 removes
  Q40's journal).
- **Audit copy:** attempt id, system, file, sha256, row counts, ids, capture text, `t0`, `t1`,
  the classification. It is a copy, never the entry's own state, and nothing reads it to decide
  anything. One file per attempt, under the system's lock, so two systems never write the same
  file. Kept 90 days; older months are removed by hand and counted in capacity.
- **What it covers** (finding 2): a deadline rollback, a failed batch, a missing partition, a
  busy lock, a phase skip, a crash at any step, with the original replaced in the meantime.
- **Bad input (Q29, as agreed):**
  - a file with bad records has its good ones ingested and is logged as partial with an ERROR.
    Its spool entry moves to `retained/philips_ct/<SME>/` with a `reasons.json` (line, field,
    reason per bad record) **before** the entry can complete;
  - a wrong header, or more than max(10, ⌊1% of data lines⌋) bad lines, is a format change:
    nothing is ingested. Data lines are the physical lines after the header, not counting one
    final empty line (so 11 bad lines of 1,000 reject the file, and 10 don't; 11 of 1,100 don't;
    12 of 1,100 do). The bytes are saved to `log.saved_files` (an attempt with no rows) and moved to `retained/` with
    `reasons.json`; an ERROR is logged every run, and the done-hash isn't set (a separate
    "seen" hash stops the same bytes being retained twice).
- **Replay:** `PHILIPS_CT_REPLAY` ingests a retained file or a rollback folder (§9.4) through the
  same path. A fully replayed file moves to `replayed/`. Retained and replayed files are never
  deleted automatically (Q29).
- **A failed spool write** (ENOSPC, permissions): the run still tries the attempt from memory
  (rows and receipt in one transaction). The file is done only if it commits, has no bad lines,
  and it's DELIVERED; otherwise no done-hash, and an ERROR names the snapshot as
  **unspooled**: it is lost if the collector replaces it before a later run succeeds, unless the
  attempt committed (then `log.saved_files` holds it).
- **Capacity (finding 7):** every run measures `spool/`, `retained/`, `replayed/` and `done/` (bytes,
  count, oldest pending). WARN at 1 GB in total or a pending entry older than 1 h; ERROR at 5 GB
  or 6 h (round 4, addition 5: the 1 h WARN is below the measured 3.5 h minimum source lifetime;
  the 6 h ERROR is not, but the spool already holds the bytes). Spooling never waits on ingest. The owner is you, and the response is in 1b.6. For scale: a file that keeps failing is
  retained at every changed grab, up to about 160 MB a day at 3.3 MB; the volume has 1.1 TB free
  (2026-11-24). A healthy run leaves the spool empty.

- **DRY_RUN:** the existing guard refuses `db.tx`. Under `DRY_RUN=1`, `ingest.js` takes no lock
  and opens no transaction, runs the candidate read as a plain `SELECT`, and records the inserts
  and the upsert. Spool, state and retention writes, the save and the Redis `SET`
  are recorded, not done. The phase, the clock check and the guard are reported, not enforced.
- **Not changed:**
  - `scan_seconds` (CT never wrote `logfile_event_history_metadata`);
  - the table and its indexes;
  - the other Philips jobs.
- **Node 16, and tests with `node --test`** (it works on 16.20; no new dependency).
- **Fixtures (Q18):** rows from the 5 copies covering suffixed, comma, multi-line, NULL `Info`,
  coded, twin, `ERROR_BLOB`, I6-merge and `Series … cancelled` rows. System ids become
  `SME00001…`. A scan found no IP, MAC, host, serial or AE title (`out/12`); the builder still
  masks those patterns and fails if any remain.
  - The folder must be lower-case `__tests__/fixtures/philips_ct/`: `.gitignore` ignores any
    path component named `Philips_CT`.
  - Synthetic cases cover what the copies lack: doubled quotes, non-ASCII text, all-NULL Events
    payloads, impossible dates, a key reused with different content.

### 9.6 Performance (measured 2026-11-20)

- **Decode + diff in Node 16** (`scripts/bench_parse.js`, `out/10`): at most 232 ms decode +
  224 ms diff for the largest file (3.33 MB, 30,949 rows). Heap under 100 MB. The projection
  adds one regex per row (to measure in 1b.2).
- **The candidate read:**
  - the complete form (±2 days plus NULL, with a `host_date` filter) takes 251 ms on the server
    for the busiest system (`sql/09`, `out/20`), via a `BitmapOr` on the `host_datetime` indexes;
  - the earlier ±1-day form was 18–69 ms (`out/09`). End to end the read took 1.9 s (`out/11`).
- **Per run, worst case** (all 9 systems changed): about 30–40 s. An unchanged file costs one
  sha256. The phase and the deadline end any run before the next alert window (§9.5).
- **Not measured yet** (finding 8):
  - the first full-buffer write, up to about 31k rows per file, which the old parser also did on
    every reset;
  - lock contention;
  - the alert processor's extra work (CT rows per run up about 45%).

  1b.2 measures the write and the lock. 1b.6 watches the alert processor's run time.
- **December partition:** every `log.*` table ends at `…_2026_11` today. Creating the 2026-12
  partition is routine fleet-wide work, but no CT insert can land in December without it.

### 9.7 Questions

**Round 1, AGREED 2026-11-20** (your answers, as recommended). Three were changed by the design
review, as marked:

19. ~~The transition: O2s.~~ **Superseded by Q27** (review finding 1: O2s suppresses a changed
    row at an old key).
20. **Text form. AGREED: R2. Its date part is superseded by Q28.** `Info` right-trimmed stays.
    The rest stays exact.
21. **Switching files. AGREED:** the `config.log` `UPDATE` in §9.4, run by you after the code
    deploy. The code refuses `.output` names.
22. **Redis. AGREED:** the `.output` offset keys are left alone (reset only in a rollback, §9.4);
    the `<SME>.<file>.csv` hash keys skip unchanged files.
23. **The DST hour. AGREED:** the earlier offset, deterministic, with `host_datetime` kept out of
    the dedupe content. Keys and days on the wall clock (Q8).
24. ~~A malformed file: fail closed for the whole file.~~ **Superseded by Q29** (review finding
    2: a failing file can lose its whole buffer at the next reset).
25. **Revised rows. AGREED:** keep both, as Q6 says. The insight-side rule is decided in PCT-2.
26. **The `.output` files. AGREED:** written and ignored until 5 clean days after the deploy, then
    removed by PCT-C2.

**Round 2, after the design review: AGREED 2026-11-24** (your answers, as recommended):

27. **The transition rule. Recommendation: rule P (§9.3).** Old-parser rows (old time text) match
    the projection of the old pipeline; new rows match exactly; multiset. It reproduces 117,270
    of 117,274 stored rows (the other 4 are genuine revisions, kept). It keeps a changed row at
    an old key. It needs no stored state. Not chosen: O2s (finding 1), or a deploy-time boundary
    (state that can be lost, and a rollback breaks it).
28. **`eal_time` / `event_time` in new rows. Recommendation: the export's `YYYY-MM-DD HH:MM:SS`**
    instead of the old `MM/dd/yy` text.
    - It marks every row's origin, which is what rule P needs.
    - It keeps the 4-digit year, and it's the exact source text.
    - Cost: the two columns hold the old format before the deploy and the new one after. Nothing
      reads them today (§9.2).
29. **Bad input. Recommendation: quarantine and durable retention (§9.5).** *(Extended by Q34
    to all pending input.)*
    - Bad records are set aside and the good ones ingested, with an ERROR.
    - A wrong header or more than max(10, 1%) bad lines retains the whole file and ingests
      nothing.
    - The exact bytes are always kept until replayed, and the same bytes go to `log.saved_files`.
30. *(The rollback part is revised by Q35.)* **Deploy and rollback. Recommendation: the drain and the reconciled rollback in §9.4,** with a
    read-only check tool that prints the commands for you to run.
31. *(Revised by Q36: a timeout can't enforce the commit deadline.)* **The alert window. Recommendation: a no-wait lock and a commit deadline 60 s before the next
    alert-processor start, retrying next run (§9.5).** Not chosen: a time budget with no
    enforcement.
32. **`alert.offline_hhm_conn`. Recommendation:** upsert it inside the EAL transaction, never
    moving it backwards. Today it is overwritten after the insert, outside any transaction.
33. **An invalid site time-zone string. Recommendation:** store `host_datetime` NULL with an
    ERROR. Keys, days and dedupe don't depend on it. Not chosen: falling back to
    `America/New_York` silently, which is right today only for the 4 Florida sites with NULL.

**Round 3, after design review round 2: AGREED 2026-11-24** (your answers, as recommended):

34. *(The separate save is replaced by Q39: the save is inside the ingest transaction.)* **Pending work and archival. Recommendation: spool every changed snapshot to local disk
    first, and keep it until committed and saved (§9.5 `spool.js`).** Extends Q29 from bad input to
    all input. The done-hash follows only a complete entry; the save is awaited; a completed
    entry's local copy is deleted, because `log.saved_files` holds the bytes; WARN/ERROR
    thresholds on disk use and age, owner you. Not chosen: retrying the current path name (the
    snapshot is lost when the collector replaces it), or saving to `log.saved_files` before
    ingest as the only copy (it fails exactly when the DB is down).
35. **Rollback. Recommendation: the tool preserves and sets the offsets itself, under the
    collector's lock (§9.4).** Changes Q30's "prints the commands for you to run": you still run
    it, `check` then `apply`. It always preserves all five published files and verifies the
    copies, and sets an offset only for an `.output` proved covered by content (a legacy
    re-export of the preserved `Logger.mdb`, or a rebuild from a completed `.csv`, byte-equal).
    Otherwise it stops for that system and you decide. Not chosen: printed commands run later (a
    publish in between makes them refer to different files).
36. *(Revised by Q40, then Q41: delivery by construction; assumption D is back.)* **The alert window. Recommendation: assumption D (reader delay ≤ 5 min; measured ≤ 53 s), a
    run phase on the DB clock, the deadline as a resource control, re-stamping the EAL rows of a
    late or uncertain commit, and a read-only audit (§9.5 `coverage.js`).** Changes Q31, which
    claimed a guarantee a timeout can't give. Cost: a rare double detection when an uncertain
    commit was in fact seen, and `capture_datetime` on re-stamped rows is the re-stamp time.
    Not chosen for PCT-1b: a checkpoint in the alert processor. It removes the assumption, but
    it's another app's change, and every log table it reads has the same window. Worth its own
    ticket.
37. ~~Ambiguous class.~~ **Superseded by Q38** (round-3 finding 1: it suppressed a new revision). **Rows with NULL or unrecognised time text. Recommendation: an "ambiguous" class that can
    match either form (§9.3).** New rows are only ever new-form or NULL (validated). Not chosen:
    treating every non-old-form row as new (the old EAL regex can store NULL, so such rows
    would be duplicated after a rollback), or a marker column (a schema change PCT-1b doesn't
    make).

**Round 4, after design review round 3: AGREED 2026-11-24** (your answers, as recommended):

38. **Provenance. Recommendation: only old-form time text marks an old-parser row; everything
    else is matched as new (§9.3).** Replaces Q37. A new row can never be old-form (validated),
    so a projection can only match an old-form row, and a new revision is never suppressed. Cost:
    an old EAL row whose regex capture was shifted by a comma in a quoted field (NULL or
    date-looking `eal_time`) is stored again once, in the new form. 0 such rows stored today, 0
    in the copies; only a rollback could create one. Not chosen: keeping Q37 (finding 1); a
    marker column (exact, but a schema change to an 11.6M-row table and its archive tables).
39. *(Changed by Q42: the outcome is decided by the recorded ids; the receipt is a cross-check.)* **Commit identity. Recommendation: each attempt has an id; its inserted ids are written to
    disk before `COMMIT`; its `log.saved_files` row, in the same transaction, is its receipt;
    an unknown outcome is decided only after taking the same advisory lock; a per-system spool
    lock fences workers (§9.5 `ingest.js`).** Changes Q34: the save is no longer a separate
    step, so it can't fail after the rows commit. Not chosen: capture time as identity (finding
    2); a new receipts table (a schema change, and `log.saved_files`'s key already fits).
40. ~~Proof and re-stamp.~~ **Superseded by Q41** (round-4 findings 2–4). **Coverage. Recommendation: proved per attempt from the reader's run log, else re-stamped by
    row id (at most 3 times), a strict phase, and a 90-day local journal (§9.5 `coverage.js`,
    `journal.js`).** Changes Q36: re-stamp whenever coverage isn't proved, not only when a
    commit is late; assumption D is no longer needed for correctness. Cost: an attempt that was
    seen but can't be proved is tested twice. On 14 days of logs every slot had exactly one
    successful run 1.3–2.8 s after its minute, so a normal `:18` / `:48` attempt is proved by
    the next run. Not chosen: an audit that only reports, with manual repair (finding 6).

**Round 5, after design review round 4: AGREED 2026-11-24** (your answers, as recommended):

41. *(K and D replaced by contract S in Q45; the audit step changed by Q47.)* **Coverage. Recommendation: deliver each attempt into exactly one scheduled reader window by
    construction: the phase, a guard on the DB clock before `COMMIT`, a host/DB clock check;
    classify it DELIVERED or `late` from `t1`; leave reader success to the alert processor's own
    monitoring (§9.5 `coverage.js`).** Supersedes Q40's per-attempt proof, automatic re-stamps
    and journal. Round 4 found three gaps in that machinery: re-stamp crash recovery, the error
    filter, and historical clock bounds. Each could be fixed only with more of it, and the
    journal would need its own framing and concurrency. Cost: PCT-1b no longer checks that the
    reader *succeeded* for each attempt, only that its rows land in exactly one scheduled window.
    A failed or missed run loses those rows' alerting, as it already does for every other log
    table. Evidence: 672 of 672 slots, one run each, 0 `ERROR` entries in 14 days (`out/24`,
    `out/25`). Assumptions K (clock within 60 s at the reader's start) and D (CT query within
    4 min) are stated and monitored, not proved. Not chosen: fixing Q40 (the coverage machinery
    would outgrow the parser); a checkpoint in the alert processor (the exact fix, but another
    app's change; recommended as its own ticket).
42. *(Changed by Q46: automatic decisions only within 24 h and with the partition attached; otherwise a manual, archive-aware check.)* **Commit outcome. Recommendation: decide an unknown outcome by the recorded inserted ids,
    after the barrier; the receipt is a cross-check; a mixed result stops for you; ERROR if still
    unresolved after 24 h (§9.5 `ingest.js`).** Changes Q39. Sequence ids are never reused, and
    nothing deletes from `log.philips_ct_eal_events`. `log.saved_files` rows are deleted after
    48 h by `delete_old_files` in both `hhm_rpp` and this app (`jobs/aux_jobs/clear_old_db_files.js`).
    Not chosen: exempting CT receipts from that cleanup (a change to a job two apps share, for
    one consumer).
43. **Barrier liveness. Recommendation: `idle_in_transaction_session_timeout` 2 min and
    keepalives on the ingest session; the backend pid recorded before `COMMIT`; the barrier lock
    and the id/receipt read as separate statements under Read Committed; an unresolved outcome
    blocks only that system's ingest, logs `pg_stat_activity` for the pid, WARN at 30 min and
    ERROR at 2 h; pending-age WARN at 1 h, ERROR at 6 h (§9.5).** Not chosen: terminating the
    original backend automatically (a backend in `COMMIT` must finish, and the app role may
    lack the right).
44. **`late` repair. Recommendation: a manual `tooling/philips_ct_restamp.js` that follows the
    ingest protocol: intent and ids on disk before `COMMIT`; the outcome decided after the
    barrier by where the ids are (old or new capture); the same guard and classification
    (§9.5).** Replaces Q40's automatic re-stamps (round-4 finding 2). Not chosen: automatic
    re-stamps (`late` is expected never, and a person should look first).

**Round 6, after design review round 5: AGREED 2026-11-24** (your answers, as recommended):

45. **Reader timing. Recommendation: state the reader's timing as contract S, per nominal slot:
    each scheduled run's CT snapshot at DB time within `[slot − 60 s, slot + 5 min]`, launch,
    bootstrap and clock error included; a run outside S counts as a reader failure, monitored by
    `sql/13` in 1b.6 (§9.5 `coverage.js`).** Changes Q41: replaces assumptions K and D, which
    bounded time from the process start and from the writer's sample, not from the slot (round-5
    finding 1). With the phase and `t1 < N_next − 90 s`, S gives exactly one read across the
    three adjacent slots. Measured: every run in 14 days inside `[slot + 1.3 s, slot + 53 s]`
    (`out/24`, `out/26`). Not chosen: a per-attempt proof of the reader's timing (Q41's narrowing).
46. **Outcome horizon. Recommendation: decide an unknown outcome automatically only within 24 h
    of `t0` and only while the capture's partition is attached; otherwise keep it unknown with
    an ERROR, and decide it with a read-only, archive-aware `tooling/philips_ct_outcome.js`
    (§9.5 `ingest.js`).** Changes Q42 (round-5 finding 2): the archive job detaches CT
    partitions after six months, so absence from the parent isn't proof of an abort. Not
    chosen: searching `archive_log` automatically (a rare path; a person should see it).
47. **Completion order. Recommendation: write a separate audit copy keyed by attempt id, then
    the done-hash, then mark `state.json` `complete`, then delete the bytes and `state.json`
    last; every step idempotent (§9.5 `spool.js`).** Changes Q41's audit record, which moved the
    entry's own state away before the bytes were deleted (round-5 finding 3). Not chosen:
    letting recovery read the audit folder (it would make the audit part of the state machine).

### 9.8 Steps and exit criteria

| Step | Content | Exit | Earliest |
|---|---|---|---|
| **1b.0 Plan** | this section | Q19–Q26 AGREED | **done 2026-11-20** |
| **1b.0r Design review** | round 1: `REVIEW-PCT1B-PLAN-CODEX.md` (3 P1, 6 P2), answered in §9.9. Round 2: `REVIEW-PCT1B-PLAN-CODEX-2.md` (2 P1, 5 P2), answered in §9.10. Round 3: `REVIEW-PCT1B-PLAN-CODEX-3.md` (2 P1, 4 P2), answered in §9.11. Round 4: `REVIEW-PCT1B-PLAN-CODEX-4.md` (0 P1, 4 P2), answered in §9.12. Round 5: `REVIEW-PCT1B-PLAN-CODEX-5.md` (0 P1, 3 P2), answered in §9.13. Round 6: the updated handoff → `REVIEW-PCT1B-PLAN-CODEX-6.md` | no open P1/P2; Q27–Q37 AGREED (**done 2026-11-24**); Q38–Q40 AGREED (**done 2026-11-24**); Q41–Q44 AGREED (**done 2026-11-24**); Q45–Q47 AGREED (**done 2026-11-24**) | now |
| **1b.1 Build** | `csv.js`, `rows.js`, `legacy.js`, `time.js`, `ingest.js`, `spool.js`, `save.js`, `coverage.js`, `index.js`, `tooling/philips_ct_rollback.js`, `tooling/philips_ct_restamp.js`, `tooling/philips_ct_outcome.js`; masked fixtures; `node --test` | **Decoder:** literal backslashes, `\\n` vs `\n`, doubled quotes, CRLF, tabs, adjacent escapes, a trailing lone backslash, empty vs NULL, non-ASCII, a bad-quote line. **Rows:** header, field count, key format, impossible dates, all-NULL Events payload, kind round-trip, Q28 text. **Legacy oracle** (finding 6): the projection against the **actual old regexes and helpers** on synthetic doubled quotes in `Info`, `File` and `ErrNum`, tabs, backslashes, Unicode whitespace, empty vs NULL, the I6 merge. **Transition identity** (finding 1): old split A → same A → changed B at the same key over separate snapshots; reset and clock reversal; a nonstandard `EAL` value; old and new candidates together; duplicate stored rows; order permutations. Assert which rows are inserted, not just totals. **Time:** DST both ways, NULL and invalid zones. **Provenance** (round 2, addition 5; round 3, additions 1–2): `Info` containing `","`; NULL source `EalTime` / `EventTime`; unrecognised time text; rows the old parser stores during a rollback; **the new-only A/B pair** (A: `Info` `alpha"`, NULL time; B: `alpha","beta`, a time) in both orders, an older replay after the newer grab, a Redis loss, repeats and a rollback interval, asserting the stored contents (both A and B kept); **comma-shifted old EAL rows** (`File` or `ErrNum` with a comma, a date-looking later field) through the real old helper and whole-file scan, stored once more in new form, counted; old/new syntax tested as a property, not trusted from a fixture label; an invalid zone with every incoming `host_datetime` NULL (the span from raw keys finds earlier non-NULL rows). **Whole-pipeline oracle** (addition 7): the old collector's shell steps (the pre-PCT-C script, `sort` under the cron environment's locale) and the old parser's whole-file `/g` scan over sequential snapshots, against the per-row projection: byte tails starting inside a record, I6 consuming the next timestamp, an I6 record at EOF, changed adjacency between grabs. **Thresholds** (addition 6): 10 and 11 bad lines; 1% and one above on 999, 1,000, 1,001 and 1,100 lines. **Phase and deadline** (round 3, addition 4): pure functions of the exact capture text: `N + 6 min` exactly, 1 µs before and after, both reader minutes, hour and day boundaries, the same for re-stamps; capture text round-trips without loss. **Coverage classification** (round 4, findings 3–4): pure functions of the exact capture text, `t1` and the measured offset: `t1` at `N_next − 90 s` exactly and 1 µs either side; the guard at the phase end exactly; offset + round trip at 10 s and just above (no ingest); signed offsets; an offset change between runs over 10 s → WARN naming the attempts in between; a later sample, taken after a clock correction, never reclassifies an earlier attempt. **Slot contract** (round 5, finding 1): the readers at N, N_next and N_next + 30 min varied independently over `[slot − 60 s, slot + 5 min]` and just outside it, with launch and bootstrap delays (Codex's delayed-start timeline included), against the real 30-minute predicate: inside S, every DELIVERED commit is read exactly once; outside S, the case is a reader violation, not a parser pass. **Spool state machine:** every transition and every crash point, with a fake filesystem that fails each write; two workers on one system (the spool lock); pending entries processed while the configured file is missing (addition 5); a crash after each completion step (Q47), the audit copy's rename boundary included: the original attempt id and classification survive, no new attempt or save happens, the audit copy exists once, and the folder is removed in the end; two systems completing at once (separate audit files, no shared file). Each test is checked to fail under a matching mutation. No network, no real DB, every child process bounded | after 2026-11-24 18:53 UTC, once you confirm the cutover closed |
| **1b.2 Exactness and rehearsal** | throwaway PostgreSQL 14 (local `initdb`, socket only) with the real DDL: monthly partitions including a month boundary, the indexes, `alert.offline_hhm_conn`; the real parser code and SQL | **DB = MDB** for each copy on an empty DB, both tables: the multiset of (key, content) equals an independent reference (plain `mdb-export` → Python) under Q28/R2 text, including suffixed, comma, multi-line and the 43 `Series … cancelled` rows. **Re-run, Redis cleared:** 0 inserted. **Reset** (half a buffer, then the full one, then a disjoint one): 0 duplicates. **Production-shaped seed** (finding 7): only `log`-eligible old rows from `sql/05`, with their real capture times; inserts = **113,552** in total, matching the per-copy table in §9.3, with their identities checked. Then a repeat, a Redis loss and a changed snapshot. **Candidate SQL** (finding 4): stored NULL `host_datetime`, a zone change of 26 h, a suffixed key: each inserted row visible to its next read. **Transactions** (required addition 5): two connections on one file; a failure in a later batch; a kill before commit, after commit but before Redis, and after Redis but before the save; the deadline expiring; reader visibility at a simulated `:24`. **Pending work** (round 2, additions 2 and 6): a deadline rollback, a missing partition, a late-batch failure and a busy lock, each followed by a source reset with the original replaced: the exact accepted identities recovered from the spool; a crash after a partial ingest but before retention or the hash; a failing in-transaction save (the whole attempt rolls back), and a death after `COMMIT` but before completion, with the original replaced: `log.saved_files` ends with the exact bytes once and the entry's state is right; ENOSPC, a permission failure and a death during a spool or retention write (addition 7): no done-hash, a visible **unspooled** ERROR, and recovery only where a durable copy exists (the spool, `retained/`, or the attempt's `log.saved_files` row if it committed). Assert bytes and states, not just row counts. **Commit reconciliation** (round 3, addition 3): another transaction's rows at the same capture time, the other kind at the same time; a check while the original `COMMIT` is still running (a test-only deferred constraint trigger that sleeps at commit; the barrier waits for it); committed with the response lost (the trigger sleeps, the client drops its socket, the server completes the commit) versus aborted (the backend terminated before `COMMIT`): assert exactly which rows are acknowledged. **Receipt lifecycle** (round 4, finding 1): the receipt deleted before recovery (as the 48 h cleanup does), with zero and with nonzero recorded ids: a commit is recognised by its ids, an abort by their absence, a mixed set or a receipt without its ids stops with an ERROR and no fresh attempt; unrelated receipts at the same time; a `committing` entry 24 h old → ERROR and no automatic decision afterwards. **Archive** (round 5, finding 2): a committed manifest after receipt deletion with its partition detached into `archive_log`, and a real abort of the same age: neither decided automatically; the outcome tool finds the archived ids and the true absence respectively. **Barrier** (round 4, additions 5–6): the original backend still in `COMMIT` (the sleeping trigger) and idle in its open transaction (the 2 min timeout ends it); the lock timeout leaving the outcome unknown, the pid diagnostics logged, the system's later snapshots still spooled; the actual recovery SQL with the original finishing during the wait. **`late` and repair** (round 4, finding 2): a slow `COMMIT` (the sleeping trigger) past `N_next − 90 s` → `late`, kept in the spool, an ERROR each run; then the re-stamp tool, with a kill before `COMMIT`, a lost response after `COMMIT`, and a kill before its state write: on restart, ids found at the new capture are recognised as that operation, not re-stamped again; repeated restarts; an aborted repair; missing and mixed ids; a repair that itself ends `late`, then a second repair whose old capture is the first's new one; new snapshots still spooled while an outcome is unknown; across a month boundary (rows move partitions, ids unchanged); a simulated reader query overlapping the `UPDATE`. **Retention:** a bad line among good ones; repeated failure, then the buffer replaced; a bad header; replay after the original is gone; capacity WARN/ERROR. **Alert coverage** (additions 3 and 4): a slow `COMMIT` (a test-only deferred constraint trigger that sleeps at commit time), a client pause between statements, a lost commit acknowledgment (the backend killed during `COMMIT`), runs outside the phase (Codex's `:24:10` timeline is refused), a simulated reader query at N + d for several d, including both ends of D: every DELIVERED attempt's EAL rows are read by exactly one simulated reader query (each adjacent reader's snapshot varied over `[slot − 60 s, slot + 5 min]`), and every other commit is `late`. **Rollback matrix** (finding 1, addition 1): the collector stopped after each of its five renames, and two consecutive partial publishes; files replaced between `check` and `apply`; a grab holding the lock; the copies verified before any offset changes; then the originals deleted and every row recovered from the preserved set by replay. `UNCOVERED` leaves the offset unchanged; a message alone isn't a pass. Offset ordering; redeploy with existing hashes. Measured: the first full-buffer write and the lock behaviour | after 1b.1 |
| **1b.3 DRY_RUN** | `DRY_RUN=1` from the dev checkout against prod (read-only sessions) | (a) prod's files as they are: every CT file skipped silently, 0 writes, 0 CT errors. (b) `DEV_FILE_PATH` → the copies' `.csv` for SME20598 / SME18534 / SME18535: the planned inserts equal the "`log` only" rule-P counts (SME20598: 15,197 Events, 0 EAL; SME18534: 623 Events, 0 EAL; SME18535: 14,055 Events, 2 EAL, the revised rows) against the real stored rows, run time recorded. The parity check doesn't apply: `hhm_rpp` no longer runs CT, and MDB is the reference | after 1b.2 |
| **1b.4 Code review** | `REVIEW-PCT1B-PARSER-HANDOFF.md` → Codex → `REVIEW-PCT1B-PARSER-CODEX.md`; fixes recorded here | the review closed; then commit with your OK | after 1b.3 |
| **1b.5 Deploy** (you) | confirm `crontab -l` has no `hhm_rpp … philips_ct` line; the 2026-12 partition if it's December; promote `DEV` → `STAGING` → `PROD`; the drain (§9.4); pull; the `config.log` `UPDATE`; watch the next run | the first run: `PHILIPS_CT` warn/error 56 → 0 (all files missing, silent), nothing inserted | after 1b.4 |
| **1b.6 Monitor** | 5 clean days; and once a CT system is reachable, its first `.csv` grab | 5 clean days of runs: the spool empty after every run, no retained files, no capacity WARN, no `late` entry, no unknown outcome, no offset-change WARN. The alert processor (`sql/13`): one run per slot, every run inside S, none with an `ERROR` entry (`type = 'ERROR'`, `testRowForLogAlert` included). A capacity WARN/ERROR: you read `reasons.json`, fix or replay, and move old retained files elsewhere by hand. **On the first live capture:** DB = that grab's `Logger.mdb` (keys and content, both tables); 0 duplicates on the following runs; the new EAL rows DELIVERED, and read by the next alert-processor run (its run log); its run time recorded against the days before. Close-out needs the live capture (§6), so it waits on reachability (§8.1) | after 1b.5 |

### 9.9 Design review round 1 (Codex, 2026-11-20): what changed

Review: `REVIEW-PCT1B-PLAN-CODEX.md`. Verdict: change the design before building. Codex checked
the installed `mdb-export` on both tables of all 5 copies: 0 row-count mismatches and 0 field
mismatches after one-pass unescaping, and 0 unknown escape pairs.

| # | Finding | Disposition |
|---|---|---|
| 1 P1 | O2s's key-only match suppresses a changed row at an old split key, and a nonstandard `EAL` value would make new rows key-only too | **Agreed.** Replaced by rule P (§9.3, Q27): projection matching for old-parser rows, provenance from the time text (Q28). Measured: the projection reproduces 117,270 of 117,274 stored rows (`out/18`) |
| 2 P1 | Fail-closed retries can lose a whole buffer when the scanner resets | **Agreed.** Quarantine bad records, ingest the rest, retain the exact bytes durably with a replay path, and save the same bytes (§9.5, Q29) |
| 3 P1 | Rollback's end-of-file offset reset skips unread rows; an in-flight old process isn't covered by the advisory lock | **Agreed.** A drain at deploy; a reconciled rollback with a read-only check tool and retention of unreconciled snapshots (§9.4, Q30). Rule P's provenance holds across a rollback |
| 4 P2 | The candidate read misses NULL `host_datetime` and zone changes over 24 h | **Agreed.** ±2 days OR NULL, plus a `host_date` filter, complete for accepted keys (251 ms, `out/20`); impossible dates rejected; invalid zones → NULL + ERROR (Q33). 0 NULL `host_datetime` in `log` today (`out/19`) |
| 5 P2 | An all-NULL Events payload reads back as EAL | **Agreed.** Validation requires an Events column set; a kind round-trip check before insert; the same predicate in SQL and JS |
| 6 P2 | R2 isn't old-parser-equivalent for doubled quotes in `Info`, `File`, `ErrNum` | **Agreed.** Transition comparison now uses the projection with the real old regex and helpers, not trimming plus date text. The 77,260-row claim is limited to the measured data |
| 7 P2 | Seeding archived rows doesn't model the runtime read (113,552 vs 62,208) | **Agreed.** The rehearsal seeds `log`-eligible rows only, expected total 113,552; the all-history count is kept as a separate study (§9.3) |
| 8 P2 | The alert-window budget isn't enforced | **Agreed.** No-wait lock, capture time at the lock, commit deadline before the next alert run, retry next run (§9.5, Q31). The heartbeat goes into the same transaction (Q32) |
| 9 P2 | The keys are primary keys (`mdb-schema … postgres`) | **Agreed; corrected** in §9.1 (`out/17`). Multiset handling stays for stored history. DST tests use sequential snapshots |

### 9.10 Design review round 2 (Codex, 2026-11-24): what changed

Review: `REVIEW-PCT1B-PLAN-CODEX-2.md`. Verdict: revise before building. Codex independently
re-projected the records rebuilt from the `.csv` files: 117,270 matches, 4 `Info` revisions,
873 I6 wildcard matches. It found no counterexample to the I6 wildcard, and found the 1% / 10-line
policy and a hash after a partial ingest reasonable once retention is durable and acknowledged.

| # | Finding | Disposition |
|---|---|---|
| 1 P1 | Rollback's EOF reset after a partial collector publish: the `.output` can be newer than any `.csv`, so preserving the `.csv` doesn't cover it; mtimes don't identify a publish; the collector keeps running | **Agreed.** The tool holds the collector's `.grab.lock`, preserves all five files with verified copies, sets an offset only for an `.output` proved covered by content, and stops on `UNCOVERED`. Replay includes a fresh export of the preserved `Logger.mdb` (§9.4, Q35) |
| 2 P1 | A valid snapshot whose ingest keeps failing (deadline, batch, missing partition, busy lock) is lost when the buffer resets | **Agreed.** Every changed snapshot is spooled first and stays until committed and saved (§9.5 `spool.js`, Q34) |
| 3 P2 | `statement_timeout` doesn't bound `COMMIT` (PostgreSQL 14 disables it first), nor client time | **Agreed.** The deadline is a resource control on the DB clock; a late or uncertain commit is detected and its EAL rows re-stamped (§9.5 `coverage.js`, Q36) |
| 4 P2 | A commit before the nominal deadline can still miss every reader window (manual run at `:24:10`; a delayed reader) | **Agreed.** Coverage stated against actual reader snapshots: assumption D (measured: runs end ≤ 53 s after the minute, `out/21`), a run phase that refuses the counterexample, re-stamp recovery, a read-only audit. The reader isn't changed (Q36) |
| 5 P2 | The old EAL regex can store NULL `eal_time` (`Info` with `","`), so time text isn't a complete provenance test | **Agreed; reproduced** with the repo's regex. NULL or unrecognised time text is an ambiguous class that can match either form; new rows are validated to new-form or NULL; the counters are narrowed to what's observable (§9.3, Q37) |
| 6 P2 | A save failure after the hash is set is never retried; `gzip_file.js` doesn't await its insert | **Agreed.** The hash follows the acknowledged save; the CT path has its own awaited `save.js`; a failed save stays pending (§9.5) |
| 7 P2 | Permanent retention has no capacity or failure contract | **Agreed.** Completed entries leave the spool; disk and age WARN/ERROR thresholds with an owner; a failed retention write blocks completion; `replayed/` counted (§9.5, 1b.6) |

All 7 required additions to 1b.1/1b.2 are in §9.8. Also corrected: the round-2 handoff called the
plan uncommitted; it was committed as `a3b3a75`.

### 9.11 Design review round 3 (Codex, 2026-11-24): what changed

Review: `REVIEW-PCT1B-PLAN-CODEX-3.md`. Verdict: revise before building. Codex found the
coverage condition (`t < s`, `s − 30 min < c`) right, and the locked rollback, preservation and
spool sound for what they cover.

| # | Finding | Disposition |
|---|---|---|
| 1 P1 | The ambiguous class lets the projection of a new revision B suppress a new NULL-time row A; A → B → A → B stores only A | **Agreed.** Q38: only old-form time marks an old row; new rows, NULL included, match exactly. A and B are both kept in any order (§9.3) |
| 2 P1 | Rows at a capture time don't prove which transaction committed (another attempt at the same time; a `COMMIT` still running; ms truncation in node-postgres) | **Agreed.** Q39: attempt id; inserted ids `fsync`ed before `COMMIT`; the `log.saved_files` row in the same transaction is the receipt; the outcome is decided only after the advisory-lock barrier; capture time kept as text; a per-system spool lock (§9.5 `ingest.js`) |
| 3 P2 | An old EAL row can have new-form time (a comma in `File` shifts the capture) | **Agreed; reproduced.** Under Q38 such a row is matched as new, so the cost is one deliberate duplicate, bounded: 0 stored, 0 in the copies (`out/19`, `out/23`) |
| 4 P2 | `c = N + 5 min` exactly fails the strict reader predicate | **Agreed.** Strict phase `(N + 6 min, N_next − 2 min)` on the exact capture text, re-stamps included (§9.5) |
| 5 P2 | Spool completion can delete outstanding coverage work and its only record | **Agreed.** A 90-day journal holds each committed attempt and its coverage events; coverage is read from the journal; the spool entry is deleted only after its journal record is durable (§9.5) |
| 6 P2 | The timing study rounded runs by end time and read a field the logger doesn't write; run-log rows exist for failed runs | **Agreed.** Redone by start time (`sql/11`, `out/24`): 672 of 672 slots, one run each, 1.3–2.8 s after the minute, 0 failures. Coverage is now proved per attempt from successful runs (start − ε > `t1`, end + ε < `c` + 30 min), else re-stamped (Q40) |

All 7 required additions are in §9.8 (1b.1 and 1b.2). Dispositions 5 and 6 (the journal and the
run-log proof) are superseded by Q41 (§9.12).

### 9.12 Design review round 4 (Codex, 2026-11-24): what changed

Review: `REVIEW-PCT1B-PLAN-CODEX-4.md`. Verdict: no new P1; 4 P2 before building. Codex reran the
round-3 A/B counterexample under Q38 (both rows kept, both orders, with repeats). It found the
in-transaction receipt, the pre-`COMMIT` id manifest, the spool fence and the barrier sound
within the receipt's lifetime, and the coverage inequality and the strict phase right.

| # | Finding | Disposition |
|---|---|---|
| 1 P2 | `delete_old_files` removes receipts after 48 h; a `committing` entry recovered later looks aborted | **Agreed; checked** (`jobs/aux_jobs/clear_old_db_files.js`, also in `hhm_rpp`). Q42: the outcome is decided by the recorded ids (never reused, never deleted); the receipt is a cross-check; a mixed result stops for you; ERROR at 24 h unresolved (§9.5 `ingest.js`) |
| 2 P2 | A re-stamp has no durable intent or outcome protocol; a crash after its `COMMIT` loses the new capture | **Agreed.** Q41 removes automatic re-stamps; Q44's manual tool for `late` entries has intent on disk before `COMMIT` and decides its outcome after the barrier by where the ids are (§9.5) |
| 3 P2 | The error filter compared `'E'`; the logger stores `'ERROR'`; `testRowForLogAlert` failures were not excluded | **Agreed; reproduced and rerun.** `sql/12`, `out/25`: the stored labels are full words, and the corrected query finds **0 `ERROR` entries of any function in 672 runs**. Under Q41 the parser no longer certifies reader success; 1b.6 monitors it with the corrected filter |
| 4 P2 | A current clock sample doesn't bound a historical reader timestamp | **Agreed.** Q41 uses no historical reader timestamp: the offset is checked before the attempt (forward, ≤ 24 min to the reader), assumption K is stated, chrony's state recorded, and an offset change between runs raises a WARN naming the attempts in between |

Required additions: 1 → 1b.2 receipt lifecycle; 2 → 1b.2 `late` and repair; 3 → `out/25`, 1b.6;
4 → Q41 removes the shared journal: one audit file per attempt under the system lock;
5 → Q43, 1b.2 barrier; 6 → separate statements under Read Committed (§9.5), 1b.2 barrier.

### 9.13 Design review round 5 (Codex, 2026-11-24): what changed

Review: `REVIEW-PCT1B-PLAN-CODEX-5.md`. Verdict: no new P1; 3 P2 before building. Codex found
Q41's narrowing acceptable (reader success stays the alert processor's monitored contract), Q42
sound within the searchable horizon, Q43 adequate, and no new defect in Q44's protocol.

| # | Finding | Disposition |
|---|---|---|
| 1 P2 | K and D bound time from the writer's sample and the process start, not from the nominal slot; a delayed previous invocation reads the row twice | **Agreed.** Q45: contract S per slot, snapshot in `[slot − 60 s, slot + 5 min]`, all delays included; outside S = a reader failure, monitored (`sql/13`, `out/26`) |
| 2 P2 | The archive job detaches CT partitions after six months; a long-delayed recovery sees no ids and decides "aborted" | **Agreed; checked** (`fse_dispatch` `odd-jobs/archive-partitions.sql`). Q46: automatic decisions only within 24 h and with the capture's partition attached; otherwise unknown + ERROR and the read-only, archive-aware `tooling/philips_ct_outcome.js` |
| 3 P2 | Renaming `state.json` into the audit folder removes the restart state before the bytes are deleted | **Agreed.** Q47: a separate audit copy keyed by attempt id; `complete` marked; bytes deleted before `state.json`; every step idempotent |

Also from round 5: zero recorded ids are handled before "all present"; all / some / none are
counted against the recorded list; sequence advance is never evidence; a pid never authorises a
termination; a repair keeps its operation id and never overwrites unresolved intent, and a second
repair starts from the first's new capture; §9.4's replay text follows Q38; the capacity note
separates the 1 h WARN from the 6 h ERROR. All of these are in §9.5 and §9.8.
