# PCT-1b design review, round 5

Reviewed authoritative plan §9 at `DEV` commit `7030109`, the Round 5 handoff,
the previous reports, the corrected reader evidence, and the relevant reader,
cleanup and partition-archive code. **Q41–Q44 are agreed.** No proposed parser
implementation exists.

**Verdict: 0 new P1 findings; 3 P2 findings to resolve before building.** The
narrowing in Q41 is acceptable for PCT-1b: the parser can deliver rows into a
reader window while reader success remains the alert processor's monitored
contract. The remaining issues are the precise timing assumptions, recovery
after partition archival, and a crash gap in moving completion state.

Only this report was written. No parser, plan, DB, Redis or production file
was changed. No `.env` was read, no DB/Redis query or scanner connection was
made, and no collector was run. Bounded probes used synthetic times and
in-memory state; no raw device records were copied. PostgreSQL documentation
was consulted for partition-detach semantics.

## Findings

### 1. P2 — Exactly-one delivery needs a nominal-slot bound, not just a bound from process start

**Plan:** §9.5 lines 1291–1311; Q41; simulated reader tests in 1b.2.

**Failure:** D now bounds the CT snapshot to four minutes after the reader's
start. That does not bound delay from the nominal cron slot to that start.
For example, with identical host and DB clocks throughout:

| Event | DB time |
|---|---|
| Previous nominal reader slot N | 11:54:00 |
| That slot's reader invocation actually starts | 11:56:31 |
| Writer clock sample | 12:00:29 |
| Capture c | 12:00:30 |
| Commit / observed `t1` | 12:00:30.100 / 12:00:30.200 |
| Previous slot's CT snapshot | 12:00:31 |
| Next nominal slot | 12:24:00 |
| Next reader starts / takes CT snapshot | 12:24:01 / 12:24:02 |

The phase and commit classification pass. The sample offset and subsequent
movement are both zero, and the next start is less than 24 minutes after the
sample, so K holds. Both CT snapshots are within four minutes of their own
reader start, so D as written holds. Both readers succeed and both read the
row. The proof's assertion that the previous snapshot was at or before N+5
minutes does not follow from these assumptions.

This is a specification counterexample involving a delayed invocation, not
an assertion that a production cron run was delayed. If “start” was intended
to mean the nominal scheduling event rather than application/process start,
that stronger interpretation must be explicit. The measured start timestamp
is the first application log entry, after module loading and `makeAppRunLog`,
and does not by itself bound all launch/bootstrap delay.

There is a related horizon issue: K is stated from the writer's sample to the
next reader's start. The exactly-one proof also uses bounds for the previous
and following readers. It needs those adjacent-slot bounds too, not only a
clock bound ending at the intended next reader.

**Established:** reproduced the table's inequalities against the actual
30-minute predicate. The synthetic invocation satisfies K's stated sampling
horizon and D's process-relative duration and yields two reads. Inspected
reader `index.js` startup ordering. No actual launcher delay was induced or
live crontab inspected.

**Change:** define the required CT snapshot interval relative to each nominal
slot, including scheduler, wrapper, bootstrap and connection-queue delay, and
the relevant clock error. For example, the existing proof works if each
adjacent successful scheduled query has DB snapshot time in
`[slot − 60 s, slot + 5 min]`. Then the strict phase and `t1 < N_next − 90 s`
give exactly one read. State how K/D imply that interval for all three slots,
or make the interval the reader timing assumption and monitor violations.
Classify a delayed start outside that contract alongside a missed/failed
reader; no per-attempt success proof or automatic re-stamp is required.
Extend the tests beyond queries launched at the nominal slot with fixed clock
offsets: include invocation/bootstrap delays and independently varied adjacent
reader timing.

### 2. P2 — A detached archive partition makes committed IDs disappear from the recovery query

**Plan:** §9.5 lines 1254–1277; §9.2 archive inventory; Q42; receipt lifecycle
tests.

**Failure:** an attempt commits and its state remains `committing` after a
crash. Recovery is delayed long enough for its capture month's partition to
be detached into `archive_log`; the receipt has also expired. The IDs are
still present in the archived table, but a query of
`log.philips_ct_eal_events` at their capture time returns none. The written
rule declares the transaction aborted and permits a fresh attempt.

“Nothing deletes from this table” is not enough to establish visibility from
the partitioned parent. The existing archive operation is not a DELETE:
`fse_dispatch/utils/db/sql/odd-jobs/archive-partitions.sql` selects the month
six months earlier, includes `philips_ct_eal_events`, then executes
`DETACH PARTITION` and `SET SCHEMA archive_log`. This is the same active/archive
distinction already recognized by §9.3 and the saved legacy-row query.

This requires a long recovery delay under the current archive policy; it is
not a normal 24-hour recovery case. The 24-hour ERROR is currently a diagnostic,
not an explicit prohibition on later automatic absence-based classification.

**Established:** inspected the actual `fse_dispatch` SQL, lines 3–5, 20–23
and 43–51, and the saved query that reads archived CT partitions separately.
An in-memory trace moving two committed IDs from the active relation to an
archive relation leaves 0 active matches and 2 archived matches, taking the
plan's aborted branch. No DDL or DB query ran. PostgreSQL documents that
[detaching a partition makes it a standalone table](https://www.postgresql.org/docs/14/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE).

**Change:** before treating absence as rollback, establish that the capture
partition is still part of the relation being searched, or inspect the
corresponding archived relation. A smaller alternative is a hard automatic
reconciliation horizon: beyond it, preserve UNKNOWN and require an
archive-aware manual check. An ERROR alone must not precede a later automatic
“aborted” decision based on incomplete selection. Rehearse a committed
manifest after receipt deletion and partition detachment, plus an actual abort
at the same age. This does not require historical backfill or broadening the
normal ingestion candidate query to archives.

### 3. P2 — Renaming the audit state removes the restart state before spool deletion

**Plan:** §9.5 lines 1360–1371; completion crash tests in 1b.1.

**Failure:** completion sets the done-hash and renames the entry's `state.json`
into `done/philips_ct/<SME>/<yyyy-mm>/`. The process then dies before deleting
the spool entry. On restart, the spool input remains but its `state.json` is
gone. The plan says recovery finishes these steps from `state.json`, without
a new attempt, while also saying the moved audit file is never read to decide
anything. Those requirements cannot all hold for this crash point.

Re-ingesting the orphaned bytes may preserve DB idempotence, but it is not the
promised completion recovery and loses the entry's local attempt/classification
record. Treating missing state as a generic corrupt entry instead leaves a
permanent pending/error artifact. The safe action cannot depend solely on an
arbitrary missing manifest being evidence of successful completion.

**Established:** modeled the literal rename followed by a crash: input is
present, spool state is absent, and the only complete state is in the audit
location that recovery is forbidden to consult. No filesystem mutation was
performed. This is a gap in the specified transition, not an observed
implementation failure.

**Change:** preserve recovery state until the entire spool entry can be
removed. For example, publish a separate durable audit copy while retaining
the committed state in the entry, then remove the entry; publish the audit
copy idempotently by attempt ID. Alternatively define a durable completion
marker/pointer and permit recovery to follow it. Keep the existing test for a
crash between every completion step, but assert the original attempt ID and
classification survive, no new attempt/archive insert occurs, and the orphaned
spool is eventually removed. Test the rename boundary specifically rather
than only a failure before writing an audit record.

## Answers to the handoff and build checks

- **Q41's narrowing:** acceptable as agreed. PCT-1b need not certify successful
  evaluation or detection persistence for each attempt. The corrected
  `type = 'ERROR'` monitoring, including row-tester errors, is the appropriate
  scoped check here. A separate reader-checkpoint change remains the exact
  solution to failed/missed windows; it is not a prerequisite added by this
  review. DELIVERED must remain conditional on the stated reader timing and
  success contract, with finding 1's nominal-slot clarification.
- **Timing algebra:** under the stronger slot-relative interval above, the
  previous snapshot is before c, the intended next snapshot is after `t1`
  while c is still fresh, and the following snapshot's lower bound is above c.
  A 216-case boundary grid over captures, commits and adjacent snapshot
  endpoints had zero failures under that interval. This supports the algebra;
  it does not establish that production satisfies the timing assumption.
- **Q42 within the searchable horizon:** a complete durable manifest of
  non-reused inserted IDs, exact capture text, fresh post-barrier selection
  and atomic transactions distinguishes commit from abort. Do not infer the
  outcome from sequence advancement: sequences can consume IDs on rollback.
  All/some/none must refer to all expected IDs, not just the rows returned by
  the SELECT. Detachment is the remaining selection-completeness issue.
- **Zero inserted IDs:** re-diffing and re-saving after an absent/expired
  receipt is safe for row ingestion under the accepted candidate/archive
  policy. Handle zero before vacuous “all IDs present” logic. Preserve the
  plain receipt INSERT and the contradiction checks.
- **Q43:** the explicit idle timeout, keepalives, backend diagnostics and
  unresolved-age thresholds address the prior unspecified operational path.
  An active backend still finishing COMMIT remains UNKNOWN, as agreed; test
  that new snapshots continue to spool independently of that wait. A pid is
  diagnostic, not sufficient authority to terminate a later reused pid.
- **Q44:** the durable old/new capture intent, expected-ID count, same lock
  barrier and exact old/new reads address the prior re-stamp crash gap. Keep
  the operation ID across reconciliation; do not overwrite unresolved intent.
  Rehearse both a committed repair and an aborted repair, missing/mixed IDs,
  partition moves, and a reader overlapping the UPDATE. Also test a repair
  that itself commits `late`, followed by another explicit repair: the second
  operation must use the first operation's new capture as its old capture.
  No new defect was established in that intent/outcome approach.
- **Corrected reader evidence:** `sql/12`, `out/25` use the actual stored
  `ERROR` label and report 0 such entries across 672 runs. This resolves the
  previous bad-filter evidence gap for that sample; it was inspected, not
  re-queried here.
- **Minor text cleanup:** §9.4 still says rollback rows are “old-form or
  ambiguous” and all match rule P; use Q38's current exact/projection policy
  and its accepted legacy duplicate. The parenthetical at line 1394 should
  also distinguish the 1-hour WARN from the 6-hour ERROR: 6 hours is not below
  the measured 3.5-hour source lifetime. These do not require changing the
  agreed thresholds.

The required test additions are therefore: nominal-slot startup/queue delay
and adjacent-reader bounds; archived-ID reconciliation or an enforced recovery
horizon; and crash recovery after the audit-state rename. No write-capable
PostgreSQL rehearsal, live reader execution, collector publication exercise,
actual archive operation, or proposed implementation test was performed.
