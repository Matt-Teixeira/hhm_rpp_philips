# Philips CV: codes, templates and agreed mapping (CV-2a, 2026-11-25)

Companion to `PLAN-PHILIPS-CV-INSIGHTS.md` §4 (CV-2a). **The mapping was AGREED on 2026-11-25 (§11, Q12–Q24); nothing here is built yet** (CV-1 schema, CV-2 extract). Generated read-only:
- **DB:** `log.philips_cv_eventlog`, device days 2026-05-01 → 2026-11-25 (host_date ≥ 2026-05-01, plan Q11), 43 systems with rows in that time (20 are active today, plan §1.1), `lod` rows excluded (design §2 item 4). **39,198,951 rows** after the dedupe below: Information 37,345,007 (95.3%), Warning 1,268,870 (3.2%), Error 573,087 (1.5%), no type 11,987 (0.0%).
- **Dedupe (content, approximating design §2 item 4):** an event is the md5 of every parsed field (category, host date and time, type, code, description, memo, module, source, line, thread, …; not `id`, `capture_datetime`, `lod`). Its count is the number of times it occurs **inside one export**, and the counted value is the **maximum over exports**. So real same-second repeats stay (plan §1.3) and copies across exports (I4a/b) don't. A doubled export (I4c) still counts twice: rows = 39,198,951 against 34,752,653 distinct events (+12.8%), the repeats and the doubled exports together. CV-2 replaces this with the segment rule.
- **Buckets:** one query per device month, each reading captures from 7 days before to 50 days after the month (host dates trail capture by at most ~47 days, `out/01_host_vs_capture.tsv`), so every copy of an event lands in the same bucket. 2,499,763 rows dated before May (captured from May on, by exports that covered earlier days) were read for their codes only.
- **SME14784** (`eventlog_2`) drops records today (I1), mostly Image Detector events, and logs almost no use markers (`out/30_use_markers.tsv`). Its counts are low until the day-2 parser is live; codes it logs are marked **‡** in §3/§4.
- Evidence, SQL, the draft classifier (`mapping.js`, which becomes `insight/philips_cv/rules.js` once agreed), the mask (`mask.js`, with `test_mask.js`) and this generator: `~/philips_cv_evidence/cv2a/`.

**How rows are classified** (`mapping.js`, pure, first match wins):
- **Error rows** emit `pcv.error` and **Warning rows** `pcv.warning`, dim = the code (Q12). A code in a named metric also emits that fact.
- **Information rows** by code (and, for generic codes such as `…9921` "Command: X", by the masked description): a named fact, or nothing for utilization / inventory / telemetry / noise / trace rows. Codes reviewed as events emit `pcv.event` (dim = code).
- **The tail** (an Information code with no rule: 1.9% of Information rows) emits `pcv.event` with dim = code (plan §2 item 6, Q13).
- **Uncoded rows** (short, Windows-style records: `sshd`, Service Control Manager, SQL Server, …) by their source and message (§5). Their errors emit `pcv.error` with dim = `os:<source>`.
- **The ignore list** (§6) emits nothing: 3 codes and 4 sources, 698,491 rows (1.8%).
- **Memo** is read only for 3 generator codes (10000012 tube type, 10000013 serials, 10000015 tube life counters; Q14, Q18), which hold no patient data. Every other memo is ignored.
- **No PHI:** no rule emits text, an ID or a name. Dims are fixed words, codes, axis names, allow-listed application names (Q23) or hashes of serials (Q14).

**Checks** (§10): every code has a reviewed rule; every explicit rule matches rows; explicit rules cover 98.0% of coded Information rows; raw text and masked template classify the same on 199644 raw rows (0 differences); the SQL and JavaScript masks agree (0 differences); 261,857 stored template rows hold **0** unmasked IPs, IDs, hosts, users or serials.

**Masking** (`mask.js`, one function used everywhere): tabs and line ends → space; `0x…` → `0x<hex>`; digit runs → `#`; then `<ip>` (dotted quads, versions too), `<host>` (DICOM node names, AE titles, host names), `<user>` (Windows and `sshd` accounts), `<serial>` (`S/N`, `SN=`, `Serial:`, `…SerialNumber`), `<id>` (`ExaminationID`, `SeriesInstanceUID`, patient / study / accession IDs, random-looking tokens), `<text>` (FlexVision preset names, `ResolvePatientMix` lines), `<key>`, `<obj>`, `<email>`, `<name>` (DICOM `^` names), `<mac>`; then the first 120 characters. A template is printed here only if it occurs on 2+ systems or in 20+ rows. Labels are the data's own wording, not a decoding.

**Columns:** *Rows* = deduped rows. *Sys* = systems with the code (of 43). *Sys-days* = distinct (system, device day). Days are device wall-clock days (plan Q8).

## 1. v1 metrics (plan §3 Q9, §11 Q22) and what feeds them

| Metric | Group | Source | Dim | Rows | Sys | Notes |
|---|---|---|---|---|---|---|
| `pcv.error` | by code | every Error row (not ignored) | the code; `os:<source>` if uncoded | 525,481 | 43 | 260 codes (§3) |
| `pcv.warning` | by code | every Warning row (not ignored) | the code; `os:<source>` | 1,105,445 | 43 | 154 codes (§3); Q12 |
| `pcv.event` | by code | Information codes reviewed as events, and the tail | the code (rule id if uncoded) | 750,132 | 43 | Q13 |
| `pcv.run` | acquisition | 510020541 `X-Ray started at: <time>` | '' | 734,094 | 42 | one per X-ray run: equals the per-run record 510020540 on most systems (`out/30_use_markers.tsv`); on 23 of 24 systems, where `Run Data` is on 14 (Q17) |
| `pcv.exposure_run` | acquisition | 510020541 `X-Ray duration Exposure: <s>` | '' | 127,652 | 41 | the exposure (acquisition) runs; the rest are fluoro runs. The duration's unit is a field-service question |
| `pcv.fluoro_start` | acquisition | 510999921 `Command: StartFluoroscopy` | '' | 666,006 | 43 | the only fact among the acquisition UI commands; also logged by SME14784 |
| `pcv.procedure` | acquisition | 510020540 per-run record `Application name = <name> Application ID` | the application name, digits as `#`, if on the allow-list of 50 names seen on 2+ systems (of 69); else `other` (Q23) | 736,158 | 42 | procedure / application mix (from raw descriptions, `out/31_procedure_names.tsv`; the name is often past the 120-character template cut). Top: `Cardiac ClarityIQ_Xpertaste` 289,237, `Cardiac` 98,028, `Abdomen ClarityIQ` 56,307, `Clarity Classic (Xper Taste)` 51,037, `Cardiac EP` 31,604, `Cardiac EP HQ Fluoro` 27,448. The record also holds exam ID, series UID and dose: never read (Q9: no dose) |
| `pcv.xray_not_possible` | acquisition | 510032770 `X-ray not possible` (Error) | '' | 8,809 | 41 | counted with no cause (Q20) |
| `pcv.user_msg` | acquisition | 510999920 `User msg:` with "not possible" or "defect / failure"; 580009920 / 60009920 `Geometry movements partly available` (an alert-model phrase) | `xray_not_possible`, `fault`, `geometry_partly_available` | 33,293 | 43 | e.g. "Exposure not possible. Image disk full", "Large focus used. Small focus defect". `fault` 22,336, `xray_not_possible` 7,178, `geometry_partly_available` 3,779 |
| `pcv.generator_fault` | generator | 20000002, 10000007, 10008974, 10130204, 10134204, 10007780, 10112121, 10130103, 10006689, 10028785, 10112142 | `grid_leakage` 1,805, `mains_undervoltage` 550, `tube_adaptation_required` 534, `miu_phase` 435, `generator_exception` 366, `adu_undervoltage` 163, `tube_arcing` 102 | 3,955 | 30 | MIU phase, mains / ADU undervoltage, grid leakage, arcing, generator exceptions, tube adaptation |
| `pcv.temperature` | detector | 50001060 `Detector / Ambient temperature in 0.1 degrees Celsius: <n>` | `detector`, `ambient` | 256,543 | 27 | value = °C (n / 10). `detector` 193,148, `ambient` 63,395. Normal band: field service (plan §5) |
| `pcv.collision` | mechanics | 63001127 `Collision detected [axis=<axis>]` | the axis | 3,313 | 15 | `FrtLong` 1,200, `FrtProp` 1,068, `FrtCarc` 742, `FrtLat` 165, `FrtZRot` 80, `FrtIDS` 55 |
| `pcv.connectivity` | connectivity | 570000019, 570000016, 620000008, 620000013, 680000010, 670000208 | `dicom_assoc_warning` 896,146, `dicom_protocol_violation` 170,905, `archive_config` 15,193, `dicom_assoc_error` 10,670, `archive_job_failed` 2,540, `storage_commit_failed` 1,080 | 1,096,534 | 43 | DICOM association, archiving, storage commit |
| `pcv.remote_link` | remote_service | 830020114 / 830020115 / 830020004 | `psa_died` 108,680, `connected` 6,319, `not_connected` 5,174 | 120,173 | 41 | link down / up and PSA crashes (plan §5) |
| `pcv.ippc` | imaging | 70000003, 70000119, 70000123, 70000140, 70000141, 70000145, 70049930 | `post_disk` 1,743, `post_failed` 1,531, `image_disk` 744, `os_disk` 543, `post_other` 218, `pc_hardware` 112, `post_fan` 48 | 4,939 | 18 | IP-PC disk and POST failures |
| `pcv.inventory` | inventory | memo of 10000012 (`TubeType`), 10000013 (`Tube/GeneratorSerialNumber`); software version from `public.logfile_event_history_metadata` (Q19) | `tube_type=<v>`, `tube_serial=<hash>`, `generator_serial=<hash>` (first 10 hex of sha256), `sw_version=<v>` | 4,500 | 24 | memo rules tested on synthetic memos (`test_mapping.js`); tube-type and serial values not read in CV-2a (Q14). A hash change = "tube or generator changed" |
| `pcv.tube_counter` | generator | 10000015 `X-Segment Statistics` memo, 19 lifetime counters (Q18) | `<unit hash>/<counter>`, e.g. `…/SwitchOnCounter`, `…/ArcingCounter`, `…/LoadUnitCounterActualTube` | 2,476 | 23 | value = the counter; derive keeps the daily max and increase. Monotonic per unit on all 3 systems checked (`out/23_tube_counter_units.tsv`); biplane systems report 2 units; all-zero units skipped |

## 2. Watch list (not in v1; plan §3 Q9, §5)

| Candidate | Source | Rows | Sys | Why not v1 / what it needs |
|---|---|---|---|---|
| `pcv.exam` | 540000098 `Utilization: Select acquisition examination`; 540000093 `Select Acquisition Exam`; 540000006 `Close examination`; 540000095 `Auto MPPS Complete`; 540000094 / 540000096 `Auto Exam Close / Complete` | 21,148 / 38,160 / 17,875 / 79,343 / 18,733 / 12,123 | 27 / 42 / 41 / 41 / 40 / 36 | the markers disagree per system (e.g. Auto Exam Complete is 0 on 3 busy systems): field service picks one (plan §5) |
| `pcv.beam_on_s` | 510020541 `X-Ray started at` / `stopped at` pairs (times to 0.1 s) | 1,470,121 | 42 | pairing in derive (CV-3); `Run Data` `RunLength` is the alternative on 14 systems, unit unknown |
| `pcv.run_detail` | 10000004 `Run Data` memo: EndReason, RunLength, NumberOfPulses, Focus, filament wear | 513,646 | 24 | 14 systems only; 510029173 `After run data` is the same run logged twice (trace). EndReason values not read (memo) |
| `pcv.technique` | 510610018 `Last run kV / mA / ms`, test shots | 763,972 | 42 | per-run technique series; the use case (tube load?) needs field service |
| `pcv.tube_yield` | 510029174 `Tube yield` (memo Number, Yield); 510029175 `EDL factor` | 8,940 | 24 | meaning to confirm |
| `pcv.power_on_hours` | 70000004 `SMART Data <disk>` memo `Power-On Hours` (already in `logfile_event_history_metadata` as `power_on`) | 14,828 | 37 | **per disk** (Frontal IP-PC image / OS disk, Host PC OS disk, lateral disks): that is why plan §1.4 saw 48,764 next to 1,156. Today's extract mixes the disks (Q19) |
| `pcv.env_*` | 120000000 SIB fan speeds and top / bottom temperatures; 73428002 / 73628002 / 73238003 IPB / ISB temperatures | 1,321,203 | 41 | numbers parse; normal bands are field-service questions |
| `pcv.fluoro_buzzer` | 510018385 `5 minutes fluo buzzer activated` | 14,752 | 42 | one per 5 min of fluoro: a fluoro-time proxy |
| `pcv.startup` | 540000001 `Startup succeeded`, 510004097 `Acquisition startup completed` (now in the tail as `pcv.event`) | 3,747 / 3,746 | 42 | system restarts per day; confirm which line marks a boot |
| `pcv.archive_job` | 570000015 `Archiving Job Completed`; 550000013 `Print Job Completed` | 316,027 / 48,756 | 42 | workload context for archiving failures |

## 3. Error and Warning codes: all 402 (`pcv.error` / `pcv.warning`, dim = code)

1,823,693 Error and Warning rows. *E / W* = rows of each type (some codes also log Information rows: *Info*). *Group* = viewer group from the normalised Philips category. *Also* = the named fact the code feeds. **ignored** = on the ignore list (§6): emits nothing. ‡ = SME14784 logs the code (under-counted there until day 2).

| # | Code | E | W | Info | Group | Also | Rows | Sys | Sys-days | First | Last | Label (top masked template) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `680000010` | 10,670 | 896,146 | 0 | connectivity | `pcv.connectivity:dicom_assoc_error`, `pcv.connectivity:dicom_assoc_warning` | 906,816 | 40 | 3,691 | 2026-05-01 | 2026-11-24 | DICOM Association |
| 2 | `510610010` | 219,452 | 0 | 0 | acquisition |  | 219,452 | 2 | 53 | 2026-05-01 | 2026-11-05 | Device programming failure: X-ray Generator (100%; 2 templates) |
| 3 | `620000008` | 170,736 | 19 | 150 | service | `pcv.connectivity:dicom_protocol_violation` | 170,905 | 37 | 174 | 2026-05-01 | 2026-11-20 | Connectivity.Dicom.Access.DUL_VIOLATION: DICOM violation: Receiving u… (98%; 9 templates) |
| 4 | `650400007` | 0 | 150,662 | 0 | software | **ignored** | 150,662 | 33 | 2,569 | 2026-05-01 | 2026-11-24 | Could not get CWIS adapter |
| 5 | `830020004` | 0 | 108,680 | 0 | remote_service | `pcv.remote_link:psa_died` | 108,680 | 23 | 2,140 | 2026-05-01 | 2026-11-25 | PSA died. |
| 6 | `70000151` | 53,425 | 0 | 0 | imaging |  | 53,425 | 7 | 280 | 2026-05-01 | 2026-11-23 | Image Processing malfunction (Missing image(s) on #K# Display Device) |
| 7 | `730020000` | 36,130 | 0 | 0 | software | **ignored** | 36,130 | 19 | 1,504 | 2026-05-01 | 2026-11-25 | Application error: license checking failed. |
| 8 | `620000001` | 158 | 18,041 | 709,180 | service |  | 727,379 | 42 | 4,313 | 2026-05-01 | 2026-11-25 | Base.Com#Dotnet.Framework.COMCALLSSTATISTICS: Number of registered de… (11%; 54726 templates) |
| 9 | `730080000` ‡ | 0 | 17,406 | 0 | software |  | 17,406 | 1 | 105 | 2026-05-01 | 2026-11-20 | Statistical Parameter error |
| 10 | `650000049` | 15,827 | 0 | 0 | software |  | 15,827 | 8 | 16 | 2026-05-21 | 2026-11-12 | Error on Xper module |
| 11 | `570000019` ‡ | 15,193 | 0 | 0 | connectivity | `pcv.connectivity:archive_config` | 15,193 | 29 | 2,803 | 2026-05-01 | 2026-11-24 | Archiving configuration problem. |
| 12 | `63001046` | 0 | 14,391 | 0 | mechanics |  | 14,391 | 1 | 8 | 2026-05-12 | 2026-07-23 | Drive error: User undervoltage |
| 13 | `620000003` | 30 | 11,967 | 36,094 | service | **ignored** | 48,091 | 42 | 3,367 | 2026-05-01 | 2026-11-25 | Base.Utilities.Metrics.details:  .Copyright           : (c) Koninklij… (51%; 22 templates) |
| 14 | `510032770` | 8,809 | 0 | 0 | acquisition | `pcv.xray_not_possible` | 8,809 | 41 | 2,761 | 2026-05-01 | 2026-11-24 | X-ray not possible |
| 15 | `510020513` ‡ | 0 | 5,633 | 0 | acquisition |  | 5,633 | 12 | 668 | 2026-05-01 | 2026-11-24 | Xper settings validation failure: No license available for RecordPhys… (93%; 2 templates) |
| 16 | `830020114` | 0 | 5,174 | 0 | remote_service | `pcv.remote_link:not_connected` | 5,174 | 36 | 1,375 | 2026-05-01 | 2026-11-24 | Not connected to the Remote Support Server (Questra Enterprise Server… |
| 17 | `100060112` | 0 | 4,805 | 0 | power_io |  | 4,805 | 19 | 1,459 | 2026-05-01 | 2026-11-24 | Development error: command send to gPDU failed |
| 18 | `540000045` | 0 | 4,599 | 0 | software |  | 4,599 | 26 | 180 | 2026-05-01 | 2026-11-23 | Datamodel error (DMERROR_INTEGRATION_OBJECT_DELETED) (94%; 2 templates) |
| 19 | `620000000` | 0 | 3,847 | 220,461 | service |  | 224,308 | 41 | 3,906 | 2026-05-01 | 2026-11-24 | Connectivity.Dicom.Access.UNKNOWN: Value of attribute WriteSQExplicit… (63%; 6 templates) |
| 20 | `40000023` | 0 | 3,570 | 0 | mechanics |  | 3,570 | 2 | 7 | 2026-05-19 | 2026-11-06 | Collimator Wedge hardware or mechanics failed |
| 21 | `620000005` | 3,344 | 5 | 5,152 | service |  | 8,501 | 41 | 2,989 | 2026-05-01 | 2026-11-24 | Services.SystemController.Utilities.SCAPPLICATION: SystemController h… (59%; 6 templates) |
| 22 | `63001127` | 0 | 3,313 | 0 | mechanics | `pcv.collision:<axis>` | 3,313 | 15 | 749 | 2026-05-01 | 2026-11-24 | Application error: Collision detected [axis=FrtLong] (36%; 7 templates) |
| 23 | `70000159` | 2,534 | 0 | 0 | imaging |  | 2,534 | 7 | 448 | 2026-05-01 | 2026-11-24 | Programming Error |
| 24 | `70040006` | 0 | 2,379 | 0 | imaging |  | 2,379 | 1 | 130 | 2026-05-01 | 2026-11-24 | Programming error: Unexpected Internal Error |
| 25 | `540000042` | 0 | 2,151 | 0 | software |  | 2,151 | 5 | 445 | 2026-05-01 | 2026-11-24 | Invalid Xper in ExaminationFolder: Cardio ClarityIQ, Clarity Classic … (33%; 11 templates) |
| 26 | `70000003` | 2,009 | 0 | 34,484 | imaging | `pcv.ippc:post_other`, `pcv.ippc:post_disk`, `pcv.ippc:post_fan` | 36,493 | 37 | 2,680 | 2026-05-01 | 2026-11-24 | POST "Host PC FRU Fan #" Done/Passed (18%; 21 templates) |
| 27 | `850000000` | 1,885 | 4 | 695,002 | imaging |  | 696,891 | 35 | 3,792 | 2026-05-01 | 2026-11-25 | InfoAlways:  (via TsmLog): TsmApplication:Radiation not active, remov… (31%; 231 templates) |
| 28 | `10112142` | 0 | 1,805 | 0 | generator | `pcv.generator_fault:grid_leakage` | 1,805 | 2 | 33 | 2026-09-10 | 2026-11-11 | XSC: Grid Leakage Current out of range. Warning |
| 29 | `620000006` | 224 | 1,177 | 179,901 | service |  | 181,302 | 42 | 3,075 | 2026-05-01 | 2026-11-25 | File: loggingCLSID=PMS.PMSMIPLogAdapter (18%; 29 templates) |
| 30 | `570000016` | 159 | 1,196 | 1,185 | connectivity | `pcv.connectivity:archive_job_failed` | 2,540 | 37 | 490 | 2026-05-01 | 2026-11-24 | Archiving Job Failed. |
| 31 | `620000016` | 0 | 1,198 | 0 | service |  | 1,198 | 13 | 26 | 2026-05-06 | 2026-11-17 | Base.Utilities.gcLog: Error in cleanup .Exception: [RemotingException… (97%; 3 templates) |
| 32 | `540000015` | 0 | 1,146 | 0 | software |  | 1,146 | 31 | 355 | 2026-05-01 | 2026-11-24 | SetProcedureCmd() failed (84%; 2 templates) |
| 33 | `510610011` | 881 | 12 | 0 | acquisition |  | 893 | 5 | 21 | 2026-05-04 | 2026-11-12 | Device programming failure: X-Ray Generator |
| 34 | `70000145` | 878 | 0 | 0 | imaging | `pcv.ippc:post_failed` | 878 | 13 | 736 | 2026-05-01 | 2026-11-24 | One or more POSTs failed |
| 35 | `780049922` | 0 | 789 | 0 | software |  | 789 | 3 | 36 | 2026-05-01 | 2026-10-26 | Problem occurred |
| 36 | `760060100` | 179 | 499 | 0 | software |  | 678 | 19 | 413 | 2026-05-01 | 2026-11-24 | Internal software error |
| 37 | `70000119` | 677 | 0 | 0 | imaging | `pcv.ippc:image_disk` | 677 | 7 | 572 | 2026-05-01 | 2026-11-24 | Image Disk Error |
| 38 | `70000146` | 634 | 0 | 0 | imaging |  | 634 | 30 | 351 | 2026-05-01 | 2026-11-20 | Image Processing malfunction |
| 39 | `730999912` | 573 | 0 | 0 | software |  | 573 | 7 | 9 | 2026-05-06 | 2026-11-04 | Programming error: COM server not available. |
| 40 | `620000013` | 569 | 0 | 0 | service | `pcv.connectivity:storage_commit_failed` | 569 | 9 | 188 | 2026-05-01 | 2026-11-24 | Connectivity.Dicom.Performer.STORAGE_COMMIT: Storage Commit failed Al… (90%; 3 templates) |
| 41 | `10130103` | 0 | 550 | 0 | generator | `pcv.generator_fault:mains_undervoltage` | 550 | 15 | 100 | 2026-05-04 | 2026-11-19 | MIU: Undervoltage on mains power input |
| 42 | `620000004` | 0 | 546 | 28 | service |  | 574 | 27 | 487 | 2026-05-01 | 2026-11-23 | Base.Utilities.Brokering.Factory: CreateInstance: creation of SystemS… (90%; 5 templates) |
| 43 | `70000141` | 543 | 0 | 0 | imaging | `pcv.ippc:os_disk` | 543 | 5 | 468 | 2026-05-01 | 2026-11-24 | OS Disk Error |
| 44 | `70000149` | 536 | 0 | 0 | imaging |  | 536 | 21 | 380 | 2026-05-01 | 2026-11-19 | Image Processing malfunction |
| 45 | `20000002` | 534 | 0 | 0 | generator | `pcv.generator_fault:tube_adaptation_required` | 534 | 2 | 6 | 2026-05-19 | 2026-11-05 | X-ray tube has to be adapted |
| 46 | `670000208` | 0 | 511 | 0 | connectivity | `pcv.connectivity:storage_commit_failed` | 511 | 1 | 136 | 2026-05-01 | 2026-11-24 | StorageCommit failure: StorageCommitStatus in ExaminationFolder set t… |
| 47 | `510610014` | 481 | 0 | 0 | acquisition |  | 481 | 2 | 6 | 2026-05-19 | 2026-11-05 | Xper Validation failure |
| 48 | `10130204` | 435 | 0 | 0 | generator | `pcv.generator_fault:miu_phase` | 435 | 15 | 97 | 2026-05-04 | 2026-11-19 | MIU: Phase fault |
| 49 | `100060101` | 0 | 420 | 0 | power_io |  | 420 | 17 | 290 | 2026-05-01 | 2026-11-22 | Service error: communication with GPDU failed |
| 50 | `50001020` | 0 | 413 | 0 | detector |  | 413 | 3 | 10 | 2026-05-15 | 2026-10-29 | Resource not available |
| 51 | `70000131` | 394 | 0 | 0 | imaging |  | 394 | 8 | 339 | 2026-05-01 | 2026-11-23 | Inconsistent Image Store |
| 52 | `63000306` | 380 | 0 | 0 | mechanics |  | 380 | 3 | 65 | 2026-05-01 | 2026-11-17 | Application error: Bodyguard POST failed |
| 53 | `70000135` | 377 | 0 | 0 | imaging |  | 377 | 9 | 303 | 2026-05-01 | 2026-11-24 | One or more of the subsystems IP depends on is not correctly installed |
| 54 | `53250008` | 0 | 376 | 0 | detector |  | 376 | 5 | 342 | 2026-05-01 | 2026-11-23 | FD Controller: Detector temperature is too low |
| 55 | `510016408` ‡ | 0 | 366 | 0 | acquisition |  | 366 | 1 | 97 | 2026-05-01 | 2026-11-20 | Application Error: Xper settings validation failure: FluoTraceSubtrac… |
| 56 | `100062731` | 353 | 0 | 0 | power_io |  | 353 | 9 | 320 | 2026-05-01 | 2026-11-25 | Service error: voltage error on output #V# bank-C M-cab (89%; 3 templates) |
| 57 | `570000015` ‡ | 351 | 0 | 315,676 | connectivity |  | 316,027 | 42 | 4,078 | 2026-05-01 | 2026-11-24 | Archiving Job Completed. |
| 58 | `620000007` | 0 | 314 | 1,231 | service |  | 1,545 | 35 | 1,004 | 2026-05-01 | 2026-11-24 | Services.SystemController.Utilities.GENERICHOSTINGAPP: Component with… (63%; 18 templates) |
| 59 | `50000020` | 291 | 0 | 0 | detector |  | 291 | 2 | 6 | 2026-05-15 | 2026-08-31 | Image Detection configuration required |
| 60 | `650119912` | 272 | 0 | 0 | software |  | 272 | 15 | 39 | 2026-05-02 | 2026-11-04 | Programming error: COM server not available. |
| 61 | `70000152` | 257 | 0 | 0 | imaging |  | 257 | 7 | 232 | 2026-05-01 | 2026-11-19 | No network connection IPPC-Real time link application |
| 62 | `510640011` ‡ | 240 | 0 | 0 | acquisition |  | 240 | 1 | 21 | 2026-05-12 | 2026-10-30 | PulsFluo PlugIn: Application error: Programming XRay-Generator failed |
| 63 | `63000323` | 0 | 236 | 0 | mechanics |  | 236 | 16 | 166 | 2026-05-01 | 2026-11-13 | IPC Post: synqnet test failed, Network ERROR : single string (42%; 20 templates) |
| 64 | `100062732` | 209 | 0 | 0 | power_io |  | 209 | 9 | 172 | 2026-05-04 | 2026-11-19 | Service error: voltage error on output #V# bank-D M-cab (81%; 3 templates) |
| 65 | `100062608` | 0 | 209 | 0 | power_io |  | 209 | 2 | 87 | 2026-05-05 | 2026-11-23 | Service warning: PDU M Cab Transformer temperature high |
| 66 | `70049930` | 183 | 0 | 470 | imaging | `pcv.ippc:post_failed` | 653 | 4 | 305 | 2026-05-01 | 2026-11-24 | POST POST Frontal XRes FPGA Passed (57%; 3 templates) |
| 67 | `70040012` | 0 | 183 | 0 | imaging |  | 183 | 1 | 130 | 2026-05-01 | 2026-11-24 | Programming error: Error initializing image channels (hib boards) |
| 68 | `63000238` | 182 | 0 | 0 | mechanics |  | 182 | 8 | 89 | 2026-05-01 | 2026-11-17 | Application error: POST failed: PLG-#>, Bodyguard-ID (38%; 14 templates) |
| 69 | `100062734` | 172 | 0 | 0 | power_io |  | 172 | 6 | 151 | 2026-05-01 | 2026-11-23 | Service error: voltage error on output #V# bank-G M-cab (85%; 3 templates) |
| 70 | `10134204` | 163 | 0 | 0 | generator | `pcv.generator_fault:adu_undervoltage` | 163 | 13 | 77 | 2026-05-04 | 2026-11-19 | ADU: Undervoltage on ADU rail voltage |
| 71 | `100062733` | 162 | 0 | 0 | power_io |  | 162 | 8 | 138 | 2026-05-04 | 2026-11-19 | Service error: voltage error on output #V# bank-E M-cab (77%; 3 templates) |
| 72 | `650018104` | 155 | 0 | 0 | software |  | 155 | 12 | 35 | 2026-05-02 | 2026-11-04 | Programming error: COM server not available. |
| 73 | `60009930` | 154 | 0 | 25,462 | mechanics |  | 25,616 | 41 | 3,003 | 2026-05-01 | 2026-11-24 | POST IPC Geometry Passed (15%; 26 templates) |
| 74 | `100061405` | 0 | 154 | 0 | power_io |  | 154 | 1 | 143 | 2026-05-01 | 2026-11-24 | POST HW watchdog failure |
| 75 | `90002561` | 0 | 146 | 0 | acquisition |  | 146 | 1 | 2 | 2026-05-28 | 2026-06-05 | Cannot retrieve IP address for Sequencing function. |
| 76 | `650028673` ‡ | 0 | 142 | 16,872 | software |  | 17,014 | 42 | 3,046 | 2026-05-01 | 2026-11-24 | Monitor: Starting Application completed (99%; 2 templates) |
| 77 | `750000002` | 136 | 0 | 0 | generator |  | 136 | 1 | 2 | 2026-05-28 | 2026-06-05 | Generic CAN Interface non recoverable error |
| 78 | `10028785` | 132 | 0 | 0 | generator | `pcv.generator_fault:generator_exception` | 132 | 1 | 6 | 2026-09-25 | 2026-11-05 | Application Error: Generator exception occurred |
| 79 | `510028689` | 0 | 128 | 0 | acquisition |  | 128 | 15 | 26 | 2026-05-04 | 2026-11-20 | Degraded tube protection |
| 80 | `10000007` ‡ | 127 | 0 | 0 | generator | `pcv.generator_fault:generator_exception` | 127 | 2 | 74 | 2026-05-01 | 2026-11-18 | Generator exception occurred (97%; 2 templates) |
| 81 | `850000005` | 125 | 0 | 0 | imaging |  | 125 | 1 | 116 | 2026-05-04 | 2026-11-23 | Error: NonRecoverable: Failed to create SnapshotDBStore object  Stack… |
| 82 | `660030017` | 0 | 119 | 0 | software |  | 119 | 15 | 103 | 2026-05-04 | 2026-11-20 | Warning: Geometry module orientation switch problem |
| 83 | `70000140` | 97 | 15 | 0 | imaging | `pcv.ippc:pc_hardware` | 112 | 3 | 90 | 2026-05-04 | 2026-11-03 | PC hardware Error |
| 84 | `510028687` | 0 | 112 | 0 | acquisition |  | 112 | 14 | 45 | 2026-05-01 | 2026-11-23 | Geometry indicates unknown SourceSkinDistance HHS : Set minimum EDLD |
| 85 | `100062735` | 106 | 0 | 0 | power_io |  | 106 | 5 | 99 | 2026-05-01 | 2026-11-17 | Service error: voltage error on output #V# bank-A R-cab (73%; 3 templates) |
| 86 | `53222005` | 0 | 106 | 0 | detector |  | 106 | 7 | 106 | 2026-05-01 | 2026-11-03 | FD Controller: Detector temperature is too low |
| 87 | `10112121` | 0 | 102 | 0 | generator | `pcv.generator_fault:tube_arcing` | 102 | 8 | 37 | 2026-05-01 | 2026-11-16 | XSC: Tube Arcing detected |
| 88 | `540000034` | 0 | 100 | 0 | software |  | 100 | 8 | 18 | 2026-05-09 | 2026-11-09 | The examination state is closed or completed, this is an invalid stat… (61%; 4 templates) |
| 89 | `63001071` | 0 | 98 | 0 | mechanics |  | 98 | 1 | 76 | 2026-05-01 | 2026-10-16 | Application error: SynqNet warning |
| 90 | `510740101` | 98 | 0 | 0 | acquisition |  | 98 | 2 | 3 | 2026-08-17 | 2026-11-17 | Xper Validation Failure |
| 91 | `670000204` | 5 | 90 | 0 | connectivity |  | 95 | 5 | 61 | 2026-05-01 | 2026-11-18 | Application error: database inconsistent. |
| 92 | `510020510` | 0 | 95 | 0 | acquisition |  | 95 | 1 | 1 | 2026-11-17 | 2026-11-17 | Xper settings validation failure: No licence available for LIH. |
| 93 | `730999900` ‡ | 93 | 0 | 0 | software |  | 93 | 24 | 57 | 2026-05-04 | 2026-11-18 | Programming error: process terminated due to a fatal exception. |
| 94 | `670000200` | 0 | 91 | 0 | connectivity |  | 91 | 13 | 38 | 2026-05-05 | 2026-11-19 | Warning: unable to retrieve image from image store. |
| 95 | `100062729` | 90 | 0 | 0 | power_io |  | 90 | 10 | 81 | 2026-05-08 | 2026-11-17 | Service error: voltage error on output #V# bank-A M-cab (49%; 3 templates) |
| 96 | `53350009` | 0 | 89 | 0 | detector |  | 89 | 2 | 88 | 2026-05-01 | 2026-07-31 | FD Controller: Detector temperature is too low |
| 97 | `10027287` | 0 | 85 | 0 | generator |  | 85 | 2 | 2 | 2026-05-04 | 2026-10-26 | Application Error: Generator exception occurred |
| 98 | `510008306` | 0 | 84 | 0 | acquisition |  | 84 | 4 | 4 | 2026-05-04 | 2026-11-04 | Could not access X-ray generator (buffered) via XRayGeneration service |
| 99 | `10000014` ‡ | 0 | 83 | 0 | generator |  | 83 | 2 | 51 | 2026-05-01 | 2026-11-18 | Request of client failed (95%; 2 templates) |
| 100 | `40000159` | 76 | 0 | 0 | mechanics |  | 76 | 1 | 32 | 2026-05-07 | 2026-10-13 | Application error : CollimatorDriver Iris Area is not available |
| 101 | `100062736` | 76 | 0 | 0 | power_io |  | 76 | 1 | 72 | 2026-05-01 | 2026-08-14 | Service error: voltage error on output #V# bank-B R-cab |
| 102 | `80010055` | 0 | 76 | 0 | power_io |  | 76 | 6 | 14 | 2026-05-01 | 2026-11-02 | Communication error: Configured UI module is not detected. |
| 103 | `100062730` | 75 | 0 | 0 | power_io |  | 75 | 9 | 69 | 2026-05-08 | 2026-11-17 | Service error: voltage error on output #V# bank-B B-cab (48%; 3 templates) |
| 104 | `50001016` | 0 | 75 | 0 | detector |  | 75 | 3 | 6 | 2026-05-22 | 2026-11-05 | This resource is no longer valid (expired) |
| 105 | `510800302` | 74 | 0 | 0 | acquisition |  | 74 | 1 | 1 | 2026-11-17 | 2026-11-17 | Xper Validation Failure |
| 106 | `620000002` | 55 | 18 | 5,481 | service |  | 5,554 | 41 | 3,008 | 2026-05-01 | 2026-11-24 | Base.Job.Queue.jobQueue: No PersistencyFile in C:\Program Files\PMS\F… (58%; 14 templates) |
| 107 | `650139912` | 72 | 0 | 0 | software |  | 72 | 11 | 33 | 2026-05-02 | 2026-11-04 | Programming error: COM server not available. |
| 108 | `70000123` | 67 | 0 | 0 | imaging | `pcv.ippc:image_disk` | 67 | 4 | 61 | 2026-05-02 | 2026-11-24 | Image Disk Error (Write Error) |
| 109 | `50005084` | 67 | 0 | 0 | detector |  | 67 | 2 | 3 | 2026-07-15 | 2026-11-19 | FD Controller interface error |
| 110 | `100062741` | 66 | 0 | 0 | power_io |  | 66 | 8 | 61 | 2026-05-08 | 2026-11-17 | Service error: voltage error on output #V# bank-A B-cab (50%; 3 templates) |
| 111 | `510610050` | 0 | 65 | 0 | acquisition |  | 65 | 1 | 1 | 2026-11-17 | 2026-11-17 | ATC license not available, ATC functionality disabled |
| 112 | `510020500` ‡ | 64 | 0 | 0 | acquisition |  | 64 | 1 | 42 | 2026-05-01 | 2026-11-18 | Application error: XRayGenerator failed to prepare for Acquisition. |
| 113 | `100062605` | 64 | 0 | 0 | power_io |  | 64 | 1 | 21 | 2026-07-10 | 2026-10-26 | Service error: PDU M Cab SD card in Write protect mode |
| 114 | `100060008` | 0 | 59 | 0 | power_io |  | 59 | 1 | 2 | 2026-10-18 | 2026-10-19 | Temperature Warning event received from MPD |
| 115 | `70000118` | 58 | 0 | 0 | imaging |  | 58 | 17 | 37 | 2026-05-04 | 2026-11-09 | no network connection Image Detection - IPPC |
| 116 | `730999902` | 58 | 0 | 0 | software |  | 58 | 17 | 55 | 2026-05-02 | 2026-11-19 | Programming error: structured exception. |
| 117 | `620000012` | 0 | 56 | 5 | service |  | 61 | 5 | 54 | 2026-05-12 | 2026-11-20 | Connectivity.Dicom.Access.PEER: Association ABORTED by Peer (#: ABORT… (90%; 3 templates) |
| 118 | `63000324` | 56 | 0 | 0 | mechanics |  | 56 | 3 | 53 | 2026-08-13 | 2026-11-20 | Application error: BeamLongitudinal position Not Calibrated (77%; 2 templates) |
| 119 | `40000253` | 0 | 53 | 0 | mechanics |  | 53 | 3 | 34 | 2026-05-07 | 2026-11-02 | Application error : CollimatorDriver Configuration mismatch. Parts de… |
| 120 | `510610015` | 52 | 0 | 0 | acquisition |  | 52 | 4 | 7 | 2026-05-13 | 2026-11-05 | Validation of override failure |
| 121 | `10007780` | 0 | 50 | 0 | generator | `pcv.generator_fault:generator_exception` | 50 | 12 | 23 | 2026-05-19 | 2026-11-20 | Application Error: Generator exception occurred |
| 122 | `100060103` | 49 | 0 | 0 | power_io |  | 49 | 15 | 47 | 2026-05-03 | 2026-11-18 | Service error: Connection with GPDU lost |
| 123 | `100019930` | 48 | 0 | 11,459 | power_io |  | 11,507 | 42 | 3,029 | 2026-05-01 | 2026-11-25 | POST SIBPOST Passed (33%; 9 templates) |
| 124 | `620010001` | 46 | 0 | 167 | service |  | 213 | 24 | 45 | 2026-05-01 | 2026-11-19 | The ENERGYANDSIGNALFLOW#TESTFRONTAL was executed and had result Succe… (16%; 23 templates) |
| 125 | `100062742` | 45 | 0 | 0 | power_io |  | 45 | 6 | 41 | 2026-05-19 | 2026-11-17 | Service error: voltage error on output #V# bank-B B-cab (51%; 3 templates) |
| 126 | `63000000` | 44 | 0 | 0 | mechanics |  | 44 | 7 | 26 | 2026-05-04 | 2026-11-05 | Programming error:  GECO #F# .\ad#_sg.c## TNT_TOS:Unknown tsk name (48%; 8 templates) |
| 127 | `70000156` | 44 | 0 | 0 | imaging |  | 44 | 5 | 11 | 2026-06-12 | 2026-11-19 | Programming Error |
| 128 | `510020514` | 0 | 44 | 0 | acquisition |  | 44 | 1 | 1 | 2026-06-23 | 2026-06-23 | CumulativeAreaDose not received from AEP meter within interval. |
| 129 | `10006689` | 44 | 0 | 0 | generator | `pcv.generator_fault:generator_exception` | 44 | 1 | 5 | 2026-08-05 | 2026-11-05 | Application Error: Generator exception occurred |
| 130 | `63001126` | 43 | 0 | 0 | mechanics |  | 43 | 7 | 24 | 2026-05-14 | 2026-11-18 | Application error: Motor assembly error [axis=FrtLong] (67%; 7 templates) |
| 131 | `53322005` | 0 | 43 | 0 | detector |  | 43 | 2 | 40 | 2026-05-01 | 2026-10-21 | FD Controller: Detector temperature is too low |
| 132 | `40000153` | 42 | 0 | 0 | mechanics |  | 42 | 5 | 10 | 2026-06-15 | 2026-11-06 | Application error : CollimatorDriver Left Wedge Area is not available |
| 133 | `510016411` | 40 | 0 | 0 | acquisition |  | 40 | 2 | 4 | 2026-05-06 | 2026-11-09 | Programming error: Database read error |
| 134 | `510008307` | 0 | 40 | 0 | acquisition |  | 40 | 4 | 4 | 2026-05-04 | 2026-11-04 | Could not access X-ray generator (unbuffered) via XRayGeneration serv… |
| 135 | `830010008` | 39 | 0 | 528 | remote_service |  | 567 | 25 | 483 | 2026-05-01 | 2026-11-23 | An Exception occurred in AuthorizationHandler(), could not explicitly… (93%; 2 templates) |
| 136 | `710010042` ‡ | 0 | 37 | 0 | software |  | 37 | 1 | 36 | 2026-05-01 | 2026-11-20 | Programming error: DbServer external COM component released, but not … |
| 137 | `510008335` ‡ | 0 | 36 | 0 | acquisition |  | 36 | 14 | 19 | 2026-05-06 | 2026-11-17 | Service on which Acquisition depends has terminated |
| 138 | `510024581` | 0 | 36 | 0 | acquisition |  | 36 | 1 | 1 | 2026-11-03 | 2026-11-03 | Application warning: Spectral filter unavailable |
| 139 | `40000006` | 35 | 0 | 0 | mechanics |  | 35 | 2 | 7 | 2026-05-19 | 2026-11-06 | Application error : Collimator Wedge hardware or mechanics defect |
| 140 | `510004096` | 0 | 35 | 0 | acquisition |  | 35 | 13 | 34 | 2026-05-05 | 2026-11-23 | Programming error: unable to execute command because of disabled stat… |
| 141 | `63000325` | 33 | 0 | 0 | mechanics |  | 33 | 12 | 13 | 2026-05-22 | 2026-11-11 | Application error: ENMV_at_startup_HIGH |
| 142 | `100060012` | 0 | 33 | 0 | power_io |  | 33 | 9 | 33 | 2026-05-05 | 2026-11-18 | Application warning: shutdown of PDU may not work |
| 143 | `40009930` | 32 | 0 | 4,080 | mechanics |  | 4,112 | 41 | 2,967 | 2026-05-01 | 2026-11-24 | POST Frontal Collimator Passed (87%; 3 templates) |
| 144 | `520010003` ‡ | 32 | 0 | 0 | imaging |  | 32 | 9 | 30 | 2026-05-15 | 2026-11-12 | Programming Error (97%; 2 templates) |
| 145 | `10112091` | 32 | 0 | 0 | generator |  | 32 | 2 | 5 | 2026-05-01 | 2026-07-13 | XSC: CLM flow switch opened |
| 146 | `60000011` | 31 | 0 | 0 | mechanics |  | 31 | 6 | 17 | 2026-05-30 | 2026-11-23 | Application error : Unable to communicate with GeoIPC. SID is unknown… |
| 147 | `510028686` | 0 | 31 | 0 | acquisition |  | 31 | 5 | 15 | 2026-05-30 | 2026-11-23 | Geometry indicates unknown SourceImageDistance : ImagingArea is set w… |
| 148 | `100062743` | 30 | 0 | 0 | power_io |  | 30 | 4 | 27 | 2026-05-19 | 2026-11-17 | Service error: voltage error on output #V# bank-A B-cab (53%; 3 templates) |
| 149 | `63000295` | 0 | 30 | 0 | mechanics |  | 30 | 12 | 26 | 2026-05-07 | 2026-11-17 | Power supply switched off |
| 150 | `63001009` | 0 | 29 | 0 | mechanics |  | 29 | 5 | 23 | 2026-05-01 | 2026-09-24 | Table power is switched off |
| 151 | `540000008` | 0 | 29 | 0 | software |  | 29 | 8 | 15 | 2026-05-04 | 2026-11-12 | For Exam Folder with StartDateTime=#-# #:#:# (dd-MM HH:mm:ss), EPX-es… |
| 152 | `520019912` | 28 | 0 | 0 | imaging |  | 28 | 12 | 21 | 2026-05-06 | 2026-11-16 | Programming error: COM server not available. |
| 153 | `510710102` | 27 | 0 | 0 | acquisition |  | 27 | 2 | 2 | 2026-08-17 | 2026-11-17 | Cine Xper Validation Failure |
| 154 | `10112115` | 0 | 26 | 0 | generator |  | 26 | 2 | 7 | 2026-05-05 | 2026-08-27 | XSC: Tube Current out of range. Warning |
| 155 | `70000148` | 25 | 0 | 0 | imaging |  | 25 | 8 | 24 | 2026-05-06 | 2026-11-19 | Corrupted images received from image detection |
| 156 | `670000201` | 0 | 25 | 0 | connectivity |  | 25 | 7 | 21 | 2026-06-05 | 2026-11-13 | Application error: preparation for image processing failed. |
| 157 | `80010014` | 24 | 0 | 0 | power_io |  | 24 | 5 | 5 | 2026-05-29 | 2026-11-05 | SIB GENCAN error |
| 158 | `20000008` | 18 | 6 | 7 | generator |  | 31 | 5 | 17 | 2026-05-04 | 2026-11-17 | Reduced performance detected |
| 159 | `850000006` | 0 | 24 | 667 | imaging |  | 691 | 12 | 125 | 2026-05-01 | 2026-11-24 | Info: Snapshot has been taken from channel i# (97%; 2 templates) |
| 160 | `63000320` | 0 | 24 | 0 | mechanics |  | 24 | 2 | 6 | 2026-05-08 | 2026-09-25 | Application error: Motor power dropped (e-stop pressed?) |
| 161 | `53211404` | 24 | 0 | 0 | detector |  | 24 | 3 | 5 | 2026-07-12 | 2026-11-23 | FD Controller: No connection with system controller |
| 162 | `510008314` | 0 | 22 | 0 | acquisition |  | 22 | 5 | 5 | 2026-05-04 | 2026-11-05 | Could not access capability info via XRayGeneration service |
| 163 | `53211206` | 22 | 0 | 0 | detector |  | 22 | 1 | 1 | 2026-08-17 | 2026-08-17 | FD Controller: Interface calls not (yet) possible! |
| 164 | `650400035` | 0 | 21 | 0 | software |  | 21 | 14 | 19 | 2026-05-06 | 2026-11-17 | Connected application died |
| 165 | `53231001` | 21 | 0 | 0 | detector |  | 21 | 2 | 2 | 2026-07-18 | 2026-08-17 | FD Controller: Detector startup timed out. |
| 166 | `53231006` | 21 | 0 | 0 | detector |  | 21 | 2 | 2 | 2026-07-18 | 2026-08-17 | FD Controller: Communication error with FD detector |
| 167 | `610029912` | 20 | 0 | 0 | software |  | 20 | 7 | 9 | 2026-05-06 | 2026-11-04 | Programming error: COM server not available. |
| 168 | `620000011` | 0 | 19 | 0 | service |  | 19 | 1 | 1 | 2026-05-01 | 2026-05-01 | (rare template, not shown) |
| 169 | `510801302` | 19 | 0 | 0 | acquisition |  | 19 | 1 | 1 | 2026-11-17 | 2026-11-17 | (rare template, not shown) |
| 170 | `510020511` | 0 | 19 | 0 | acquisition |  | 19 | 1 | 1 | 2026-11-17 | 2026-11-17 | (rare template, not shown) |
| 171 | `50005093` | 18 | 0 | 0 | detector |  | 18 | 2 | 5 | 2026-05-27 | 2026-10-21 | Overall FD POST failed |
| 172 | `50007756` ‡ | 0 | 18 | 0 | detector |  | 18 | 1 | 9 | 2026-05-14 | 2026-11-17 | (rare template, not shown) |
| 173 | `53210222` | 0 | 18 | 0 | detector |  | 18 | 3 | 5 | 2026-05-27 | 2026-10-29 | FD Controller: Flat Detector Subsystem is NOT AVAILABLE for Clinical … |
| 174 | `80010050` | 15 | 3 | 0 | power_io |  | 18 | 10 | 13 | 2026-06-01 | 2026-11-19 | Communication error: Module reported an error. |
| 175 | `50005075` | 18 | 0 | 0 | detector |  | 18 | 1 | 1 | 2026-08-17 | 2026-08-17 | (rare template, not shown) |
| 176 | `760060052` ‡ | 17 | 0 | 0 | software |  | 17 | 1 | 17 | 2026-05-14 | 2026-11-03 | (rare template, not shown) |
| 177 | `10028773` | 0 | 17 | 0 | generator |  | 17 | 1 | 2 | 2026-10-26 | 2026-11-03 | (rare template, not shown) |
| 178 | `510610100` | 16 | 0 | 0 | acquisition |  | 16 | 3 | 6 | 2026-05-13 | 2026-08-31 | Programming error: device programming error |
| 179 | `63001052` | 16 | 0 | 0 | mechanics |  | 16 | 1 | 15 | 2026-05-04 | 2026-09-24 | (rare template, not shown) |
| 180 | `100010020` | 0 | 16 | 0 | power_io |  | 16 | 1 | 16 | 2026-05-12 | 2026-07-29 | (rare template, not shown) |
| 181 | `63001132` | 16 | 0 | 0 | mechanics |  | 16 | 2 | 15 | 2026-06-23 | 2026-11-16 | Application error: AD# Tilt level mismatch |
| 182 | `70000144` | 16 | 0 | 0 | imaging |  | 16 | 3 | 5 | 2026-06-17 | 2026-11-05 | Startup of IP-PC not completed |
| 183 | `70000150` | 15 | 0 | 0 | imaging |  | 15 | 10 | 15 | 2026-05-21 | 2026-11-11 | Image Processing malfunction (Missing image(s) on view Display Device) |
| 184 | `100060111` | 15 | 0 | 0 | power_io |  | 15 | 8 | 10 | 2026-05-18 | 2026-10-12 | Service error: initialization of communication with gPDU failed |
| 185 | `510008313` | 0 | 15 | 0 | acquisition |  | 15 | 4 | 4 | 2026-05-04 | 2026-11-04 | Could not access availability info via XRayGeneration service |
| 186 | `650000051` ‡ | 0 | 15 | 0 | software |  | 15 | 6 | 8 | 2026-05-15 | 2026-11-05 | Network Error |
| 187 | `80010016` | 0 | 15 | 0 | power_io |  | 15 | 8 | 13 | 2026-05-13 | 2026-11-18 | Control is active at startup |
| 188 | `70000108` | 15 | 0 | 0 | imaging |  | 15 | 5 | 6 | 2026-06-15 | 2026-11-05 | no control network connection IPPC - Host |
| 189 | `80010051` | 15 | 0 | 0 | power_io |  | 15 | 1 | 1 | 2026-06-17 | 2026-06-17 | (rare template, not shown) |
| 190 | `510032769` | 0 | 15 | 0 | acquisition |  | 15 | 4 | 4 | 2026-07-21 | 2026-10-28 | Graceful degradation: X-ray still possible |
| 191 | `650409900` | 14 | 0 | 0 | software |  | 14 | 9 | 12 | 2026-05-06 | 2026-11-17 | Programming error: process terminated due to a fatal exception. |
| 192 | `650409901` | 14 | 0 | 0 | software |  | 14 | 9 | 12 | 2026-05-06 | 2026-11-17 | Programming error: unspecified exception. |
| 193 | `80010052` | 14 | 0 | 0 | power_io |  | 14 | 8 | 9 | 2026-06-02 | 2026-11-19 | Communication error: UI module has a wrong application version. |
| 194 | `11030103` | 0 | 14 | 0 | generator |  | 14 | 1 | 4 | 2026-07-10 | 2026-09-16 | (rare template, not shown) |
| 195 | `620160002` | 14 | 0 | 0 | service |  | 14 | 2 | 3 | 2026-09-11 | 2026-11-04 | Failure operating with the X-Ray Generator service |
| 196 | `570000003` | 13 | 0 | 0 | connectivity |  | 13 | 6 | 7 | 2026-05-01 | 2026-09-08 | Application error: Connect with Repository failed |
| 197 | `63000329` | 13 | 0 | 0 | mechanics |  | 13 | 2 | 7 | 2026-05-01 | 2026-11-10 | Application error: Error on DetectorLateral movement |
| 198 | `70000102` | 13 | 0 | 0 | imaging |  | 13 | 7 | 13 | 2026-05-06 | 2026-11-13 | Application Error |
| 199 | `730999903` | 13 | 0 | 0 | software |  | 13 | 4 | 12 | 2026-05-05 | 2026-10-18 | Programming error: precondition violation. |
| 200 | `10008974` | 13 | 0 | 0 | generator | `pcv.generator_fault:generator_exception` | 13 | 6 | 8 | 2026-05-19 | 2026-11-17 | Application Error: Generator exception occurred |
| 201 | `10028778` | 0 | 13 | 0 | generator |  | 13 | 1 | 2 | 2026-09-25 | 2026-10-26 | (rare template, not shown) |
| 202 | `10112154` | 12 | 0 | 0 | generator |  | 12 | 1 | 7 | 2026-05-12 | 2026-10-09 | (rare template, not shown) |
| 203 | `530010200` | 12 | 0 | 0 | imaging |  | 12 | 1 | 1 | 2026-06-05 | 2026-06-05 | (rare template, not shown) |
| 204 | `50007757` ‡ | 0 | 12 | 0 | detector |  | 12 | 1 | 6 | 2026-06-29 | 2026-10-12 | (rare template, not shown) |
| 205 | `10027273` | 0 | 12 | 0 | generator |  | 12 | 4 | 10 | 2026-06-10 | 2026-11-19 | Application Error: Generator exception occurred |
| 206 | `63000334` | 12 | 0 | 0 | mechanics |  | 12 | 4 | 5 | 2026-08-13 | 2026-10-26 | Application error: BIB: BIB Cookie safeguard problem, possible defect… (58%; 3 templates) |
| 207 | `70020004` | 12 | 0 | 0 | imaging |  | 12 | 1 | 1 | 2026-10-07 | 2026-10-07 | (rare template, not shown) |
| 208 | `660009900` | 11 | 0 | 0 | software |  | 11 | 7 | 9 | 2026-05-06 | 2026-11-04 | Programming error: process terminated due to a fatal exception. |
| 209 | `660009901` | 11 | 0 | 0 | software |  | 11 | 7 | 9 | 2026-05-06 | 2026-11-04 | Programming error: unspecified exception. |
| 210 | `660050012` | 11 | 0 | 0 | software |  | 11 | 7 | 9 | 2026-05-06 | 2026-11-04 | Programming error: a function call failed |
| 211 | `730999909` | 11 | 0 | 0 | software |  | 11 | 4 | 4 | 2026-05-06 | 2026-11-04 | Programming error: COM method failed. |
| 212 | `510610101` | 0 | 11 | 11,048 | acquisition |  | 11,059 | 15 | 17 | 2026-05-04 | 2026-11-17 | #-factor technique values are limited and deviate from requested valu… (100%; 2 templates) |
| 213 | `10000008` ‡ | 1 | 10 | 0 | generator |  | 11 | 2 | 11 | 2026-05-12 | 2026-10-30 | (rare template, not shown) |
| 214 | `70000157` | 11 | 0 | 0 | imaging |  | 11 | 3 | 4 | 2026-06-05 | 2026-11-03 | Programming Error |
| 215 | `620110014` | 11 | 0 | 0 | service |  | 11 | 1 | 1 | 2026-09-02 | 2026-09-02 | (rare template, not shown) |
| 216 | `40000152` | 10 | 0 | 0 | mechanics |  | 10 | 5 | 7 | 2026-05-28 | 2026-11-05 | Application error : CollimatorDriver AEP Area is not available |
| 217 | `53230001` | 10 | 0 | 0 | detector |  | 10 | 1 | 2 | 2026-05-27 | 2026-07-10 | (rare template, not shown) |
| 218 | `20000003` | 10 | 0 | 0 | generator |  | 10 | 5 | 5 | 2026-05-04 | 2026-11-04 | Timeout establishing connection with the Generator |
| 219 | `70000154` | 10 | 0 | 0 | imaging |  | 10 | 3 | 6 | 2026-06-18 | 2026-11-19 | Programming Error |
| 220 | `10999900` | 10 | 0 | 0 | generator |  | 10 | 5 | 10 | 2026-06-04 | 2026-09-09 | Programming error: process terminated due to a fatal exception. |
| 221 | `10999904` | 10 | 0 | 0 | generator |  | 10 | 5 | 10 | 2026-06-04 | 2026-09-09 | Programming error: postcondition violation. |
| 222 | `11030204` | 10 | 0 | 0 | generator |  | 10 | 1 | 4 | 2026-07-10 | 2026-09-16 | (rare template, not shown) |
| 223 | `50005061` | 10 | 0 | 0 | detector |  | 10 | 1 | 1 | 2026-08-31 | 2026-08-31 | (rare template, not shown) |
| 224 | `10028771` | 0 | 10 | 0 | generator |  | 10 | 1 | 4 | 2026-09-16 | 2026-11-03 | (rare template, not shown) |
| 225 | `10028774` | 10 | 0 | 0 | generator |  | 10 | 1 | 1 | 2026-10-26 | 2026-10-26 | (rare template, not shown) |
| 226 | `40000154` | 9 | 0 | 0 | mechanics |  | 9 | 5 | 5 | 2026-05-19 | 2026-11-05 | Application error : CollimatorDriver Right Wedge Area is not available |
| 227 | `10008854` | 9 | 0 | 0 | generator |  | 9 | 4 | 8 | 2026-05-04 | 2026-11-12 | Application Error: Generator exception occurred |
| 228 | `63000326` | 0 | 9 | 0 | mechanics |  | 9 | 2 | 3 | 2026-05-06 | 2026-08-14 | (rare template, not shown) |
| 229 | `100020002` | 0 | 9 | 0 | power_io |  | 9 | 3 | 5 | 2026-05-01 | 2026-11-03 | Application error: Beeper can not beep |
| 230 | `70000117` | 9 | 0 | 0 | imaging |  | 9 | 4 | 4 | 2026-06-15 | 2026-11-05 | cannot communicate with IPPC |
| 231 | `63001133` | 8 | 0 | 0 | mechanics |  | 8 | 2 | 7 | 2026-05-14 | 2026-11-18 | Application error: Power from GIB to [unit=Table], [status=off] |
| 232 | `10027288` | 8 | 0 | 0 | generator |  | 8 | 2 | 3 | 2026-05-04 | 2026-11-03 | Application Error: Generator exception occurred |
| 233 | `760060049` | 0 | 8 | 4,235 | software |  | 4,243 | 25 | 142 | 2026-05-01 | 2026-11-24 | Service start timeout |
| 234 | `40000150` | 8 | 0 | 0 | mechanics |  | 8 | 4 | 4 | 2026-06-15 | 2026-11-05 | Application error : CollimatorDriver Filter Area is not available |
| 235 | `10131357` | 8 | 0 | 0 | generator |  | 8 | 1 | 4 | 2026-06-11 | 2026-09-29 | (rare template, not shown) |
| 236 | `80020201` | 0 | 8 | 0 | power_io |  | 8 | 4 | 4 | 2026-06-09 | 2026-09-06 | Control is active at startup |
| 237 | `63001124` | 8 | 0 | 0 | mechanics |  | 8 | 1 | 1 | 2026-10-23 | 2026-10-23 | (rare template, not shown) |
| 238 | `650000050` | 7 | 0 | 3 | software |  | 10 | 4 | 8 | 2026-05-04 | 2026-11-05 | Error in Xper module Service |
| 239 | `50001008` | 7 | 0 | 12 | detector |  | 19 | 4 | 9 | 2026-05-15 | 2026-11-09 | (rare template, not shown) |
| 240 | `520010110` | 7 | 0 | 0 | imaging |  | 7 | 3 | 5 | 2026-05-06 | 2026-09-11 | Programming Error: Illegal Image Selection |
| 241 | `620250000` | 7 | 0 | 76 | service |  | 83 | 13 | 35 | 2026-05-01 | 2026-11-17 | The output of Adjustment is SUCCESS..The Adjustment started at #-#-# … (70%; 12 templates) |
| 242 | `650110006` | 7 | 0 | 0 | software |  | 7 | 2 | 4 | 2026-06-10 | 2026-09-24 | Dose Secondary Capture Report could not be created. Check software un… |
| 243 | `620260006` | 0 | 7 | 0 | service |  | 7 | 3 | 4 | 2026-06-30 | 2026-11-06 | Image detector failure. |
| 244 | `10110001` | 0 | 7 | 0 | generator |  | 7 | 3 | 3 | 2026-06-23 | 2026-11-05 | XSC: Illegal Message from System |
| 245 | `10037274` | 7 | 0 | 0 | generator |  | 7 | 1 | 4 | 2026-07-28 | 2026-07-31 | (rare template, not shown) |
| 246 | `20000020` | 0 | 7 | 0 | generator |  | 7 | 2 | 2 | 2026-07-17 | 2026-11-04 | X-ray Generator operation failed |
| 247 | `53241021` | 7 | 0 | 0 | detector |  | 7 | 2 | 2 | 2026-08-17 | 2026-11-12 | FD Controller: Ioboard uart timeout while receiving data |
| 248 | `510999901` ‡ | 6 | 0 | 0 | acquisition |  | 6 | 4 | 5 | 2026-05-06 | 2026-09-11 | Programming error: unspecified exception. |
| 249 | `70000115` | 6 | 0 | 0 | imaging |  | 6 | 1 | 3 | 2026-05-31 | 2026-10-04 | (rare template, not shown) |
| 250 | `730999901` | 6 | 0 | 0 | software |  | 6 | 5 | 5 | 2026-05-04 | 2026-10-09 | Programming error: unspecified exception. |
| 251 | `10131358` | 6 | 0 | 0 | generator |  | 6 | 1 | 3 | 2026-05-04 | 2026-06-08 | (rare template, not shown) |
| 252 | `510008333` ‡ | 0 | 6 | 154 | acquisition |  | 160 | 16 | 120 | 2026-05-01 | 2026-11-24 | User output: Waiting for external service to become operational (96%; 2 templates) |
| 253 | `570000005` | 0 | 6 | 0 | connectivity |  | 6 | 1 | 3 | 2026-05-06 | 2026-07-10 | (rare template, not shown) |
| 254 | `10008383` | 6 | 0 | 0 | generator |  | 6 | 2 | 2 | 2026-07-17 | 2026-11-04 | Application Error: Generator exception occurred |
| 255 | `53222007` | 0 | 6 | 0 | detector |  | 6 | 1 | 3 | 2026-08-13 | 2026-08-17 | (rare template, not shown) |
| 256 | `530019912` | 6 | 0 | 0 | imaging |  | 6 | 2 | 2 | 2026-10-07 | 2026-11-04 | Programming error: COM server not available. |
| 257 | `10008969` | 6 | 0 | 0 | generator |  | 6 | 1 | 1 | 2026-10-26 | 2026-10-26 | (rare template, not shown) |
| 258 | `100010017` | 0 | 6 | 0 | power_io |  | 6 | 2 | 2 | 2026-11-02 | 2026-11-05 | Application error: communication with SIB board failed |
| 259 | `510999909` | 5 | 0 | 0 | acquisition |  | 5 | 4 | 5 | 2026-05-20 | 2026-08-14 | Programming error: COM method failed. |
| 260 | `40000008` | 5 | 0 | 0 | mechanics |  | 5 | 2 | 4 | 2026-05-28 | 2026-06-23 | Application error : Collimator Dose Measurement Device hardware or me… |
| 261 | `640100001` | 0 | 5 | 0 | software |  | 5 | 4 | 5 | 2026-05-22 | 2026-10-22 | Application error: Dangling recorded image list(s). |
| 262 | `100010019` | 0 | 5 | 0 | power_io |  | 5 | 3 | 5 | 2026-05-20 | 2026-11-11 | Application error: communication with MPD unit failed |
| 263 | `520010117` | 0 | 5 | 0 | imaging |  | 5 | 2 | 5 | 2026-05-04 | 2026-08-21 | Programming Error: Illegal Image Selection |
| 264 | `10131104` | 0 | 5 | 0 | generator |  | 5 | 2 | 4 | 2026-05-08 | 2026-07-20 | PoInt: HV symmetric warning |
| 265 | `40000151` | 5 | 0 | 0 | mechanics |  | 5 | 3 | 3 | 2026-06-15 | 2026-11-05 | Application error : CollimatorDriver Light Area is not available |
| 266 | `40000156` | 5 | 0 | 0 | mechanics |  | 5 | 3 | 3 | 2026-06-15 | 2026-11-05 | Application error : CollimatorDriver Detector related shutter area is… |
| 267 | `580009901` | 5 | 0 | 0 | mechanics |  | 5 | 5 | 5 | 2026-06-26 | 2026-08-17 | Programming error: unspecified exception. |
| 268 | `620110039` | 5 | 0 | 13 | service |  | 18 | 4 | 7 | 2026-06-12 | 2026-11-04 | The RECREATEIMAGESTOREFRONTAL was executed and had result Successful (72%; 2 templates) |
| 269 | `63001050` | 5 | 0 | 0 | mechanics |  | 5 | 2 | 5 | 2026-07-24 | 2026-08-19 | Application error: Motion controller: Position error |
| 270 | `53211417` | 5 | 0 | 0 | detector |  | 5 | 3 | 5 | 2026-07-12 | 2026-11-23 | FD Controller: Connection abort by system controller |
| 271 | `540000072` | 5 | 0 | 0 | software |  | 5 | 2 | 3 | 2026-07-06 | 2026-08-07 | Default System Printer not installed |
| 272 | `510710103` | 5 | 0 | 0 | acquisition |  | 5 | 1 | 1 | 2026-08-17 | 2026-08-17 | (rare template, not shown) |
| 273 | `53322008` | 5 | 0 | 0 | detector |  | 5 | 1 | 1 | 2026-08-17 | 2026-08-17 | (rare template, not shown) |
| 274 | `590009912` | 4 | 0 | 0 | mechanics |  | 4 | 4 | 4 | 2026-05-13 | 2026-11-10 | Programming error: COM server not available. |
| 275 | `620160008` | 4 | 0 | 0 | service |  | 4 | 3 | 3 | 2026-05-19 | 2026-07-22 | Failure operating the acquisition hand/foot switch |
| 276 | `63001017` | 4 | 0 | 0 | mechanics |  | 4 | 1 | 2 | 2026-05-01 | 2026-05-04 | (rare template, not shown) |
| 277 | `50005091` | 4 | 0 | 0 | detector |  | 4 | 1 | 2 | 2026-05-28 | 2026-06-05 | (rare template, not shown) |
| 278 | `530010001` | 4 | 0 | 0 | imaging |  | 4 | 1 | 2 | 2026-05-01 | 2026-07-28 | (rare template, not shown) |
| 279 | `580009912` | 4 | 0 | 0 | mechanics |  | 4 | 4 | 4 | 2026-05-13 | 2026-11-10 | Programming error: COM server not available. |
| 280 | `70000158` | 4 | 0 | 0 | imaging |  | 4 | 3 | 4 | 2026-06-11 | 2026-11-03 | Programming Error |
| 281 | `70000106` | 4 | 0 | 0 | imaging |  | 4 | 2 | 2 | 2026-07-15 | 2026-11-04 | Display Device configuration Error |
| 282 | `70000122` | 4 | 0 | 0 | imaging |  | 4 | 1 | 2 | 2026-07-07 | 2026-07-15 | (rare template, not shown) |
| 283 | `10008885` | 0 | 4 | 0 | generator |  | 4 | 1 | 3 | 2026-07-29 | 2026-10-26 | (rare template, not shown) |
| 284 | `10058468` | 4 | 0 | 0 | generator |  | 4 | 1 | 2 | 2026-08-05 | 2026-11-05 | (rare template, not shown) |
| 285 | `11034204` | 4 | 0 | 0 | generator |  | 4 | 1 | 2 | 2026-08-26 | 2026-09-16 | (rare template, not shown) |
| 286 | `63000500` | 4 | 0 | 0 | mechanics |  | 4 | 1 | 1 | 2026-09-02 | 2026-09-02 | (rare template, not shown) |
| 287 | `63001120` | 4 | 0 | 0 | mechanics |  | 4 | 1 | 1 | 2026-09-17 | 2026-09-17 | (rare template, not shown) |
| 288 | `53311404` | 4 | 0 | 0 | detector |  | 4 | 1 | 1 | 2026-09-17 | 2026-09-17 | (rare template, not shown) |
| 289 | `40000207` | 4 | 0 | 0 | mechanics |  | 4 | 2 | 2 | 2026-11-02 | 2026-11-05 | Application error : SysCAN GenCAN not operational |
| 290 | `10008882` | 0 | 4 | 0 | generator |  | 4 | 1 | 1 | 2026-11-05 | 2026-11-05 | (rare template, not shown) |
| 291 | `770010003` | 3 | 0 | 0 | connectivity |  | 3 | 2 | 3 | 2026-05-31 | 2026-06-03 | Network Connectivity check failed. |
| 292 | `730999904` | 3 | 0 | 0 | software |  | 3 | 2 | 3 | 2026-05-13 | 2026-09-19 | Programming error: postcondition violation. |
| 293 | `10131211` | 3 | 0 | 0 | generator |  | 3 | 3 | 3 | 2026-05-08 | 2026-07-10 | PoInt: HV symmetric fault |
| 294 | `850000001` | 0 | 3 | 9,831 | imaging |  | 9,834 | 34 | 2,301 | 2026-05-01 | 2026-11-25 | Info: TsmService started. (24%; 12 templates) |
| 295 | `63001602` | 0 | 3 | 0 | mechanics |  | 3 | 1 | 3 | 2026-05-19 | 2026-07-21 | (rare template, not shown) |
| 296 | `70000101` | 3 | 0 | 0 | imaging |  | 3 | 2 | 3 | 2026-06-04 | 2026-07-01 | Unknown error |
| 297 | `50007103` | 0 | 3 | 0 | detector |  | 3 | 1 | 1 | 2026-06-15 | 2026-06-15 | (rare template, not shown) |
| 298 | `10008978` | 0 | 3 | 0 | generator |  | 3 | 2 | 2 | 2026-06-09 | 2026-07-31 | Application Error: Generator exception occurred |
| 299 | `650009950` | 3 | 0 | 0 | software |  | 3 | 2 | 3 | 2026-07-22 | 2026-11-12 | Programming error: unspecified exception. |
| 300 | `53240804` | 3 | 0 | 0 | detector |  | 3 | 1 | 1 | 2026-07-18 | 2026-07-18 | (rare template, not shown) |
| 301 | `70000163` | 3 | 0 | 0 | imaging |  | 3 | 2 | 3 | 2026-07-07 | 2026-11-03 | Image Store not created |
| 302 | `520019900` | 3 | 0 | 0 | imaging |  | 3 | 3 | 3 | 2026-08-05 | 2026-11-17 | Programming error: process terminated due to a fatal exception. |
| 303 | `520019901` | 3 | 0 | 0 | imaging |  | 3 | 3 | 3 | 2026-08-05 | 2026-11-17 | Programming error: unspecified exception. |
| 304 | `520020309` | 3 | 0 | 0 | imaging |  | 3 | 3 | 3 | 2026-08-05 | 2026-11-17 | Application Error: The QA module has generated a fatal internal error |
| 305 | `510028677` | 0 | 3 | 0 | acquisition |  | 3 | 1 | 2 | 2026-08-17 | 2026-08-31 | (rare template, not shown) |
| 306 | `10112144` | 0 | 3 | 0 | generator |  | 3 | 1 | 1 | 2026-09-18 | 2026-09-18 | (rare template, not shown) |
| 307 | `40000157` | 3 | 0 | 0 | mechanics |  | 3 | 2 | 2 | 2026-10-23 | 2026-11-02 | Application error : CollimatorDriver Linear X Shutter Area is not ava… |
| 308 | `40000158` | 3 | 0 | 0 | mechanics |  | 3 | 2 | 2 | 2026-10-23 | 2026-11-02 | Application error : CollimatorDriver Linear Y Shutter Area is not ava… |
| 309 | `50001013` ‡ | 3 | 0 | 0 | detector |  | 3 | 1 | 1 | 2026-10-08 | 2026-10-08 | (rare template, not shown) |
| 310 | `53240816` | 3 | 0 | 0 | detector |  | 3 | 1 | 1 | 2026-10-29 | 2026-10-29 | (rare template, not shown) |
| 311 | `53331001` | 3 | 0 | 0 | detector |  | 3 | 1 | 1 | 2026-10-21 | 2026-10-21 | (rare template, not shown) |
| 312 | `53331006` | 3 | 0 | 0 | detector |  | 3 | 1 | 1 | 2026-10-21 | 2026-10-21 | (rare template, not shown) |
| 313 | `70000110` | 3 | 0 | 0 | imaging |  | 3 | 2 | 2 | 2026-10-19 | 2026-11-03 | Application Error |
| 314 | `53250005` | 3 | 0 | 0 | detector |  | 3 | 1 | 1 | 2026-11-12 | 2026-11-12 | (rare template, not shown) |
| 315 | `510999900` | 2 | 0 | 0 | acquisition |  | 2 | 2 | 2 | 2026-05-06 | 2026-09-11 | Programming error: process terminated due to a fatal exception. |
| 316 | `670009900` | 2 | 0 | 0 | connectivity |  | 2 | 2 | 2 | 2026-05-08 | 2026-10-09 | Programming error: process terminated due to a fatal exception. |
| 317 | `63000330` | 0 | 2 | 0 | mechanics |  | 2 | 2 | 2 | 2026-05-14 | 2026-09-16 | Application error: Warning on longitudinal movement |
| 318 | `100010022` | 0 | 2 | 0 | power_io |  | 2 | 1 | 2 | 2026-05-28 | 2026-06-05 | (rare template, not shown) |
| 319 | `10112113` | 0 | 2 | 0 | generator |  | 2 | 1 | 1 | 2026-05-22 | 2026-05-22 | (rare template, not shown) |
| 320 | `610039912` | 2 | 0 | 0 | software |  | 2 | 2 | 2 | 2026-06-02 | 2026-10-09 | Programming error: COM server not available. |
| 321 | `63001122` | 2 | 0 | 0 | mechanics |  | 2 | 2 | 2 | 2026-06-17 | 2026-08-25 | Application error: BIB POST error [item=DetectorBodyGuardTes] |
| 322 | `63001123` | 2 | 0 | 0 | mechanics |  | 2 | 2 | 2 | 2026-06-02 | 2026-06-17 | Application error: GIB POST error [item=EStopChainTest] |
| 323 | `70000143` | 2 | 0 | 0 | imaging |  | 2 | 2 | 2 | 2026-06-15 | 2026-07-15 | Unexpected forced shutdown of PC |
| 324 | `10131359` | 2 | 0 | 0 | generator |  | 2 | 1 | 1 | 2026-06-30 | 2026-06-30 | (rare template, not shown) |
| 325 | `760060082` | 0 | 2 | 6 | software |  | 8 | 7 | 8 | 2026-06-03 | 2026-11-17 | Database stop problem |
| 326 | `80010001` | 0 | 2 | 0 | power_io |  | 2 | 1 | 1 | 2026-06-17 | 2026-06-17 | (rare template, not shown) |
| 327 | `63000298` | 2 | 0 | 0 | mechanics |  | 2 | 2 | 2 | 2026-07-25 | 2026-08-31 | Application error: Power supply not switched on |
| 328 | `63000319` | 2 | 0 | 0 | mechanics |  | 2 | 1 | 2 | 2026-07-17 | 2026-09-21 | (rare template, not shown) |
| 329 | `650009949` | 2 | 0 | 0 | software |  | 2 | 2 | 2 | 2026-07-22 | 2026-09-04 | Programming error: process terminated due to a fatal exception. |
| 330 | `53210233` | 2 | 0 | 0 | detector |  | 2 | 1 | 2 | 2026-07-18 | 2026-08-01 | (rare template, not shown) |
| 331 | `53230605` | 2 | 0 | 0 | detector |  | 2 | 1 | 2 | 2026-07-18 | 2026-08-01 | (rare template, not shown) |
| 332 | `53230203` | 0 | 2 | 0 | detector |  | 2 | 1 | 2 | 2026-07-18 | 2026-08-01 | (rare template, not shown) |
| 333 | `10006777` | 0 | 2 | 0 | generator |  | 2 | 1 | 1 | 2026-07-17 | 2026-07-17 | (rare template, not shown) |
| 334 | `10056768` | 0 | 2 | 0 | generator |  | 2 | 1 | 1 | 2026-07-17 | 2026-07-17 | (rare template, not shown) |
| 335 | `640019909` | 2 | 0 | 0 | software |  | 2 | 1 | 2 | 2026-08-14 | 2026-09-11 | (rare template, not shown) |
| 336 | `640029912` | 2 | 0 | 0 | software |  | 2 | 1 | 2 | 2026-08-14 | 2026-09-11 | (rare template, not shown) |
| 337 | `640110031` | 2 | 0 | 0 | software |  | 2 | 1 | 2 | 2026-08-14 | 2026-09-11 | (rare template, not shown) |
| 338 | `510004101` | 0 | 2 | 0 | acquisition |  | 2 | 1 | 1 | 2026-08-17 | 2026-08-17 | (rare template, not shown) |
| 339 | `100010018` | 0 | 2 | 0 | power_io |  | 2 | 1 | 1 | 2026-08-27 | 2026-08-27 | (rare template, not shown) |
| 340 | `520010101` | 2 | 0 | 0 | imaging |  | 2 | 1 | 1 | 2026-09-11 | 2026-09-11 | (rare template, not shown) |
| 341 | `103268201` | 0 | 2 | 0 | detector |  | 2 | 1 | 1 | 2026-10-27 | 2026-10-27 | (rare template, not shown) |
| 342 | `103268202` | 0 | 2 | 0 | detector |  | 2 | 1 | 1 | 2026-10-27 | 2026-10-27 | (rare template, not shown) |
| 343 | `70000127` | 2 | 0 | 0 | imaging |  | 2 | 1 | 1 | 2026-11-03 | 2026-11-03 | (rare template, not shown) |
| 344 | `70000153` | 2 | 0 | 0 | imaging |  | 2 | 1 | 1 | 2026-11-05 | 2026-11-05 | (rare template, not shown) |
| 345 | `120091340` | 2 | 0 | 0 | power_io |  | 2 | 1 | 1 | 2026-11-02 | 2026-11-02 | (rare template, not shown) |
| 346 | `10008379` | 2 | 0 | 0 | generator |  | 2 | 1 | 1 | 2026-11-04 | 2026-11-04 | (rare template, not shown) |
| 347 | `10112143` | 2 | 0 | 0 | generator |  | 2 | 1 | 1 | 2026-11-05 | 2026-11-05 | (rare template, not shown) |
| 348 | `10131216` | 2 | 0 | 0 | generator |  | 2 | 1 | 1 | 2026-11-05 | 2026-11-05 | (rare template, not shown) |
| 349 | `570000010` | 0 | 2 | 0 | connectivity |  | 2 | 1 | 2 | 2026-11-02 | 2026-11-03 | (rare template, not shown) |
| 350 | `10007775` | 0 | 2 | 0 | generator |  | 2 | 1 | 1 | 2026-11-03 | 2026-11-03 | (rare template, not shown) |
| 351 | `40009912` ‡ | 1 | 0 | 0 | mechanics |  | 1 | 1 | 1 | 2026-05-08 | 2026-05-08 | (rare template, not shown) |
| 352 | `620110000` | 1 | 0 | 0 | service |  | 1 | 1 | 1 | 2026-05-22 | 2026-05-22 | (rare template, not shown) |
| 353 | `63000318` | 1 | 0 | 0 | mechanics |  | 1 | 1 | 1 | 2026-05-24 | 2026-05-24 | (rare template, not shown) |
| 354 | `650000058` | 1 | 0 | 0 | software |  | 1 | 1 | 1 | 2026-05-19 | 2026-05-19 | (rare template, not shown) |
| 355 | `50005078` | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-05-21 | 2026-05-21 | (rare template, not shown) |
| 356 | `50009912` ‡ | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-05-08 | 2026-05-08 | (rare template, not shown) |
| 357 | `660020012` | 1 | 0 | 0 | software |  | 1 | 1 | 1 | 2026-05-06 | 2026-05-06 | (rare template, not shown) |
| 358 | `10130209` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-05-08 | 2026-05-08 | (rare template, not shown) |
| 359 | `10057685` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-05-04 | 2026-05-04 | (rare template, not shown) |
| 360 | `60009900` | 1 | 0 | 0 | mechanics |  | 1 | 1 | 1 | 2026-06-05 | 2026-06-05 | (rare template, not shown) |
| 361 | `60009901` | 1 | 0 | 0 | mechanics |  | 1 | 1 | 1 | 2026-06-05 | 2026-06-05 | (rare template, not shown) |
| 362 | `103262105` | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-06-15 | 2026-06-15 | (rare template, not shown) |
| 363 | `660050001` | 1 | 0 | 0 | software |  | 1 | 1 | 1 | 2026-06-17 | 2026-06-17 | (rare template, not shown) |
| 364 | `540019909` | 1 | 0 | 0 | software |  | 1 | 1 | 1 | 2026-06-03 | 2026-06-03 | (rare template, not shown) |
| 365 | `10027274` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-06-10 | 2026-06-10 | (rare template, not shown) |
| 366 | `50007101` | 0 | 1 | 0 | detector |  | 1 | 1 | 1 | 2026-06-15 | 2026-06-15 | (rare template, not shown) |
| 367 | `53211201` | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-07-18 | 2026-07-18 | (rare template, not shown) |
| 368 | `10008851` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-07-17 | 2026-07-17 | (rare template, not shown) |
| 369 | `10009048` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-07-17 | 2026-07-17 | (rare template, not shown) |
| 370 | `670000400` | 0 | 1 | 0 | connectivity |  | 1 | 1 | 1 | 2026-07-01 | 2026-07-01 | (rare template, not shown) |
| 371 | `10006768` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-07-17 | 2026-07-17 | (rare template, not shown) |
| 372 | `10009049` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-07-17 | 2026-07-17 | (rare template, not shown) |
| 373 | `10036973` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-07-17 | 2026-07-17 | (rare template, not shown) |
| 374 | `210000025` ‡ | 0 | 1 | 0 | other |  | 1 | 1 | 1 | 2026-08-24 | 2026-08-24 | (rare template, not shown) |
| 375 | `53311417` | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-09-17 | 2026-09-17 | (rare template, not shown) |
| 376 | `70000128` | 1 | 0 | 0 | imaging |  | 1 | 1 | 1 | 2026-09-11 | 2026-09-11 | (rare template, not shown) |
| 377 | `520010000` | 1 | 0 | 0 | imaging |  | 1 | 1 | 1 | 2026-09-03 | 2026-09-03 | (rare template, not shown) |
| 378 | `640100006` | 0 | 1 | 0 | software |  | 1 | 1 | 1 | 2026-09-24 | 2026-09-24 | (rare template, not shown) |
| 379 | `63001063` | 0 | 1 | 0 | mechanics |  | 1 | 1 | 1 | 2026-09-22 | 2026-09-22 | (rare template, not shown) |
| 380 | `10130105` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-09-18 | 2026-09-18 | (rare template, not shown) |
| 381 | `63001131` | 1 | 0 | 0 | mechanics |  | 1 | 1 | 1 | 2026-10-26 | 2026-10-26 | (rare template, not shown) |
| 382 | `50000564` ‡ | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-10-08 | 2026-10-08 | (rare template, not shown) |
| 383 | `53341021` | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-10-21 | 2026-10-21 | (rare template, not shown) |
| 384 | `70030006` | 1 | 0 | 0 | imaging |  | 1 | 1 | 1 | 2026-10-07 | 2026-10-07 | (rare template, not shown) |
| 385 | `660040012` | 1 | 0 | 0 | software |  | 1 | 1 | 1 | 2026-10-07 | 2026-10-07 | (rare template, not shown) |
| 386 | `830009900` | 1 | 0 | 0 | remote_service |  | 1 | 1 | 1 | 2026-10-16 | 2026-10-16 | (rare template, not shown) |
| 387 | `830009903` | 1 | 0 | 0 | remote_service |  | 1 | 1 | 1 | 2026-10-16 | 2026-10-16 | (rare template, not shown) |
| 388 | `10038065` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-10-26 | 2026-10-26 | (rare template, not shown) |
| 389 | `40000103` | 0 | 1 | 0 | mechanics |  | 1 | 1 | 1 | 2026-10-23 | 2026-10-23 | (rare template, not shown) |
| 390 | `750000017` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-10-23 | 2026-10-23 | (rare template, not shown) |
| 391 | `50007100` | 0 | 1 | 0 | detector |  | 1 | 1 | 1 | 2026-10-21 | 2026-10-21 | (rare template, not shown) |
| 392 | `50007102` | 0 | 1 | 0 | detector |  | 1 | 1 | 1 | 2026-10-21 | 2026-10-21 | (rare template, not shown) |
| 393 | `53310222` | 0 | 1 | 0 | detector |  | 1 | 1 | 1 | 2026-10-21 | 2026-10-21 | (rare template, not shown) |
| 394 | `520010002` | 0 | 1 | 0 | imaging |  | 1 | 1 | 1 | 2026-10-23 | 2026-10-23 | (rare template, not shown) |
| 395 | `50002012` | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-11-09 | 2026-11-09 | (rare template, not shown) |
| 396 | `53222017` | 1 | 0 | 0 | detector |  | 1 | 1 | 1 | 2026-11-12 | 2026-11-12 | (rare template, not shown) |
| 397 | `70000002` | 1 | 0 | 0 | imaging |  | 1 | 1 | 1 | 2026-11-03 | 2026-11-03 | (rare template, not shown) |
| 398 | `10007469` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-11-04 | 2026-11-04 | (rare template, not shown) |
| 399 | `10007751` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-11-04 | 2026-11-04 | (rare template, not shown) |
| 400 | `10008855` | 1 | 0 | 0 | generator |  | 1 | 1 | 1 | 2026-11-03 | 2026-11-03 | (rare template, not shown) |
| 401 | `10007151` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-11-04 | 2026-11-04 | (rare template, not shown) |
| 402 | `10008349` | 0 | 1 | 0 | generator |  | 1 | 1 | 1 | 2026-11-03 | 2026-11-03 | (rare template, not shown) |

By group: connectivity 14 codes / 924,464 rows; acquisition 39 codes / 237,227 rows; software 51 codes / 231,258 rows; service 21 codes / 212,418 rows; remote_service 5 codes / 113,895 rows; imaging 57 codes / 67,600 rows; mechanics 57 codes / 23,036 rows; power_io 36 codes / 7,454 rows; generator 70 codes / 4,606 rows; detector 51 codes / 1,734 rows; other 1 codes / 1 rows.

## 4. Information codes with an explicit rule (110)

35,576,169 rows, 95.2% of all Information rows. *Cat*: utilization / inventory / telemetry rows feed named or watch-list metrics; noise (UI commands, operator prompts) and trace (performance markers, state and service chatter) emit nothing. *Facts* = named facts from the code's Information rows.

| # | Code | Cat | Group | Facts | Rows | Share of Info | Sys | Label | Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `730069921` ‡ | noise | software |  | 4,492,962 | 12.03% | 43 | Command: Lowerpriority (50%; 2 templates) | Command: Lowerpriority / Minimize |
| 2 | `520019921` ‡ | noise | imaging |  | 3,256,292 | 8.72% | 43 | Command: StartViewing (24%; 97 templates) | Reviewing UI commands |
| 3 | `580009921` ‡ | noise | mechanics |  | 3,023,080 | 8.09% | 43 | Command: EnablePatientSupportBrake.Brake (24%; 58 templates) | Patient and beam positioning UI commands |
| 4 | `510999921` ‡ | noise | acquisition | `pcv.fluoro_start` | 2,110,781 | 5.65% | 43 | Command: StopFluoroscopy (32%; 44 templates) | UI command log; only StartFluoroscopy is a fact |
| 5 | `510020541` | utilization | acquisition | `pcv.exposure_run`, `pcv.run` | 1,597,773 | 4.28% | 42 | X-Ray stopped at: #:#:#.# (46%; 3 templates) | one 'X-Ray started' per run (= the 510020540 record; 23 of 24 systems in November); 'duration Exposure' marks exposure runs; start/stop times give beam-on time (watch) |
| 6 | `660040018` | noise | software |  | 1,332,252 | 3.57% | 41 | Execute command: [StartStepImageFwd] for control [ImageForw… (14%; 63 templates) | Execute command [...] for control [...] |
| 7 | `830009921` | noise | remote_service |  | 1,275,180 | 3.41% | 33 | Command: | ServApps 'Command:' (empty) |
| 8 | `120000000` | telemetry | power_io |  | 1,253,813 | 3.36% | 41 | SIB Fan speed of fan # is: # rpm [#/#/# #:#:#.#] (45%; 34 templates) | SIB fan speeds and top / bottom temperatures |
| 9 | `570009921` ‡ | noise | connectivity |  | 1,050,797 | 2.81% | 42 | Command: StoreForDemoMode (54%; 17 templates) | Archiving UI commands |
| 10 | `60000022` | noise | mechanics |  | 985,811 | 2.64% | 42 | Command: Start ROTATEBEAMFRONTAL (25%; 33 templates) | Command: Start <motion> |
| 11 | `60000023` | noise | mechanics |  | 985,781 | 2.64% | 42 | Command: Stop ROTATEBEAMFRONTAL (25%; 33 templates) | Command: Stop <motion> |
| 12 | `510610018` | utilization | acquisition |  | 763,972 | 2.05% | 42 | Last run kV = #.# Last run mA = #.# Last run ms = #.# Calcu… (82%; 14 templates) | Last run kV / mA / ms per run (watch: technique series) |
| 13 | `510020540` | utilization | acquisition | `pcv.procedure` | 736,158 | 1.97% | 42 | ExaminationID = <id> ApplicationGroupName = Cardio ClarityI… (40%; 193 templates) | per-run record: application (protocol family) is the dim; exam ID, series UID, dose fields never read |
| 14 | `620000001` | trace | service |  | 709,180 | 1.90% | 42 | Base.Com#Dotnet.Framework.COMCALLSSTATISTICS: Number of reg… (11%; 54726 templates) | Field Service framework log (tens of thousands of templates) |
| 15 | `850000000` | trace | imaging |  | 695,002 | 1.86% | 35 | InfoAlways:  (via TsmLog): TsmApplication:Radiation not act… (31%; 231 templates) | FlexVision InfoAlways / radiation active lines |
| 16 | `100062204` | trace | power_io |  | 637,907 | 1.71% | 1 | Application event: gPDU info: E#_reserved | gPDU info: E#_reserved (same system) |
| 17 | `100062203` | trace | power_io |  | 637,906 | 1.71% | 1 | Application event: gPDU info: E#_reserved | gPDU info: E#_reserved (one system, ~23k a day) |
| 18 | `510029173` | trace | acquisition |  | 513,646 | 1.37% | 24 | After run data | After run data: the same run as 10000004, logged twice |
| 19 | `10000004` | utilization | generator |  | 513,646 | 1.37% | 24 | Run Data | Run Data (some software versions only; 14 of 24 systems in November): memo RunLength / NumberOfPulses / EndReason / Focus / filament wear (watch) |
| 20 | `570000024` | trace | connectivity |  | 497,406 | 1.33% | 41 | Archiving configuration data | Archiving configuration data |
| 21 | `580000006` ‡ | trace | mechanics |  | 481,554 | 1.29% | 42 | PERF-EVENT: request entering P&B (99%; 2 templates) | PERF-EVENT: request entering P&B |
| 22 | `220200` | trace | software |  | 469,494 | 1.26% | 42 | Client status changed | CAHost client status changed |
| 23 | `90000020` | trace | acquisition |  | 449,838 | 1.20% | 27 | Sequencer SAN timing start | Sequencer SAN timing start |
| 24 | `570000015` ‡ | utilization | connectivity |  | 315,676 | 0.85% | 42 | Archiving Job Completed. | Archiving Job Completed (watch: archive jobs) |
| 25 | `590009921` ‡ | noise | mechanics |  | 264,784 | 0.71% | 42 | Command: BLObjectShuttersStop (21%; 18 templates) | Beam limitation UI commands |
| 26 | `50001060` | telemetry | detector | `pcv.temperature` | 256,543 | 0.69% | 27 | Detector temperature in #.# degrees Celsius: # (75%; 2 templates) | 0.1 degree C units |
| 27 | `670000001` ‡ | trace | connectivity |  | 242,059 | 0.65% | 42 | open database connection. | open database connection |
| 28 | `580009920` ‡ | noise | mechanics | `pcv.user_msg:geometry_partly_available` | 241,149 | 0.65% | 43 | User msg: WARNING: TUBE bodyguard active (20%; 60 templates) | User msg: bodyguard / collision-prevention active (operator-level); 'Geometry movements partly available' is an alert-model phrase -> pcv.user_msg |
| 29 | `540000014` ‡ | noise | software |  | 222,609 | 0.60% | 43 | Command: AutoMPPSComplete (36%; 16 templates) | Patient Administration UI commands (descriptions only; Set* values are in memo, never read) |
| 30 | `620000000` | trace | service |  | 220,461 | 0.59% | 41 | Connectivity.Dicom.Access.UNKNOWN: Value of attribute Write… (63%; 6 templates) |  |
| 31 | `670000004` | trace | connectivity |  | 219,703 | 0.59% | 41 | DICOM Association information | DICOM Association information |
| 32 | `830020007` | trace | remote_service |  | 212,991 | 0.57% | 42 | PSA starting... | PSA starting |
| 33 | `830020008` | trace | remote_service |  | 212,965 | 0.57% | 42 | IBSService started. | IBSService started |
| 34 | `63000236` ‡ | trace | mechanics |  | 208,170 | 0.56% | 43 | PERF-EVENT: SEGMOVSID_TABLE_HEIGHT entering GSC #:#:#.# (19%; 143 templates) | Geometry PERF-EVENT / BIB POST / network settings |
| 35 | `10131300` | telemetry | generator |  | 189,679 | 0.51% | 24 | PoInt: Shunt test and calibration data | PoInt shunt test and calibration data |
| 36 | `10131301` | telemetry | generator |  | 189,679 | 0.51% | 24 | PoInt: Divider test and calibration data | PoInt divider test and calibration data |
| 37 | `620000006` | trace | service |  | 179,901 | 0.48% | 42 | File: loggingCLSID=PMS.PMSMIPLogAdapter (18%; 29 templates) |  |
| 38 | `510999920` ‡ | noise | acquisition | `pcv.user_msg:fault`, `pcv.user_msg:xray_not_possible` | 174,655 | 0.47% | 43 | User msg: Free disk space # (#) images (37%; 80 templates) | User msg: most are operator prompts; 'not possible' and 'defect / failure' messages emit pcv.user_msg |
| 39 | `570000013` ‡ | trace | connectivity |  | 165,457 | 0.44% | 42 | No images selected for this job |  |
| 40 | `520050001` | trace | imaging |  | 133,114 | 0.36% | 8 | PERF-EVENT: HandleViewingSelectionChanged : StartTime |  |
| 41 | `520050002` | trace | imaging |  | 133,114 | 0.36% | 8 | PERF-EVENT: HandleViewingSelectionChanged : EndTime |  |
| 42 | `760060001` ‡ | trace | software |  | 129,762 | 0.35% | 43 | Starting Service | Session Manager: Starting Service (per service) |
| 43 | `63000249` | inventory | mechanics |  | 120,981 | 0.32% | 41 | Software version: GEO IPC BIOS Version = #.#.# (5%; 146 templates) | Geometry component software / firmware versions |
| 44 | `510900003` | trace | acquisition |  | 119,373 | 0.32% | 8 | PERF_EVENT: Notify Viewing |  |
| 45 | `510900001` | trace | acquisition |  | 117,586 | 0.31% | 8 | PERF_EVENT: Start Resources for X-Ray |  |
| 46 | `520050003` | trace | imaging |  | 115,626 | 0.31% | 8 | PERF-EVENT: StartViewing : StartTime |  |
| 47 | `520050004` | trace | imaging |  | 115,626 | 0.31% | 8 | PERF-EVENT: StartViewing : StartTime |  |
| 48 | `830020003` | trace | remote_service |  | 114,959 | 0.31% | 31 | PSA started. | PSA started |
| 49 | `760060004` ‡ | trace | software |  | 111,586 | 0.30% | 43 | Stopping Service | Stopping Service |
| 50 | `510900002` | trace | acquisition |  | 106,971 | 0.29% | 8 | PERF_EVENT: Stop Fluoro Request |  |
| 51 | `510900000` | trace | acquisition |  | 106,970 | 0.29% | 8 | PERF_EVENT: Start Fluoro Request | PERF_EVENT: Start Fluoro Request (8 systems) |
| 52 | `540000004` | trace | software |  | 104,398 | 0.28% | 40 | Delete examination | Delete examination |
| 53 | `830020005` | trace | remote_service |  | 101,834 | 0.27% | 37 | PSA NOT started. | PSA NOT started (systems without remote support configured?) |
| 54 | `540019921` ‡ | noise | software |  | 100,933 | 0.27% | 43 | Command: SelectAcqExam (18%; 53 templates) | Patient Administration UI commands incl. Set* (PHI in memo: never read or emitted) |
| 55 | `620000014` | trace | service |  | 87,480 | 0.23% | 41 | Connectivity.Dicom.Access.STATE_DETAILS:  .***** dump of as… (92%; 7 templates) | DICOM associate descriptor dump |
| 56 | `650400015` | noise | software |  | 85,439 | 0.23% | 41 | Execute command: [SetZoomFactor] for control [-] by [TSM] I… (38%; 123 templates) | Execute command [...] (Graphical UI) |
| 57 | `570000021` ‡ | trace | connectivity |  | 80,468 | 0.22% | 42 | Execution of job started. |  |
| 58 | `620000015` | trace | service |  | 80,026 | 0.21% | 41 | Connectivity.Dicom.Piim.repository: Connected to DICOMNetwo… (30%; 35 templates) | Connected to DICOM repository |
| 59 | `540000095` | utilization | software |  | 79,343 | 0.21% | 41 | Auto MPPS Complete | Auto MPPS Complete |
| 60 | `540000092` | trace | software |  | 76,515 | 0.20% | 42 | Select Reviewing Exam | Select Reviewing Exam |
| 61 | `850000099` | trace | imaging |  | 73,831 | 0.20% | 34 | Info: Action: select preset id=p#, name=<text> in ExamRoom (6%; 864 templates) | FlexVision preset actions |
| 62 | `570000023` | trace | connectivity |  | 70,483 | 0.19% | 17 | Auto push to workstation is skipped. |  |
| 63 | `510028688` | utilization | acquisition |  | 67,777 | 0.18% | 42 | Applied tube protection | Applied tube protection (watch) |
| 64 | `510019388` ‡ | trace | acquisition |  | 61,813 | 0.17% | 43 | Fluo flavour selection completed | Fluo flavour selection completed |
| 65 | `550009921` ‡ | noise | connectivity |  | 59,926 | 0.16% | 42 | Command: AutoPrint (81%; 4 templates) | Printing UI commands |
| 66 | `70000006` | trace | imaging |  | 58,426 | 0.16% | 37 | FaultFinding error event overview | FaultFinding error event overview |
| 67 | `90000021` | trace | acquisition |  | 51,105 | 0.14% | 27 | Sequencer SAN timing stop | Sequencer SAN timing stop |
| 68 | `550000013` ‡ | utilization | connectivity |  | 48,756 | 0.13% | 42 | Print Job Completed. | Print Job Completed |
| 69 | `80000501` | noise | power_io |  | 46,257 | 0.12% | 39 | UI devices: Control is no longer available | UI devices: control no longer available |
| 70 | `590010401` | noise | mechanics |  | 44,342 | 0.12% | 35 | User output: Autowedge follow command via EPX procedure sel… | Autowedge follow command |
| 71 | `510021391` ‡ | trace | acquisition |  | 44,000 | 0.12% | 43 | System not ready for exposure x-ray acquisition | System not ready for exposure |
| 72 | `650000055` ‡ | trace | software |  | 43,822 | 0.12% | 42 | Log message from Xper module | Log message from Xper module |
| 73 | `510021394` ‡ | trace | acquisition |  | 43,367 | 0.12% | 43 | System not ready for fluorscopy x-ray acquisition | System not ready for fluoroscopy |
| 74 | `540000098` | utilization | software |  | 42,292 | 0.11% | 27 | Utilization: Select acquisition examination (50%; 2 templates) | Utilization: Select / Deselect acquisition examination (17 systems) |
| 75 | `510021402` | utilization | acquisition |  | 40,141 | 0.11% | 40 | Application = Cardiac (#) (26%; 384 templates) | Application = <name> (<id>) selection (watch) |
| 76 | `60000024` | trace | mechanics |  | 40,132 | 0.11% | 8 | PERF-EVENT: SEGMOVSID_TABLE_HEIGHT leaving GeoHost #:#:#.# | PERF-EVENT leaving GeoHost |
| 77 | `510021390` ‡ | trace | acquisition |  | 39,922 | 0.11% | 43 | System ready for exposure x-ray acquisition | System ready for exposure |
| 78 | `510021393` ‡ | trace | acquisition |  | 39,133 | 0.10% | 43 | System ready for fluoroscopy x-ray acquisition | System ready for fluoroscopy |
| 79 | `540000093` | utilization | software |  | 38,160 | 0.10% | 42 | Select Acquisition Exam | Select Acquisition Exam |
| 80 | `70000003` | trace | imaging | `pcv.ippc:post_other`, `pcv.ippc:post_disk`, `pcv.ippc:post_fan` | 34,484 | 0.09% | 37 | POST "Host PC FRU Fan #" Done/Passed (18%; 21 templates) | POST <unit> Done/Passed (Error rows: pcv.ippc) |
| 81 | `540000017` | noise | software |  | 27,355 | 0.07% | 42 | Confirmation command SelectAcqExam is triggered; (65%; 14 templates) | Confirmation command … is triggered |
| 82 | `60009930` | trace | mechanics |  | 25,462 | 0.07% | 41 | POST IPC Geometry Passed (15%; 26 templates) | POST <unit> Passed |
| 83 | `70000007` | trace | imaging |  | 24,280 | 0.06% | 37 | System configuration |  |
| 84 | `60009920` ‡ | event | mechanics | `pcv.user_msg:geometry_partly_available` | 23,994 | 0.06% | 43 | User msg: WARNING: Adjustment of frontal stand required (53%; 21 templates) | User msg: stand adjustment / geometry warnings (pcv.event); the alert-model phrase -> pcv.user_msg |
| 85 | `70000000` | trace | imaging |  | 23,934 | 0.06% | 22 | Image processing OK | Image processing OK |
| 86 | `550000007` | trace | connectivity |  | 22,904 | 0.06% | 41 | Printing -> ACP: ACP Component did not return S_OK | Printing ACP component did not return S_OK |
| 87 | `73428002` | telemetry | imaging |  | 22,464 | 0.06% | 5 | VPCBOARDROLE_IPB_FRONTAL# IPB Temperature # degrees Celsius… | IPB temperature |
| 88 | `73628002` | telemetry | imaging |  | 22,464 | 0.06% | 5 | VPCBOARDROLE_IPB_FRONTAL# IPB Temperature # degrees Celsius… | IPB temperature |
| 89 | `73238003` | telemetry | imaging |  | 22,462 | 0.06% | 5 | VPCBOARDROLE_ISB_FRONTAL ISB Temperature # degrees Celsius … | ISB temperature |
| 90 | `540000091` | trace | software |  | 21,555 | 0.06% | 40 | Select Administration Exam | Select Administration Exam |
| 91 | `540000018` | noise | software |  | 19,148 | 0.05% | 42 | Command: SelectAcqExam; Confirmation is ignored, the pop-up… (92%; 6 templates) | Command confirmation ignored |
| 92 | `540000094` | utilization | software |  | 18,733 | 0.05% | 40 | Auto Exam Close | Auto Exam Close |
| 93 | `540000006` | utilization | software |  | 17,875 | 0.05% | 41 | Close examination | Close examination |
| 94 | `70000004` | telemetry | imaging |  | 14,828 | 0.04% | 37 | SMART Data Frontal IP-PC Image disk # (45%; 5 templates) | SMART Data <disk>: memo Power-On Hours per disk (watch, Q19) |
| 95 | `510018385` ‡ | utilization | acquisition |  | 14,752 | 0.04% | 42 | User output : # minutes fluo buzzer activated | 5-minute fluoro buzzer (watch: fluoro time proxy) |
| 96 | `540000096` | utilization | software |  | 12,123 | 0.03% | 36 | Auto Exam Complete | Auto Exam Complete (0 on some systems) |
| 97 | `510029174` | telemetry | acquisition |  | 8,940 | 0.02% | 24 | Tube yield | Tube yield: memo Number / Yield (watch) |
| 98 | `830020115` | event | remote_service | `pcv.remote_link:connected` | 6,319 | 0.02% | 31 | Connected to the Remote Support Server (Questra Enterprise … | named metric (§1) |
| 99 | `10000011` | inventory | generator |  | 4,500 | 0.01% | 24 | Tube Focus Capabilities | Tube Focus Capabilities |
| 100 | `760060075` ‡ | inventory | software |  | 3,967 | 0.01% | 43 | Allura Xper Software Version | Allura Xper Software Version: memo COMMERCIAL_VERSION, already extracted to public.logfile_event_history_metadata (reuse, Q19) |
| 101 | `760060076` ‡ | inventory | software |  | 3,922 | 0.01% | 43 | Allura Host MAC Address | Allura Host MAC Address (value in memo; never emitted) |
| 102 | `760060077` ‡ | inventory | software |  | 3,922 | 0.01% | 43 | Allura Host SystemID | Allura Host SystemID (value in memo; never emitted) |
| 103 | `10000015` | telemetry | generator |  | 2,476 | 0.01% | 23 | X-Segment Statistics | memo: X-Segment Statistics -> pcv.tube_counter, dim <unit hash>/<counter> (Q18; monotonic per unit, out/23) |
| 104 | `10000009` | inventory | generator |  | 2,250 | 0.01% | 24 | X-Segment Configuration | memo: X-Segment Configuration (unit SW / HW versions, serial) |
| 105 | `10000010` | inventory | generator |  | 2,250 | 0.01% | 24 | X-Segment Capabilities | X-Segment Capabilities |
| 106 | `10000012` | inventory | generator |  | 2,250 | 0.01% | 24 | Installation Configuration | memo: Installation Configuration TubeType -> pcv.inventory tube_type=<v> (Q14) |
| 107 | `10000013` | inventory | generator |  | 2,250 | 0.01% | 24 | Adaptation Data | memo: Adaptation Data Tube/GeneratorSerialNumber -> pcv.inventory tube_serial / generator_serial = hash (Q14) |
| 108 | `570000016` | event | connectivity | `pcv.connectivity:archive_job_failed` | 1,185 | 0.00% | 37 | Archiving Job Failed. | named metric (§1) |
| 109 | `70049930` | event | imaging | `pcv.ippc:post_failed` | 470 | 0.00% | 4 | POST POST Frontal XRes FPGA Passed (57%; 3 templates) | named metric (§1) |
| 110 | `620000008` | event | service | `pcv.connectivity:dicom_protocol_violation` | 150 | 0.00% | 37 | Connectivity.Dicom.Access.DUL_VIOLATION: DICOM violation: R… (98%; 9 templates) | named metric (§1) |

## 4b. Information family rules (any code without an explicit rule, by description shape)

| Rule | Shape | Cat | Codes | Rows | Share of Info | Sys | Top codes (rows) |
|---|---|---|---|---|---|---|---|
| `perf_event` | `/^PERF[-_ ]EVENT/` | trace | 16 | 114,134 | 0.31% | 8 | 510900004 (21,809), 80010002 (21,657), 510900009 (20,596), 510900005 (19,330), 63000751 (16,114), 510900011 (4,894), 540040005 (2,553), 540040006 (2,553) |
| `post_passed` | `/^POST .*\b(Passed\|Done\/Passed\|succeeded)\.?$/i` | trace | 8 | 45,276 | 0.12% | 42 | 80019930 (19,001), 100019930 (11,459), 650009979 (6,954), 40009930 (4,080), 10999930 (2,170), 70019930 (750), 70029930 (748), 50009930 (114) |
| `ui_command` | `/^(Command: \|Execute command: \|Confirmation command )/` | noise | 5 | 11,079 | 0.03% | 39 | 540000019 (8,035), 650100003 (2,867), 770010001 (100), 540000020 (59), 620999921 (18) |

## 5. Uncoded rows (short, Windows-style records): 46 sources

872,037 rows (2.2%). They carry no technical event ID: the source sits in `category` and the text in `message`.

| Source | Rows | E | W | Sys | Rule(s) | Facts | Label |
|---|---|---|---|---|---|---|---|
| sshd | 367,199 | 10,652 | 0 | 42 | ignore_source | **ignored** | sshd: PID #: Accepted password for <user> from <ip> port # … (23%; 75 templates) |
| Service Control Manager | 191,043 | 5,528 | 0 | 19 | os_severity, os_service_state | `pcv.error` | ISTBrokerServer� stop (20%; 44 templates) |
| MSSQL$SQLEXPRESS | 127,199 | 0 | 0 | 42 | os_sql |  | Recovery is complete. This is an informational message only… (3%; 91 templates) |
| McAfee Solidifier | 91,266 | 309 | 796 | 42 | ignore_source | **ignored** | McAfee Solidifier allowed package modification by 'c:\windo… (43%; 1650 templates) |
| Windows Error Reporting | 21,150 | 0 | 0 | 8 | os_app_crash, os_wer_other | `pcv.event` | Fault bucket , type #�Event Name: WindowsWcpOtherFailure#�R… (44%; 11 templates) |
| NI Configuration Manager | 10,112 | 0 | 0 | 37 | os_other |  | Opening configuration database. (67%; 2 templates) |
| CAHost | 7,385 | 0 | 0 | 42 | os_other |  | Service started (48%; 4 templates) |
| VPC HostAgent | 6,879 | 0 | 0 | 37 | os_other |  | Service started successfully. (92%; 3 templates) |
| EventLog | 5,131 | 0 | 0 | 19 | os_other |  | (empty) (67%; 2 templates) |
| LogAuditService | 4,653 | 0 | 0 | 26 | os_other |  | Service started successfully. (50%; 3 templates) |
| OpenSSHServer | 3,698 | 0 | 0 | 42 | ignore_source | **ignored** | OpenSSHServer: PID #: 'OpenSSHServer' service started (100%; 2 templates) |
| niZeroconfService | 3,363 | 0 | 0 | 37 | os_other |  | mDNSResponder started |
| XDDS | 3,363 | 0 | 0 | 37 | os_other |  | Service started (86%; 2 templates) |
| MSMQ | 2,876 | 0 | 0 | 31 | os_other |  | The Message Queuing service started. |
| MSMQTriggers | 2,876 | 0 | 0 | 31 | os_other |  | Message Queuing Triggers started successfully. |
| TlntSvr | 2,872 | 0 | 0 | 29 | os_other |  | Service started |
| MSDTC | 2,809 | 0 | 0 | 31 | os_other |  | #� #� #� #� #� # (100%; 2 templates) |
| Philips.PmsIxr.Misc.Private.PdsAd.PdsAdapterService | 2,494 | 0 | 0 | 24 | os_other |  | Service started successfully. (79%; 3 templates) |
| Software Protection Platform Service | 2,337 | 0 | 31 | 8 | os_other, os_severity | `pcv.warning` | Initialization status for service objects.�C:\Windows\syste… (20%; 6 templates) |
| USER32 | 1,698 | 0 | 0 | 19 | os_other |  | winlogon.exe� <host>� No title for this reason could be fou… (62%; 8 templates) |
| VNC Server | 1,445 | 485 | 0 | 8 | ignore_source | **ignored** | UpdateNotificationCertificate: Invalid certificate: SSL Err… (34%; 3 templates) |
| EMET | 1,440 | 0 | 0 | 8 | os_other |  | EMET Service status is: Running  EMET configuration for App… (33%; 3 templates) |
| AUAService | 999 | 0 | 0 | 5 | os_other |  | Service started successfully. (51%; 2 templates) |
| WinMgmt | 968 | 0 | 0 | 8 | os_other |  | (empty) |
| Wlclntfy | 960 | 0 | 0 | 8 | os_other |  | The winlogon notification subscriber <SessionEnv> was unava… |
| Microsoft-Windows-User Profiles Service | 950 | 0 | 2 | 8 | os_other, os_severity | `pcv.warning` | The User Profile Service has started successfully. (51%; 3 templates) |
| Microsoft-Windows-LoadPerf | 934 | 0 | 0 | 8 | os_other |  | Performance counters for the WmiApRpl (WmiApRpl) service we… (50%; 2 templates) |
| Winlogon | 486 | 0 | 1 | 8 | os_other, os_severity | `pcv.warning` | Windows license validated. (100%; 2 templates) |
| EventSystem | 480 | 0 | 0 | 8 | os_other |  | #� SuppressDuplicateDuration� Software\Microsoft\EventSyste… |
| WAS-LA | 480 | 0 | 0 | 8 | os_other |  | Listener Adapter protocol 'net.pipe' successfully connected… |
| CentralLoggingService | 472 | 0 | 0 | 5 | os_other |  | Service started successfully. (79%; 3 templates) |
| NAUpdate | 464 | 0 | 0 | 8 | os_other |  | Service started/resumed |
| LocalLoggingService | 459 | 0 | 0 | 5 | os_other |  | Service started successfully. (81%; 3 templates) |
| ESENT | 445 | 0 | 0 | 1 | os_other |  | Windows (#) Windows: The database engine has begun replayin… (25%; 4 templates) |
| SCardSvr | 418 | 418 | 0 | 15 | os_severity | `pcv.error` | The system cannot find the path specified. (64%; 13 templates) |
| Windows Search Service | 111 | 0 | 0 | 1 | os_other |  | The Windows Search Service started. |
| LoadPerf | 36 | 0 | 0 | 16 | os_other |  | Performance counters for the WmiApRpl (WmiApRpl) service we… (50%; 2 templates) |
| Graphical UI | 32 | 0 | 0 | 1 | os_other |  | (rare template, not shown) |
| Userenv | 18 | 0 | 16 | 11 | os_severity, os_other | `pcv.warning` | (empty) (89%; 3 templates) |
| LabVIEW | 13 | 13 | 0 | 4 | os_severity | `pcv.error` | LabVIEW information:  Error: # "Not Found" for "national in… (85%; 2 templates) |
| DrWatson | 7 | 0 | 0 | 6 | os_other |  | The application, C:\Program Files\Philips\ICE\SDCI.exe, gen… (29%; 5 templates) |
| Image Detector | 6 | 1 | 1 | 1 | os_severity, os_other | `pcv.error`, `pcv.warning` | (rare template, not shown) |
| .NET Runtime | 5 | 5 | 0 | 4 | os_severity | `pcv.error` | The operation completed successfully. (80%; 2 templates) |
| X-Ray Generator | 4 | 4 | 0 | 1 | os_severity | `pcv.error` | (rare template, not shown) |
| Application Error | 1 | 1 | 0 | 1 | os_severity | `pcv.error` | (rare template, not shown) |
| FusionDb | 1 | 1 | 0 | 1 | os_severity | `pcv.error` | (rare template, not shown) |

## 6. The ignore list (Q15, Q16): emits nothing

| Code / source | Rows | Sys | Sys-days | Why |
|---|---|---|---|---|
| `620000003` | 48,091 | 42 | 3,367 | Field Service config parser: unknown tag/name combination |
| `650400007` | 150,662 | 33 | 2,569 | Could not get CWIS adapter: chronic on many systems |
| `730020000` | 36,130 | 19 | 1,504 | license checking failed: chronic on many systems (field-service question, plan §5) |
| source `sshd` | 367,199 | 42 | 3,958 | remote logins / application whitelisting / certificate notices |
| source `McAfee Solidifier` | 91,266 | 42 | 3,482 | remote logins / application whitelisting / certificate notices |
| source `VNC Server` | 1,445 | 8 | 496 | remote logins / application whitelisting / certificate notices |
| source `OpenSSHServer` | 3,698 | 42 | 3,021 | remote logins / application whitelisting / certificate notices |

## 7. Totals by class

| Class | Codes / sources | Rows | Share | Emits |
|---|---|---|---|---|
| error | 268 | 525,481 | 1.34% | `pcv.error` (+ named) |
| warning | 159 | 1,105,445 | 2.82% | `pcv.warning` (+ named) |
| event | 386 | 760,296 | 1.94% | `pcv.event` / named |
| utilization | 15 | 4,307,177 | 10.99% | named (`pcv.run`, `pcv.procedure`, …) or nothing |
| inventory | 9 | 146,292 | 0.37% | nothing yet (memo rules, Q14) |
| telemetry | 10 | 1,983,348 | 5.06% | `pcv.temperature` or nothing |
| noise | 25 | 19,810,612 | 50.54% | nothing (`pcv.fluoro_start`, `pcv.user_msg` excepted) |
| trace | 111 | 9,861,809 | 25.16% | nothing |
| ignore | 7 | 698,491 | 1.78% | nothing |

## 8. The tail: Information codes with no explicit rule → `pcv.event`, dim = code

380 codes, 720,469 rows (1.93% of Information rows). Mostly start-up, shutdown, configuration and status lines on many systems. A code that a family rule (§4b) also catches is counted here only for its other rows. Top 40:

| Code | Rows | Sys | Sys-days | Group | Label |
|---|---|---|---|---|---|
| `570000029` | 19,134 | 8 | 703 | connectivity | Archiving Job Information |
| `550000017` | 18,713 | 41 | 2,984 | connectivity | Printing configuration data. |
| `650028673` ‡ | 16,872 | 42 | 3,046 | software | Monitor: Starting Application completed (99%; 2 templates) |
| `50001027` | 15,642 | 42 | 3,304 | detector | Image Detection Frontal is now operational (24%; 6 templates) |
| `70000005` | 14,824 | 37 | 2,681 | imaging | PCI ID Information (v#.#.#) Host PC (23%; 7 templates) |
| `840000104` | 13,270 | 37 | 2,725 | imaging | XDDS discovered a new device |
| `63001603` | 12,603 | 1 | 60 | mechanics | MagnusInterface::#:#:#.# INFO: CPatientSupportIOStatusEntity::OnTrigg… (35%; 42 templates) |
| `540000076` | 11,791 | 6 | 502 | software | Invalid default Xper in Customization Information Model: Vascular Bod… (36%; 6 templates) |
| `570000020` ‡ | 11,229 | 42 | 3,027 | connectivity | Initialize job queue |
| `620000010` | 11,094 | 41 | 2,985 | service | Connectivity.Dicom.Performer.SCPPERFORMER: Starting ImportDaemon DICO… (33%; 3 templates) |
| `510610101` | 11,048 | 15 | 17 | acquisition | #-factor technique values are limited and deviate from requested valu… (100%; 2 templates) |
| `80030004` | 10,645 | 41 | 3,002 | power_io | Communication error: Unable to open RS# connection with IR receiver o… |
| `840000106` | 10,407 | 37 | 2,725 | imaging | Changed IP address to static entry in ARP table (90%; 2 templates) |
| `100010023` | 10,342 | 37 | 2,724 | power_io | Mio server state changed |
| `850000001` | 9,831 | 34 | 2,301 | imaging | Info: TsmService started. (24%; 12 templates) |
| `750000000` ‡ | 9,407 | 42 | 3,044 | generator | Generic CAN Interface log message |
| `650000054` ‡ | 8,854 | 43 | 3,366 | software | Xper module Service log message |
| `20000029` | 8,380 | 17 | 1,366 | generator | Tube Yield Curve |
| `50001024` | 8,106 | 41 | 3,001 | detector | Start-up of frontal Image Detection Channel (46%; 4 templates) |
| `640110101` | 7,480 | 41 | 3,013 | software | Start connecting RDBMS, connection string: DSN=Fusion, ReadOnly: # (50%; 4 templates) |
| `760060066` ‡ | 7,427 | 43 | 3,052 | software | Free space on drive 'C' is # bytes. (44%; 4 templates) |
| `120030500` | 7,378 | 41 | 2,999 | power_io | SIB SER_init end, status: # [#/#/# #:#:#.#] (50%; 2 templates) |
| `540019920` ‡ | 7,211 | 42 | 2,223 | software | User msg: Examination is already selected for acquisition (38%; 19 templates) |
| `590009920` | 7,146 | 41 | 2,940 | mechanics | User msg: WARNING:AutoWedgeFollow functn unav. (99%; 4 templates) |
| `63000315` | 6,980 | 41 | 2,968 | mechanics | LUC NODE CLE# PRESENT (42%; 4 templates) |
| `570000028` | 6,904 | 4 | 367 | connectivity | Archiving Job Information |
| `100040002` | 6,794 | 1 | 154 | power_io | Door State changed to |
| `63001018` | 6,749 | 17 | 1,377 | mechanics | SynqNet info |
| `650400026` | 6,313 | 41 | 3,006 | software | UnExpected value for UIModelItem |
| `620000002` | 5,481 | 41 | 3,008 | service | Base.Job.Queue.jobQueue: No PersistencyFile in C:\Program Files\PMS\F… (58%; 14 templates) |
| `760060053` ‡ | 5,415 | 43 | 2,916 | software | Service shutdown failed |
| `70010013` | 5,250 | 4 | 305 | imaging | System configuration |
| `63001012` | 5,165 | 18 | 1,486 | mechanics | MCCV logging disabled |
| `620000005` | 5,152 | 41 | 2,989 | service | Services.SystemController.Utilities.SCAPPLICATION: SystemController h… (59%; 6 templates) |
| `510000194` ‡ | 5,116 | 1 | 83 | acquisition | Last Fluo kV = #.# Last Fluo mA = #.# Last Fluo ms = #.# Framerate = … |
| `50000030` | 4,836 | 4 | 304 | detector | Version info |
| `730080001` ‡ | 4,397 | 43 | 3,102 | software | FusionLog Server started |
| `20000028` | 4,338 | 17 | 1,367 | generator | System configuration |
| `40000203` ‡ | 4,331 | 42 | 3,039 | mechanics | SysCAN Collimator communication available between NICOL node # and Co… (98%; 2 templates) |
| `850000010` | 4,294 | 26 | 1,877 | imaging | Info: Snapshot software will use Mediawallgrabber in DirectMode (27%; 8 templates) |

## 9. Category normalising map (Q21)

Two spellings across software versions. Rule: `&` → `and` (`normCategory` in `mapping.js`). Then each normalised category maps to a viewer group (`GROUP`).

| As logged | Rows | Normalised | Rows already spelled that way | Group |
|---|---|---|---|---|
| Archiving & Networking | 1,889,501 | Archiving and Networking | 351,002 | connectivity |
| Patient & Beam pos. | 2,726,379 | Patient and Beam pos. | 1,019,893 | mechanics |

Parse artifacts (dialog text in the category field; 2 rows; group `other`): `&Yes &No Graphical UI`, `OK Patient Administration`.

Other categories, with their group: Acquisition → acquisition; Automation → software; Beam Limitation → mechanics; CAHost → software; CWIS → connectivity; Collimator → mechanics; DICOM → connectivity; Data Model Translator → connectivity; Database → software; Datamodel → software; EpxModel → software; Field Service → service; FlexVision → imaging; Gen Can → generator; Geometry → mechanics; Graphical UI → software; IPISLib → imaging; Image Channel → imaging; Image Detector → detector; Image Processor → imaging; Mercury → other; Misc. IO → power_io; Non-Graphical UI → software; PC-Infrastructure → software; Patient Administration → software; Printing → connectivity; RIS Interface → connectivity; Reviewing → imaging; SIB → power_io; SIP → software; Sequencer → acquisition; ServApps → remote_service; Session Manager → software; UI Devices → power_io; X-Ray Generator → generator; X-Ray control → generator; XDDS → imaging; Xper Management tool → software.

## 10. Checks

| Check | Result |
|---|---|
| every code has a reviewed rule | 889 codes: 402 with Error / Warning rows (by severity, §3), 110 Information codes with an explicit rule (§4), 29 caught by 3 family rules (§4b), 380 with rows in the reviewed tail (§8), 3 ignored (§6); 46 uncoded sources (§5). 2 more codes occur only in rows dated before May: they fall to the same severity / tail rules |
| every explicit rule matches rows | Information rules: 106 of 106; named-metric codes: 29 of 29; ignore codes 3 of 3; ignored sources 4 of 4; family rules 3 of 3; OS rules 5 of 5 |
| coverage of Information rows by explicit rules | 98.03% of coded Information rows (target ~97%, plan §2 item 6); the tail is 1.93% |
| raw text and masked template classify the same | 199644 raw rows (0.5% random sample, piped, never stored): 0 differences (`out/12_validate_raw.txt`) |
| SQL mask = JavaScript mask | same sample: 0 differences |
| no sensitive value in any stored template | 261,857 template rows scanned with `residual()` (IPs, ID values, serial values, hosts, users, `Set*` values, `^` names, e-mail, random tokens, digits): **0** hits; on the raw sample after `mask()`: {}. Masks applied: `<obj>` 119,073, `<ip>` 5,857, `<text>` 3,421, `<serial>` 3,357, `<hex>` 1,864, `<host>` 1,023, `<id>` 681, `<user>` 292, `<key>` 27 |
| the 3 alert-model phrases are mapped | "Grid smallest focus is defect": **0 rows since 2026-05-01** (no code to map); "Gigalink lock dropped": **0 rows since 2026-05-01** (no code to map); "Geometry movements partly available": 60009920 (Information), 580009920 (Information) (3,875 raw rows, 39 sys) → event: pcv.user_msg:geometry_partly_available; noise: pcv.user_msg:geometry_partly_available. "Gigalink lock dropped" reads like an Image Detector (FDC) line, the kind `eventlog_2` drops today (I1): re-check after day 2 (Q24) |
| memo reads | memo is selected as part of the md5 dedupe key, as field names (`out/20_memo_keys.tsv`), and, after your Q18 approval, as the numbers of 23 named counters of 10000015 on 3 systems (`out/22`, `out/23`; serials only as an md5 key, never printed). No memo text, serial, ID or name was printed or stored |
| classifier tests | `node --test test_mapping.js test_mask.js`: severity, use markers with trailing spaces, procedure allow-list, temperature, memo rules (hashed serials, all-zero unit skipped, a `Set*` memo never read), alert phrase, Windows layer: all pass |

## 11. Questions for CV-2a (Q12–Q24) — AGREED 2026-11-25

You accepted the recommendation in every question on 2026-11-25 and approved the Q18 read. Each answer is marked **AGREED**; the reasoning is kept. Numbered after the plan's Q1–Q11 (§3) and C1–C4 (§7.6). Counts are deduped rows since 2026-05-01 unless stated.

### Q12. Errors and warnings: two metrics or one?
- Error rows: 573,087; Warning rows: 1,268,870. Warnings are dominated by `680000010` DICOM Association (896,146) and `830020004` PSA died (108,680).
- One metric would let chronic warnings drown real errors in the "error storm" finding.

**AGREED (recommended): two metrics, `pcv.error` and `pcv.warning`, both with dim = code.** The storm finding (CV-4) reads `pcv.error`; the viewer shows both.

### Q13. The cut and the tail
- Explicit rules (§4) and 3 family rules (§4b) cover 98.0% of coded Information rows; the tail is 380 codes, 1.9% of Information rows.
- Tail rows are start-up, shutdown, configuration and status lines spread over many systems.

**AGREED (recommended): accept the cut. Tail Information codes emit `pcv.event` with dim = code, and every new code falls to the same severity / tail rules with no code change.** The viewer lists codes first seen in the last 30 days so the mapping can be extended later.

### Q14. Tube and generator identity: serials in `insight.*`?
- `Adaptation Data` (10000013) and `X-Segment Statistics` (10000015) memos carry `TubeSerialNumber` and `GeneratorSerialNumber` (field names seen; values not read). `Installation Configuration` (10000012) carries `TubeType`.
- Plan §2 item 8 wants "tube or generator serial changed". Your masking rule treats serials as sensitive.

**AGREED (recommended): store a hash, not the serial: `pcv.inventory` dim `tube_serial=<first 10 hex of sha256(serial)>` (same for the generator), and `tube_type=<value>` in clear.** A change of hash is the finding; the serial itself never leaves `log.*`.

### Q15. Ignore list: codes
- `730020000` license checking failed: 36,130 Error rows on 19 systems, 1,504 system-days.
- `650400007` Could not get CWIS adapter: 150,662 Warning rows on 33 systems, 2,569 system-days.
- `620000003` Field Service config parser, unknown tag/name: 48,091 rows.

**AGREED (recommended): ignore all three (emit nothing) until field service says otherwise (plan §5 already asks about the license error).** They are constant on most systems, so they carry no signal but would dominate `pcv.error` / `pcv.warning`.

### Q16. The Windows layer (uncoded short records)
- 872,037 rows from 46 sources (§5): `sshd` logins, McAfee whitelisting, Service Control Manager, SQL Server, Windows Error Reporting, …
- `sshd` and McAfee lines carry user and host names (masked here).

**AGREED (recommended): ignore `sshd`, `OpenSSHServer`, McAfee Solidifier and VNC Server entirely; count other sources' Error / Warning rows as `pcv.error` / `pcv.warning` with dim = `os:<source>`; count Windows application crashes (`APPCRASH`, `BEX`, …) as `pcv.event` dim `os_app_crash`; all other uncoded Information rows are trace.**

### Q17. What counts as use
Per-system comparison for November (`out/30_use_markers.tsv`):
- `X-Ray started at` (510020541) equals the per-run record (510020540) on most systems (e.g. 7,236 = 7,236) and exists on 23 of 24 systems. `Run Data` (10000004) exists on 14.
- `X-Ray duration Exposure` marks exposure runs; `Command: StartFluoroscopy` counts fluoro starts and is the only marker SME14784 logs.
- Exam markers disagree per system (Auto Exam Complete is 0 on 3 busy systems).

**AGREED (recommended): v1 use = `pcv.run` (every X-ray run, from `X-Ray started`), `pcv.exposure_run`, `pcv.fluoro_start` and `pcv.procedure`. UI commands, viewing and exam selections are not use. Exams and beam-on time stay on the watch list** (plan Q9: behind field service).

### Q18. Tube life counters (`X-Segment Statistics`, 10000015)
- Its memo has `ArcingCounter`, `ExposureCounterLarge/SmallFocus`, `FluoroscopyTimeLarge/SmallFocus`, `LoadUnitCounterActualTube`, `SwitchOnCounter`, `UpTime`, `TotalFilamentWear…`, `InstallationDate` (2,476 rows on 23 systems, about daily). It is the strongest tube-wear signal in the log.
- Values were not read in CV-2a (memo).

**AGREED: you approved the read on 2026-11-25. Done the same day (`sql/22_tube_counters.sql`, `sql/23_tube_counter_units.sql`; numbers only, serials hashed and never printed), on the 3 systems with the most reports (SME01394, SME02531, SME13641):**
- every counter is numeric, present in every report, and reported about daily;
- keyed by unit (a hash of `UnitSerialNumber`), **every counter only goes up: 0 decreases** on all 3 systems. Without the key SME01394 zig-zags: it has **two units** (biplane), and SME13641 reports a second, all-zero unit;
- SME01394's `ArcingCounter` went up 6 times in the period; the other two stayed flat.

**So `pcv.tube_counter` is in v1 (§1):** dim = `<unit hash>/<counter>` for 19 counters (`SwitchOnCounter`, `UpTime`, `StandByTime`, `ArcingCounter`, `AdaptationCounter`, `PreparationCounter`, exposure / fluoroscopy / preparation counts and times per focus, load units, filament wear per focus, `Energy`); value = the counter; derive keeps the daily max and the daily increase. All-zero units are skipped; `CFactor*` (calibration factors) are not counters. Units of measure stay a field-service question.

### Q19. Software version and power-on hours
- Software version: 760060075 `Allura Xper Software Version` (memo `COMMERCIAL_VERSION`), already extracted by `extract_memo_data.js` into `public.logfile_event_history_metadata` (`software_version`).
- Power-on hours come from 70000004 `SMART Data <disk>`: **one counter per disk** (Frontal IP-PC image disk, OS disk, Host PC OS disk, lateral disks). `extract_memo_data.js` stores them all as one `power_on` series. That is most likely why plan §1.4 saw 48,764 next to 1,156 on SME00782 (70000004 is the only code whose memo carries `Power-On Hours`; values not read).

**AGREED (recommended): reuse `logfile_event_history_metadata` for the software version (no new rule). For power-on hours, leave `extract_memo_data.js` unchanged and keep the metric on the watch list; when it is wanted, the insight extract reads 70000004 itself with dim = the disk name from the description.** This also answers one plan §5 field-service question (see "For the main plan").

### Q20. "X-ray not possible": count only, or a cause?
- 510032770: 8,809 Error rows on 41 systems. The description is always the same; any cause would be in memo.
- In this session a read of memo shapes (masked, for this code only) was blocked by the auto-mode safety check, so the memo was not looked at.

**AGREED (recommended): v1 counts it with no dim; no memo look.**

### Q21. Category normalising map
- `Archiving & Networking` 1,889,501 rows / `Archiving and Networking` 351,002 rows; `Patient & Beam pos.` 2,726,379 rows / `Patient and Beam pos.` 1,019,893 rows

**AGREED (recommended): `&` → `and` (`normCategory`), then the group map in `mapping.js` (`GROUP`).** Groups drive the viewer only; codes stay the key.

### Q22. The v1 list as a whole
§1 lists 17 metrics (16 proposed, plus `pcv.tube_counter` after Q18). New against plan Q9: `pcv.user_msg` (operator messages "… not possible" / "… defect"), and temperatures as a value series (`pcv.temperature`, detector and ambient, °C; derive keeps daily min / mean / max).

**AGREED (recommended): accept §1 as v1, with §2 as the watch list.**

### Q23. Procedure dim: a guard against free text
- `pcv.procedure` takes the application name from the per-run record: 69 distinct names, 19 of them on one system only.
- They are configured protocol names, but a site can create its own.

**AGREED (recommended): keep names seen on 2+ systems (an allow-list built from the data, reviewed); map the rest to `other`.** Nothing typed at the console can then become a dim.

### Q24. Two of the three alert phrases never occur
- The enabled CV alert models match 3 phrases. Since 2026-05-01, "Geometry movements partly available" occurs 3,875 times (60009920, 580009920: now `pcv.user_msg:geometry_partly_available`). **"Grid smallest focus is defect" and "Gigalink lock dropped" occur 0 times.**
- "Gigalink" lines are Image Detector (FDC) events, the kind the `eventlog_2` parser drops today (I1). The grid phrase may be worded differently on these software versions (the log has "Large focus used. Small focus defect").

**AGREED (recommended): no mapping change now; re-run `sql/13_alert_phrases.sql` once day 2 has been live a week, and raise the two silent models with whoever owns `alert.models`** (they cover 8,109 of the 9,138 enabled models).

## 12. For the main plan

Proposed text for `PLAN-PHILIPS-CV-INSIGHTS.md` (not edited here: another session owns it):
- **§4, CV-2a row:** "Mapping drafted in `PLAN-PHILIPS-CV-INSIGHTS-CODES.md` (2026-11-25): 889 codes, 17 v1 metrics, questions Q12–Q24, AGREED 2026-11-25."
- **§5, field-service questions:** replace "Which counters do the `Power-On Hours` memos report" with "Power-on hours are per disk (SMART data of each IP-PC / host disk; CV-2a). Which disk's hours stand for the system?" Add: "What unit is `X-Ray duration Exposure`?", "What units do the `X-Segment Statistics` counters use (UpTime and the times look like seconds; load units, filament wear, Energy)? Is a rising `ArcingCounter` a service trigger?", "Is `PSA died` (108,680 warnings on 23 systems) a real outage?", "What does `Device programming failure: X-ray Generator` (510610010) mean? 2 systems logged 219,452 errors".
- **§1.4:** "Power-on hours mix counters" → "Power-on hours are per disk (70000004 `SMART Data <disk>`); `extract_memo_data.js` stores them as one series."

## Appendix A. Information codes to 97% of Information rows (187), each with its rule

| # | Code | Rows | Cum % | Sys | Rule | Cat | Label |
|---|---|---|---|---|---|---|---|
| 1 | `730069921` | 4,492,962 | 12.0% | 43 | info | noise | Command: Lowerpriority (50%; 2 templates) |
| 2 | `520019921` | 3,256,292 | 20.7% | 43 | info | noise | Command: StartViewing (24%; 97 templates) |
| 3 | `580009921` | 3,023,080 | 28.8% | 43 | info | noise | Command: EnablePatientSupportBrake.Brake (24%; 58 templates) |
| 4 | `510999921` | 2,110,781 | 34.5% | 43 | info | noise | Command: StopFluoroscopy (32%; 44 templates) |
| 5 | `510020541` | 1,597,773 | 38.8% | 42 | info | utilization | X-Ray stopped at: #:#:#.# (46%; 3 templates) |
| 6 | `660040018` | 1,332,252 | 42.3% | 41 | info | noise | Execute command: [StartStepImageFwd] for control [ImageForwardReverse… (14%; 63 templates) |
| 7 | `830009921` | 1,275,180 | 45.7% | 33 | info | noise | Command: |
| 8 | `120000000` | 1,253,813 | 49.1% | 41 | info | telemetry | SIB Fan speed of fan # is: # rpm [#/#/# #:#:#.#] (45%; 34 templates) |
| 9 | `570009921` | 1,050,797 | 51.9% | 42 | info | noise | Command: StoreForDemoMode (54%; 17 templates) |
| 10 | `60000022` | 985,811 | 54.6% | 42 | info | noise | Command: Start ROTATEBEAMFRONTAL (25%; 33 templates) |
| 11 | `60000023` | 985,781 | 57.2% | 42 | info | noise | Command: Stop ROTATEBEAMFRONTAL (25%; 33 templates) |
| 12 | `510610018` | 763,972 | 59.2% | 42 | info | utilization | Last run kV = #.# Last run mA = #.# Last run ms = #.# Calculated Obje… (82%; 14 templates) |
| 13 | `510020540` | 736,158 | 61.2% | 42 | info | utilization | ExaminationID = <id> ApplicationGroupName = Cardio ClarityIQ Applicat… (40%; 193 templates) |
| 14 | `620000001` | 709,180 | 63.1% | 42 | info | trace | Base.Com#Dotnet.Framework.COMCALLSSTATISTICS: Number of registered de… (11%; 54726 templates) |
| 15 | `850000000` | 695,002 | 65.0% | 35 | info | trace | InfoAlways:  (via TsmLog): TsmApplication:Radiation not active, remov… (31%; 231 templates) |
| 16 | `100062204` | 637,907 | 66.7% | 1 | info | trace | Application event: gPDU info: E#_reserved |
| 17 | `100062203` | 637,906 | 68.4% | 1 | info | trace | Application event: gPDU info: E#_reserved |
| 18 | `510029173` | 513,646 | 69.8% | 24 | info | trace | After run data |
| 19 | `10000004` | 513,646 | 71.1% | 24 | info | utilization | Run Data |
| 20 | `570000024` | 497,406 | 72.5% | 41 | info | trace | Archiving configuration data |
| 21 | `580000006` | 481,554 | 73.8% | 42 | info | trace | PERF-EVENT: request entering P&B (99%; 2 templates) |
| 22 | `220200` | 469,494 | 75.0% | 42 | info | trace | Client status changed |
| 23 | `90000020` | 449,838 | 76.2% | 27 | info | trace | Sequencer SAN timing start |
| 24 | `570000015` | 315,676 | 77.1% | 42 | info | utilization | Archiving Job Completed. |
| 25 | `590009921` | 264,784 | 77.8% | 42 | info | noise | Command: BLObjectShuttersStop (21%; 18 templates) |
| 26 | `50001060` | 256,543 | 78.5% | 27 | info | telemetry | Detector temperature in #.# degrees Celsius: # (75%; 2 templates) |
| 27 | `670000001` | 242,059 | 79.1% | 42 | info | trace | open database connection. |
| 28 | `580009920` | 241,149 | 79.7% | 43 | info | noise | User msg: WARNING: TUBE bodyguard active (20%; 60 templates) |
| 29 | `540000014` | 222,609 | 80.3% | 43 | info | noise | Command: AutoMPPSComplete (36%; 16 templates) |
| 30 | `620000000` | 220,461 | 80.9% | 41 | info | trace | Connectivity.Dicom.Access.UNKNOWN: Value of attribute WriteSQExplicit… (63%; 6 templates) |
| 31 | `670000004` | 219,703 | 81.5% | 41 | info | trace | DICOM Association information |
| 32 | `830020007` | 212,991 | 82.1% | 42 | info | trace | PSA starting... |
| 33 | `830020008` | 212,965 | 82.7% | 42 | info | trace | IBSService started. |
| 34 | `63000236` | 208,170 | 83.2% | 43 | info | trace | PERF-EVENT: SEGMOVSID_TABLE_HEIGHT entering GSC #:#:#.# (19%; 143 templates) |
| 35 | `10131300` | 189,679 | 83.7% | 24 | info | telemetry | PoInt: Shunt test and calibration data |
| 36 | `10131301` | 189,679 | 84.2% | 24 | info | telemetry | PoInt: Divider test and calibration data |
| 37 | `620000006` | 179,901 | 84.7% | 42 | info | trace | File: loggingCLSID=PMS.PMSMIPLogAdapter (18%; 29 templates) |
| 38 | `510999920` | 174,655 | 85.2% | 43 | info | noise | User msg: Free disk space # (#) images (37%; 80 templates) |
| 39 | `570000013` | 165,457 | 85.6% | 42 | info | trace | No images selected for this job |
| 40 | `520050001` | 133,114 | 86.0% | 8 | info | trace | PERF-EVENT: HandleViewingSelectionChanged : StartTime |
| 41 | `520050002` | 133,114 | 86.3% | 8 | info | trace | PERF-EVENT: HandleViewingSelectionChanged : EndTime |
| 42 | `760060001` | 129,762 | 86.7% | 43 | info | trace | Starting Service |
| 43 | `63000249` | 120,981 | 87.0% | 41 | info | inventory | Software version: GEO IPC BIOS Version = #.#.# (5%; 146 templates) |
| 44 | `510900003` | 119,373 | 87.3% | 8 | info | trace | PERF_EVENT: Notify Viewing |
| 45 | `510900001` | 117,586 | 87.6% | 8 | info | trace | PERF_EVENT: Start Resources for X-Ray |
| 46 | `520050003` | 115,626 | 88.0% | 8 | info | trace | PERF-EVENT: StartViewing : StartTime |
| 47 | `520050004` | 115,626 | 88.3% | 8 | info | trace | PERF-EVENT: StartViewing : StartTime |
| 48 | `830020003` | 114,959 | 88.6% | 31 | info | trace | PSA started. |
| 49 | `760060004` | 111,586 | 88.9% | 43 | info | trace | Stopping Service |
| 50 | `510900002` | 106,971 | 89.2% | 8 | info | trace | PERF_EVENT: Stop Fluoro Request |
| 51 | `510900000` | 106,970 | 89.4% | 8 | info | trace | PERF_EVENT: Start Fluoro Request |
| 52 | `540000004` | 104,398 | 89.7% | 40 | info | trace | Delete examination |
| 53 | `830020005` | 101,834 | 90.0% | 37 | info | trace | PSA NOT started. |
| 54 | `540019921` | 100,933 | 90.3% | 43 | info | noise | Command: SelectAcqExam (18%; 53 templates) |
| 55 | `620000014` | 87,480 | 90.5% | 41 | info | trace | Connectivity.Dicom.Access.STATE_DETAILS:  .***** dump of associate de… (92%; 7 templates) |
| 56 | `650400015` | 85,439 | 90.7% | 41 | info | noise | Execute command: [SetZoomFactor] for control [-] by [TSM] Increment s… (38%; 123 templates) |
| 57 | `570000021` | 80,468 | 90.9% | 42 | info | trace | Execution of job started. |
| 58 | `620000015` | 80,026 | 91.2% | 41 | info | trace | Connectivity.Dicom.Piim.repository: Connected to DICOMNetworkReposito… (30%; 35 templates) |
| 59 | `540000095` | 79,343 | 91.4% | 41 | info | utilization | Auto MPPS Complete |
| 60 | `540000092` | 76,515 | 91.6% | 42 | info | trace | Select Reviewing Exam |
| 61 | `850000099` | 73,831 | 91.8% | 34 | info | trace | Info: Action: select preset id=p#, name=<text> in ExamRoom (6%; 864 templates) |
| 62 | `570000023` | 70,483 | 92.0% | 17 | info | trace | Auto push to workstation is skipped. |
| 63 | `510028688` | 67,777 | 92.1% | 42 | info | utilization | Applied tube protection |
| 64 | `510019388` | 61,813 | 92.3% | 43 | info | trace | Fluo flavour selection completed |
| 65 | `550009921` | 59,926 | 92.5% | 42 | info | noise | Command: AutoPrint (81%; 4 templates) |
| 66 | `70000006` | 58,426 | 92.6% | 37 | info | trace | FaultFinding error event overview |
| 67 | `90000021` | 51,105 | 92.8% | 27 | info | trace | Sequencer SAN timing stop |
| 68 | `550000013` | 48,756 | 92.9% | 42 | info | utilization | Print Job Completed. |
| 69 | `80000501` | 46,257 | 93.0% | 39 | info | noise | UI devices: Control is no longer available |
| 70 | `590010401` | 44,342 | 93.1% | 35 | info | noise | User output: Autowedge follow command via EPX procedure selection |
| 71 | `510021391` | 44,000 | 93.3% | 43 | info | trace | System not ready for exposure x-ray acquisition |
| 72 | `650000055` | 43,822 | 93.4% | 42 | info | trace | Log message from Xper module |
| 73 | `510021394` | 43,367 | 93.5% | 43 | info | trace | System not ready for fluorscopy x-ray acquisition |
| 74 | `540000098` | 42,292 | 93.6% | 27 | info | utilization | Utilization: Select acquisition examination (50%; 2 templates) |
| 75 | `510021402` | 40,141 | 93.7% | 40 | info | utilization | Application = Cardiac (#) (26%; 384 templates) |
| 76 | `60000024` | 40,132 | 93.8% | 8 | info | trace | PERF-EVENT: SEGMOVSID_TABLE_HEIGHT leaving GeoHost #:#:#.# |
| 77 | `510021390` | 39,922 | 93.9% | 43 | info | trace | System ready for exposure x-ray acquisition |
| 78 | `510021393` | 39,133 | 94.0% | 43 | info | trace | System ready for fluoroscopy x-ray acquisition |
| 79 | `540000093` | 38,160 | 94.1% | 42 | info | utilization | Select Acquisition Exam |
| 80 | `620000003` | 36,094 | 94.2% | 42 | ignore | ignore | Base.Utilities.Metrics.details:  .Copyright           : (c) Koninklij… (51%; 22 templates) |
| 81 | `70000003` | 34,484 | 94.3% | 37 | info | trace | POST "Host PC FRU Fan #" Done/Passed (18%; 21 templates) |
| 82 | `540000017` | 27,355 | 94.4% | 42 | info | noise | Confirmation command SelectAcqExam is triggered; (65%; 14 templates) |
| 83 | `60009930` | 25,462 | 94.5% | 41 | info | trace | POST IPC Geometry Passed (15%; 26 templates) |
| 84 | `70000007` | 24,280 | 94.5% | 37 | info | trace | System configuration |
| 85 | `60009920` | 23,994 | 94.6% | 43 | info | event | User msg: WARNING: Adjustment of frontal stand required (53%; 21 templates) |
| 86 | `70000000` | 23,934 | 94.6% | 22 | info | trace | Image processing OK |
| 87 | `550000007` | 22,904 | 94.7% | 41 | info | trace | Printing -> ACP: ACP Component did not return S_OK |
| 88 | `73428002` | 22,464 | 94.8% | 5 | info | telemetry | VPCBOARDROLE_IPB_FRONTAL# IPB Temperature # degrees Celsius [#/#/# #:… |
| 89 | `73628002` | 22,464 | 94.8% | 5 | info | telemetry | VPCBOARDROLE_IPB_FRONTAL# IPB Temperature # degrees Celsius [#/#/# #:… |
| 90 | `73238003` | 22,462 | 94.9% | 5 | info | telemetry | VPCBOARDROLE_ISB_FRONTAL ISB Temperature # degrees Celsius [#/#/# #:#… |
| 91 | `510900004` | 21,809 | 94.9% | 8 | family: perf_event | event | PERF_EVENT: Start Exposure Request |
| 92 | `80010002` | 21,657 | 95.0% | 8 | family: perf_event | event | PERF-EVENT: joystick response table height, start measurement |
| 93 | `540000091` | 21,555 | 95.1% | 40 | info | trace | Select Administration Exam |
| 94 | `510900009` | 20,596 | 95.1% | 8 | family: perf_event | event | PERF_EVENT: RFS Selection Request |
| 95 | `510900005` | 19,330 | 95.2% | 8 | family: perf_event | event | PERF_EVENT: Stop Exposure Request |
| 96 | `540000018` | 19,148 | 95.2% | 42 | info | noise | Command: SelectAcqExam; Confirmation is ignored, the pop-up message i… (92%; 6 templates) |
| 97 | `570000029` | 19,134 | 95.3% | 8 | **tail** | event | Archiving Job Information |
| 98 | `80019930` | 19,001 | 95.3% | 41 | family: post_passed | event | POST Review module in control room Passed (20%; 9 templates) |
| 99 | `540000094` | 18,733 | 95.4% | 40 | info | utilization | Auto Exam Close |
| 100 | `550000017` | 18,713 | 95.4% | 41 | **tail** | event | Printing configuration data. |
| 101 | `540000006` | 17,875 | 95.5% | 41 | info | utilization | Close examination |
| 102 | `650028673` | 16,872 | 95.5% | 42 | **tail** | event | Monitor: Starting Application completed (99%; 2 templates) |
| 103 | `63000751` | 16,114 | 95.6% | 8 | family: perf_event | event | PERF-EVENT: joystick response table height, stop measurement |
| 104 | `50001027` | 15,642 | 95.6% | 42 | **tail** | event | Image Detection Frontal is now operational (24%; 6 templates) |
| 105 | `70000004` | 14,828 | 95.6% | 37 | info | telemetry | SMART Data Frontal IP-PC Image disk # (45%; 5 templates) |
| 106 | `70000005` | 14,824 | 95.7% | 37 | **tail** | event | PCI ID Information (v#.#.#) Host PC (23%; 7 templates) |
| 107 | `510018385` | 14,752 | 95.7% | 42 | info | utilization | User output : # minutes fluo buzzer activated |
| 108 | `840000104` | 13,270 | 95.8% | 37 | **tail** | event | XDDS discovered a new device |
| 109 | `63001603` | 12,603 | 95.8% | 1 | **tail** | event | MagnusInterface::#:#:#.# INFO: CPatientSupportIOStatusEntity::OnTrigg… (35%; 42 templates) |
| 110 | `540000096` | 12,123 | 95.8% | 36 | info | utilization | Auto Exam Complete |
| 111 | `540000076` | 11,791 | 95.9% | 6 | **tail** | event | Invalid default Xper in Customization Information Model: Vascular Bod… (36%; 6 templates) |
| 112 | `100019930` | 11,459 | 95.9% | 42 | family: code, post_passed | event | POST SIBPOST Passed (33%; 9 templates) |
| 113 | `570000020` | 11,229 | 95.9% | 42 | **tail** | event | Initialize job queue |
| 114 | `620000010` | 11,094 | 95.9% | 41 | **tail** | event | Connectivity.Dicom.Performer.SCPPERFORMER: Starting ImportDaemon DICO… (33%; 3 templates) |
| 115 | `510610101` | 11,048 | 96.0% | 15 | **tail** | event | #-factor technique values are limited and deviate from requested valu… (100%; 2 templates) |
| 116 | `80030004` | 10,645 | 96.0% | 41 | **tail** | event | Communication error: Unable to open RS# connection with IR receiver o… |
| 117 | `840000106` | 10,407 | 96.0% | 37 | **tail** | event | Changed IP address to static entry in ARP table (90%; 2 templates) |
| 118 | `100010023` | 10,342 | 96.1% | 37 | **tail** | event | Mio server state changed |
| 119 | `850000001` | 9,831 | 96.1% | 34 | **tail** | event | Info: TsmService started. (24%; 12 templates) |
| 120 | `750000000` | 9,407 | 96.1% | 42 | **tail** | event | Generic CAN Interface log message |
| 121 | `510029174` | 8,940 | 96.1% | 24 | info | telemetry | Tube yield |
| 122 | `650000054` | 8,854 | 96.2% | 43 | **tail** | event | Xper module Service log message |
| 123 | `20000029` | 8,380 | 96.2% | 17 | **tail** | event | Tube Yield Curve |
| 124 | `50001024` | 8,106 | 96.2% | 41 | **tail** | event | Start-up of frontal Image Detection Channel (46%; 4 templates) |
| 125 | `540000019` | 8,035 | 96.2% | 39 | family: ui_command | event | Command: DeleteExam; Command is confirmed by the user, command will b… (94%; 7 templates) |
| 126 | `640110101` | 7,480 | 96.2% | 41 | **tail** | event | Start connecting RDBMS, connection string: DSN=Fusion, ReadOnly: # (50%; 4 templates) |
| 127 | `760060066` | 7,427 | 96.3% | 43 | **tail** | event | Free space on drive 'C' is # bytes. (44%; 4 templates) |
| 128 | `120030500` | 7,378 | 96.3% | 41 | **tail** | event | SIB SER_init end, status: # [#/#/# #:#:#.#] (50%; 2 templates) |
| 129 | `540019920` | 7,211 | 96.3% | 42 | **tail** | event | User msg: Examination is already selected for acquisition (38%; 19 templates) |
| 130 | `590009920` | 7,146 | 96.3% | 41 | **tail** | event | User msg: WARNING:AutoWedgeFollow functn unav. (99%; 4 templates) |
| 131 | `63000315` | 6,980 | 96.3% | 41 | **tail** | event | LUC NODE CLE# PRESENT (42%; 4 templates) |
| 132 | `650009979` | 6,954 | 96.4% | 41 | family: post_passed | event | POST Xper_module_# Passed |
| 133 | `570000028` | 6,904 | 96.4% | 4 | **tail** | event | Archiving Job Information |
| 134 | `100040002` | 6,794 | 96.4% | 1 | **tail** | event | Door State changed to |
| 135 | `63001018` | 6,749 | 96.4% | 17 | **tail** | event | SynqNet info |
| 136 | `830020115` | 6,319 | 96.4% | 31 | named | event | Connected to the Remote Support Server (Questra Enterprise Server). |
| 137 | `650400026` | 6,313 | 96.4% | 41 | **tail** | event | UnExpected value for UIModelItem |
| 138 | `620000002` | 5,481 | 96.5% | 41 | **tail** | event | Base.Job.Queue.jobQueue: No PersistencyFile in C:\Program Files\PMS\F… (58%; 14 templates) |
| 139 | `760060053` | 5,415 | 96.5% | 43 | **tail** | event | Service shutdown failed |
| 140 | `70010013` | 5,250 | 96.5% | 4 | **tail** | event | System configuration |
| 141 | `63001012` | 5,165 | 96.5% | 18 | **tail** | event | MCCV logging disabled |
| 142 | `620000005` | 5,152 | 96.5% | 41 | **tail** | event | Services.SystemController.Utilities.SCAPPLICATION: SystemController h… (59%; 6 templates) |
| 143 | `510000194` | 5,116 | 96.5% | 1 | **tail** | event | Last Fluo kV = #.# Last Fluo mA = #.# Last Fluo ms = #.# Framerate = … |
| 144 | `510900011` | 4,894 | 96.5% | 8 | family: perf_event | event | PERF_EVENT: EPX Selection Completed |
| 145 | `50000030` | 4,836 | 96.6% | 4 | **tail** | event | Version info |
| 146 | `10000011` | 4,500 | 96.6% | 24 | info | inventory | Tube Focus Capabilities |
| 147 | `730080001` | 4,397 | 96.6% | 43 | **tail** | event | FusionLog Server started |
| 148 | `20000028` | 4,338 | 96.6% | 17 | **tail** | event | System configuration |
| 149 | `40000203` | 4,331 | 96.6% | 42 | **tail** | event | SysCAN Collimator communication available between NICOL node # and Co… (98%; 2 templates) |
| 150 | `850000010` | 4,294 | 96.6% | 26 | **tail** | event | Info: Snapshot software will use Mediawallgrabber in DirectMode (27%; 8 templates) |
| 151 | `40000170` | 4,256 | 96.6% | 41 | **tail** | event | CollimatorDriver Filter Area is available |
| 152 | `40000171` | 4,256 | 96.6% | 41 | **tail** | event | CollimatorDriver Light Area is available |
| 153 | `40000172` | 4,256 | 96.7% | 41 | **tail** | event | CollimatorDriver AEP Area is available |
| 154 | `40000173` | 4,256 | 96.7% | 41 | **tail** | event | CollimatorDriver Left Wedge Area is available |
| 155 | `40000174` | 4,256 | 96.7% | 41 | **tail** | event | CollimatorDriver Right Wedge Area is available |
| 156 | `40000176` | 4,256 | 96.7% | 41 | **tail** | event | CollimatorDriver Detector related shutter area is available |
| 157 | `40000204` | 4,256 | 96.7% | 41 | **tail** | event | SysCAN Collimator communication available between NICOL node # and Co… |
| 158 | `40000015` | 4,255 | 96.7% | 41 | **tail** | event | System configuration |
| 159 | `63000310` | 4,253 | 96.7% | 27 | **tail** | event | soft-collision detected |
| 160 | `760060049` | 4,235 | 96.7% | 25 | **tail** | event | Service start timeout |
| 161 | `40009930` | 4,080 | 96.7% | 41 | family: code, post_passed | event | POST Frontal Collimator Passed (87%; 3 templates) |
| 162 | `50001025` | 4,062 | 96.8% | 42 | **tail** | event | Detector goes power down (91%; 3 templates) |
| 163 | `770990000` | 4,053 | 96.8% | 41 | **tail** | event | Secure CWIS Policy is Enabled (84%; 4 templates) |
| 164 | `63001130` | 4,035 | 96.8% | 24 | **tail** | event | Power from GIB to [unit=FrontalStand][status=on] (47%; 4 templates) |
| 165 | `100060102` | 4,029 | 96.8% | 24 | **tail** | event | Connection with GPDU established |
| 166 | `100050009` | 4,018 | 96.8% | 14 | **tail** | event | Injector ready state changed to |
| 167 | `760060075` | 3,967 | 96.8% | 43 | info | inventory | Allura Xper Software Version |
| 168 | `760060076` | 3,922 | 96.8% | 43 | info | inventory | Allura Host MAC Address |
| 169 | `760060077` | 3,922 | 96.8% | 43 | info | inventory | Allura Host SystemID |
| 170 | `100010006` | 3,860 | 96.8% | 42 | **tail** | event | MioService Start up completed |
| 171 | `50001058` | 3,854 | 96.8% | 37 | **tail** | event | Overall FD POST succeeded |
| 172 | `90000000` | 3,807 | 96.9% | 42 | **tail** | event | Sequencer startup |
| 173 | `40000100` | 3,795 | 96.9% | 42 | **tail** | event | CollimatorDriver startup sequence completed successful (99%; 2 templates) |
| 174 | `60000002` | 3,785 | 96.9% | 42 | **tail** | event | Geometry Startup Completed |
| 175 | `80000000` | 3,780 | 96.9% | 42 | **tail** | event | Startup sequence completed succesful |
| 176 | `90000002` | 3,778 | 96.9% | 41 | **tail** | event | Sequencer operational |
| 177 | `760060000` | 3,778 | 96.9% | 43 | **tail** | event | Starting System |
| 178 | `680000005` | 3,768 | 96.9% | 42 | **tail** | event | RIS Interface |
| 179 | `60000012` | 3,758 | 96.9% | 41 | **tail** | event | Informational : Geometry operational |
| 180 | `60000021` | 3,755 | 96.9% | 41 | **tail** | event | Informational : Geometry configuration |
| 181 | `660000015` | 3,755 | 96.9% | 42 | **tail** | event | Starting application |
| 182 | `73200000` | 3,752 | 97.0% | 4 | **tail** | event | VPCBOARDROLE_ISB_FRONTAL Imagedisk Info (slot:#,siop:#,disk:#) Read C… (20%; 14 templates) |
| 183 | `540000005` | 3,751 | 97.0% | 42 | **tail** | event | System configuration |
| 184 | `540000001` | 3,747 | 97.0% | 42 | **tail** | event | Startup succeeded |
| 185 | `510004097` | 3,746 | 97.0% | 42 | **tail** | event | Acquisition startup completed |
| 186 | `610010002` | 3,745 | 97.0% | 42 | **tail** | event | Automation Service:Start up completed |
| 187 | `650000056` | 3,745 | 97.0% | 42 | **tail** | event | Xper module Service startup complete |

