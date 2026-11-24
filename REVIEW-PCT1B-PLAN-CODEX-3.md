# PCT-1b design review, round 3

Reviewed authoritative plan §9 at `DEV` commit `f4da136`, the updated handoff,
both previous reports, the new evidence, and the relevant existing parser,
collector and alert-reader code. **Q27–Q33 and Q34–Q37 are agreed.** This is
still a design review; there is no proposed parser implementation.

**Verdict: revise before building. There are 2 P1 and 4 P2 findings.** The
spool and locked rollback materially improve recovery. Remaining blockers are
silent suppression of a revision in a wholly new-parser history and an
uncertain-commit test that does not establish which transaction committed.
The coverage phase also has a strict-boundary error, and its recovery and
audit need a durable completion contract.

Only this report was written. No parser, plan, DB, Redis or production file
was changed. No `.env` was read, no DB/Redis query or scanner connection was
made, and no collector was run. Probes used synthetic inputs, the existing
projection helpers and installed timestamp parser; raw device data stayed in
the evidence directory. Child probes were bounded. PostgreSQL and
node-postgres documentation were consulted for the relevant semantics.

## Findings

### 1. P1 — Ambiguous matching suppresses a revision even when both rows are new

**Plan:** §9.3 lines 1045–1064; §9.5 lines 1264–1266; Q37; transition tests.

**Failure:** start with an empty DB. Two successive EAL snapshots have the
same valid key and identical other source fields:

| Snapshot | Source `Info` | Source `EalTime` |
|---|---|---|
| A | `alpha"` | NULL |
| B | `alpha","beta` | `2026-11-01 12:00:00` |

The new parser stores A exactly, with NULL `eal_time`. B's canonical new row
differs in both `info` and `eal_time`, so Q6 requires keeping B. However, the
old-pipeline projection of B is `info = alpha"`, `eal_time = NULL`, with every
other column equal to stored A. Q37 treats A as ambiguous and allows that
projection to suppress B. No old parser has run and no information was lost
when A was stored.

Order matters. Processing A → B → A → B stores **only A**. Processing
B → A → B → A stores **both B and A**. Oldest-first processing follows the
first order when A actually precedes B; it does not cure this loss. A replay
of B continues to match A and inserts nothing.

**Established:** reproduced with `plainRecord()` and `projectEal()` from the
existing evidence script, the actual old regex/helpers, the plan's three
classification rules and an in-memory matcher. B's projection equals A on
all 13 EAL content columns. Each file has one key, so greedy matching and
duplicate source keys are not involved.

**Change:** distinguish the stated legacy-loss ambiguity from suppression of
a known, canonical new revision. NULL time text cannot provide that origin
distinction. Preserve reliable origin information for new NULL-time rows, or
use a conservative ambiguous-row policy that preserves the different canonical
content, accepting legacy duplicates where necessary. If Q37 is intentionally
kept unchanged, explicitly agree this additional exception to Q6 and remove
the claim that any replay order keeps all revisions. The accepted limitation
about information destroyed by an old pipeline does not describe this
new-parser-only example. Add both orders and assert the actual stored contents.

### 2. P1 — Existence at a capture time is not proof that this transaction committed

**Plan:** §9.5 lines 1202–1203 and 1238–1248; Q36; uncertain-commit rehearsal.

**Failure, false positive:** an unrelated transaction of system S has stored
rows with capture time C. A second transaction of S, also assigned C, fails
without committing its different rows. The proposed check sees rows at
`(S, C)` and treats the second transaction as committed-uncertain. The
subsequent EAL re-stamp updates the unrelated transaction's rows. The failed
snapshot can then be saved/completed without its missing rows being inserted.

Nothing makes `(system_id, capture_datetime)` a transaction identifier. The
saved catalog shows a primary key on `(id, capture_datetime)`, not a unique
transaction capture time. The two kinds have different advisory locks, and
the existence test does not even specify kind. The installed node-postgres
timestamp parser also maps both of these DB times to the same JavaScript Date:

```text
2026-11-24 12:18:00.123001+00
2026-11-24 12:18:00.123999+00
                     -> 2026-11-24T12:18:00.123Z
```

Preserving microseconds avoids that particular collision but still does not
establish uniqueness of a wall-clock value.

**Failure, false negative:** a lost-response connection's backend may still
be executing COMMIT. A SELECT on a new connection sees no uncommitted rows;
absence does not establish rollback. If the original later commits after its
reader snapshot, a subsequent normal diff inserts zero rows under a new
capture time. That does not re-stamp the original rows or establish their
coverage. The old attempt must remain unresolved until its outcome is settled.

**Established:** reproduced the timestamp collision with the installed
`pg.types` parser and modeled the literal existence/update predicates against
two transaction identities. The still-running-commit case follows PostgreSQL
snapshot visibility; it was not induced on a DB. See
[node-postgres date precision](https://node-postgres.com/features/types#date--timestamp--timestamptz)
and [PostgreSQL Read Committed visibility](https://www.postgresql.org/docs/14/transaction-iso.html#XACT-READ-COMMITTED).

**Change:** give each attempt a durable identity and exact expected row set.
For example, persist inserted row IDs/counts before COMMIT, or write a receipt
keyed by a durable attempt ID in the same DB transaction. Reconcile an
uncertain attempt only after a barrier establishes that its original
transaction has ended; the same system/kind advisory lock can provide such a
barrier if used correctly. Keep an unresolved outcome pending. Re-stamp the
identified rows, preserving their identity across partition moves, rather
than every EAL row at an unreserved timestamp. Serialize/fence ownership of
the spool entry through reconciliation and completion: atomic file replacement
alone does not stop two workers from replacing each other's attempt state.

Test another transaction at C, both kinds, timestamp precision round-trips,
a check while the original COMMIT is still running, and committed-but-no-ack
versus aborted outcomes. Killing a backend during COMMIT is not by itself
evidence that the committed-but-no-ack branch was exercised.

### 3. P2 — An old EAL row can have new-form time text

**Plan:** §9.3 lines 1050–1058; Q37; provenance tests in 1b.1.

**Failure:** a valid source EAL row has `File = 'f,part'`,
`Info = '2026-11-01 12:00:00'`, `Line = 4`, `Param1 = 5`, `Param2 = 6`, and
a normal source EalTime. Plain export quotes the comma-containing File field,
but the old regex splits it at the comma. The actual old match includes:

```text
file     = "f
line     = part"
param_1  = 4
param_2  = 5
info     = 6
eal_time = 2026-11-01 12:00:00
```

The target content columns are text (§1.4), so the malformed-looking `line`
does not prevent that old row from being stored. Its host key remains valid.
The revised classifier calls it a new-parser row and allows only exact new
matching. The canonical new source row differs, so an unchanged source row
is inserted again even though its projection reproduces the legacy row.

**Established:** reproduced with the evidence script's plain-record builder
and actual `projectEal()` regex/helpers. The returned `eal_time` matches the
new-form pattern. No source date formatting changed: the regex captured Info
in place of the source EalTime. This is synthetic, not a row observed in the
five copies.

**Change:** stop treating a new-looking time as an unconditional origin proof
for EAL. Its old time group is unconstrained, and earlier comma fields can
shift the capture to arbitrary text. Specify conservative handling or reliable
provenance for this case as well as NULL. If duplication is deliberately
accepted for such legacy shapes, bound and document that exception instead
of asserting the classifier establishes origin. Add comma-containing File
and ErrNum, with date-looking text in later fields, to the whole-pipeline
provenance tests, including rollback-generated rows.

### 4. P2 — The closed phase boundary fails the strict reader predicate under D

**Plan:** §9.5 lines 1218–1232; Q36; phase tests.

**Failure:** take the permitted endpoints exactly:

```text
previous nominal reader N       12:24:00
capture c                       12:29:00 = N + 5 min
commit t                        12:30:00
next nominal reader N_next      12:54:00
next reader snapshot s          12:59:00 = N_next + 5 min
```

D holds and the left-closed phase admits c. The earlier reader's snapshot is
at or before c, before the commit. The next reader requires
`capture_datetime > 12:29:00`, excluding the row. Every later reader excludes
it too. The commit is on time, so late-commit recovery is not triggered.

**Established:** reproduced the inequalities using synthetic timestamps.
Under D the worst next-query lower bound is `N + 5 min`; the required
inequality is strict. The same boundary applies to re-stamps and pending
replays, not just first ingestion.

**Change:** use a strictly later lower phase bound, preferably with an explicit
precision margin, and check the capture time actually assigned to the rows.
Derive the interval from the strict predicate, including equality and
serialization precision. Test exactly N+5, just before/after it, and reader
snapshots at both D endpoints for ingest and re-stamp.

### 5. P2 — Spool completion can discard outstanding coverage work and its audit record

**Plan:** §9.5 lines 1238–1252 and 1260–1272; Q34/Q36; spool state machine.

**Failure:** an EAL commit is late and its entry becomes `restamp_due`.
The save succeeds. The stated completion predicate requires only committed,
saved and, if applicable, retained; those conditions now hold. It permits
setting the done-hash and deleting the spool entry before the next in-phase
run can re-stamp the rows. An unchanged live file is then skipped with nothing
pending. The specification never makes coverage resolution a prerequisite
for completion.

There is also no specified durable audit record after completion. The only
defined per-attempt capture/commit record is `state.json`, deleted with the
spool. `log.saved_files` archives input bytes, not the actual inserted row
set, commit outcome or re-stamp history. The daily audit nevertheless needs
those records for completed entries if D is later found to have failed.
An already committed entry whose save failed must not overwrite its original
attempt identity/timing merely because a later zero-insert diff commits.

**Established:** a specification-state trace with `committed = true`,
`saved = true`, zero bad lines and `restamp_due = true` satisfies the written
completion predicate. No proposed implementation exists to supply a missing
guard or journal. This is a gap in the state-machine contract, not a claim
that an implementation has already deleted work.

**Change:** define separate ingestion, archival and coverage obligations.
Unresolved commit outcomes and outstanding re-stamps must block deletion of
their recovery state. Preserve an acknowledged journal/receipt for completed
attempts containing exact row identity, original/current capture times, commit
upper bounds and re-stamp outcomes for the audit's retention horizon. Define
the journal's durability and failure behavior before deleting spool metadata.
Keep save retries distinct from new ingest attempts. Add late commit → save
success → restart, save failure → later zero-insert retry, repeated re-stamp
failure, and a D violation discovered after spool cleanup to the tests.

### 6. P2 — The timing study and run-log audit do not establish successful reader coverage

**Plan:** §9.5 lines 1224–1227 and 1249–1252; `sql/10`, `out/21`; 1b.6 audit.

**Failure:** the timing SQL assigns each run to the most recent nominal
minute **from its end time**. A run intended for 11:54 that finishes at
12:24:20 is reported as ending 20 seconds after its minute, rather than
30 minutes 20 seconds late. Aggregate counts of 48/day do not distinguish
one missing slot plus a duplicate/manual/overlapping run in another slot.
The published 12–53-second offsets and 672 total runs therefore do not by
themselves prove that each intended reader ran within D.

The attempted start extraction uses `e->>'datetime'`, while the actual reader
logger writes **`dt`**. `out/21` consequently has no start sample. That `dt`
is generated by the app's clock, so using it alongside DB timestamps also
requires an explicit skew bound or conservative treatment.

Finally, an `app_run_logs` row exists for failed runs too. The reader's outer
catch writes one when its boot query batch fails, and detection-insert failure
is caught and logged before the run record is written. A run's start/end
interval is neither proof that a CT snapshot was successfully read nor proof
that matching detections were stored. The audit can incorrectly certify an
uncovered interval unless it examines outcome as well as timing.

**Established:** inspected the saved timing SQL/output and current reader
`utils/logger/log.js` (`dt` at line 46), `index.js` boot `Promise.all`, and
its closing/error paths at lines 655–674. A synthetic 30-minute-late completion
reproduces the timing-query alias. No fresh DB query was made; no actual
missed or delayed production run is asserted.

**Change:** associate runs with intended slots independently of end-time
rounding; extract the correct available fields, inspect per-slot multiplicity
and gaps, and preserve UNKNOWN when the evidence cannot establish a slot or
snapshot. Filter/flag failed CT reads and failed detection writes. Use run
intervals only as conservative bounds: proving coverage requires a successful
reader snapshot after commit and before capture expiry, not just an
overlapping run. State how clock uncertainty and missing logs affect the
result. An audit can remain read-only and the reader unchanged, but it must
report uncertainty honestly and route it to the agreed repair procedure.

## Required additions and corrected test oracles

1. **Revision identity:** both orders of the new-parser-only A/B pair in
   finding 1, including an older replay after the newer grab, Redis loss,
   repeated snapshots and a rollback interval. Assert the canonical contents
   retained, not only zero insert counts on repeat.
2. **Origin classification:** the old EAL comma-field/new-form example in
   finding 3, with the real old helper and whole-file scan. Include valid and
   NULL source times in new rows. Treat old/new-looking syntax as the property
   being tested, not a trusted fixture annotation.
3. **Commit reconciliation:** another transaction at the same capture time;
   another kind at that time; a transaction still committing during the check;
   both abort and committed-with-lost-response outcomes. Assert which exact
   rows are acknowledged and updated. Include two workers sharing one spool
   entry through post-COMMIT state/save/re-stamp operations.
4. **Coverage boundaries:** exact lower endpoint, precision round-trips,
   reader D endpoints, and the same cases for re-stamps. A slow-commit test
   must demonstrate the actual committed outcome; a backend kill can instead
   exercise only rollback.
5. **Completion and audit durability:** discover a D violation after normal
   spool cleanup; retain a re-stamp obligation after save success and process
   death; retry archival without replacing the original attempt record.
   Process pending entries even when the current input pathname is absent;
   the `missing → skip` branch must not bypass independent spool recovery.
6. **Audit fixtures:** a 30-minute-late run, one missed and one duplicate slot,
   missing start/end evidence, app/DB clock uncertainty, boot-query failure
   and detection-insert failure. Distinguish PROVED from UNKNOWN coverage.
7. **Retention oracle:** the new plan explicitly permits an unspooled outcome
   when a spool write fails and ingest/save also fail. The ENOSPC test cannot
   simultaneously require every artifact to be recoverable. Test the declared
   residual failure honestly: no handled hash, a visible unspooled error, and
   recovery only when some durable copy actually exists.

## Checks that passed and remaining limits

- **Coverage condition:** `t < s` and `s − 30 min < c` correctly describes
  visibility and freshness for a successful query selecting that system.
  Successful evaluation and detection persistence are additional obligations.
  With `c > N+5 min`, `t < N_next` and D, the next query covers the row. The
  main phase argument works after correcting the closed endpoint.
- **Rollback:** preservation of the complete set under the collector's lock,
  verified copies before offset mutation, fresh export of the preserved MDB
  on replay and refusal of uncovered outputs address round-2 finding 1 for
  the preserved snapshot. Re-export with byte equality is a sound sufficient
  link; a locale mismatch that makes the bytes differ must fail closed, not
  authorize an offset. Pin the exact commands/exporter/locale for rehearsal.
  Content comparison is not evidence that ingestion already happened; its
  safety depends on the retained input and replay route remaining durable.
- **Spool and archival:** preserving every observed changed snapshot before
  processing, propagating save failures and setting the hash after the
  acknowledged save address the previous disappearing-buffer and save-order
  defects in the ordinary successful-spool path. Capacity thresholds and an
  owner are now specified. This review does not infer durability when the plan
  explicitly reports an unspooled failure.
- **Provenance:** validating new time text to new-form or NULL prevents new
  rows from accidentally using old-form text. It does not solve the reverse
  direction for the old EAL regex or give new NULL rows a distinct origin.
- The previous 117,270/117,274 measured projection result remains useful for
  those copies. It was not rerun here; the new findings use inputs absent from
  that dataset. There was no write-capable PostgreSQL rehearsal, production
  timing measurement, collector publication exercise, or implementation test
  in this review. The proposed locked rollback, partition-moving re-stamp and
  spool recovery still require their build-time integration rehearsals.
