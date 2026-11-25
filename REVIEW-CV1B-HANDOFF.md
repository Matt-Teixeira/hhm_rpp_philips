# Review handoff: CV-1b Philips CV parser fix and backfill tool (code review)

Please review the **implementation** of `PLAN-PHILIPS-CV-INSIGHTS.md` §7 (authoritative: §7.2–§7.4 is
the design, §7.8 the build and its changes from the design). Write findings to
`REVIEW-CV1B-CODEX.md`, as P1 / P2 / P3, each with a concrete failure (input → wrong result). One round
is planned: please separate what must change before deploy from what can wait.

## Scope

Repo `hhm_rpp_philips`, branch `DEV`, commit `fb3d510` (`git show --stat fb3d510`).

| File | What it is |
|---|---|
| `jobs/Philips/CV/decode.js` | Latin-1 decode with the `0xE1` → `�` separator restored; the PHI mask; `read_lines` |
| `jobs/Philips/CV/folders.js` | daily-folder order (by date digits) and the wait / skip rule |
| `jobs/Philips/CV/eventlog.js` | the daily job: the folder loop, the pointer, stop on error, no-record files, `isLast` |
| `jobs/Philips/CV/lod_eventlog.js` | the on-demand file: decode and mask only |
| `parse/parsers.js` | `philips_re.cv.eventlog_2` (I1); `eventlog` is unchanged |
| `tooling/cv_backfill.js` | the one-off backfill (Q4): guards, capture time, one transaction per folder |
| `util/dry_run.js` | recorded-SQL file name (affects every job's `DRY_RUN` output name only) |
| `jobs/Philips/CV/__tests__/` | 20 tests; the loop tests stub the DB, Redis and logger through `require.cache` |

## How to check

- Tests: `node --test jobs/` (Node 16.20; no network, no DB): 10 of 10 files pass.
- Evidence (outside the repo): `~/philips_cv_evidence/README.md`, section "CV-1b build checks". Its
  `src/` and `out/db_*.json` hold raw device data **with PHI**: please don't copy from them into the
  review.

## Already established (plan §7.8)

- Oracle: the repo's line pipeline on 16 real files (771,620 rows) equals an independent Python
  reader. The only differences are the separator rendering inside `message` and the masked values.
- `DRY_RUN` of the real job on 3 systems: 79,768 recorded rows, equal to the oracle field by field.
  The recorded SQL has 0 unmasked PHI values.
- The loop tests fail 4 of 5 against the old `eventlog.js`.
- Backfill `DRY_RUN`: 3 missing exports = reader = oracle; an already-loaded export is refused; the
  45 real folders are refused until the collector sweep ships.

## Judgement calls (please challenge)

1. **Latin-1, not Windows-1252,** and `0xE1` mapped back to `U+FFFD`, so `message` keeps today's
   separator and the alert models (`contains` on `description`, 3 ASCII phrases) can't change.
2. **The mask runs on the raw line before matching.** With no ` [UI_DEVICE_NAME]` after the value,
   it masks to the end of the line, and that row loses its trailing fields. Is the regex
   (`decode.js` `PHI_RE`, lazy) safe on every shape? Are there sinks it misses? `log.saved_files`
   still gets the raw file for 48 h (not changed, by design).
3. **An error stops the system's run** with no time limit, unlike a missing `.txe` (48 h). A folder
   the DB always rejects, for example one holding a NUL byte (`\u0000` is invalid in `text`; none
   seen in the samples), would block that system until someone acts. It's visible as an error every
   run. Should `decode_line` strip `\u0000` instead?
4. **The 48 h age is the daily folder's mtime.** §7.3 now requires the collector's temp unzip
   folder to be outside it; otherwise retries would refresh the mtime and the skip would never fire.
   Is the mtime the right clock, or does anything else touch the folder?
5. **Skip and no-record files move the pointer** to that folder (§7.8 item 3).
6. **Backfill guards:** refuse when `(system_id, capture_datetime)` exists, or when existing daily
   rows cover more than 10% of the file's records in its host window. Capture time = the
   `Event.zip` mtime, at least 24 h old and ≥ 2026-05-01. Are these enough to make a second run, or a
   run after the live job already loaded the folder, harmless?
7. **Not changed on purpose:** lod files are still re-read whole on any size change, and duplicates
   are left to the insight layer (Q5).
