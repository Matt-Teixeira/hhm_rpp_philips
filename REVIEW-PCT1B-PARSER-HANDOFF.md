# Review handoff: PCT-1b Philips CT parser, code review (step 1b.4)

Please review the **implementation** of plan §9 (`PLAN-PHILIPS-CT-INSIGHTS.md`, authoritative;
design review closed after round 6, §9.14). Write findings to `REVIEW-PCT1B-PARSER-CODEX.md`, as
P1 / P2 / P3 with a concrete failure for each. One round is planned: please separate what must change
before deploy from what can wait.

## Scope

Repo `hhm_rpp_philips`, branch `DEV`, commits `aeff0cc..HEAD` (`git log --oneline aeff0cc~1..HEAD`).

| File | What it is (plan §9.5) |
|---|---|
| `jobs/Philips/CT/csv.js` | decode the collector's `mdb-export -e` files |
| `jobs/Philips/CT/rows.js` | validate and build rows (headers, keys, Q28 text, Q38, kind round-trip, Q29 thresholds) |
| `jobs/Philips/CT/legacy.js` | rule P: projection through the old pipeline (the repo's real regexes), multiset match |
| `jobs/Philips/CT/time.js` | `host_datetime` (DST fold → earlier offset; caches) |
| `jobs/Philips/CT/coverage.js` | phase, guard, DELIVERED / `late`, clock checks (µs from PostgreSQL text) |
| `jobs/Philips/CT/spool.js` | spool, per-system `flock`, atomic writes, orphan repair, Q47 completion |
| `jobs/Philips/CT/save.js` | the receipt in the ingest transaction |
| `jobs/Philips/CT/ingest.js` | one attempt per entry: direct connection, manual `BEGIN` / `COMMIT`, unknown-outcome resolution (Q39, Q42, Q43, Q46) |
| `jobs/Philips/CT/run.js` | per-system orchestration, `DRY_RUN`, replay, the dev-only `.csv` name switch |
| `jobs/Philips/CT/index.js`, root `index.js` | entry points (`PHILIPS_CT`, `PHILIPS_CT_REPLAY`) |
| `tooling/philips_ct_{rollback,restamp,outcome,reader_monitor}.js`, `tooling/lib/` | operator tools |
| `utils/db/pg-pool.js` | `keepAlive: true` (affects every job) |
| removed | `jobs/Philips/CT/eal_parser.js`, `events_parser.js`, `data_acquisition/Philips_CT.js` |

## How to check

- Tests: `node --test jobs/Philips/CT/__tests__/ tooling/__tests__/` (Node 16.20; no network, no DB).
- Rehearsal (optional, outside the repo): `~/philips_ct_evidence/pct1b/rehearsal/` runs the real
  code against a throwaway local PostgreSQL 14 (`schema.sql` rebuilds the prod tables from the
  catalog; `harness.js` injects the DB, Redis and logger; `rh.clock_timestamp()` shadows the DB clock
  through `search_path`). Scenarios `s1`–`s6`; results `pct1b/out/38`–`45`.
- Evidence index: `~/philips_ct_evidence/pct1b/README.md`, "Build 1b.1", "Rehearsal 1b.2", "Dry run 1b.3".

## Already established (with evidence)

- The code reproduces the plan's rule-P counts exactly on the 5 copies (`out/31`) and on a
  production-shaped seed in PostgreSQL: 113,552 inserts (`out/39`); DB = MDB against an independent
  Python reader of the plain export (`out/38`); dry run against prod: 0/623, 0/15,197, 2/14,055 (`out/47`).
- Every row of the old whole-file pipeline is reproduced by the per-row projection: 129,647, 0 missed (`out/37`).
- Mutation check: 22 of 23 killed; the survivor (removing the new-form time regex) is equivalent,
  because the arithmetic date check already rejects any other text (`out/36`).
- Unknown outcomes on the real server: terminated in `COMMIT` → aborted; lost response → committed by
  ids, recovery waiting at the barrier while the original was still in `COMMIT`; receipt deleted;
  mixed ids; 24 h horizon; detached partition + the outcome tool (`out/40`). `late` and the re-stamp
  tool, including a month boundary and a kill during its `COMMIT` (`out/41`).

## Deviations and judgement calls (please challenge)

1. **`no_eal_rows`:** an attempt that inserted no EAL rows is never `late` (`ingest.js`
   `classifyAttempt`). Rationale: every enabled CT model tests `err_number`, NULL in Events (§9.2).
2. **Orphan repair** (`spool.js` `repairOrphans`): a folder with `data` and no `state.json` gets a
   rebuilt `spooled` state; stray temp files are deleted under the system lock. Not in the plan.
3. **The per-system lock** is a `flock` child process holding the lock while the parent lives
   (stdin pipe). Released on exit or crash.
4. **Advisory key:** `pg_try_advisory_xact_lock(hashtext('philips_ct_ingest:<SME>:<kind>'))`, the
   convention other apps here use.
5. **Unknown outcome held per file:** an unresolved entry holds later entries of the same file only.
6. **`devCsvNames`** (dev only, `DEV_ENV=dev` and `PHILIPS_CT_DEV_CSV=1`) for the 1b.3 dry run.
7. **Plan correction (§9.4):** one partial collector publish can leave `Events.output`
   `UNCOVERED` (the rehearsal matrix, `out/43`); the remedy is waiting for the next grab.
8. **The rollback tool's `.csv` route** compares bytes after rebuilding with several locales for
   `sort`; any byte-identical result proves coverage.

## Please look hard at

1. **`ingest.js`:** every path between `BEGIN` and the state writes; what happens on each exception;
   whether any path can acknowledge a commit that didn't happen, or retry one that did.
2. **`run.js`:** the entry state machine across runs (all statuses, the `held` set, the order of
   completion and Redis writes), and the `DRY_RUN` path (nothing written; `db.connect` is refused there).
3. **Rule P and Q38** in `legacy.js` / `rows.js`: any input that suppresses a new row or duplicates an
   old one beyond the accepted comma-shift case.
4. **The tools:** `rollback apply` (lock, preservation, coverage, the Redis `SET`), `restamp` and
   `outcome resolve` (they write state; check their preconditions and crash points).
5. **Operational:** the shared `keepAlive` change; log volume; anything that would make the first
   prod runs noisy or slow (9 systems, unreachable today, so every configured file is missing).

## Ground rules

Read-only: no writes to the prod DB, Redis, `/home/prod` or the collector folders; no `.env` reads;
no scanner connections. The rehearsal cluster and evidence folders are fine to use. Raw device data
(`pct1b/csv/`, `mdb/`) stays out of the repo; the committed fixtures are masked (Q18).
