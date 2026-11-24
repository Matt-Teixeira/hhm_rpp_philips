# Review handoff: PCT-1b parser fix design (Philips CT), before the build

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
