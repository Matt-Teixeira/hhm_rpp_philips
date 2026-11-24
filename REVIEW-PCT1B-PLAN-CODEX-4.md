# PCT-1b design review, round 4

Reviewed authoritative plan §9 at `DEV` commit `8e95ed3`, the Round 4 handoff,
the previous reports, the new evidence, and the relevant existing parser,
cleanup and alert-reader code. **Q38–Q40 are agreed.** This remains a design
review; no proposed parser implementation exists.

**Verdict: no new P1 finding; 4 P2 findings remain to resolve before building.**
Q38 fixes the new-row suppression counterexample. The fenced ingest attempt,
in-transaction receipt and pre-COMMIT row manifest address the previous
transaction-identity problem within their recovery lifetime. The remaining
issues concern that lifetime, crash recovery of re-stamps, and false-positive
coverage proofs.

Only this report was written. No parser, plan, DB, Redis or production file
was changed. No `.env` was read, no DB/Redis query or scanner connection was
made, and no collector was run. Bounded probes used synthetic state/times and
existing projection helpers and logger constants. Raw device data stayed in
the evidence directory. PostgreSQL documentation was consulted for lock and
timeout semantics.

## Findings

### 1. P2 — An expired receipt can make a committed attempt look aborted

**Plan:** §9.5 lines 1240–1252; Q39; commit-reconciliation tests.

**Failure:** an attempt commits its EAL rows and receipt, but the process dies
before recording `committed`; its durable state remains `committing`. Recovery
is delayed beyond 48 hours. The existing cleanup path deletes the receipt:

```sql
DELETE FROM log.saved_files
WHERE capture_datetime < NOW() - INTERVAL '48 hours';
```

Recovery obtains the advisory-lock barrier, finds no receipt, and declares
the attempt aborted. Its recorded row IDs can still exist in the log table,
but the specified absent-receipt branch does not check them. A replacement
attempt diffs those rows, inserts zero, and journals no EAL IDs for them.
If the original rows missed their reader window, their coverage obligation
has disappeared from the recovery path. The spool still permits manual
recovery, but automatic classification is wrong.

**Established:** inspected `jobs/aux_jobs/clear_old_db_files.js:5` and its
`delete_old_files` entry point in root `index.js`. A synthetic state trace
with a committed row manifest, expired receipt and successful barrier takes
the plan's aborted branch and subsequently inserts zero rows. No cleanup was
run, and this review did not verify its live cron schedule. The design must
nevertheless account for this existing deletion path rather than assume
receipts persist for every possible recovery delay.

**Change:** protect unresolved receipts from cleanup, or define a recovery
protocol that does not infer rollback from an expired/missing receipt.
Preserve the original attempt and its row/coverage identity when its outcome
cannot be established. The recorded row manifest is useful evidence; inspect
it and stop on contradictions instead of acknowledging a fresh zero-row
attempt as a substitute. Specify receipt retention and the maximum recovery
horizon, including other applications that can clean this shared table.
Rehearse recovery after receipt expiry/deletion with both zero-row and
nonzero-row attempts.

### 2. P2 — Re-stamps lack the durable intent and outcome protocol used for ingestion

**Plan:** §9.5 lines 1272–1282 and 1314–1325; Q40; re-stamp rehearsals.

**Failure:** the spool is already deleted and the journal contains an open
obligation for EAL IDs at capture C. A re-stamp transaction updates those IDs
from C to C2 and commits. The process dies before appending the journal event
`C → C2`. On restart, the durable journal still says C. The specified retry
`WHERE id = ANY($ids) AND capture_datetime = C` updates zero rows and fails its
row-count assertion. C2 and its commit bound were never durably recorded.

If that re-stamp committed after its reader snapshot, no query need ever
evaluate the rows. For example, a re-stamp captured at 13:18 commits at
13:24:30, after the 13:24 snapshot. The 13:54 query excludes capture 13:18.
Restarting from the old journal cannot automatically re-stamp those rows
again. A lost COMMIT acknowledgment creates the same uncertainty. The ingest
receipt does not certify this later UPDATE.

**Established:** modeled an already committed row at C2 with the journal still
at C; the prescribed retry affects 0 of 1 expected IDs. The plan specifies
pre-COMMIT durable state and outcome recovery for **ingest** attempts, but
only a post-operation coverage event for re-stamps. No DB UPDATE or process
kill was performed.

**Change:** give each re-stamp a durable operation identity and write intent
before COMMIT: exact IDs, old/new capture text, generation and timing data.
After the advisory-lock barrier, reconcile whether those identified rows
remain at C or moved to the intended C2; do not lose C2 when the response or
journal append is lost. Record a conservative commit upper bound and keep
coverage open until the outcome is durable. Specify how retries count toward
the three-re-stamp limit: discovering that the same operation committed must
not count as executing another re-stamp. Test every crash boundary around
UPDATE, COMMIT and journal acknowledgment, including a month boundary and a
reader overlapping the UPDATE.

### 3. P2 — The error filter misses stored error labels and row-evaluation failures

**Plan:** §9.5 lines 1262–1267 and 1289–1294; `sql/11`, `out/24`; coverage
proof fixtures.

**Failure in the evidence:** both failure flags in `11_alert_reader_slots.sql`
compare `w->>'type' = 'E'`. The reader's `utils/logger/enums.js` defines
`E: 'ERROR'`; the logger stores that value unchanged. A real boot or detection
insert error therefore does not set either flag. The published zero-error
counts cannot establish that all 672 runs succeeded.

**Failure in the proposed proof:** even after correcting the label, excluding
only `onBoot` and `insertAlertDetections` errors is insufficient to certify
row evaluation. `test-row-for-log-alert.js:176–182` catches an evaluation
exception, logs `ERROR` with `func = 'testRowForLogAlert'`, marks the row
untested, and returns. The outer run can finish and save its log without either
of the two excluded errors. The proof can mark an affected attempt PROVED
and close it although its rows were not successfully evaluated.

**Established:** loaded the actual logger constants without loading the app
or DB pool, then applied the evidence predicates to synthetic error entries.
All three functions escaped the literal `E` filter; the row tester also
escaped a corrected two-function `ERROR` filter. Inspected the actual reader
catch path. This establishes the filter defect, not that production suffered
one of these errors; no fresh run-log query was made.

**Change:** use the actual stored label `ERROR` in evidence and runtime
coverage queries and rerun the timing/error study. Include CT evaluation
failures in the success criterion. A conservative rule can leave the whole
attempt UNPROVED when a relevant row-test error cannot be attributed more
precisely. Build fixtures from the real logger's shape and constants; assert
that a timing-valid run with each of these failures cannot close coverage.
Keep absence of an alert separate from successful evaluation of the row.

### 4. P2 — A current clock sample does not bound a historical reader timestamp

**Plan:** §9.5 lines 1262–1271; Q40; clock uncertainty fixtures.

**Failure:** the proof uses a reader's historical app-clock start but obtains
ε from a host/DB round trip at the current run's start. No bound on offset
changes between those events is specified. Consider these DB times:

| Event | Value |
|---|---|
| Attempt capture | 12:18:00 |
| Attempt commit upper bound `t1` | 12:23:10 |
| Reader actually starts | 12:22:58 |
| Its logged start, host clock 65 s ahead | 12:24:03 |
| Reader CT snapshot | 12:23:00 |
| Reader end, DB `inserted_at` | 12:24:20 |
| Later proof-run clock sample, after correction | offset 40 ms; ε about 1.04 s |

The reader did not see the commit. Nevertheless logged start − ε > `t1`,
and end + ε < capture + 30 min, so the proposed rule certifies coverage.
The next reader's window excludes the original capture. The over-5-second
guard does not fire because the sampled offset is now small. Small samples
before and after a reader also do not exclude an intervening clock step.

**Established:** reproduced the proof inequalities with synthetic times and
a historical offset excursion. This is not a claim that this host actually
stepped its clock. The point is that the stated proof lacks a bound relating
its sampled offset to the timestamp it certifies.

**Change:** define ε as a valid absolute error bound for the particular
reader run, including sampling uncertainty and permitted drift/steps across
the relevant interval. Preserve the calibration evidence or state and enforce
the clock-stability assumption needed to extend a sample to that interval.
When that bound cannot be established, leave coverage UNPROVED and use the
agreed recovery path. Distinguish an observed current offset from a guarantee
about historical timestamps. Add offset excursions, clock corrections,
signed offsets and samples outside the reader interval to the proof tests.

## Required additions and operational checks

1. **Receipt lifecycle:** cleanup/expiry before outcome recovery, unrelated
   receipts, zero inserted IDs and nonzero IDs. An absent receipt with surviving
   manifest rows must not be silently classified as an ordinary abort.
2. **Re-stamp recovery:** durable intent, loss of the response, commit before
   journal event, repeated restart, partition move, overlapping reader and
   correct attempt-limit accounting. The existing ingest COMMIT tests do not
   cover the UPDATE's outcome protocol.
3. **Reader proof:** actual `ERROR` labels and row-tester failures; rerun the
   saved SQL using the correct labels. Validate historical clock uncertainty,
   not just the current offset-over-5-seconds branch.
4. **Journal integrity:** two system workers append to the same monthly file;
   short/partial append, ENOSPC, crash and restart; duplicate append after an
   acknowledgment gap. Assert that every acknowledged record is recoverable
   and every attempt/event is applied once. Per-system flock does not serialize
   the shared journal. Define framing/append serialization and repair of an
   incomplete record before allowing a later record to be acknowledged.
5. **Barrier liveness:** a backend still in COMMIT, and a backend idle in its
   open transaction. `lock_timeout = 10 min` bounds one lock wait; it does not
   end the original backend or bound total time UNKNOWN. Repeated timeouts may
   therefore continue indefinitely. Define backend diagnostics, an idle-session
   limit or an explicit operator recovery route, and keep new source snapshots
   spooling while an old outcome remains unresolved. The generic 6-hour backlog
   WARN is longer than the measured 3.5-hour minimum source lifetime.
   PostgreSQL documents [transaction advisory-lock lifetime](https://www.postgresql.org/docs/14/explicit-locking.html#ADVISORY-LOCKS)
   and the separate [idle-in-transaction timeout](https://www.postgresql.org/docs/14/runtime-config-client.html#GUC-IDLE-IN-TRANSACTION-SESSION-TIMEOUT).
6. **Barrier snapshot:** use a fresh receipt SELECT after lock acquisition,
   under Read Committed. Do not combine a blocking lock call and receipt read
   in one statement with a pre-wait snapshot or retain a pre-wait Repeatable
   Read snapshot. Test the actual recovery SQL against the original transaction
   finishing during the wait. See [PostgreSQL snapshot rules](https://www.postgresql.org/docs/14/transaction-iso.html#XACT-READ-COMMITTED).

## Checks that passed and limits

- **Q38:** reran the round-3 new-only A/B counterexample with the revised
  classification. Both orders, with repeats, preserve both canonical rows.
  Validation to new-form or NULL establishes the needed one-way invariant.
  Ingest and replay must share that builder; re-stamps change only capture
  time. The accepted duplicate for a malformed legacy time capture is an
  explicit policy now, not a remaining objection from round 3.
- **Receipt identity within its lifetime:** a plain receipt INSERT in the
  same transaction, a durable pre-COMMIT ID manifest and the system spool
  fence are a sound design direction. A pre-existing conflicting receipt
  makes that INSERT fail before the attempt can become `committing`; it
  should never be handled with `ON CONFLICT DO NOTHING`. Waiting for the
  original transaction's advisory lock before a fresh receipt read addresses
  the previous still-running-COMMIT counterexample. Receipt deletion is the
  separate remaining problem in finding 1.
- **Coverage inequality:** if ε really bounds the reader clock error and
  successful evaluation/persistence is established, start − ε > `t1` and
  end + ε < `c` + 30 min conservatively bracket the CT snapshot. The CT read
  being one member of `Promise.all` does not invalidate that argument: it
  occurs after boot logging and before successful closing actions. Missing
  evidence should yield UNPROVED. The strict six-minute phase also fixes the
  previous equality counterexample.
- **Coverage after cleanup:** the journal explicitly owns obligations after
  spool deletion, and a failed journal append leaves committed input pending.
  This closes the prior completion-predicate omission for ingest attempts.
  Re-stamp crash recovery and journal publication must meet the same standard.
- **Three-re-stamp cap:** stopping automation with an ERROR is an agreed
  limit. The obligation must remain open for operator repair, and the journal
  must distinguish that state from PROVED. It is a bounded recovery policy,
  not an unconditional eventual-evaluation guarantee.
- No write-capable PostgreSQL rehearsal, cleanup, collector exercise, actual
  clock change, live alert run or proposed implementation test was performed.
  The saved 672-slot timing statistics were inspected, not freshly measured;
  their zero-error interpretation requires correction. The rollback matrix,
  real receipt/row transaction, filesystem recovery and partition-moving
  re-stamp still require the planned integration rehearsals.
