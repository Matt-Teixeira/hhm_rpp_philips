# Philips CV Insights — plan

**Current state (2026-11-25):** **CV-0 (decide) is DONE: AGREED 2026-11-25.** You accepted the
recommendation in every §3 question (Q1–Q11) as written. Evidence was read-only, and there has been
no code, no commit, and no write to prod, Redis, `/home/prod` or the collector folders. Evidence:
`~/philips_cv_evidence/` (README is the index).

**Next:** CV-1b (the parser fix, this repo) and the collector session (Q3), with CV-2a (the code
mapping, read-only) in parallel. Each starts with its own detailed plan and your go-ahead.

**In one paragraph:** the parser stores what it reads faithfully. On every sampled file, row counts
and every field match an independent reader, with two small exceptions (I1, I2). The real losses
are upstream of the parse:
- **I3:** 158 daily exports in 2026 never reached the DB, which leaves 35 gaps (146 system-days) in
  the last 120 days. 129 of those zips are intact on disk.
- **I4:** duplicates arrive by design. LOD re-copies daily rows, consecutive exports overlap, and a
  device sometimes exports the same window twice.

The content is far richer than GE CV. It is readable English with codes. It logs normal use (exams,
fluoro, exposures, runs) and tube and generator identity, not only errors. **It also holds some
PHI** (dates of birth and patient IDs typed at the console). Recommendation: fix ingest first
(CV-1b) while the mapping is drafted read-only (CV-2a), then the GE pipeline as usual.

Method, as for GE CT/CV/MRI and Philips CT:
- read-only evidence → design and questions → phases with exit criteria;
- independent-SQL verification, rehearse → apply → verify;
- a Codex review per step, closed once the findings converge;
- a commit only when you say so.

---

## 1. What the data supports (verified against prod, read-only, 2026-11-25)

### 1.1 Coverage: 20 of 76 systems send data

| Group | Systems | Why |
|---|---|---|
| **Active** (rows ≤ 7 days old) | **20** | polled and reachable |
| Polled, stale (last rows 8–120 days ago) | 8 | polled; last export between 2026-08 and 2026-11 |
| Polled, no rows in 120 days | 11 | unreachable. Only SME00467 and SME02548 log an error (`max-retries exceeded`, every run). The others drop out silently: `list_new_phil_cv_files` returns `null` with no error |
| **Not polled** (`systems.process_log = false`) | 37 | the collector skips them. 6 of them had rows until about 2026-08-03 (SME01397, SME11530, SME11925, SME11927, SME13488, SME13529), so someone switched them off then |

- All 76 have `run_group = 1` and both files configured (`EventLog`, `lod_EventLog`). 75 use
  regex `eventlog`, and SME14784 uses `eventlog_2`.
- 15 configured systems have no folder on disk at all.
- The collector polls 39 systems (`process_log = true`). In a 24 h window only 21 got as far as
  listing their daily folders.
- `log.philips_cv_eventlog` starts on 2026-05-01: older partitions are archived. It holds 42.4 M
  rows.

### 1.2 The source: `EventLog.txe`, a daily export

- **How it arrives:**
  1. The cath system writes `SaveDevData/daily_YYYY_MM_DD/Event.zip` itself, once a day around 07:00
     local time.
  2. The collector (`phil_cv_21.sh` / `_22.sh`: FTP or SFTP) fetches that zip into
     `files/<SME>/daily_…/`.
  3. `parse_event_zip.sh` unzips it to `EventLog.txe` + `EventLogSystem.txe`.
- **Format:**
  - The file is ISO-8859-1 text with CRLF line ends.
  - Fields are separated by byte `0xE1` (`á`). Node reads the file as UTF-8, so `0xE1` becomes `�`,
    which is why the parser regexes split on `�`.
  - The newest event comes first. Timestamps have one-second resolution.
- **Two record shapes:**
  - **Full** (14 fields, ~98%): `category, date, time, error_type, num_1, Technical Event ID,
    Description, Channel Identification, Module, Source File, Line Number, Memo, SubsystemNumber,
    ThreadName`. Some software versions write 12 fields (no Subsystem/Thread). `eventlog_2` systems
    write 13 (no Channel).
  - **Short** (6–11 fields): Windows-style events (`sshd`, `Service Control Manager`, McAfee), with
    the text in `message`.
- **Each daily file covers the time since the previous export**, not one calendar day. Consecutive
  files overlap by about 75–340 records (0.1–2%). After a quiet weekend one file covers 3–5 days.
- **`lod_EventLog.txe`** is "log on demand": a separate folder that someone triggers on the device.
  The collector mirrors it and renames the newest export into the system root. It changes rarely:
  11 systems in 120 days, 1–6 times each.
- `EventLogSystem.txe` (the Windows system log) and `Event.zip` (the same two files) aren't parsed.
  They don't need to be.

### 1.3 Ingest integrity (checked first, as asked)

**Method.** An independent Python reader (`scripts/db_vs_file.py`) reads the raw bytes, decodes
them as Latin-1, splits on `0xE1` and parses fields by label. It doesn't reuse the parser's regex.
Its output was compared row by row and field by field with the DB rows of the same capture, in `id`
order. Files checked: 4 `eventlog` files (SME01393 daily, SME18533 daily, SME20610 daily,
SME01394 lod) and 1 `eventlog_2` file (SME14784), **152,141 DB rows in total**.

**What is right:**
- Row counts equal the file record counts on every capture checked (12 captures, 5 systems,
  `out/06_per_capture.tsv`).
- On the `eventlog` files, every field of every row equals the reference, apart from I2. That covers
  147,297 rows.
- Host times convert correctly (07:01 EST → 12:01Z).
- The repeated lines inside a file (~10%) are **real events**, not copies. For example, the UI fires
  `Command: Minimize` several times within one second. They must be kept.

**What is wrong:**

| # | Finding | Size | Where it's fixed |
|---|---|---|---|
| **I1** | **`eventlog_2` drops records.** It has no "message" branch, so short records fail. It requires digits in `SubsystemNumber`, but Image Detector (embedded) events write a binary byte there (`SubsystemNumber: \x05`). A stray empty field after `Memo` also fails | 72 of 4,916 records (1.5%) on SME14784, the only `eventlog_2` system. 57 of them are Image Detector events | parser |
| **I2** | **Non-UTF-8 bytes become `�`.** Besides the separator, the files contain `0xA0` (non-breaking space), `0x83`, and accented letters. In `message` that only garbles text. Inside `Memo` it **cuts the memo and loses `subsystem_number` and `thread_name`**. Inside `Description` it would push the whole record into the message branch (not seen in the samples) | 18,341 rows in 30 days hold `�` (0.4%); structural loss on 2 rows in the SME18533 sample | parser |
| **I3** | **Exports that never reach the DB.** When one collector run fetches two or more daily folders and stops before its unzip loop, only the newest folder is unzipped later. The next run re-checks only `last_aquired_dir`. Example: SME00445 `daily_2026_11_11`, fetched at 12:42 on 11-12 in the same run as 11_12; that run logged 25 grabs, 0 unzips and no error. The parser then moves its Redis pointer (`<SME>.last_parsed_phil_cv_daily`) past folders that have no `EventLog.txe` and never comes back | **158** such folders in 2026 (129 with an intact zip, 32 empty, 1 truncated). **35 gaps, 146 system-days** in the last 120 days. **45 zips since 2026-05-01 hold 589,064 records that can be recovered** | collector + parser (+ backfill, Q4) |
| **I4** | **Duplicates by design.** (a) **LOD re-copies daily rows**: 2,167 of 2,168 SME01394 lod records are also in its daily files, and the whole lod file is re-parsed whenever its size changes (104,937 lod rows in 120 days). (b) **Boundary overlap**: ~75–340 records per export are stored twice. (c) **Double exports by the device**: SME20610's 11-03 zip holds the same 10-09 → 11-03 window twice (222,399 + 222,440 records). 16 captures re-cover more than a day of the previous one, 12 of them on SME14784 | a few % overall; up to 2× on single days | insight extract (Q5) |
| I5 | **No natural key.** The table's only key is `(id, capture_datetime)`. Nothing in the DB stops a re-ingest | — | insight extract (Q5) |
| I6 | **Time zones.** 10 systems have a NULL site time zone (SME20233, SME20596, SME20597, SME20600, SME20601, SME20603, SME20604, SME20610, SME20612, SME21636). `generateDateTime` then assumes `America/New_York`, so `host_datetime` may be off by 1–3 h. `host_date` / `host_time` (the wall clock) are unaffected | 10 systems, 2 of them active | none in code (Q8) |

Not a CV defect, but due soon: the newest partition is `log.philips_cv_eventlog_2026_11`. **The
`2026_12` partition doesn't exist yet.** `fse_dispatch` `add-pg-table-partitions.sql` creates
"current date + 1 month". Check it exists before 2026-12-01 00:00 UTC.

### 1.4 Content (30 days, daily exports only, 24 systems, 4.43 M rows)

| `error_type` | Rows | Codes |
|---|---|---|
| Information | 4,298,574 (97%) | 453 |
| Warning | 103,053 (2.3%) | 100 |
| Error | 29,560 (0.7%) | 162 |

- **679 technical event IDs.** Descriptions are readable English: nothing is encoded, unlike GE's
  `errortext`. 77% of rows have a `Memo` with tagged detail (`[FREE_TEXT]`, `[STATE]`,
  `[SEVERITY]`, `[FUSION_COMMAND]`, `[TEST_REPORT]`).
- **Category names have two spellings across software versions** (`Patient & Beam pos.` /
  `Patient and Beam pos.`, `Archiving & Networking` / `Archiving and Networking`). They need a
  normalising map.
- **What the log can support** (codes in `out/14_top_codes.tsv`, `out/15_exam_meta.tsv`):

| Area | Signal (code) | Systems |
|---|---|---|
| **Use** | `Command: StartFluoroscopy` (510999921); `X-Ray duration Exposure: n` (510020541); `Last run kV/mA/ms` (510610018); `Application name / Procedure name` (510020540) | 23–24 |
| **Runs** | `Run Data` (10000004): EndReason, RunLength, NumberOfPulses, Focus | 14 |
| **Exams** | `Utilization: Select acquisition examination` (540000098); `Close examination` (540000006); Auto MPPS / Exam Close / Exam Complete | 17–23 |
| **Tube and generator identity** | `Adaptation Data` (10000013: TubeSerialNumber, GeneratorSerialNumber); `Installation Configuration` (TubeType); `Tube yield`; `Applied tube protection` | 14 |
| **Generator / power faults** | MIU phase fault (10130204); mains undervoltage (10130103); ADU undervoltage (10134204); grid leakage (10112142); generator exception | 1–8 each |
| **"X-ray not possible"** | 510032770, Error: 1,027 rows, **23 systems, 312 system-days** | 23 |
| **Detector** | temperature in 0.1 °C (50001060), a numeric series; FD POST / startup | 17–23 |
| **Mechanics** | `Collision detected [axis=…]` (63001127); collimator wedge failure (40000023) | 1–12 |
| **Connectivity** | DICOM association (680000010: 53 k warnings, 1.5 k errors); archiving configuration (570000019); remote-support server not connected (830020114); `PSA died` (830020004) | 9–24 |
| **IP-PC health** | image / OS disk errors (70000119/141); POST failures (70000003/145) | 4–6 |
| **Inventory** | software version, power-on hours (already extracted to `public.logfile_event_history_metadata` by `extract_memo_data.js`) | 20 |
| Probably noise | `license checking failed` (730020000: 9,402 errors, 13 systems); UI commands (`Lowerpriority`, `StartViewing`, brake) | — |

- **Power-on hours mix counters.** For SME00782 the max is 48,764 while the most common value is
  1,156. What each counter measures needs checking (field service, §5).

### 1.5 PHI in the log

- `Command: Set<Field>` UI commands (code 540019921, category Patient Administration) log the value
  typed at the console in `Memo`. In 30 days that was: `SetPatientDateOfBirth` 13 rows,
  `SetPatientID` 13, `SetOperatorName` 13, `SetPatientHeight` / `Weight` 6 each, and
  `SetPatientType` 26. Most come from one system. Counts only, in `out/17_phi_counts.tsv`; no values
  were printed or stored outside `src/`.
- `ExaminationID` and `PatientID` also appear in `[STATE]` memos. PatientID looks encoded (24+
  base64-like characters); ExaminationID is often a timestamp (`E2026…`).
- This is already in `log.philips_cv_eventlog`, in the `log.saved_files` gzips (48 h), on disk, and
  in `~/philips_cv_evidence/src/`. The insight layer must never copy it (Q6).

### 1.6 Prod constraints for any change

- **Alert processor:** 9,138 enabled `alert.models` rows match on `description` (59 systems). It
  reads rows with `capture_datetime > now() − 30 min`. A parser change must keep `description`
  byte-faithful and keep live rows inside that window. **A backfill must not land inside it**: if
  it did, old events would raise new alerts.
- Old Philips jobs in `hhm_rpp` still hold their own copies of these files (unused since the
  2026-11-19 cutover). Prod runs `PHILIPS_CV` from `/home/prod/hhm_rpp_philips` at `:18` / `:48`.
  The Redis keys `<SME>.last_parsed_phil_cv_daily` and `<SME>.lod_EventLog.txe` are shared with it.
- The parser also feeds `alert.offline_hhm_conn` (newest `host_datetime`), `log.lod_reference`,
  `public.logfile_event_history_metadata`, and `log.saved_files`.

---

## 2. Proposed design

1. **The same pipeline as GE and Philips CT:** facts (extract) → daily (derive) → findings
   (rules, replayed with `state.js`) → `api.*` views → viewer. Each step is a pure core with tests,
   independent-SQL verification and a Codex review.
2. **Where the code lives: option C, as Philips CT §4.2 agreed.**
   - Schema in `hhm_rpp_ge`: one migration through the one runner, the scanner allowlist for
     `api.philips_cv_*`, and C1-Philips (positive selection in the GE verifiers).
   - Runtime in `hhm_rpp_philips/insight/philips_cv/`, with vendored, checksum-pinned `db.js` and
     `stage_wrapper.js`.
   - **CV goes first:** Philips CT is blocked on data, so CV builds the shared Philips plumbing that
     CT will reuse.
3. **Names:** metrics `pcv.*`, findings `pcv_*`, `findings.source = 'philips_cv'`, tables
   `insight.philips_cv_facts` / `_daily`, views `api.philips_cv_*`, kill switch
   `INSIGHT_PHILIPS_CV_ENABLED` (off by default), and a stage at the end of `PHILIPS_CV` (no new cron
   line).
4. **Facts are deduped on content, because the source has no sequence number:**
   - **Event identity** = `(system_id, host_date, host_time, sha1 of the raw record bytes)`.
   - **Occurrences** = the event's count within one export *segment*. A segment is a stretch where
     time runs newest-first without a reset, so a doubled export (I4c) splits into two segments.
     Real same-second repeats count; copies across exports, LOD and segments don't.
   - LOD rows are not used for facts.
   - Days come from the device wall clock (`host_date`).
5. **Coverage per system-day.** An export window (from its first to its last event) marks the days
   it covers. A day no export covers is shown as **no data**, never as a quiet day. This is CT's
   `coverage.js` idea, and it matters because of I3.
6. **Classification:** a reviewed code mapping (`technical_event_id` + normalised category),
   with labels taken from the readable `Description`. It is cut at about 97% of rows, and the tail
   is counted as `pcv.event` / `pcv.error` with the code as `dim`. Every code is in a rule or on the
   reviewed ignore list, the same coverage rule as GE.
7. **No PHI in `insight.*`:** no `Memo` text from Patient Administration, no ExaminationID and no
   PatientID. Exams are counted, never identified.
8. **Findings v1** (candidates, tuned by replay in CV-4):
   - an error storm against the system's own baseline;
   - recurring "X-ray not possible";
   - generator power faults (mains undervoltage, MIU phase fault, ADU undervoltage);
   - detector temperature out of its normal band;
   - DICOM / archiving failures over several days;
   - the remote-support link down for several days;
   - IP-PC disk / POST failures;
   - recurring collisions;
   - **tube or generator serial changed** (an informational event).
9. **Viewer:** a "Philips CV Insights — Internal" page in `sme_reports/philips_cv/`, on the shared
   `insights/` core. Its panels: use, errors by code, generator / tube, detector, connectivity, a
   coverage timeline.

---

## 3. Questions — AGREED 2026-11-25

You accepted every recommendation below as written on 2026-11-25. Each answer is marked
**AGREED**; the reasoning is kept as it was.

1. **Order: ingest first, or build on what's there?**
   **AGREED (recommended): ingest first (CV-1b), with the code mapping (CV-2a) drafted read-only in
   parallel.** I3 leaves whole days missing on the busiest systems (SME00446 lost 10 exports since
   May), and counts built on that would be wrong without anyone noticing. The mapping needs only the
   history, so nothing waits.

2. **Parser fix scope (CV-1b, this repo).**
   **AGREED (recommended): one change, like PCT-1b, with the simplest design that closes I1–I3:**
   - decode the file as Latin-1 and split on byte `0xE1`. That fixes I2 and keeps `Description`
     byte-faithful for the alert models;
   - a tolerant `eventlog_2` pattern: a message branch, and a `SubsystemNumber` that may hold
     anything (I1);
   - the daily pointer must never advance past a folder that has no `EventLog.txe`. Wait for it, or
     log a warning after 2 days and move on;
   - mask the value of `Set(Patient|Operator|Physician|Accession)*` commands in `Memo` before insert
     (Q6).

   This changes what new rows hold in `log.*`: real characters instead of `�`, and masked PHI.
   Before deploy, check that none of the 9,138 alert models matches on `�`. Not chosen: reusing
   PCT-1b's spool and transaction machinery. CV has no byte-offset tail to protect, so it would only
   add review surface.

3. **Collector fix (a separate session in `hhm_data_acquisition`, like PCT-C).**
   **AGREED (recommended): yes, small:**
   - each run unzips **every** daily folder that has an `Event.zip` but no `EventLog.txe`, not only
     `last_aquired_dir`;
   - unzip to a temporary name and `mv` it into place, so the parser never sees a half-written
     file;
   - log an error when a polled system can't be listed. Today that failure is silent: 18 systems in
     a 24 h window, and the only 2 errors logged come from a separate grab step.

   It ships with or before the parser fix.

4. **Backfill the missing exports?**
   **AGREED (recommended): yes, but only the 45 intact zips since 2026-05-01** (589,064 records,
   14 systems). Run them through the fixed parser, with `capture_datetime` set to the folder's
   fetch time (its mtime), never `now()`. That way the rows land in the right partitions and stay
   outside the alert processor's 30-minute window. You run it after a `DRY_RUN` rehearsal. The 84
   older zips predate the live partitions, so leave them. This writes to `log.*`, which is why it's
   your call. GE CV-1b did the same, at a smaller size (D6).

5. **Duplicates (I4): fix in `log.*`, or dedupe in the insight layer?**
   **AGREED (recommended): leave `log.*` as it is and dedupe in the extract (§2 item 4).** LOD rows exist so
   that an on-demand pull reaches alerts quickly. Changing their meaning in `log.*` touches the
   alert processor and `log.lod_reference`, for no gain to insights.

6. **PHI.**
   **AGREED (recommended):**
   - the insight layer never stores memo text, patient or exam IDs (§2 item 7);
   - mask new rows at parse time (Q2);
   - **raise the existing rows with whoever owns data privacy.** That covers `log.philips_cv_eventlog`
     since 2026-05, `archive_log` and the files on disk. Whether and how to purge history is their
     call, not this plan's;
   - delete `~/philips_cv_evidence/src/` once the CV-1b fixtures are masked.

7. **Where the code lives, and the migration number.**
   **AGREED (recommended): option C, as CT (§2 item 2). The migration takes the next free number when CV-1
   starts.** That is 010 if CT is still blocked, and CT then takes 011. CV builds C1-Philips and the
   vendored helpers, and CT reuses them.

8. **Time.**
   **AGREED (recommended): device wall clock (`host_date`, `host_time`) for days and keys, as CT Q8.** List
   the 10 NULL time zones (I6) for whoever owns `public.sites`; don't fix them in code.

9. **Metric scope v1.**
   **AGREED (recommended):**
   - **v1 (the data shows it clearly):** errors and warnings by code; "X-ray not possible"; fluoro
     starts; exposures; runs (on the 14 systems that log `Run Data`); procedure / application mix;
     generator / power faults; detector temperature; collisions; connectivity (DICOM, archiving,
     remote link); IP-PC disk / POST; inventory (software version, tube type, tube and generator
     serial).
   - **Behind field-service confirmation (§5):** exams per day (which marker); beam-on time
     (`RunLength` units); power-on hours.
   - **Not attempted:** anything patient-level, and dose.

10. **Coverage: build for the 20 live systems now?**
    **AGREED (recommended): yes, like GE CV.** Each system joins when its exports arrive, with no code
    change. Restoring collection stays outside this plan. The §1.1 table is the starting list for
    its owner: 37 not polled (6 switched off around 2026-08-03), 11 polled but unreachable, and 8
    stale.

11. **History.**
    **AGREED (recommended): facts from 2026-05-01** (the start of the table), after the Q4 backfill, with
    uncovered days marked "no data" (§2 item 5). No backfill from `archive_log`.

---

## 4. Proposed phases

| Phase | What | Exit criteria |
|---|---|---|
| **CV-0 Decide** ✅ AGREED 2026-11-25 | this plan; your answers to §3 | answers recorded as AGREED |
| **CV-1b Ingest integrity** (this repo, plus a collector session) | Q2 parser fix; Q3 collector fix; Q4 backfill; tests on masked fixtures (`SME00001…`, lower-case `philips_cv/` folders) | on every sampled export, DB = the independent reader (rows and fields, both regex models, including `0xA0` / `\x05` records); no folder skipped (a folder without `.txe` holds the pointer); `DRY_RUN` rehearsal; Codex review closed; you deploy; 5 clean days; backfill DB = zip records |
| **CV-2a Mapping** (read-only, parallel to CV-1b) | `PLAN-PHILIPS-CV-INSIGHTS-CODES.md`: every code with label, category, rule or ignore | mapping agreed |
| **CV-1 Schema** (`hhm_rpp_ge`) | C1-Philips; allowlist `api.philips_cv_*`; migration (Q7); `insight_writer` grant on `log.philips_cv_eventlog` (you run it) | tests; local rehearsal; review closed; you apply |
| **CV-2 Extract** | `insight/philips_cv/` rules + extract with content dedupe + backfill from 2026-05-01 | dry run = independent SQL per system × metric; every code covered; review closed |
| **CV-3 Derive** | daily (wall-clock days), coverage, capabilities, inventory, code labels | verifiers equal independent SQL; review closed |
| **CV-4 Findings** | replay history, propose rules with evidence, agree, build | replay drift 0; stored = recomputed; review closed |
| **CV-5 Stage** | stage after `PHILIPS_CV`, `INSIGHT_PHILIPS_CV_ENABLED`, `INSIGHT_*` lines in the prod `.env` (you add them) | 5 clean days; ingest unchanged with the switch off and on; replay = incremental |
| **CV-6 Viewer** | "Philips CV Insights — Internal" | as GE CT §16.4 |

**Checkpoints for your go-ahead:** ~~the §3 answers~~ (AGREED 2026-11-25); before the collector change; before the parser
change; before the backfill; before each migration; before each deploy; before every commit or
push, in any repo.

---

## 5. Field-service questions (non-blocking; collected for later, as for GE)

- Which line marks one exam: `Utilization: Select acquisition examination`, `Close examination`,
  or `Auto MPPS Complete`?
- What unit is `Run Data` `RunLength`, and why do only 14 systems log `Run Data`? (Software 8.2.x?)
- What triggers "X-ray not possible" (510032770) on 23 systems? Which causes need service?
- Which counters do the `Power-On Hours` memos report (SME00782: 48,764 vs 1,156)?
- Is `license checking failed` (730020000) harmless noise?
- Is `PSA died` / "Not connected to the Remote Support Server" a known remote-support outage?
- What normal range does the detector temperature (0.1 °C units, e.g. 289) have?

---

## 6. Evidence

`~/philips_cv_evidence/README.md` maps each section above to its script and output. The scripts are
read-only: `q.js` refuses a non-read-only session, and prod files were only listed, tested or
copied.
