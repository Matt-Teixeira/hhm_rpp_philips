# Review handoff: PCT-1b parser fix design (Philips CT), before the build

## Review closed (2026-11-24)

The design review closed after round 6: no open P1, and round 6's one P2 (the reader monitor)
answered with `sql/14` and its fixtures (§9.14). No round 7 was run (the user's decision). The
remaining checks are the build's tests (1b.1), the PostgreSQL rehearsal (1b.2), the dry run (1b.3)
and Codex's code review (1b.4, its own handoff).

## Round 6 (2026-11-24): the design revised for `REVIEW-PCT1B-PLAN-CODEX-5.md`

Repo `hhm_rpp_philips`, branch `DEV`. The round-5 revision is committed on `DEV`, on top of `7030109`.
**§9 is authoritative**; the changes are listed in §9.13. Please write round-6 findings to
`REVIEW-PCT1B-PLAN-CODEX-6.md`. Ground rules unchanged (below). Q27–Q44 are AGREED.
Q45–Q47 are AGREED too (2026-11-24, as recommended). Still no parser code.

| Round-5 finding | Change | Where | New evidence (`~/philips_ct_evidence/pct1b/`) |
|---|---|---|---|
| 1 P2 slot-relative reader timing | Contract S replaces K and D: each scheduled run's CT snapshot at DB time in `[slot − 60 s, slot + 5 min]`, launch, bootstrap, queue and clock error included; outside S = a reader failure, monitored. The exactly-one argument is restated for the readers at N, N_next and N_next + 30 min | §9.5 `coverage.js`, Q45 | `sql/13`, `out/26`: runs assigned to the *nearest* slot; 672 runs, 0 early (< slot − 50 s), 0 ending after slot + 5 min, 0 with `ERROR`, 0 missed, 0 multiple |
| 2 P2 detached archive partition | Automatic outcome decisions only within 24 h of `t0` **and** with the capture's partition attached (catalog check); otherwise unknown + ERROR, never a later automatic "aborted". A read-only, archive-aware `tooling/philips_ct_outcome.js check`; `resolve` records only a complete answer | §9.5 `ingest.js`, Q46 | checked: `fse_dispatch` `odd-jobs/archive-partitions.sql` detaches `philips_ct_eal_events` six months back |
| 3 P2 audit rename crash gap | A separate audit copy keyed by attempt id (idempotent), then the done-hash, then `state.json` → `complete`, then the bytes, then `state.json` last | §9.5 `spool.js`, Q47 | |

Your other round-5 notes are applied: zero ids handled first; all/some/none counted against the
recorded list; sequence advance never evidence; a pid never authorises a termination; a repair
keeps its operation id, never overwrites unresolved intent, and a second repair starts from the
first's new capture; §9.4's replay text follows Q38; the capacity note separates the 1 h WARN
from the 6 h ERROR. Tests for each are in §9.8 (1b.1, 1b.2), and 1b.6 monitors S with `sql/13`.

**Please look hard at (round 6):**
1. **S.** Is `[slot − 60 s, slot + 5 min]` with the phase `(N + 6 min, N_next − 2 min)` and
   `t1 < N_next − 90 s` exactly one read for all three adjacent slots? Is `sql/13` a fair
   monitor of S, given that start is on the host clock and end on the DB clock?
2. **Q46.** Is "partition attached" checkable exactly from the catalog for a text capture time,
   and is the manual tool's "complete answer" rule sound?
3. **Q47.** Every crash point in completion, including the done-hash before `complete`.
4. Whether anything else stands between this design and the build.

## Round 5 (2026-11-24): the design revised for `REVIEW-PCT1B-PLAN-CODEX-4.md`

Repo `hhm_rpp_philips`, branch `DEV`. The round-4 revision is committed on `DEV`, on top of `8e95ed3`.
**§9 is authoritative**; the changes are listed in §9.12. Please write round-5 findings to
`REVIEW-PCT1B-PLAN-CODEX-5.md`. Ground rules unchanged (below). Q27–Q40 are AGREED (Q40 is now
superseded by Q41). Q41–Q44 are AGREED too (2026-11-24, as recommended). Still no parser code.

**The main change is a deliberate narrowing.** Three of your four round-4 findings were in Q40's
after-the-fact proof and its automatic re-stamps. Rather than add more machinery, Q41 replaces
them. Coverage is delivered by construction: the phase, a DB-clock guard before `COMMIT`, a
forward host/DB clock check, and a DELIVERED / `late` classification from `t1`. PCT-1b no longer
certifies that the reader *succeeded*; that is left to the alert processor's own monitoring, as
for every other log table.

| Round-4 finding | Change | Where | New evidence (`~/philips_ct_evidence/pct1b/`) |
|---|---|---|---|
| 1 P2 receipt expiry | Unknown outcome decided by the recorded ids after the barrier (all present → committed; none → aborted; a mix, or a receipt without its ids → ERROR and stop, never a fresh attempt). The receipt is a cross-check. ERROR at 24 h unresolved | §9.5 `ingest.js`, Q42 | checked: `delete_old_files` (48 h) is in this app and `hhm_rpp`; nothing deletes from `log.philips_ct_eal_events` |
| 2 P2 re-stamp recovery | No automatic re-stamps. A late commit → `late` entry kept in the spool, ERROR each run. A manual `tooling/philips_ct_restamp.js` writes intent and ids before `COMMIT` and decides its outcome after the barrier by where the ids are (old or new capture) | §9.5, Q41, Q44 | |
| 3 P2 error labels | Reproduced: the stored label is `ERROR`. Rerun with the corrected filter: **0 `ERROR` entries of any function in 672 runs** (only `WARN` stored). The parser no longer certifies reader success; 1b.6 monitors it with the corrected filter, `testRowForLogAlert` included | §9.5 `coverage.js`, 1b.6 | `sql/12`, `out/25` |
| 4 P2 historical clock | No historical reader timestamp is used. The offset (+ round trip ≤ 10 s) is checked before the attempt, forward to the reader at most 24 min later. Assumption K (≤ 50 s further movement) is stated; chrony state recorded; an offset change over 10 s between runs → WARN naming the attempts in between | §9.5 `coverage.js`, Q41 | chrony synced to `metadata.google.internal`, offset µs (2026-11-24) |

Required additions: 1 → 1b.2 receipt lifecycle; 2 → 1b.2 `late` and repair; 3 → `out/25`, 1b.6;
4 → the journal is gone (one audit file per attempt under the system lock, read by nothing);
5 → Q43 (`idle_in_transaction_session_timeout` 2 min, keepalives, pid diagnostics, WARN 30 min /
ERROR 2 h unknown, pending-age WARN 1 h / ERROR 6 h) and 1b.2 barrier; 6 → separate statements
under Read Committed (§9.5 `ingest.js`) and 1b.2 barrier.

**Please look hard at (round 5):**
1. **Q41's classification.** With the phase `(N + 6 min, N_next − 2 min)`, `t1 < N_next − 90 s`,
   the offset within 60 s when the reader fires (assumption K) and the CT query within 4 min of
   the reader's start (assumption D), does exactly one scheduled reader read the rows? Is anything
   besides K, D and reader success assumed?
2. **The narrowing itself.** Is leaving reader success to the alert processor acceptable for
   PCT-1b, given that the old parser and every other log table already depend on it? If not,
   say what minimal check you would require.
3. **Q42.** Can the recorded ids be present without this attempt having committed, or absent
   when it did (sequence ids, partitions, archive tables)? Is the zero-id case safe?
4. **Q44's repair tool.** Is its intent/outcome protocol sound at every crash point?
5. Whether the §9.8 additions now test what each round-4 finding needed.

## Round 4 (2026-11-24): the design revised for `REVIEW-PCT1B-PLAN-CODEX-3.md`

Repo `hhm_rpp_philips`, branch `DEV`. The round-3 revision is committed on `DEV`, on top of
`f4da136`. **§9 is authoritative**; the changes are listed in §9.11. Please write
round-4 findings to `REVIEW-PCT1B-PLAN-CODEX-4.md`. Ground rules unchanged (below). Q27–Q37
are AGREED (Q37 now superseded by Q38); Q38–Q40 are AGREED too (2026-11-24, as recommended). Still no parser code.

| Round-3 finding | Change | Where | New evidence (`~/philips_ct_evidence/pct1b/`) |
|---|---|---|---|
| 1 P1 ambiguous class suppresses a new revision | Only old-form time text ⇒ old row (projection only); anything else ⇒ new (exact only). New rows are validated never to be old-form | §9.3, Q38 | |
| 2 P1 capture time isn't a transaction identity | Attempt uuid in `state.json` before `BEGIN`; inserted ids + capture text `fsync`ed as `committing` before `COMMIT`; `log.saved_files` insert in the same transaction is the receipt (its PK is `(system_id, file_name, capture_datetime)`); unknown outcome decided after `pg_advisory_xact_lock(system, kind)` (`lock_timeout` 10 min), else stays unknown; capture kept as text; per-system `flock` on the spool | §9.5 `ingest.js`, Q39 | catalog: `log.saved_files` has no `id`, PK as above |
| 3 P2 old row with new-form time | Reproduced. Under Q38 it's a bounded deliberate duplicate | §9.3 | `scripts/eal_time_shape_census.js`, `out/23`: 0 of 77,264 copy EAL rows project to non-old-form time |
| 4 P2 closed phase endpoint | Strict `(N + 6 min, N_next − 2 min)` on the exact capture text; re-stamps too | §9.5 `coverage.js` | |
| 5 P2 completion drops coverage work | `journal.js`: 90-day append-only `fsync`ed journal; coverage read from the journal; spool deleted only after the journal record | §9.5, Q40 | |
| 6 P2 timing study / audit | Redone by start time (`dt`), per-slot multiplicity, failure flags. Coverage proved per attempt from a successful run (start − ε > `t1`, end + ε < `c` + 30 min, no `E` from `onBoot` / `insertAlertDetections`), else re-stamp by id (≤ 3) | §9.5 `coverage.js`, Q40 | `sql/11`, `out/24`: 672/672 slots, one run each, start +1.3–2.8 s, ≤ 51 s, 0 failures; host vs DB clock ≈ 40 ms |

**Please look hard at (round 4):**
1. **Q38's one-directional provenance.** Is "no new row is ever old-form" enforced on every write
   path (ingest, replay, re-stamp, rollback replay)? Is the duplicate the only cost?
2. **The receipt and barrier.** Can a `log.saved_files` row at (system, file, capture text)
   exist without this attempt having committed, or be missing when it did? Is the advisory-lock
   barrier sound if the original backend is still in `COMMIT`, or is idle in transaction after
   the client died? Does `lock_timeout` + "stays unknown" ever block forever?
3. **Coverage proof.** Is start − ε > `t1` and end + ε < `c` + 30 min, with no `E` entries,
   sufficient given that the reader's CT query is one of several in a `Promise.all`? Is ε right?
4. **Re-stamp by id.** Interaction with the journal, the 3-attempt cap, partition moves, and an
   alert-processor run that overlaps the re-stamp transaction.
5. Whether the required additions in §9.8 now test what each finding needed.

## Round 3 (2026-11-24): the design revised for `REVIEW-PCT1B-PLAN-CODEX-2.md`

Repo `hhm_rpp_philips`, branch `DEV`. The plan revised for round 2 is committed on `DEV`, on top of
`a3b3a75` (which committed the round-1 revision; the round-2 text below wrongly called that
uncommitted). **§9 is authoritative**; the round-3 changes are listed in
§9.10. Please write round-3 findings to `REVIEW-PCT1B-PLAN-CODEX-3.md`. Ground rules unchanged
(below). Q27–Q33 and Q34–Q37 are AGREED (Q34–Q37 on 2026-11-24, as recommended). Still no parser code.

| Round-2 finding | Change | Where | New evidence (`~/philips_ct_evidence/pct1b/`) |
|---|---|---|---|
| 1 P1 rollback after a partial publish | `tooling/philips_ct_rollback.js check` / `apply`. `apply` holds the collector's `<dir>/.grab.lock`, preserves all five published files with fsync and read-back sha256, proves each `.output` covered by content (legacy re-export of the preserved `Logger.mdb`, or a rebuild from a completed `.csv`, byte-equal), sets only covered offsets, stops on `UNCOVERED`. Replay includes a fresh `-e` export of the preserved `Logger.mdb` | §9.4, Q35 | |
| 2 P1 valid snapshots that keep failing | `spool.js`: every changed snapshot spooled (fsync, atomic `state.json`) before anything else; pending entries processed oldest first each run; done only when committed and the save acknowledged | §9.5, Q34 | |
| 3 P2 timeout ≠ commit deadline | DB clock only; the deadline kept as a resource control; a late (`t1 ≥ N_next`) or uncertain commit is marked `restamp_due`, and the next in-phase run re-stamps that commit's EAL rows' `capture_datetime` | §9.5 `coverage.js`, Q36 | |
| 4 P2 reader windows | Assumption D (reader snapshot within N + 5 min); run phase `[N + 5 min, N_next − 2 min)` refuses your `:24:10` timeline; read-only audit against `util.app_run_logs`. Reader unchanged | §9.5 `coverage.js`, Q36 | `sql/10`, `out/21`: 672 runs in 14 days, 48/day, none missed; each ended 12–53 s after its minute (p99 37 s) |
| 5 P2 NULL `eal_time` | Reproduced. Three classes by time text: old form → (a) only; new form → (b) only; NULL or other → ambiguous, either. New rows validated to new-form or NULL (the MDB time columns are nullable; 0 NULL in the copies). Counters narrowed to observable ones | §9.3, Q37 | `scripts/eal_null_time_probe.js`, `out/22` |
| 6 P2 save after hash | `save.js` awaited, errors propagated; hash only after the acknowledged save; a failed save stays pending | §9.5 | |
| 7 P2 retention capacity | Completed spool entries deleted (bytes are in `log.saved_files`); WARN 1 GB / 6 h, ERROR 5 GB / 24 h over `spool/`, `retained/`, `replayed/`; a failed retention write blocks completion; threshold arithmetic spelled out | §9.5, 1b.6 | free space 1.1 TB (2026-11-24) |

Facts checked this round: `alert.detections` key is `(run_id, job_id, alert_model_id,
capture_datetime, inserted_at)` (no cross-run dedupe); `log.philips_ct_eal_events` is
partitioned by `RANGE (capture_datetime)`.

**Please look hard at (round 3):**
1. **Coverage (`coverage.js`).** Is the coverage condition right (`t < s` and `s − 30 min <
   c`)? Is the phase sufficient under D, including a re-stamp run and a pending replay? Is the
   "uncertain commit" check (rows with the recorded capture time exist) sound when two
   transactions of one system share nothing but the system id? Is re-stamping by
   `(system_id, capture_datetime, EAL kind)` precise enough?
2. **Spool idempotence.** Oldest-first replay of pending entries, interleaved with new grabs,
   resets and a rollback period: any order where rule P's multiset match inserts a duplicate or
   drops a row?
3. **Rollback coverage proof.** Is "legacy re-export of the preserved `Logger.mdb` equals the
   `.output`" or "rebuild from a completed `.csv` equals the `.output`" a sound proof that
   setting that offset to the preserved size skips nothing? Locale and `sort` determinism?
4. **Ambiguous class.** Any path by which a new row is stored with time text that isn't
   new-form or NULL, or an old row lands as new-form?
5. Anything in the required-additions list (§9.8 1b.1/1b.2) that doesn't actually test what the
   finding needed.

## Round 2 (2026-11-20): the design revised for `REVIEW-PCT1B-PLAN-CODEX.md`

Repo `hhm_rpp_philips`, branch `DEV`. The revised plan is in the working tree, uncommitted, on top
of `42cd3f7`: `PLAN-PHILIPS-CT-INSIGHTS.md` §9. **§9 is authoritative.** The round-1 text further
down describes the design as it was. Please write round-2 findings to
`REVIEW-PCT1B-PLAN-CODEX-2.md`. The ground rules below are unchanged: read-only everywhere, the DB
only through `q.js`, no `.env`, no writes to Redis or `/home/prod`, real collector runs only with
the stub `lftp`, `python3 -I`, every child process bounded. Still no parser code exists; the
build starts after 2026-11-24 18:53 UTC.

**All 9 findings were accepted** (plan §9.9), and the user AGREED Q27–Q33 as recommended on
2026-11-24. What changed:

| Finding | Change | Where | New evidence (`~/philips_ct_evidence/pct1b/`) |
|---|---|---|---|
| 1 P1 O2s suppresses changed rows | **Rule P.** A stored row matches an incoming row at the same key if (a) it is an old-parser row and equals a **projection** of the incoming row through the old pipeline: the plain `mdb-export` record, then for EAL `awk 'NF>2'`, `ct_eal_v_2`, `remove_dub_quotes`, `''`→NULL; for Events the collector's `tr -cd` set, the `awk -F,` reorder, the `sed` filter, `ct_events_v2`. Or (b) it equals the new representation exactly. Multiset. **Provenance from the row:** new rows store `eal_time` / `event_time` as the export's `YYYY-MM-DD HH:MM:SS` (Q28); every stored row has the old `MM/dd/yy HH:mm:ss` (11,622,334 of 11,622,334 in `log`). No boundary state | §9.3, §9.5 `legacy.js`, Q27, Q28 | `scripts/legacy_projection.js`, `out/18`: the rebuilt plain record = real `mdb-export` on every EAL row and every Events row but `ERROR_BLOB` (BLOB text, after the stored fields). Projection = stored row for **117,270 of 117,274** (the 4 are the revised rows, kept under Q6). That includes **873 I6-merged rows**: the old regex ran into the next line and stored its event time in `eal`, so `eal` is matched as "a `MM/dd/yy HH:mm:ss` value". `out/19`: time-text census and NULL `host_datetime` = 0 |
| 2 P1 fail-closed loses buffers | Records are physical lines (the `-e` dialect). A bad record is quarantined and the rest ingested (partial, ERROR). A wrong header or > max(10, 1%) bad lines retains the whole file and ingests nothing. The exact bytes are retained in `retained/philips_ct/` (never auto-deleted) with `reasons.json`, with a replay entry point. The file is read once into a buffer; the hash, the parse and `log.saved_files` all use that buffer | §9.5 `csv.js`, `retain.js`, `index.js`, Q29 | |
| 3 P1 rollback / in-flight writers | Deploy drain (`pgrep` empty after a run, pull, `UPDATE`, all before the next cron start). Rollback: stop CT, run a read-only check tool (Redis done-hash vs current `.csv` sha256, same-publish check against `.output`), retain unreconciled snapshots, then set the offsets, then config, then code, then cron. Replay later; rule P matches rows the old parser stored meanwhile | §9.4, Q30 | |
| 4 P2 candidate completeness | `host_datetime` within the span ±2 days **OR NULL**, plus `host_date = ANY(file dates)`, plus the kind predicate. Impossible dates rejected. Invalid zone → NULL + ERROR (Q33) | §9.5 `ingest.js` | `sql/09`, `out/20`: 251 ms on the server for the busiest system (`BitmapOr`) |
| 5 P2 all-NULL Events payload | Validation requires an Events column set. Kind round-trip check before insert. The same predicate in SQL and JS | §9.5 `rows.js` | |
| 6 P2 R2 not old-equivalent | Transition comparison uses the projection (real old regex and helpers), not trim plus date text | §9.3 | `out/18` |
| 7 P2 rehearsal seeding | Rehearsal seeds `log`-eligible rows only: expected 113,552 inserts (your number); the all-history count (62,208) is a separate study | §9.3, §9.8 1b.2 | `out/18` "rule P" |
| 8 P2 alert window | `pg_try_advisory_xact_lock` (no wait; skip the file if busy); capture time = when the lock is taken; commit deadline = next alert-processor start (minutes 24/54) − 60 s via `SET LOCAL statement_timeout`; no file started with < 30 s left; on expiry roll back and retry next run. `offline_hhm_conn` in the same transaction, `GREATEST` (Q32) | §9.5, Q31, Q32 | |
| 9 P2 primary keys | Corrected (§9.1); DST tests on sequential snapshots | §9.1 | `out/17` |

**Please look hard at (round 2):**
1. **Is rule P sound?** In particular:
   - the provenance test (old time text ⇔ old-parser row): can any path make a new row look
     old, or an old row look new?
   - the I6 wildcard on `eal`;
   - the residual ambiguity stated at the end of §9.3 (two source rows that differ only in what
     the old pipeline destroyed). Is it stated honestly and bounded?
   - Can the projection's per-row replay ever disagree with the old parser's whole-file `/g`
     scan in a way that matters? Beyond I6, think of the byte-offset tail starting mid-line,
     and `sort` order.
2. **Retention:**
   - the 1% / 10-line threshold;
   - setting the hash after a partial ingest;
   - disk growth while a system keeps failing;
   - whether replay plus rule P is idempotent in every order: replay before or after new
     grabs, and after a rollback period.
3. **The rollback check tool's "same publish" test.** Is it enough to make an end-of-file reset
   safe, given the collector's publish order (`Logger.mdb`, `.output` ×2, `.csv` ×2, each
   `mv -fT`) and a partly failed publish?
4. **The deadline:** any path where a row commits after a reader snapshot and is then outside
   every later reader window. Think of a manual run, clock skew between the app box and the DB,
   and the alert processor running late or long.
5. **Anything in the 1b.1 / 1b.2 exit criteria (§9.8)** that still wouldn't catch a defect you
   found.

---

## Round 1 (original handoff; describes the design before the review)

Repo: `hhm_rpp_philips`, branch `DEV`, commit `42cd3f7`. **This is a design review. No code
exists yet.** The parser may not be changed before 2026-11-24 18:53 UTC, and we want design
defects found before then. Please write findings to `REVIEW-PCT1B-PLAN-CODEX.md` in this repo.

**What to read:** `PLAN-PHILIPS-CT-INSIGHTS.md` §9 (about 270 lines). Background: §1.4–§1.5
(source, time), §3 (ingest defects I1–I8), §5 Q4–Q8, §7.4, §8 (the collector change, PCT-C,
already in prod). The owner has agreed the design as written (§9.7, Q19–Q26). A finding can still
overturn any part of it; that is the point of this review.

**Ground rules:**
- **Read-only, everywhere.**
  - Prod DB: only through `~/philips_ct_evidence/scripts/q.js`, which opens its own session
    with `default_transaction_read_only=on`, a statement timeout and a lock timeout. Never the
    app pool. Read-only sessions refuse temp tables; use CTEs.
  - Never read `.env` (it holds device credentials). Never write to Redis, prod files or
    `/home/prod/*`. No connection to any scanner.
- **Raw device data stays where it is:** `~/philips_ct_evidence/mdb/`, `pct1b/csv/`,
  `pct1b/out/legacy_rows.json`. Don't copy it into the repo. Don't put hosts, IPs or credentials
  in the review.
- **Tools:** Python with `python3 -I`. Real collector runs only with the stub `lftp` (see
  `pct1b/scripts/build_csv.sh`, which refuses to run unless the stub is first on `PATH`). Bound
  every child process.
- **Runtime:** Node 16.20 on the server (prod and dev are the same box). Tests will use `node --test`.

## The problem, in one paragraph

Philips CT scanners keep a rolling Access database, `Logger.mdb`, with two tables, `EALInfo` and
`Events`. It resets to an empty file every 3.5 h to 2.3 days. The collector (`hhm_data_acquisition`,
prod since 2026-11-20) downloads it every 30 min. It writes two sets of exports:
- the legacy, lossy `EALInfo.output` / `Events.output`;
- new, complete `EALInfo.csv` / `Events.csv`, from `mdb-export -e -b strip -T '%Y-%m-%d %H:%M:%S'`
  then `tr -d '\000'`, replaced atomically.

This repo's parser (`jobs/Philips/CT/`) reads only the `.output` files and tails them by byte
offset, with the offset kept in Redis. It loses about 52% of Events rows (a regex rejects the
`__NN` key suffix), splits `Msg` at its first space, and assumes an append-only file although
the collector rewrites a sorted full export every time. Both tables go into one table,
`log.philips_ct_eal_events`, partitioned monthly on `capture_datetime`. PCT-1b replaces the
reader with a whole-file `.csv` parse plus key-based dedupe against the DB.

**State:** all 9 collected systems have been unreachable since 2026-10-30 / 11-02, so no live
`.csv` exists. The proof uses the 5 `Logger.mdb` copies: 179,478 rows.

## The design under review (plan §9.5)

| Piece | Intended behaviour |
|---|---|
| `csv.js` | **Decode.** A CSV state machine over the whole text. `""` → `"`. Records end at LF or CRLF outside quotes. Then **one left-to-right unescape pass per field**: `\n \r \t \\`; any other backslash pair is kept. An unquoted empty field is NULL; `""` is empty text. Malformed quoting throws |
| `rows.js` | **Build rows.** Checks the exact header. Key `yyyy/MM/dd HH:mm:ss.SSS[__NN]` → `host_date`, `host_time` (suffix kept). Events: `message` = `Msg` whole, `eal` = `EAL` (`Yes` / NULL). **R2 text (Q20):** `eal_time` / `event_time` written as the old `MM/dd/yy HH:mm:ss`, and EAL `Info` right-trimmed with `/\s+$/` (all-blank → NULL), both exactly as the old parser stored them. BLOB dropped |
| `time.js` | **`host_datetime`** = wall clock in the site time zone (`America/New_York` if NULL). The repeated DST hour takes the earlier offset via luxon 3.6 `getPossibleOffsets()`. Today luxon picks by the offset at parse time, so the result depends on when the parser ran |
| `ingest.js` | **Per file, in one transaction:** `pg_advisory_xact_lock(system, kind)`; read the stored rows of that system and kind with `host_datetime` within the file's span ±1 day. Kind = Events if any of `type, level, module, time_stamp, message, eal, event_time` is set, else EAL. Then a **multiset diff on (key, content)**, where content = the 20 text columns, without `host_datetime`, `capture_datetime`, `id` and `status`. Apply the **O2s rule**, then insert the rest in batches of 5,000 and commit |
| `index.js` | **Per configured file:** missing → skip silently; not `.csv` → WARN and skip; Redis `<SME>.<file>` holding `{size, sha256}` unchanged → skip. Otherwise ingest, then set the hash, then `gzip_n_save` (unchanged). The EAL ingest upserts `alert.offline_hhm_conn` with the newest inserted `host_datetime` |

**The O2s rule (Q19), the core of the transition.** The DB already holds about 11.6M rows from
the old parser, with Events `Msg` split (the rest of the message landed in `eal`). On the first
whole-file parse, plain key+content dedupe would duplicate them. The rule: **a stored Events row
whose `eal` is neither `Yes` nor NULL is an old split row, and matches on key only.** Every other
stored row matches on key + content (agreed rule Q6: rows with the same key and different content,
from DST or resets, are all kept).

Measured on the 5 copies against the 117,274 rows the old parser stored for the same windows
(plan §9.3):

| Option | Duplicates of stored rows | Never-stored rows lost |
|---|---|---|
| key+content only | 6,839 | 0 |
| **O2s** | **0 Events** (4 EAL rows, below) | **0** |
| high-water key | 0 | 31,255 |
| cutover timestamp | 0 | 62,204 |

The 4 EAL rows: their stored `Info` is garbled or NULL, and a later grab has the real text. They
were probably still being written when grabbed. Under Q6 the corrected row is kept as a second
row (Q25).

**The file switch (Q21).** The CT job reads file names from `config.log` (query `PHILIPS_CT` in
`data_acquisition/on_boot_queries.js`). After the code deploy, the owner runs an `UPDATE` changing
`EALInfo.output` → `EALInfo.csv` (26 rows) and `Events.output` → `Events.csv` (25 rows). Order:
code, then config. For rollback: config, then code, then reset the old Redis offset keys
`<SME>.EALInfo.output` / `<SME>.Events.output` to the current file sizes.

**Fail closed (Q24).** A wrong header, bad quoting, a wrong field count or a malformed key is an
ERROR for that file. Nothing from it is inserted and its hash isn't set, so the next run retries.

## Evidence (all in `~/philips_ct_evidence/pct1b/`, README maps each item)

- `csv/<SME>/EALInfo.csv`, `Events.csv`: the real collector's output for each copy
  (`scripts/build_csv.sh`). `out/01`.
- `scripts/csvref.py`: the Python reference decoder and the R1/R2 row builders.
- `scripts/transition.py`, `transition_shape.py`: the option table (`out/07`, `out/13`). The
  stored rows come from `sql/05` → `out/legacy_rows.json`.
- `out/08`: the 4 revised rows.
- `out/15`: table order is not time order (backward steps of up to 20 h), so file order can't
  separate the two DST passes.
- `out/16`: luxon's run-time-dependent DST result and `getPossibleOffsets()`.
- **Readers:** `out/02`, `out/03`, `out/14`. The only live reader is `/home/prod/alert-processor`
  (readable; don't open its `.env`). It runs at cron `24,54`, does `SELECT *` of rows with
  `capture_datetime` in the last 30 min, and tests `err_number contains` (13 models per system).
- **Performance:** `out/09`–`out/11`. Decode + diff ≤ 0.46 s for the largest file. The
  stored-rows read is 18–69 ms on the server and 1.9 s end to end for the busiest system.
- `pctc/scripts/check_csv_export.py`: the collector export equals plain `mdb-export` on every
  field of all 5 copies after unescaping.

## Please look hard at

1. **The O2s rule.**
   - Can it suppress a legitimate new row, or let a duplicate through? Only `Yes` / NULL appear
     in `EAL` in the 5 copies, but the column is `Text(6)`. If a scanner ever writes another value,
     new rows would carry it and fall into the key-only branch on later runs.
   - Should the branch also require `capture_datetime` before the deploy, or is stateless better?
2. **The dedupe window.** It is `host_datetime` ±1 day, with keys compared on
   `host_date`/`host_time`. Look for any way a stored row escapes the window and is re-inserted
   on every run:
   - `host_datetime` NULL: the old code can store NULL when luxon fails;
   - a key that passes the format check but is an impossible date (`2026/02/30`);
   - a site time zone changed later;
   - a scanner clock far off.
3. **The kind discriminator** (`num_nonnulls` of the Events columns), for old rows and new ones.
4. **R2 equivalence.**
   - Is `/\s+$/` in JS the same trim the old regex `"?(?<info>.*?)(\s+)?"?,"` did, for every
     possible `Info`?
   - Is converting `-T '%Y-%m-%d %H:%M:%S'` back to `MM/dd/yy HH:mm:ss` exactly what the old
     export printed (mdb-export's default format) for every value, including midnight and
     years outside 2000–2099?
5. **The decoder against the real `mdb-export -e`** on this box (mdbtools as installed):
   - Does it escape every backslash, so `\x` for other `x` never occurs?
   - Does `-b strip` leave anything in BLOB beyond the `""` seen on 511 rows?
   - Can a `\0` removed by `tr` ever join two fields or break quoting?
6. **Concurrency and atomicity.**
   - The transaction + advisory lock, against a manual run during cron.
   - The Redis hash written only after commit, and what happens if it isn't.
   - `capture_datetime` set at file start, against the alert processor's 30-min window
     (the parser runs at `:18/:48`, the alert processor at `:24/:54`).
7. **Fail closed vs data loss.** A malformed row is likely to stay in the scanner's buffer until
   that buffer resets. If the file keeps failing, its rows are never ingested, and once the
   buffer resets they are gone. Is fail-closed per file still right? Is there something better
   that adds no silent drop, such as quarantining the bad rows and ingesting the rest with an
   ERROR?
8. **The DST rule (Q23).** The earlier offset is used, and `host_datetime` is kept out of the
   content. Any dedupe or ordering effect we missed, for example on `alert.offline_hhm_conn` or
   `log.log_recent_files`?
9. **The deploy order and rollback** in §9.4: any window where the old or new code meets the
   other's config or Redis state and inserts wrong rows.
10. **Whether the exit criteria in §9.8 (1b.1–1b.6) would catch the defects above.** In
    particular: is the transition rehearsal (stored rows loaded into a throwaway PostgreSQL 14,
    then each copy) a faithful model of prod?

## Out of scope

- Making the scanners reachable (network work, plan §8.1).
- The collector itself (PCT-C, reviewed in 5 rounds, in prod). A collector defect is still worth
  reporting, as a separate note.
- Changing or cleaning existing rows (Q5: no backfill). The insight layer (PCT-2 onward).
- `public.logfile_event_history_metadata.scan_seconds`: shared with other parsers and read by
  `fse_dispatch`. CT never writes it, and nothing here may change it.

## What we'd like back (`REVIEW-PCT1B-PLAN-CODEX.md`)

- **Each finding:** a number, P1 / P2 / P3, the plan section it hits, the failure in concrete
  terms (what input or state → which wrong row, loss or duplicate), how you established it
  (reproduced, measured on the evidence, or reasoned), and a suggested change.
  - P1: a design that would lose or duplicate rows, or break prod.
  - P2: a likely defect or a gap in the proof.
  - P3: minor.
- **A verdict:** is the design ready to build as agreed, or which parts must change first?
- **Missing tests:** anything 1b.1 / 1b.2 must add.

After this review closes, the build follows. The code review gets its own handoff
(`REVIEW-PCT1B-PARSER-HANDOFF.md`) after the exactness proof and the dry run (§9.8, 1b.4).
