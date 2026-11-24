# PCT-1b design review

Reviewed the working-tree `PLAN-PHILIPS-CT-INSIGHTS.md`, principally §9,
against commit `42cd3f7`, the existing parser and helpers, the evidence scripts
and saved results, the five local MDB copies, and the alert processor's reader.
This is a design review; no proposed parser implementation exists.

**Verdict: change the design before building.** There are **3 P1 and 6 P2
findings**. In particular, O2s cannot uphold Q6 as written, a rejected buffer has
no durable recovery path, and resetting rollback offsets to EOF can discard
unprocessed data. The five-copy result is useful evidence for those snapshots,
but is not a proof of the transition under key reuse or the production candidate
query.

Only this requested report was written. No parser, plan, production file, DB or
Redis state was changed. No DB/Redis query or scanner connection was made. MDB
exports and Python/Node probes were bounded; Python used `python3 -I -B`. Raw
device records remain in the evidence directory. Examples below are synthetic.

## Findings

### 1. P1 — O2s suppresses different content at an old split row's key

**Plan:** §9.3, §9.5 `ingest.js`, §9.7 Q19/Q25; especially lines 1005–1007
and 1127–1129.

**Failure:** let the DB contain an old Events row at key K with
`message = 'Ready'`, `eal = 'Now'`. It represents `Msg = 'Ready Now'`.
A later buffer contains K with `Msg = 'Fault Raised'`, `EAL = NULL`.
O2s consumes the stored key-only count and inserts nothing. The new event is
lost, although Q6 requires keeping different content and Q25 explicitly allows
revisions between grabs. The old row keeps suppressing the revision on every
changed-file retry. A capture boundary alone would not fix this example: the
old row really was captured before deployment.

The same error becomes a permanent rule for new rows if a scanner writes
`EAL = 'No'` or another permitted text value. Once stored, such a row becomes a
key-only wildcard on subsequent reads. The plan must either validate the source
flag domain or stop treating its value as sufficient provenance.

**Established:** reproduced with an in-memory implementation of the exact
`Counter` subtraction in `transition_shape.py`: legacy A vs source A inserts
0, correctly; legacy A vs different source B also inserts 0, incorrectly.
New `EAL = 'No'` vs revised content likewise inserts 0. Historical key reuse and
revised memo content are already documented in §3.1 and §9.3. The supplied
transition copies do not exercise this case.

**Change:** remove unconditional key-only suppression. Match legacy rows using
all surviving content, for example by projecting the incoming row through the
old collector/parser's transformations solely for transition comparison. Bound
legacy eligibility with reliable provenance or a fixed deployment boundary;
retain exact matching for new rows. Where the old lossy representation cannot
distinguish candidates, preserve the differing new content under Q6 and report
the ambiguity. Do not claim universal zero loss and zero duplication from an
irreversibly lossy representation.

### 2. P1 — Fail-closed retries can lose an entire buffer, including valid rows

**Plan:** §9.5 lines 1082–1086; §9.7 Q24; §9.8 1b.1/1b.6.

**Failure:** one record has a malformed key or wrong field count, while the rest
of a file contains valid new events. The file is rejected on every run. The
scanner then resets its rolling MDB and the collector replaces the CSV. None
of the valid events were inserted. The specified successful-ingest → hash →
`gzip_n_save` path supplies no required archive of the rejected bytes or replay
work item. ERROR logging and an unchanged hash do not preserve a disappearing
buffer. This can turn one bad row into the loss of thousands of good rows.

**Established:** reasoned directly from the specified rejection, save ordering,
and measured 3.5-hour minimum buffer lifetime. This is a consequence of Q24,
not a claim that one of the five supplied CSVs is malformed.

**Change:** require durable retention of the exact rejected input and a visible
replay mechanism before it can be overwritten. For records whose boundaries are
known, quarantine bad records with their reasons and ingest valid records with
an ERROR and explicit partial status. For broken quoting or an untrusted
header, retain the whole input and do not guess record boundaries. Define hash
behavior and retention/replay completion for partial files. Saving must use the
same bytes that were parsed: unchanged `gzip_n_save` reopens the pathname, which
may already refer to the collector's next atomic replacement.

### 3. P1 — Rollback's EOF reset skips rows that neither parser has processed

**Plan:** §9.4 lines 1042–1043 and 1056–1061; §9.8 1b.5. The handoff's
summary also puts the offset reset after restoring old code, whereas §9.4 says
to do it before.

**Failure:** the last completed CSV ingest covered snapshot A. The collector
publishes B containing additional events, and rollback starts before B is
ingested, or because B fails validation. Setting the old `.output` offset to
B's current size instructs the old parser to start after those additional
rows. If the file does not grow again before reset, those rows are never read.
Resetting before code, as the plan says, still loses this tail; resetting after
code additionally permits an old cron run to use the stale offset.

Separately, code-first/config-second does not stop an old process that already
loaded `.output` configuration. It can continue inserting while a new process
ingests `.csv`. The old process does not take the new advisory lock, so the
new transaction cannot serialize those two writers.

**Established:** reasoned from byte-offset semantics, the once-per-process
configuration load in root `index.js`, and the old parsers' unlocked inserts.
An offset of 100 advanced to EOF 150 skips the 50 unread bytes by construction.
No live rollback was attempted.

**Change:** specify a drain/barrier for CT writers during deploy and rollback.
Before an EOF reset, reconcile the exact current collector snapshot and prove
its relevant rows have been ingested or durably retained for replay. Coordinate
publication as necessary so this proof and the offset refer to the same
snapshot. Reset offsets while old CT execution is stopped, restore a coherent
code/config pair, then resume. If the failing parser cannot reconcile the
snapshot, preserve it and provide a recovery route instead of declaring EOF
safe. Add this failure case to the rollback rehearsal.

### 4. P2 — The candidate read is not complete for the identity being compared

**Plan:** §9.5 `rows.js`, `time.js`, `ingest.js`, line 1081; §9.7 Q23.

**Failure:** a stored row with the same raw key/content but NULL
`host_datetime` is excluded by every range comparison. It is inserted again
when its CSV is next processed. The old date helper does return NULL for invalid
dates and invalid zones, and the old parsers continue building the row. If the
new code also accepts a format-valid but impossible date, it can create rows
that its own next candidate read cannot find. A retained hash merely hides this
failure until the file changes or Redis is cleared.

A valid zone change can also move a matching row outside the padded range.
For the same wall clock, `Pacific/Kiritimati` and `Etc/GMT+12` differ by 26 hours;
one-day padding misses the previous instant for a short file. Ordinary scanner
clock skew alone does not cause this: both conversions still use its raw key.

**Established:** local Luxon probes returned NULL for `2026/02/30` and an
invalid zone, and reproduced the 26-hour displacement outside the new range.
The 117,274 saved candidates contain zero NULL timestamps, so the supplied
transition proof does not exercise the NULL case. This is not evidence that
production currently contains such a row.

**Change:** require calendar/time-zone validity explicitly and make the
candidate query complete for accepted raw keys, including legacy NULL or
out-of-window conversions. A timestamp index may remain a fast path, but it
cannot be the sole correctness predicate while timestamp interpretation is
excluded from identity. Test actual SQL selection, not just the diff function.

### 5. P2 — An accepted all-NULL Events payload is read back as EAL

**Plan:** §9.5 `rows.js` and `ingest.js`, lines 1079–1081; Q24.

**Failure:** a correctly headed Events row has a valid `DataTime` but all seven
persisted Events columns are NULL. Header/key/field-count validation accepts
it. After insertion the `num_nonnulls(...)` discriminator calls it EAL. The
next Events candidate read excludes it and inserts it again. It can also
contaminate EAL matching if that table subsequently has the same raw key.
Dropping BLOB does not leave any other guaranteed Events marker.

**Established:** the discriminator evaluates to EAL for this synthetic row.
`mdb-schema` does not show a required non-NULL payload marker in the copies;
all 102,214 observed Events rows do have a marker, so this is an untested
accepted-input case rather than an observed device defect.

**Change:** require at least one persisted Events marker in `rows.js`, with
quarantine/recovery as in finding 2, or introduce reliable stored provenance.
Assert that each built row is classified back into its originating kind before
inserting it. Use the identical predicate in SQL and tests.

### 6. P2 — R2 does not make every unchanged EAL column legacy-equivalent

**Plan:** §9.3 lines 1010–1011; §9.5 `rows.js`; §9.7 Q20, particularly
lines 1139–1142.

**Failure:** source `Info = 'alpha"beta   '` is exported as
`"alpha""beta   "`. The old `ct_eal_v_2` regex stores `alpha""beta`.
CSV decoding plus R2 trimming stores `alpha"beta`. O2s uses full content for
EAL, so the new parser inserts an additional row even though the source content
did not change. The old EAL parser's quote-cleanup helper for `file` and
`err_number` removes only the enclosing quote pair; it also leaves doubled
interior quotes rather than decoding them. Those fields need the same check.

**Established:** ran the actual old regex on synthetic doubled-quote Info;
the stored and R2 strings differ exactly as above. Plain padded Info matches,
and `/\s+$/` matches the old trim for the tested representable strings. The old
regex does not ingest an Info containing an embedded line terminator, so there
is no universal old/new row equivalence for that case either. The five copies
contain no double quotes (§9.1), which explains why the existing measurement
passes. The Python oracle also has a different Unicode `\s` set from JS and
must not define old-parser equivalence for synthetic Unicode whitespace.

**Change:** retain the desired decoded new text, but define transition
comparison against the old representation separately. Cover quotes in Info,
File and ErrNum with the actual old regex and quote-removal helper. Limit the
77,260-row equivalence claim to the measured dataset; do not make universal
compatibility depend on trim plus date formatting alone.

### 7. P2 — Loading all saved legacy rows does not model the production read

**Plan:** §9.3 lines 988–1003 and 1026–1029; §9.8 1b.2/1b.4.

**Failure:** `sql/05` includes `archive_log` rows for the two 2025 copies.
`transition_shape.py` feeds them all to the matcher. The proposed runtime reads
only `log.philips_ct_eal_events`. Loading all 117,274 saved rows into the
throwaway runtime table would therefore make rows suppress inserts that would
be inserted in production. It also bypasses any proof that the real window and
kind predicates selected the correct candidates.

**Established:** inspected the SQL and script, then reran the same reference
matcher using only candidates labeled `src = 'log'`. It proposed **113,552**
inserts, versus the published **62,208** with archived candidates included.
This does not overturn the explicitly accepted archive-reingest policy; it
shows that the published total is not the runtime expectation.

**Change:** keep the all-history comparison as a separate transition study.
For the integration rehearsal, preserve source schemas, relevant partition
bounds, and row timestamps, seed only rows eligible in production into `log`,
and exercise the real candidate SQL. Record separate expected totals. Run
first ingest, repeat ingest, Redis loss, and a changed snapshot against each
seeded DB; final counts alone do not show which new rows were suppressed.

### 8. P2 — The alert-window claim excludes unbounded lock and write time

**Plan:** §9.2 line 974; §9.5 line 1081; §9.6 lines 1106–1118;
§9.8 1b.2/1b.6.

**Failure:** a file starts at `:18`, then waits for an advisory lock or takes
longer to commit than expected. It commits after the alert processor's `:24`
query snapshot. Its rows were invisible to that query, and at `:54` their
file-start `capture_datetime` is already over 30 minutes old. They are never
evaluated. The plan specifies a five-minute budget, but no lock/transaction
deadline or recovery behavior that enforces it.

**Established:** the actual alert query is `capture_datetime > NOW() -
INTERVAL '30 minutes'`. The evidence benchmark measures decode/diff and reads;
it does not bound lock waits, multi-batch inserts/commit, saving, or the alert
processor's increased per-model work. No delayed production run was induced.

**Change:** define bounded lock acquisition and a whole-transaction deadline,
including what happens when it expires. Set capture time after lock acquisition
where appropriate, and ensure late commits remain eligible for a reader run or
have an explicit replay route. Rehearse two connections, lock contention,
slow/failing batches, and the reader's actual query snapshots. Measure the
first full-buffer write and alert-reader workload before asserting the budget.

### 9. P2 — The source-schema premise about duplicate keys is incorrect

**Plan:** §9.1 lines 963–965, feeding the multiset/DST rationale in §9.5.

**Failure:** the plan says `mdb-schema` shows no unique index and consequently
allows two identical timestamp keys within one source table. On this box,
`mdb-schema <copy>/Logger.mdb postgres` emits a primary key on `EALInfo.DTime`
and a primary key on `Events.DataTime` for **all five copies**. It also emits
the EAL-to-Events timestamp foreign key. A reference rehearsal built around
simultaneous duplicate source keys is not demonstrating the actual schema.

**Established:** reproduced by bounded, read-only `mdb-schema` calls on each
copy. The positional backend matters; the default output does not provide the
same constraint detail.

**Change:** correct §9.1 and explicitly distinguish keys repeated across
snapshots/resets from duplicates within one source table. Keep defensive
multiset handling if desired, since stored history can have duplicates, but
base DST tests on sequential snapshots as well. The constraints alone do not
establish what the scanner does on its second pass through a repeated hour;
do not infer suffixing, replacement or reset without evidence. Finding 1
applies to sequential key reuse even when each individual file has unique keys.

## Required additions to 1b.1 / 1b.2

1. **Transition identity:** old split A → same A → changed B at the same key
   over separate snapshots; reset/clock reversal; future nonstandard EAL flag;
   legacy and exact candidates together; duplicate stored rows. Assert identities
   and contents of inserts, not merely totals or presence of a key. If accepting
   multiple source rows per key defensively, permute their order too.
2. **Candidate SQL:** stored NULL timestamp, valid key with an old timestamp
   outside the padded window, site-zone change, invalid calendar date/zone,
   millisecond suffixes, and all-NULL Events payload. Every accepted inserted row
   must be visible to its next same-kind read when Redis is cleared.
3. **Independent legacy oracle:** actual old EAL regex plus quote cleanup and
   empty-string mapping, not only `csvref.db_row`. Add doubled quotes, tabs,
   literal backslashes, Unicode whitespace, and empty-vs-NULL fields. Check
   midnight and two-digit-year formatting outside 2000–2099 with the installed
   exporter if those values are accepted.
4. **Durable rejection:** one malformed record among valid records, repeated
   failure followed by buffer reset, invalid header, broken quoting, save
   failure, and collector replacement between parsing and saving. Verify exact
   snapshot retention and successful replay after the original file disappears.
5. **Real transactions:** two PostgreSQL connections ingesting the same file;
   rollback on a later batch failure; process failure before commit, after
   commit/before Redis, and after Redis/before save. Repeat without Redis and
   verify no additional rows. Include heartbeat failure in the transaction
   atomicity contract, and test historical corrections/DST against the chosen
   heartbeat monotonicity policy.
6. **Production-shaped seed:** separate active and archived rows; actual
   monthly capture partitions, including a month boundary; actual kind/window
   predicates. Test reader visibility while the writer waits or commits late.
7. **Deployment:** an in-flight old process, rollback with unprocessed new
   bytes, rollback after validation failure, offset-reset ordering, and a
   subsequent redeploy using existing CSV hashes. Demonstrate the drain and
   snapshot reconciliation, not just the happy-path command order.

## Checks that passed and limits

- Independently ran the installed `mdb-export` on both tables of all five
  copies with and without the new flags. Across **179,478 rows**, there were
  **0 row-count mismatches, 0 field mismatches** after one-pass unescaping and
  the stated date conversion, **0 unknown escape pairs**, and **0 nonempty
  stripped BLOB values**. This validates the measured dialect and R2 date text
  on these copies. It does not exercise dates or characters absent from them.
- All **117,274** saved candidates have non-NULL `host_datetime`; none of the
  **102,214** observed Events rows has an entirely NULL persisted Events
  payload. Those observations explain why findings 4 and 5 escape this proof.
- With a consistent snapshot, complete candidate selection, and the same lock
  on every writer, commit-before-Redis is sound: losing the hash update causes
  another DB diff, not another insert. Enforce those prerequisites and test the
  failure boundaries before relying on this property.
- There was no write-capable PostgreSQL rehearsal, collector run, network
  access to devices, live alert execution, or implementation test in this
  review. Those are build/deploy validation steps, not completed evidence.
