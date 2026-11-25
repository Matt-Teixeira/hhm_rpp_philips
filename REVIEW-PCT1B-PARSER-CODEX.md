# PCT-1b parser implementation review

Reviewed `DEV` through `671b089`, including the working-tree `run.js` and plan
changes, against `REVIEW-PCT1B-PARSER-HANDOFF.md` and authoritative plan §9.
The supplied test command passes: all seven test files passed under the
installed Node 16 runtime. The additional probes below exercise the actual
implementation with synthetic inputs, temporary filesystem state and injected
dependencies; they expose faults outside the supplied passing cases.

**Verdict: do not deploy the current tree. Findings 1–5 must change first:
2 P1 and 3 P2. Findings 6–7 are P3 follow-ups that can wait.** This is an
implementation review; the settled design tradeoffs do not need reopening.

Only this report was added. Existing source/plan changes were left intact.
No `.env` was read, no production DB/Redis or scanner connection was made,
and no production/collector file was written. Probes used disposable `/tmp`
directories and synthetic records. The lock probe stopped only the lock-holder
process it created. No write-capable PostgreSQL rehearsal was run in this
review. PostgreSQL and Linux documentation were consulted for the locking
recommendations.

## Must change before deploy

### 1. P1 — Redis reads precede durable spooling and can lose an observed snapshot

**Location:** [run.js:125](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CT/run.js:125),
also the seen-hash read at line 127 and the outer catch at line 243.

**Failure:** the file has been read into memory, but both Redis reads occur
before `spoolSnapshot`. If Redis GET/connect fails, or JSON decoding throws,
the system exits through the outer catch without preserving the bytes or
attempting DB ingestion. Existing pending entries are also bypassed. A rolling
buffer that is replaced/reset before Redis recovers is lost, despite the
spool-first recovery contract. An unbounded cache connection attempt can
block at the same point while holding the system lock.

**Reproduced:** invoked real `runSystem` with a valid synthetic EAL file,
a GET that rejected, and an injected DB that counted connections. The result
was **0 spool entries, 0 DB connections**, and an error log. The input was
still available only at its live pathname. Replacing that pathname removes
the only copy this run had observed.

**Change:** do not make preservation or pending-work recovery depend on the
cache. Treat bounded cache read/parse failures as a cache miss and continue
spooling/diffing, or durably spool before those reads. Cache errors must not
abort the system before preservation. Add orchestration tests for rejected
GET, unavailable Redis/connect timeout and malformed cached JSON, followed
by replacement of the original; recover the exact observed bytes and rows.

### 2. P1 — Semantic ERROR logging throws and can permanently prevent backlog processing

**Location:** [run.js:62](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CT/run.js:62),
callers at lines 94, 129, 143, 199, 205 and 211;
[log.js:54](/home/matt-teixeira/hep3/hhm_rpp_philips/utils/logger/log.js:54).

**Failure:** the new logging wrapper defaults `err` to NULL. Many ERROR
events describe a condition rather than a caught exception and use that
default. The real logger unconditionally evaluates `err.stack` for ERROR,
so these calls throw `TypeError: Cannot read properties of null (reading
'stack')` instead of recording the intended event.

The capacity path is a persistent processing failure: once the oldest pending
entry exceeds six hours, its ERROR is emitted before the DB connection or
entry loop. It throws every run, so ingestion never drains that backlog even
after the original DB/network problem is fixed. A `late` entry similarly
throws when logging its repair instruction and stops later entry processing.
Bad-input and invalid-zone diagnostics also take exception paths unintentionally.

**Reproduced:** used the **real logger** with a seven-hour-old synthetic
spool entry and no live source file. `runSystem` made **0 DB connections**,
left the entry `spooled`, and logged only the outer TypeError. Repeating the
same conditions repeats the failure. The rehearsal harness's permissive fake
logger does not reproduce this API requirement.

**Change:** make the CT logging adapter compatible with the actual logger,
or safely handle absent error objects in the shared logger. Preserve semantic
ERROR notes and ensure logging does not abort processing of an otherwise
recoverable condition. Test capacity, bad input, invalid zone, contradiction
and `late` using the real logging behavior, including a second run that drains
the backlog. A fake logger that accepts every argument cannot validate these
paths by itself.

### 3. P2 — A completed repair can leave a permanent stateless spool orphan

**Location:** [philips_ct_restamp.js:127](/home/matt-teixeira/hep3/hhm_rpp_philips/tooling/philips_ct_restamp.js:127),
[spool.js:150](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CT/spool.js:150).

**Failure:** `record()` durably changes the entry from `late` to `committed`,
then unlinks `restamp.json`. A crash or unlink failure between those operations
leaves committed state plus the old intent file. The next cron run correctly
enters normal completion, but `removeEntry()` deletes `data` and `state.json`
without handling `restamp.json`. `rmdirSync` then fails with ENOTEMPTY.

The next run finds only `restamp.json`: no state and no input bytes. Orphan
repair cannot rebuild it, `removeIfEmpty` refuses it, and it produces an ERROR
on every run. The repair tool also rejects entries whose state is no longer
`late`. The row UPDATE may be correct, but completion is no longer recoverable
through the advertised workflow.

**Reproduced:** ran actual `record()` with an injected interruption before
intent unlink, then actual `Spool.finish`. State was `committed` before
completion; completion failed with **ENOTEMPTY** and left exactly
`restamp.json`, with no `state.json` or `data`.

**Change:** make acknowledgment/cleanup of an already-applied repair
idempotent. Recognize the operation ID already recorded in state, remove the
resolved intent before final entry deletion, and preserve state until all
required cleanup can finish. Do not blindly discard an unresolved intent.
Test a crash **after** the repaired state write but before intent unlink,
through the subsequent real run/completion path. Also avoid appending the
same repair operation twice when its first result was already recorded.

### 4. P2 — Archive enumeration can race detachment and falsely resolve a commit as aborted

**Location:** [philips_ct_outcome.js:44](/home/matt-teixeira/hep3/hhm_rpp_philips/tooling/philips_ct_outcome.js:44),
through the absence decision at line 58.

**Failure:** the tool enumerates archive relations first, then reads the
active parent. For a long-unresolved committed capture whose partition is
about to be archived, this interleaving is possible:

1. The archive relation is not found during enumeration; the partition is
   still attached under `log`.
2. `fse_dispatch` commits its DETACH/SET SCHEMA transaction.
3. The fresh active-parent SELECT returns no IDs.
4. The receipt has expired; the tool returns `aborted` without querying the
   newly archived relation. `resolve` then permits a new ingest attempt.

The per-system advisory/spool locks do not fence the archive job. The intended
“complete answer” is therefore not established. This is specifically the
archive-aware manual path, not the automatic path's 24-hour case.

**Reproduced:** invoked actual `checkOutcome` with a connection double modeling
that valid SQL interleaving. A known committed ID moved after archive
enumeration; the result was **`aborted`**, with only the active parent listed
as searched. No real partition was moved in this review.

**Change:** stabilize catalog enumeration and row selection against archive
DDL, or detect a changed catalog and retry/return UNKNOWN. For the existing
plain DETACH job, an appropriate parent relation lock acquired before
enumeration and retained through the read can provide the needed exclusion;
preserve the fresh post-advisory-barrier snapshot semantics. See PostgreSQL's
[partition maintenance](https://www.postgresql.org/docs/14/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-MAINTENANCE)
and [table lock modes](https://www.postgresql.org/docs/14/explicit-locking.html#LOCKING-TABLES).
Add a two-connection rehearsal that moves the partition between enumeration
and row selection. The answer must be committed or UNKNOWN, never aborted.

### 5. P2 — The child-held flock can disappear while the parent continues unfenced

**Location:** [spool.js:270](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CT/spool.js:270),
and the same pattern in
[philips_ct_rollback.js:34](/home/matt-teixeira/hep3/hhm_rpp_philips/tooling/philips_ct_rollback.js:34).

**Failure:** after the `locked` acknowledgment, the parent gets only a
release handle. Unexpected exit of the `cat`/`flock` holder is ignored because
the exit handler acts only while `settled` is false. The lock is released,
but the parent continues DB/filesystem work and another worker can acquire
the same system lock. This invalidates single-owner spool state and repair
assumptions. In the rollback helper it can also invalidate exclusion of
collector publication during preservation and offset changes.

**Reproduced:** acquired the real system lock in a disposable directory,
stopped only that probe's `cat` holder, and acquired the same lock again from
the still-running parent. The first handle reported no loss and did not
prevent further work. This is different from the tested parent-death case,
where closing stdin does correctly release the lock.

**Change:** retain the lock's lifetime in the parent, or fail closed when the
holder disappears and stop guarded operations. On Linux, a parent-owned open
file description shared with a locking helper can retain a flock after helper
exit; see [flock descriptor lifetime](https://man7.org/linux/man-pages/man2/flock.2.html).
Use the same lifetime guarantee for both helpers. Test unexpected holder
exit while the parent is alive: either a second acquisition must remain
blocked, or the first worker must stop before it can continue protected work.

## Follow-ups that can wait

### 6. P3 — Unknown-commit recovery retains bad bytes without their recorded reasons

**Location:** [ingest.js:172](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CT/ingest.js:172),
[run.js:208](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CT/run.js:208),
and `Spool.finish`'s `bad_reasons || []`.

The pre-COMMIT state contains the bad-line count but not reasons. Reasons are
added only after a normally acknowledged commit. If COMMIT is uncertain and
later resolved, completion retains the bytes with an empty reason list. A
probe through actual `attempt()` and `finish()` produced one prepared bad
record and `bad_lines = 1`, but **0 retained reasons** after modeled successful
outcome recovery. Persist reasons before COMMIT, or rebuild them from the
retained bytes during recovery. This can wait because the exact bytes remain
available and the diagnoses can be reconstructed.

### 7. P3 — Replay reports full success for input that is still rejected

**Location:** [run.js:350](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CT/run.js:350).

Replay equates disappearance of matching spool entries with successful replay.
An unchanged bad-header file can instead be retained again, have its spool
entry removed, and be logged/moved as `fully replayed` although no rows were
accepted. A probe through real replay/orchestration, with the logger isolated
from finding 2, moved a still-invalid source into `replayed/`, reported full
success, and created another retained copy with a format-change error.
Check the ingest/retention result before claiming full replay; preserve a
clear unresolved status. This is deferrable because the bytes remain retained
and the bad-input ERROR is also emitted once finding 2 is fixed.

## Validation and disposition

- Ran `node --test jobs/Philips/CT/__tests__/ tooling/__tests__/`: all seven
  test files passed. The failing probes above did not change repository tests
  or implementation files.
- The large-copy exactness, production-shaped counts and PostgreSQL scenarios
  in the handoff are useful evidence for the paths they exercised. They were
  not rerun here. The real-logger incompatibility is specifically hidden by
  the rehearsal harness's injected logger; archive enumeration races and the
  repair acknowledgment/cleanup boundary need additional integration cases.
- `no_eal_rows` is a reasonable scoped deviation with today's CT models:
  those attempts add no alertable EAL row set to deliver. Holding unknown
  outcomes per file also preserves the independent per-kind transaction model.
  The hashtext advisory namespace can serialize unrelated collisions without
  changing identities. The dev CSV switch requires both flags as documented.
- No new Rule P/Q38 suppression counterexample was established in this code
  review. Existing provenance validation and exact matching retain their
  design-review disposition. Orphan repair is consistent with the process-crash
  protocol while the fencing and durable-state assumptions hold.
- The shared `keepAlive: true` change is small and consistent with the direct
  connection protocol; no additional issue was found in that change. Dry-run
  dispatch uses the guarded path; no production dry run was executed here.
- Before deployment, fix findings 1–5 and validate them through the real
  orchestration/logger and operator recovery paths. This need not become
  another design-review cycle. Preserve the exactness/count checks for any
  affected ingestion code and add the targeted fault regressions above.
