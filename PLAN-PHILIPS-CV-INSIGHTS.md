# Philips CV Insights — plan

**Current state (2026-11-25):** **CV-0 (decide) is DONE: AGREED 2026-11-25.** You accepted the
recommendation in every §3 question (Q1–Q11) as written. Evidence was read-only, and there has been
no code, no commit, and no write to prod, Redis, `/home/prod` or the collector folders. Evidence:
`~/philips_cv_evidence/` (README is the index).

**Next:** CV-1b (§7): parser built (`fb3d510`, `49d016b`; review closed §7.9). Collector committed (`43888d9`); its Codex review found 2 P2 + 1 P3, all fixed and closed (§7.12); next: deploy (§7.11, day 1 = collector). CV-2a (the
code mapping, read-only) can run in parallel once you say so.

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
| **I1** | **`eventlog_2` drops records.** It has no "message" branch, so short records fail. It requires digits in `SubsystemNumber`, but Image Detector (embedded) events write a binary byte there (`SubsystemNumber: \x05`). Three more were a `0x83` byte in `Memo`, read as a second separator (an I2 case; first described here as "a stray empty field", corrected 2026-11-25) | 72 of 4,916 records (1.5%) on SME14784, the only `eventlog_2` system. 57 of them are Image Detector events | parser |
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
- Why does SME14784 sometimes create a `daily_*` folder without writing its `Event.zip` (30 times
  in 2026, §7.10)?

---

## 6. Evidence

`~/philips_cv_evidence/README.md` maps each section above to its script and output. The scripts are
read-only: `q.js` refuses a non-read-only session, and prod files were only listed, tested or
copied.

---

## 7. CV-1b: ingest integrity (planned 2026-11-25, read-only so far)

Scope as agreed in Q2–Q4: the parser fix (this repo), the collector fix (a separate session in
`hhm_data_acquisition`), and the backfill of the 45 zips. **Nothing is built yet.** The build
starts on your go-ahead (§7.7).

### 7.1 What the CV-1b evidence added

- **The root cause of I3 is the tunnel-reset path.** `jobs/tunnel_reset/philips/philips_cv.js`
  fetches daily zips and moves the `last_phil_cv_daily` key forward, but **never unzips**. The next
  regular run unzips only `last_aquired_dir`, the newest folder. So when one tunnel reset fetches
  two or more folders, all but the newest stay zipped, and the parser then moves past them.
  Example: SME00445 on 11-12, tunnel reset at 12:40 fetched `daily_2026_11_11` and `_12`; at 13:00
  only `_12` was unzipped.
- **Regular collector runs can't overlap the parser.** 671 runs in 14 days started at :00/:30 and
  took 42 s (max 50 s), long before :18/:48 (`out/33_collector_timing.tsv`). The atomic unzip (Q3)
  is still worth doing, as cheap insurance.
- **The alert models can't be affected by the decode change.** All 9,138 are `contains` on
  `description`, with 3 ASCII phrases: `Grid smallest focus is defect`, `Gigalink lock dropped`,
  `Geometry movements partly available`. "Gigalink" is an Image Detector event, and those are the
  events `eventlog_2` drops today (I1). So **the fix restores those alerts on SME14784.**
- **PHI, exactly** (120 days, counts only, `out/32_set_values.tsv`). These commands log the typed
  value after `Execute()`:

  | Command | Rows with a value | Systems |
  |---|---|---|
  | `SetPatientDateOfBirth` / `SetPatientID` / `SetGender` | 146 / 140 / 141 | 31 / 31 / 27 |
  | `SetPatientType` / `Height` / `Weight` | 164 / 100 / 102 | 18 / 12 / 11 |
  | `SetStudyID` / `SetExaminationID` | 140 / 140 | 19 / 1 |
  | `SetOperatorName` / `SetAttendingPhysician` | 146 / 150 | 10 / 33 |
  | `SetLongReportText` (free text) | 10 | 2 |
  | `SetPatientName` | **0** (never carries a value) | 33 |

  `SetProcedure`, `SetAcquisitionProcedure` and `SetRunLocalizedProcedureName` carry procedure
  names. They aren't identifying, and the procedure mix needs them.
- **No empty or tiny `EventLog.txe`** in any 2026 daily folder, so a "don't move past a missing
  file" rule can't stall on empty files.
- **Prototype** (`~/philips_cv_evidence/cv1b/proto.js`, evidence only), compared with the
  independent reader:

  | File | Lines | Unparsed now → new | Rows that change | Masked |
  |---|---|---|---|---|
  | SME01393 daily, SME20610 daily, SME01394 lod | 118,735 | 0 → 0 | **0** | 0 |
  | SME18533 daily / lod | 28,562 / 3,956 | 0 → 0 | 2 / 2 (the `0xA0` memos, now whole) | 0 / 1 |
  | SME14784 daily (`eventlog_2`) | 4,916 | **72 → 0** | all fields equal the reference | 45 |

  Apart from the masked memo values, every field of every row equals the reference.

### 7.2 The parser change (this repo)

| File | Change |
|---|---|
| `jobs/Philips/CV/decode.js` (new, pure) | `decode_line(latin1_text)`: replaces `á` (byte `0xE1`) with `�`, so **the existing regexes and stored separators stay exactly as today**, and every other byte keeps its real character (I2). `mask_phi(line)`: replaces the value after `Execute()` with `<masked>` for the 12 commands in §7.1 (any `SetPatient*`, plus `SetGender`, `SetStudyID`, `SetExaminationID`, `SetOperatorName`, `SetAttendingPhysician`, `SetLongReportText`). It runs on the line **before** matching, so the DB, the metadata extract and the run-log notes (`first_row`, `NO MATCH FOUND`) never see the value. Empty values are left alone. `plan_folders(listing, pointer, has_txe, folder_age_h)`: the pointer rule below, as a pure function |
| `parse/parsers.js` | `eventlog_2` gets the same shape as `eventlog`: a `message` branch, an optional tail, and `SubsystemNumber: (\d+)?` followed by any text (the `\x05` case). The three "stray field" records were a `0x83` byte in `Memo`, which the Latin-1 decode already fixes. `eventlog` is unchanged |
| `jobs/Philips/CV/eventlog.js` | Streams with `encoding: 'latin1'` (still line by line, which matters for the 258 MB exports) through `decode_line` and `mask_phi`. **Pointer rule:** folders are parsed in order. At a folder without `EventLog.txe`, the run stops for that system and the pointer stays put, unless the folder is more than 48 h old (folder mtime): then it logs a warning `no EventLog.txe after 48 h, skipped` and moves on. A DB error also stops the run for that system, so no later folder moves the pointer past a failed one. A file with 0 records is logged and moved past |
| `jobs/Philips/CV/lod_eventlog.js` | the same decode and mask; nothing else (Q5) |
| `jobs/Philips/CV/__tests__/` (new) | `node --test`, with masked hand-built fixtures (`SME00001…`, no IPs, serials or names) for: `0xE1` / `0xA0` / `0x83` / `\x05`; the `eventlog_2` shapes (`\x05`, empty `SubsystemNumber`, `0x83` in `Memo`, short records); each masked command (including a value that holds `�` or has no `[UI_DEVICE_NAME]` after it), an empty value, and a procedure name left alone; `plan_folders` (missing folder < 48 h blocks, > 48 h skips, an error blocks, a new system starts at its newest folder) |

- **Latin-1, not Windows-1252.** Latin-1 is lossless and needs no ICU. It only renders bytes
  `0x80`–`0x9F` differently (3 bytes in the samples).
- **What new `log.*` rows look like:** the same as today, except that real characters replace `�`
  inside text, `eventlog_2` rows that were dropped now arrive, and the 12 commands' values read
  `<masked>`.
- **Not changed:** lod handling, duplicates (Q5), `saved_files` (48 h retention; it keeps the raw
  file), the offline upsert, and the metadata extract.

### 7.3 The collector change (separate session, `hhm_data_acquisition`, as agreed in Q3)

1. **Sweep:** at the end of each regular CV run, unzip **every** `daily_*` folder that has an
   `Event.zip` and no `EventLog.txe`. This covers the tunnel-reset path with no change to it. It
   also unzips the 129 old zips once. That's harmless: they sit before the parser's pointer, so
   they are only read by the explicit backfill (§7.4).
2. **Atomic unzip:** `parse_event_zip.sh` extracts to a temporary folder, then `mv`s
   `EventLog.txe` into place last. **The temporary folder must be outside the daily folder** (for
   example `files/<SME>/.unzip_tmp/`). The parser's 48 h skip measures the daily folder's mtime, and
   a temp folder inside it would refresh that mtime on every failed retry, so the skip would never
   fire (found while writing the CV-1b review handoff).
3. ~~**Visible failures:** log an error when `list_new_phil_cv_files` returns `null`.~~ **Dropped
   (2026-11-25, §7.10): my claim was wrong.** Listing failures are logged as warnings and queued for
   the tunnel reset and the connection status (`exec_list_dirs`). My 24 h query had filtered on text
   that those entries don't contain.
4. ~~**Check on the devices**~~ **Answered from the run logs (C4, §7.10): nothing to re-fetch.**

### 7.4 The backfill (Q4)

- **A one-off tool,** `tooling/cv_backfill.js`. Its input is the list of 45 folders
  (`out/23_recoverable_zips.tsv`, since 2026-05-01). For each folder it parses `EventLog.txe` with
  the §7.2 code and inserts the rows with **`capture_datetime` = the folder's mtime** (its fetch
  time).
- **No Redis, `saved_files`, offline upsert or metadata writes.**
- **Idempotent:** it refuses a folder when rows with that `(system_id, capture_datetime)` already
  exist.
- Every timestamp is days old, so no row lands in the alert processor's 30-minute window. All of
  them fall in existing partitions (2026-05 … 2026-11).
- **`DRY_RUN` first:** the recorded INSERT rows per folder must equal the independent reader's
  record count. Then you run it on prod.

### 7.5 Build order and checkpoints

1. The pure layer (`decode.js`, the `eventlog_2` regex) and its tests.
2. Wire it into `eventlog.js` and `lod_eventlog.js`.
3. **Oracle:** the new parse of every file in `~/philips_cv_evidence/src/` equals the independent
   reader (rows and fields), apart from masked values. Then a local `DRY_RUN` rehearsal:
   `DEV_ENV=prod DRY_RUN=1 ONLY_SME=SME01393,SME14784,SME18533 npm run philips_cv`, with the
   recorded INSERTs checked against the reader.
4. The backfill tool and its `DRY_RUN` rehearsal.
5. Codex review (`REVIEW-CV1B-HANDOFF.md` → `REVIEW-CV1B-CODEX.md`), closed once findings converge.
6. Commit (your OK), the collector session (§7.3), then deploy: **collector first** (it closes most
   of I3 on its own), the parser a day later, then the backfill.
7. Exit (§4): 5 clean days. That means no new gap in `sql/08_gaps.sql`, no `NO MATCH FOUND`, no
   errors, every new folder parsed within one run of being unzipped, and the 45 backfilled gaps
   closed.

### 7.6 Questions for CV-1b — AGREED 2026-11-25 (the recommendation in each)

- **C1. Deploy order. AGREED (recommended): collector first, then the parser a day later.** The sweep alone
  stops new I3 losses. The parser's pointer rule is a second line of defence, and shipping them
  apart keeps each change easy to read in the logs.
- **C2. The mask list. AGREED (recommended): the 12 commands in §7.1** (corrected from "14" on 2026-11-25: the list was always these 12). That is Q6's pattern plus
  `SetStudyID`, `SetExaminationID`, `SetGender`, `SetAttendingPhysician` and `SetLongReportText`,
  which the data shows carry identifying values. Procedure names are kept.
- **C3. How long a missing `EventLog.txe` blocks the pointer. AGREED (recommended): 48 h, then skip with a
  warning.** Once the sweep is in place, a `.txe` appears within 30 minutes of its zip, so 48 h only
  catches real failures. Anything skipped stays recoverable with the backfill tool.
- **C4. The 33 folders that can't be recovered. AGREED (recommended): the collector session checks
  whether the devices still hold them, and re-fetches only if they do.** No new code if they're
  gone; the gaps stay marked "no data" (§2 item 5).

### 7.7 Your go-ahead

Agree C1–C4, and I build steps 1–4 on `DEV` (uncommitted), then bring you the oracle, the rehearsal
results and the review handoff.

### 7.8 Build status: steps 1–4 done (2026-11-25, on `DEV`)

| File | What |
|---|---|
| `jobs/Philips/CV/decode.js` (new) | `decode_line`, `mask_phi`, `prepare_line`, `parse_line`, `read_lines` (streams as Latin-1) |
| `jobs/Philips/CV/folders.js` (new) | `folder_key`, `folders_to_parse`, `folder_action` (`WAIT_HOURS` = 48) |
| `jobs/Philips/CV/eventlog.js` | the decode and mask; the folder rules; stop on error; a file with no records moves on; `isLast` by position |
| `jobs/Philips/CV/lod_eventlog.js` | the decode and mask only |
| `parse/parsers.js` | `eventlog_2` as §7.2 (`eventlog` unchanged) |
| `tooling/cv_backfill.js` (new) | the §7.4 tool: `DRY_RUN`, `--apply`, `--root` for rehearsals |
| `util/dry_run.js` | the recorded-SQL file is named after `basename(argv[2])`, so a tool given a file path can record. Job names give the same file names as before |
| `jobs/Philips/CV/__tests__/` (new) | `decode.test.js` (9), `folders.test.js` (6), `eventlog_loop.test.js` (5: the real `eventlog.js` on temp folders, with the DB, Redis and logger stubbed) |

**Evidence** (`~/philips_cv_evidence/cv1b/`, README there):

| Check | Result |
|---|---|
| `node --test jobs/` | 10 of 10 files pass (3 CV, 7 CT) |
| Do the tests catch the old bugs? | the loop tests run against the **old** `eventlog.js`: 4 of 5 fail (wait, skip, stop on error, date order and saving). The fifth, a new system, is unchanged by design |
| Oracle: the repo's line pipeline on all 16 copied files vs the independent reader (strict) | **771,620 rows**, 0 dropped, 0 unparsed. The only differences: `�` as the separator inside `message` (as stored today) and the masked values (45 on SME14784, 1 on SME18533) (`02_oracle.txt`, `03_oracle_strict.txt`) |
| `DRY_RUN` of `PHILIPS_CV` (`DEV_ENV=prod DRY_RUN=1 ONLY_SME=SME01393,SME14784,SME18533`) | 79,768 recorded rows = the files' record counts, and equal to the oracle **field by field** (0 differences; `technical_event_id` is compared as a number, since the job sends `'060009920'`). No NULL `host_datetime` (`05_dry_run_vs_oracle.txt`) |
| PHI in the recorded SQL (41 MB, run-log notes included) | 106 PHI-command occurrences: 46 masked, 60 empty, **0 unmasked** |
| Backfill `DRY_RUN`, the real list of 45 folders | all 45 refused: "no EventLog.txe". That's correct until the collector sweep ships (`06_backfill_dry_45.txt`) |
| Backfill `DRY_RUN`, a scratch root (`unzip -p` from the prod zips, `cp -p`) | 3 missing exports: **29,449 rows** = the reader = the oracle (0 field differences), `capture_datetime` = the zip's export time, `lod` NULL; 1.5–2.2% already in the window (the normal boundary overlap). The control, SME01393 11-18 (already loaded), was refused: 22,751 rows already in its window (`07`–`09`) |

**Changes from §7.2–§7.4 made during the build** (for the review):
1. **No stray-field clause in `eventlog_2`.** The three "stray field" records were a `0x83` byte in
   `Memo`, which the Latin-1 decode already fixes. I1 in §1.3 is corrected.
2. **Backfill `capture_datetime` = the `Event.zip` mtime, not the folder mtime.** Unzipping
   `EventLog.txe` into a folder moves the folder's mtime to "now", which could put rows in the alert
   window. `lftp` keeps the zip's mtime, the device's export time. The tool also refuses any capture
   less than 24 h old.
3. **A skipped folder moves the pointer to itself,** so it isn't warned about every 30 minutes. A
   file with no records also moves on, with a warning. (No empty file exists today: §7.1.)
4. **Folders are compared by their date digits.** A pointer folder that no longer exists used to
   make the job re-read all history; now it reads only later folders.
5. **The mask list is 12 commands, not 14** (C2; the count was wrong, the list was not).
6. **The 2026-05 partition:** the archive job detaches "today − 6 months", so `2026_05` is likely
   detached before the backfill runs. The 14 May folders (of 45) would then fail cleanly: one
   transaction per folder, reported as refused. They stay in `archive_log`'s range, and that's
   acceptable under Q11.

**Next:** Codex review (`REVIEW-CV1B-HANDOFF.md` → `REVIEW-CV1B-CODEX.md`), then the collector
session (§7.3), then deploy in the C1 order: collector, parser a day later, backfill.

### 7.9 Codex review CV1B (2026-11-25): P1, P2 and P3, all fixed

The review (`REVIEW-CV1B-CODEX.md`, of `fb3d510`) found one P1, one P2 and one P3. All three
reproduced, and all three are fixed. Each fix has the review's own counterexample as a test, and
every new test **fails on `fb3d510`** (mutation check).

| Finding | Fix | Test |
|---|---|---|
| **P1-A** A tag inside a typed value ended the mask early (the lazy match stopped at the first ` [UI_DEVICE_NAME]`) | `mask_phi` finds the value's end from the record's **structure**: everything from `Execute()` to the record's last `�SubsystemNumber:` field (or the end of the record) becomes `<masked>`. Ambiguity over-masks, never under-masks. The "Confirmed command … Execute()" form is covered too | `decode.test.js` 10, 11 |
| **P1-B** A CR / LF / CRLF inside a value split the record before masking; the rest reached the DB or the `NO MATCH FOUND` note | `read_lines` joins a physical line that doesn't start like a record (`<category>�YYYY-MM-DD�HH:MM:SS�`) to the previous record with one space, then masks. This works for CRLF and LF files alike. **`NO MATCH FOUND` notes no longer carry raw text**: only `record_head` (category, date, time) and the length. They are capped at 20 per file plus one total (a rejected file is now retried every run, so the cap matters). The `datetime object null` notes drop the raw line too | `decode.test.js` 12, 13; `eventlog_loop.test.js` 6, 8; `lod_loop.test.js` 1: the synthetic value appears in no INSERT and no serialized log note |
| **P2** A file whose every record was rejected moved the pointer (the "no records" branch) | A non-blank file with 0 matched records logs an error `All N records rejected: stop, the pointer stays` and stops. Only a blank file moves on. LOD: an all-rejected (or blank) file is not acknowledged, and its Redis size isn't updated (explicit now; before, it relied on an empty-INSERT error) | `eventlog_loop.test.js` 7 (two runs: rejected → pointer stays; file replaced → loaded); `lod_loop.test.js` 2 |
| **P3** Overlapping backfills, or the live job, could both pass the duplicate guards | The guards and the INSERT run in **one transaction after `pg_advisory_xact_lock(hashtext('philips_cv_backfill'))`**, so a second run waits and then sees "already loaded". **The tool refuses any folder not strictly before the system's live pointer** (Redis `GET`), so the live job can never load the same folder. With no pointer it refuses on `--apply` | `folders.test.js` 7 (`before_pointer`). **The lock and transaction path can't run under `DRY_RUN`, so it has not run yet.** First `--apply`: one folder, then check |

**Re-verified after the fixes** (`~/philips_cv_evidence/cv1b/10`–`14`):
- `node --test jobs/`: 11 of 11 files pass.
- Oracle on all 16 real files: identical to §7.8 (771,620 rows; only separator rendering in
  `message` and the 46 masked values differ). No real file has a CR or LF inside a field, so the
  joining changes no real row.
- `DRY_RUN` of `PHILIPS_CV` (3 systems): 79,768 rows, equal to the oracle field by field. PHI scan
  with the structural rule: 108 occurrences, 46 masked, 62 empty, **0 unmasked**.
- Backfill `DRY_RUN`: the 45 real folders are refused (no `.txe` yet); the scratch rehearsal loads
  the same 29,449 rows; the control is refused.

**Review CLOSED 2026-11-25 (your decision):** no finding is open. The fixes answer each finding with the review's own
counterexample, and a further round would only confirm them (feedback: no confirmation-only rounds).

### 7.10 Collector session (2026-11-25, `hhm_data_acquisition` `DEV` commit `43888d9`)

**What the session found** (`~/philips_cv_evidence/sql/40`–`41`, `out/40`–`41`):
- **The tunnel-reset job runs at :10 and :40** (≤ 7 min); regular runs at :00 and :30 (≤ 50 s). They
  never overlap, so the sweep needs no "is this download finished?" rule. A half-downloaded zip
  would just fail to unzip and be retried next run.
- **C4, the 33 unrecoverable folders: nothing to re-fetch.** 30 are on SME14784, spread over every
  month through November, so this is recurring, not history. For SME14784 `daily_2026_11_17` the
  device answered `550 Event.zip: The system cannot find the file` on **158 tries over 6 days**
  (1,458 such answers from July to November). The device created the daily folder and never wrote
  its zip. That's a question for field service (§5). The other three are one each on SME21636,
  SME11713 and SME13529 (the truncated zip; not polled).
- **§7.3 item 3 dropped** (see there).
- **A side bug, not changed:** the tunnel-reset path hard-codes `phil_cv_21_lod.sh` (FTP), even for
  the 12 SFTP (`phil_cv_22`) systems.

**The change (two items):**

| File | Change |
|---|---|
| `read/sh/Philips/parse_event_zip.sh` | **Atomic.** Extracts into `files/<SME>/.unzip_tmp.<daily>.<pid>`, **outside** the daily folder, then `mv`s the files in, `EventLog.txe` last. Any failure (damaged zip, no `EventLog.txe` in the zip, `unzip` dying mid-write) publishes nothing, leaves the daily folder's mtime unchanged (which the parser's 48 h rule relies on), and removes the temp folder. Guards against a missing folder, an empty argument, or a folder without `Event.zip`. The old "newest `Event.zip` under `$1`" `find` is gone: each folder holds one zip |
| `util/tools/phil_cv_unzip_sweep.js` (new) | `folders_to_unzip` (pure) and `scan_system_folder`: every `daily_*` folder with `Event.zip` and no `EventLog.txe`, oldest first |
| `jobs/hhm/philips/philips_cv.js` | At the end of each regular run, the sweep unzips every pending folder, **whoever fetched it**. This replaces the unzip of only `last_aquired_dir` and of this run's folders. The re-fetch of a zip missing from `last_aquired_dir` is unchanged |
| `read/__tests__/parse_event_zip.test.js`, `util/tools/__tests__/phil_cv_unzip_sweep.test.js` (new) | 10 jest tests: byte-identical output to the pre-change script (pinned to `aa68ceb`); rename (new inode); the three failure cases keep the mtime and leave no temp; argument guards; sweep selection; `run_phil_cv` sweeping two tunnel-reset folders while the device is unreachable |

**Verified:**
- `npx jest read/__tests__ util/tools/__tests__`: 61 of 61 pass (PCT-C's 51 + 10).
- Against the pre-change code, 7 of the 10 fail. The 3 that pass are by design: sweep selection
  (new code), scan (new code), and the truncated zip, which the old script also refused, though in
  place.
- On copies of 4 real zips: `EventLog.txe` is byte-identical to `unzip -p`, with the same files and
  no temp left (`cv1b/15_collector_unzip_real.txt`).

**What the first deployed run does:** it unzips the **123** pending old zips on polled systems once
(41 MB compressed, 868 MB uncompressed; 1.1 TB free). They are all behind the parser's pointers, so
the live parser ignores them; the backfill reads them. Only 1 of the 45 backfill folders is on a
system that isn't polled (SME11925). It needs a one-off unzip with the same script (§7.11).

**Next:** Codex review (`hhm_data_acquisition/REVIEW-CV1B-COLLECTOR-HANDOFF.md`; committed before it, at your request),
then deploy (C1: collector first, parser a day later, then the backfill).

### 7.11 Deploy runbook (C1 order; you run each step, I check each one read-only)

| Step | Where | What | My check afterwards |
|---|---|---|---|
| **Day 1: collector** | your machine, then the server | promote `hhm_data_acquisition` `DEV` → `STAGING` → `PROD`; then `sudo -u prod git -C /home/prod/hhm_data_acquisition pull` | after the next :00/:30 run: the 123 pending folders have `EventLog.txe`; no `.unzip_tmp.*` left; no new unzip errors; regular-run time still under the next :10 |
| **Day 2: parser** | the server | if it's December: `log.philips_cv_eventlog_2026_12` exists. Promote `hhm_rpp_philips` `DEV` → `STAGING` → `PROD`; then `sudo -u prod git -C /home/prod/hhm_rpp_philips pull`. No `.env` or cron change | after the next :18/:48 run: rows per system as before; no `NO MATCH FOUND`; no errors; the pointers move. Then 5 clean days (§7.5 step 7) |
| **Backfill** (after day 2) | the server, in `/home/prod/hhm_rpp_philips` | 1. the one unpolled folder: `sudo -u prod /home/prod/hhm_data_acquisition/read/sh/Philips/parse_event_zip.sh /home/prod/hhm_data_acquisition/files/SME11925/<folder>`. 2. `sudo -u prod env DRY_RUN=1 node tooling/cv_backfill.js <list.tsv>` (I prepare the list then, from the live pointers). 3. `--apply` on **one** folder (the lock-and-transaction path has never run, §7.9). 4. `--apply` on the rest | **before 3 (§7.12):** each folder's window from the `DRY_RUN` output overlaps both neighbouring loaded exports (a cut historic zip would leave a gap; such a folder is held back). After 3 and 4: rows = the reader's record count per folder; the gaps in `sql/08_gaps.sql` closed; nothing in the alert window. The 2026-05 folders are refused if that partition is detached by then (§7.8 item 6) |

### 7.12 Codex review CV1B-COLLECTOR (2026-11-25): two P2 and one P3, all fixed

The review (`hhm_data_acquisition/REVIEW-CV1B-COLLECTOR-CODEX.md`, of `43888d9`) found 0 P1, 2 P2
and 1 P3. All three reproduced, and all three are fixed. Each
finding has a test, and every one of those tests **fails on `43888d9`**.

**New evidence:** the entry names of all **9,940** `Event.zip` files on disk since mid-2025
(`~/philips_cv_evidence/out/42_zip_entries.txt`): 9,690 hold `EventLog.txe` + `EventLogSystem.txe`;
163 add `EventLogSecurity.txe`; 82 hold `EventLog.txe` only; 5 are unreadable. No folders, no dot
files, nothing else.

| Finding | Fix | Tests |
|---|---|---|
| **P2-1** A failed publish could refresh the daily folder's mtime on every retry. The companion was moved in before `EventLog.txe`, and a nested `Trace/` could fail forever, so the parser's 48 h skip never fired | `parse_event_zip.sh` publishes an **allowlist** (the evidence above): `EventLog.txe` **first**, then `EventLogSystem.txe` / `EventLogSecurity.txe` if present. If the primary `mv` fails, the daily folder is untouched. Once the primary is in, the sweep never selects the folder again, so a companion failing afterwards is only reported on stderr (exit 0). Nothing else in the zip is published | `parse_event_zip.test.js`: a failed primary `mv`, twice, leaves the mtime unchanged both times; a failed companion still publishes the primary and the sweep skips the folder; a zip with `Trace/` next to an existing non-empty `Trace/` |
| **P2-2** A cut transfer could leave a valid-looking zip prefix at `Event.zip`, which was unzipped and never repaired | `phil_cv_21.sh` / `phil_cv_22.sh` download into `files/<SME>/.incoming.<daily>.<pid>` (next to the daily folder) and `mv` the zip in **only after `lftp` succeeds and the file is non-empty**. A failed transfer leaves nothing at `Event.zip`, doesn't touch the daily folder, and is fetched again later. The `lftp` commands, the exit status and stderr on failure are unchanged, so the wrapper classifies outcomes as before. **Historic zips** (fetched by the old scripts) aren't vouched for by this: they reach the DB only through the backfill, and §7.11 now checks that each one's window overlaps both neighbouring exports before `--apply` | `phil_cv_grab.test.js` (stub `lftp`, both scripts): finished; **a cut transfer whose bytes are a valid zip → nothing published, mtime unchanged, and the next complete transfer is published, swept and unzipped with the new content**; 550; `lftp` exit 0 with an empty or missing file |
| **P3** Dot entries were dropped silently | Covered by the allowlist (the policy is now explicit and tested) | the allowlist test (`.export-info`, `other.bin` not published) |

**Re-verified:** `npx jest read/__tests__ util/tools/__tests__`: **74 of 74** (PCT-C 51 + 23). On
the 4 real zips, `EventLog.txe` is byte-identical to `unzip -p`. A real 3-file zip publishes all
three files, identical to `unzip -p`, with no temp left.

**Review CLOSED 2026-11-25 (your decision):** no finding is open, and each fix is shown on the review's own counterexample.
