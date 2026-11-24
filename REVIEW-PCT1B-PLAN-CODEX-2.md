# PCT-1b design review, round 2

Reviewed `PLAN-PHILIPS-CT-INSIGHTS.md` §9 against the round-1 report, the round-2
handoff, the existing parser/helpers, the revised evidence, the collector's
publication code, and the alert reader. **Q27–Q33 are agreed**; the findings
below concern defects in those decisions' proposed realization, not unanswered
questions. The checkout is `DEV` at `a3b3a75`, which commits the revised plan;
the handoff's description of it as uncommitted above `42cd3f7` is stale. There
is still no proposed parser implementation.

**Verdict: revise the design before building. There are 2 P1 and 5 P2 findings.**
The largest remaining problems are rollback after a partial collector publish
and the absence of durable recovery for valid snapshots that cannot commit.
The proposed timeout also does not enforce a commit deadline, and even a
perfect deadline would not guarantee alert-reader coverage.

Only this report was written. No parser, plan, production file, DB or Redis
state was changed. No `.env` was read, and no DB/Redis query or scanner
connection was made. Probes used existing local evidence and synthetic input;
raw device data was not copied into the repository. PostgreSQL 14 documentation
and source were consulted for timeout semantics.

## Findings

### 1. P1 — Retaining the current CSV does not make rollback's EOF reset safe

**Plan:** §9.4, lines 1108–1123; Q30; §9.8 rollback rehearsal.

**Failure:** snapshot A was ingested. A later grab B publishes `Logger.mdb`
and the two `.output` files, then fails before publishing the `.csv` files.
The collector explicitly permits this partial state. The current CSV is A;
the current legacy output is B, containing an additional event X. A check may
correctly print `NOT RECONCILED`, but its prescribed recovery copies **A's CSV**
and resets **B's output offset** to EOF. X is neither ingested nor retained for
replay. The old parser skips X, and replaying A cannot recover it.

This failure does not require the mtime heuristic to return a false positive.
Even an accurate mismatch result leads to insufficient preservation. Moreover,
mtimes are not a publication identity: the MDB's timestamp can be preserved by
the download, and exports are created before their separate renames. No
enforced timestamp relationship is specified. Stopping CT parsing also leaves
the collector running. A new publish between checking, copying and setting
the offsets can make those operations refer to different snapshots.

**Established:** inspected
`hhm_data_acquisition/read/sh/Philips/phil_ct_data_grab_1.sh`, lines 152–162:
publication is five independent `mv -fT` operations, in the handoff's order;
failure exits with the already-published subset left in place. A synthetic
A/B state trace of the specified rollback commands leaves X uncovered. No
collector or live rollback was run.

**Change:** establish a barrier against collector publication as well as CT
writers, for example using the collector's existing per-system `.grab.lock`.
Bind the check, preservation and offset to the same exact files. Advance an
offset only when that output's relevant rows are proved handled, or when the
exact unprocessed input has been durably preserved with a defined recovery
route. Preserve the current MDB and legacy output when their corresponding
CSV is absent; do not substitute a different grab's CSV. A partly published
set must fail reconciliation unless content-level evidence establishes
coverage. Test every publish prefix and replacement between each rollback
step, including verification of the retained artifact before offset changes.

### 2. P1 — Valid snapshots that fail ingestion still have no durable recovery path

**Plan:** §9.5 `index.js`, lines 1146 and 1160–1179; Q29/Q31; §9.8 1b.2.

**Failure:** a correctly formatted CSV contains new event X. Its transaction
repeatedly expires, fails a batch, or cannot insert because the next monthly
partition is absent. The plan rolls back and retries next run, but retention
is required only for malformed input. The rolling source resets and the
collector replaces the file before any successful retry. X is gone from both
the source and the DB. Neither an unset Redis hash nor the successful-ingest
save path preserves the failed snapshot.

Similarly, a file read into memory and skipped for a busy lock has not been
proved covered by the other writer, which might be processing an older
snapshot. In the partial-input path, retention is ordered after ingestion;
a process failure between commit and retention can also strand the bad lines
when the original disappears.

**Established:** reasoned from the explicit retention eligibility/order and
the deadline's rollback-and-retry behavior. This is the same disappearing
buffer mechanism as round-1 finding 2, now triggered by operational failure
rather than validation. The plan itself identifies missing partitions and
unmeasured first-write duration. No production failure was induced.

**Change:** make preservation cover pending work, not just bad records.
Durably spool the exact observed snapshot before treating it as retryable or
handled, or specify an equivalent collector retention/acknowledgment contract.
Keep it pending until ingestion and required archival obligations are
confirmed. Recovery must work after process failure, timeout, missing
partitions, lock contention and replacement of the original. Establish durable
retention before acknowledging a partial file. Retrying the current pathname
alone is insufficient.

### 3. P2 — `statement_timeout` does not enforce the promised commit deadline

**Plan:** §9.2 line 988; §9.5 lines 1160–1164; §9.6 line 1208; Q31.

**Failure:** all batches finish before `:23`, and `COMMIT` starts before that
deadline. A slow WAL flush delays visibility until after the `:24` reader
snapshot. The rows retain their `:18` capture time, so the `:54` query excludes
them. This transaction need not expire under the proposed mechanism.

**Established:** PostgreSQL 14's `finish_xact_command()` disables the active
statement timeout **before** calling `CommitTransactionCommand()`. Thus a
timeout on the command does not bound the transaction's final commit work.
Separately, `statement_timeout` is a relative server-side statement limit,
not an absolute app-clock deadline or a limit on all intervening client work.
See the [PostgreSQL 14 source](https://github.com/postgres/postgres/blob/REL_14_STABLE/src/backend/tcop/postgres.c#L2545)
and [timeout documentation](https://www.postgresql.org/docs/14/runtime-config-client.html#GUC-STATEMENT-TIMEOUT).
This was established from source, not a write-capable DB rehearsal.

**Change:** retain the no-wait lock and statement limits as resource controls,
but remove the claim that they guarantee timely visibility. Define an absolute
deadline using an explicit clock authority, check remaining time throughout
client and SQL work, and specify recovery for late or uncertain commit
outcomes. A successful late commit cannot subsequently be rolled back or
repaired by re-ingesting under normal dedupe. Its alert evaluation needs a
durable recovery mechanism. Rehearse delayed final commit, client pauses and
lost commit acknowledgments, not just a slow/canceled INSERT.

### 4. P2 — A commit before the nominal deadline can still miss every reader window

**Plan:** §9.2 line 988; §9.5 capture/deadline, lines 1151 and 1160–1164; Q31.

**Failure:** even granting a perfectly enforced deadline and synchronized
clocks, consider this manual run, which the design permits:

| Event | Time |
|---|---|
| Writer obtains lock and stamps its rows | 12:24:10 |
| The `:24` reader's CT query takes its snapshot | 12:24:20 |
| Writer commits | 12:24:30 |
| Next nominal writer deadline | 12:53:00 |
| The `:54` reader's CT query takes its snapshot | 12:54:20 |

The first query cannot see the uncommitted rows. The second requires
`capture_datetime > 12:24:20`, excluding their `12:24:10` capture time. All
later queries exclude them too. The writer committed well before `12:53`.
No long outage is needed: actual query execution slightly after the cron
minute is enough for this manual-run case. For ordinary `:18` runs, a reader
delayed past `:48` likewise loses coverage even when the writer finishes early.

**Established:** reproduced the visibility/window inequalities with synthetic
times against the actual predicate in
`/home/prod/alert-processor/utils/db/sql/alert-processor/log/get-data.sql`.
The reader starts several asynchronous DB operations from `index.js`; its CT
query snapshot is not fixed to the nominal cron minute. No live reader ran.
App/DB clock skew would require additional explicit bounds; the counterexample
does not depend on it.

**Change:** specify coverage in terms of actual successful reader snapshots
and commits. Use a durable evaluation queue/checkpoint or an explicit recovery
scan; overlapping windows also need a defined repeat-evaluation policy. If the
reader cannot change within PCT-1b, document the bounded operating assumptions,
restrict manual/replay ingest to a safe phase, and provide recovery when
reader timing violates those assumptions. A nominal cron constant alone
cannot support the unconditional claim. Add the timeline above and late/missed
reader runs to 1b.2.

### 5. P2 — The old EAL parser can store NULL time, defeating time-text provenance

**Plan:** §9.3 lines 1036–1042; §9.5 `rows.js`/`legacy.js`; Q27/Q28/Q30.

**Failure:** a valid EAL record has `Info = 'alpha","beta'` and a normal,
non-NULL source `EalTime`. Plain export quotes the Info field as
`"alpha"",""beta"`. The actual `ct_eal_v_2` regex stops inside that quoted
field and captures:

```text
info     = alpha"
eal_time = ''  -> stored NULL
```

The row's key and other fields are valid. The projection reproduces this old
row, including its NULL time, but rule P's old-format provenance test rejects
it. Exact new-form matching also fails. An unchanged source row is therefore
inserted next to its legacy representation. This can occur during a rollback,
after the current census was taken, so that census cannot close the gap.

**Established:** ran the repo's actual regex and quote helpers on a synthetic
plain-export record, then the existing evidence script's `projectEal()`.
Both produced the captures above. `mapDataToSchema()` maps the empty capture
to NULL. The assertion that the old regexes cannot store NULL time is false
for EAL; its time capture is `.*?`, unlike Events' constrained date pattern.
The saved census's zero NULL count remains valid for its measured rows.

**Change:** define handling for NULL/noncanonical time provenance and test it
through a rollback/redeploy. Separate canonical new rows from ambiguous legacy
rows using a marker whose guarantees are actually enforced. If retaining
time-text provenance, specify and validate the accepted new time domain,
including source NULL, and choose an explicit conservative policy for unknown
legacy shapes. Do not classify all non-old-format rows as new or claim the
format is an unconditional origin proof. Keeping a duplicate deliberately for
an ambiguous row is a possible policy, but must be stated as such.

### 6. P2 — A saved-file failure after the hash update is never retried

**Plan:** §9.5 `index.js`, line 1146; §9.4 hash semantics, lines 1127–1129;
Q29; §9.8 failure after Redis/before save.

**Failure:** ingestion commits, the done-hash is set, and the process dies
before saving the buffer to `log.saved_files`, or the save fails. Subsequent
runs see the same hash and skip the file, so the archival obligation is never
retried. On replacement, the exact input bytes are lost unless independently
retained. Correctly passing the original buffer solves the pathname race but
not this completion gap. Ingested rows survive; the promised saved snapshot
does not.

**Established:** follows directly from the proposed order and unchanged-hash
early return. The current helper also compounds this: `util/gzip_file.js:64`
does not await/return `db.none()`, and surrounding helpers swallow errors.
Changing the input argument to a buffer does not by itself make save success
observable to the caller. No save was attempted.

**Change:** make archival completion observable and retryable. Save before
marking the entire file handled, or track pending archival work separately
from the ingest optimization and retain the buffer until acknowledged. Await
the save and propagate failure on the CT path. After a commit succeeds but
save fails, another DB diff is safe; suppressing all remaining work is not.
The existing kill-point test must assert eventual byte-identical archival
after the original pathname has disappeared, not just unchanged row counts.

### 7. P2 — Permanent retention has no capacity or retention-failure contract

**Plan:** §9.5 lines 1170–1179; Q29; §9.8 1b.6.

**Failure:** one persistent bad record remains in a growing rolling buffer.
Each grab changes the file hash, so storing each distinct content once still
retains a full snapshot every 30 minutes. Files are never automatically
deleted, including those moved to `replayed/`. A full filesystem eventually
prevents retention and can affect other jobs. The plan does not define what
happens to the good-row commit, partial status or done-hash when retention
fails, or how an operator acts before capacity is exhausted.

**Established:** reasoned from the specified retention policy. At the
measured largest-file size of about 3.33 MB, 48 distinct snapshots of one
failing table are about 160 MB/day before compression. This is a growth
example, not a measured fleet forecast or a claim that today's disk is full.
Content deduplication does not bound changing snapshots.

**Change:** specify free-space/backlog monitoring, an actionable threshold
and owner, and a durable spill/manual cleanup process consistent with the
agreed no-auto-delete rule. Include `replayed/` in capacity accounting. A
failed or incomplete retention write must not authorize a handled hash or a
rollback EOF reset. Rehearse ENOSPC, permission failure and process death
during retention; verify the artifact and reasons are recoverable before
acknowledgment. Define the response to growing pending work rather than making
“no retained files” the only monitoring criterion.

## Required additions to 1b.1 / 1b.2

1. **Rollback publication matrix:** stop after each of the five collector
   renames; replace files between check/copy/offset steps; verify recovery of
   the new rows from the preserved artifacts after original files disappear.
   A `NOT RECONCILED` message alone is not a passing assertion.
2. **Recovery of valid files:** transaction timeout, missing partition,
   late-batch failure and lock contention followed by a source reset. Recover
   the exact accepted identities from durable pending snapshots. Include a
   crash after partial ingest but before retention/hash.
3. **Actual deadline boundaries:** delay final commit, pause the client between
   commands, lose the commit response, and vary app/DB clock offset. Verify
   the chosen late-commit recovery instead of assuming rollback is possible.
4. **Actual reader windows:** the manual-run timeline in finding 4, late/missed
   cron runs and a queued CT query. Assert that every committed alert-eligible
   row is eventually evaluated through either the normal reader or recovery.
5. **Provenance domain:** `Info` containing quote-comma-quote; NULL source
   `EalTime`/`EventTime`; noncanonical legacy time; rollback-generated rows.
   Verify candidate SQL when an invalid zone makes every incoming
   `host_datetime` NULL: span bounds must still come from raw keys and find
   earlier non-NULL candidates.
6. **Durable completion:** retention disk failure, interrupted artifact/reason
   writes, save failure and process death after Redis/before save; replace the
   original before restarting. Assert exact bytes and pending-work status as
   well as DB row counts. Exercise threshold boundaries at 10 bad lines and
   just above/below 1%, with a specified denominator and rounding rule.
7. **Whole-pipeline oracle:** compare the actual old collector transformations
   and whole-file `/g` scans with projection over sequential snapshots. Include
   actual sort order, byte tails beginning inside a record, I6's consumed next
   timestamp, an I6 record at EOF, and changed adjacency between grabs. The
   current projection tests use the same regex as their oracle; matching the
   regex per record does not independently establish scan-context equivalence.

## Checks that passed and limits

- Independently decoded the existing CSVs and rebuilt the plain records using
  the revised evidence helpers, then projected **those rebuilt records** and
  compared against the saved stored rows. Result: **117,270 matches, 4 Info
  mismatches, including 873 I6 wildcard matches**. This strengthens the saved
  study, whose comparison loop projects the real plain export rather than the
  reconstructed record. It does not establish universal whole-file equivalence.
- The corrected production/all-history split and the explicit acceptance of
  archived-buffer reingestion resolve round-1 finding 7. No additional row-count
  objection was found in that distinction.
- The 10-line/1% policy and partial-file hash are reasonable design choices
  once exact-byte retention is durable and acknowledged, replay is tracked,
  and threshold arithmetic is explicit. An unchanged partial file can be
  skipped safely while its retained work remains independently visible.
- No additional counterexample to the I6 wildcard was established beyond the
  acknowledged lossy-representation ambiguity. The wildcard must stay gated
  by the full projected shape and legacy eligibility; a date-shaped `eal`
  alone is insufficient. Count wildcard/legacy matches and unmatched incoming
  rows. The true number of suppressed revisions or old-shape duplicates is
  unobservable from lossy rows alone, so §9.3's “counts both cases” claim
  should be narrowed to observable match/ambiguity counters.
- The measured time-text census and candidate-query cost are useful evidence,
  not universal provenance or timing proofs. No DB query, write-capable
  PostgreSQL rehearsal, real collector run, live alert execution, or proposed
  parser implementation test was performed in this round. A bounded plain-MDB
  export probe encountered a child-process `EPERM`; it was not used as fresh
  export-validation evidence. The successful comparison above used saved CSVs
  and candidates in place.
