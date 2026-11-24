# PCT-1b design review, round 6

Reviewed authoritative plan §9 at `DEV` commit `a1d77bf`, the Round 6 handoff,
the previous reports, and the revised timing SQL/evidence. **Q45–Q47 are
agreed.** This is a design review; no proposed parser implementation exists.

**Verdict: the three round-5 design findings are addressed. No new P1 finding;
1 P2 finding remains in the reader monitor used by 1b.6.** Correct that monitor
and its evidence before closing the design review. No further parser
architecture change is requested by this round.

Only this report was written. No parser, plan, evidence script, DB, Redis or
production file was changed. No `.env` was read, no DB/Redis query or scanner
connection was made, and no collector was run. Bounded probes used synthetic
times and in-memory completion state. PostgreSQL documentation was consulted
for the catalog checks. Raw device records were not copied.

## Finding

### 1. P2 — `sql/13` can report no violations for a definitely early reader or a missing latest slot

**Plan:** §9.5 lines 1318–1331; Q45; §9.8 1b.6;
`pct1b/sql/13_reader_slot_contract.sql` and `out/26`.

**Failure A, definitely early:** the early flag checks only the host-clock
start. The DB-clock end is checked only against the upper bound. For a
reader whose host is two minutes ahead:

| Timestamp | Value |
|---|---|
| Logged host start | 12:24:01.500 |
| Nearest nominal slot assigned by the SQL | 12:24:00 |
| Actual CT snapshot, DB clock | 12:22:03 |
| `inserted_at`, DB clock | 12:22:15.500 |

The SQL's `early` predicate is false: the logged start is after 12:23:10.
Its `late` predicate is also false: the end is before 12:29. Yet the DB end
is before S's earliest permitted snapshot, 12:23; the CT snapshot necessarily
preceded that end and was too early. A set of otherwise successful runs at
this offset can have one run per inferred slot and zero reported violations.

This is a violation of S that the monitor should detect, not a counterexample
to delivery when S holds. An ingest-time clock sample does not make the SQL
a reliable monitor of earlier or transient reader clock errors.

**Failure B, missing terminal slots:** the expected slot series is generated
from `min(observed slot)` to `max(observed slot)`. At DB time 12:31, suppose
successful records end at the 11:54 slot and the 12:24 run never produces a
record. Its S deadline, 12:29, has passed. The series nevertheless ends at
11:54 and reports zero missing slots. If the reader remains stopped, the
expected series never advances. The same construction omits missing slots
at the beginning of the monitoring period.

**Established:** applied the SQL's nearest-slot formula and exact predicates
to synthetic timestamps. Failure A returned `early = false`, `late = false`
while its DB end proved it too early. A four-run synthetic series ending at
11:54 returned zero missing slots at 12:31. No actual early/missing production
run is asserted, and the saved 672-run dataset was not re-queried.

**Change:** add the DB-clock checks that can establish definite early timing,
including `inserted_at < slot − 60 s`. Treat cross-clock inconsistencies or
an unestablished host-clock bound as uncertain timing rather than proof that
S held. The host-start/end interval remains a proxy for the CT snapshot;
the SQL need not become a per-attempt delivery proof.

Generate expected slots from an explicit DB-clock monitoring interval and
the elapsed S deadline, independently of observed rows. Exclude slots whose
deadline has not elapsed; include missing completed slots at both ends and
the zero-observed-runs case. Fetch sufficient boundary records for that
interval. Keep multiplicity, missing timestamp and actual `ERROR` checks.
Add these fixtures to monitor validation and rerun the corrected read-only
study. This is a targeted monitoring fix; it does not require changing the
alert reader or restoring Q40's machinery.

## Closed findings and answers to the handoff

**S and exactly-one delivery.** The revised slot-relative contract closes the
previous timing-assumption gap. Let the previous slot be N and the next one
N+30 min. For a capture strictly inside `(N+6 min, N+28 min)` and an observed
commit upper bound before `N+28 min 30 s`:

- The previous reader's snapshot is at or before N+5 min, before capture
  and commit.
- The next reader's earliest snapshot is N+29 min, after the commit upper
  bound. Its latest window lower bound is N+5 min, below capture.
- The following reader's earliest window lower bound is N+29 min, above
  capture.

Thus exactly one scheduled query reads the row under S and reader success.
A fresh grid using integer microseconds, independently varying the three
adjacent snapshot times at S's endpoints and nominal times, passed all
216 cases. The delayed-launch counterexample from round 5 is now outside
the explicit reader contract. This is an algebra/model check, not a production
timing guarantee. Reader success remains outside the parser as agreed.

**Q46 and automatic outcomes.** The hard 24-hour horizon and attachment
precondition close the archive-visibility defect. PostgreSQL exposes the
parent/child relationship in
[`pg_inherits`](https://www.postgresql.org/docs/14/catalog-pg-inherits.html)
and the bound in
[`pg_class.relpartbound`](https://www.postgresql.org/docs/14/catalog-pg-class.html).
The capture's partition is therefore checkable from the catalog without a
write probe. The build must compare `$capture::timestamptz` with typed bound
values, not compare date strings or trust the child table's name. In
particular, a non-UTC capture text near midnight can belong to a different
UTC month. Reject an ambiguous/missing bound or pending detachment, and keep
the catalog check valid through the outcome read. Inability to establish the
precondition means UNKNOWN, never an absence-based abort.

**The manual complete-answer rule.** It is sound under the existing barrier,
fencing and no-ID-reuse/no-data-deletion contract, provided “complete” means
the entire expected ID list and every relevant active/archive location were
checked successfully. A permission/query/catalog-discovery failure is
incomplete, not an empty result. Preserve the receipt contradiction checks
and zero-ID special case. `resolve` must perform its own fresh, protected
check, not record an earlier CLI result. Test catalog movement around the
check and the exact 24-hour boundary in the real PostgreSQL rehearsal. These
are implementation checks for the stated conservative rule, not a request
to search archives on the ordinary ingest path.

**Q47 completion.** The separate audit copy closes the missing-state crash
gap. A synthetic crash-prefix model covering audit publication, hash update,
the `complete` marker, payload deletion, state deletion and folder removal
recovered the same completed attempt without another ingest/save. In
particular, a hash written before `complete` cannot suppress recovery:
the system processes pending entries before its unchanged-file optimization,
and `committed` state remains available. A `complete` entry must be inspected
before requiring its input bytes, since deletion may already have occurred.
After the final state unlink, an empty leftover directory can be removed;
it is not a new pending snapshot. The real crash/fsync tests are still needed.

**Other scope.** Q38's one-way provenance, bounded legacy duplication, the
in-transaction save, exact row manifests, unknown-outcome barrier, durable
manual re-stamp intent and collector-locked rollback retain their previous
review dispositions. No additional counterexample was established here.
The expanded 1b.1/1b.2 criteria cover the round-5 fixes; add the monitor
fixtures from the finding above. Keep S as an explicit monitored assumption,
and do not describe `out/26` as direct DB-snapshot measurement.

No write-capable PostgreSQL rehearsal, catalog query, actual filesystem crash,
collector publication exercise, live reader run or proposed implementation
test was performed. Design acceptance will not replace the planned build,
exactness, transaction/filesystem rehearsals, dry run and code review.
