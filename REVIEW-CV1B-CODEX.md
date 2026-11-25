# CV-1b implementation review

Reviewed `DEV` commit `fb3d510` against `REVIEW-CV1B-HANDOFF.md` and
`PLAN-PHILIPS-CV-INSIGHTS.md` §7.2–§7.4, including the build changes in §7.8
and the working-tree clarification about the collector's temporary directory.

**Verdict: address findings 1–2 before deploying the parser: one P1 and one
P2. Finding 3 is a P3 follow-up that can wait for this one-off backfill if
execution is serialized as described below.**

`node --test jobs/` passes all 10 test files on Node **16.20.2**. Additional
probes ran the actual daily job and decoder with synthetic Latin-1 files,
temporary directories, stubbed DB/Redis dependencies and the real logger.
The backfill probe evaluated the actual `load_folder` implementation with
injected dependencies; it did not execute the tool's CLI or read `.env`.
The supplied oracle/rehearsal summaries were inspected; the full 771,620-row
comparison was not rerun. The failures below are synthetic counterexamples,
not claims that these shapes occurred in those production samples.

Only this review was added to the repository. No implementation was changed,
no production DB/Redis or scanner connection was made, and no raw device data
was copied into the review. The disposable probe is
`/tmp/cv1b_review_probe.js` (`node /tmp/cv1b_review_probe.js`).

## Must change before parser deploy

### 1. P1 — Typed free text can escape the mask into both rows and run logs

**Locations:** [decode.js:31](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CV/decode.js:31),
[decode.js:62](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CV/decode.js:62),
and the raw warning sink at
[eventlog.js:118](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CV/eventlog.js:118).
LOD shares the reader and logs unmatched lines too.

**Failure A — a tag inside a value:** use this synthetic memo inside an
otherwise valid full record:

```text
Memo: [FUSION_COMMAND]  SetLongReportText Execute() note [UI_DEVICE_NAME] SYNTHETIC_SECRET [UI_DEVICE_NAME]  .
```

The lazy match stops at the **first** tag, even when it is part of the typed
report text. The actual `prepare_line` → `parse_line` result is:

```text
[FUSION_COMMAND]  SetLongReportText Execute() <masked> [UI_DEVICE_NAME] SYNTHETIC_SECRET [UI_DEVICE_NAME]  .
```

`SYNTHETIC_SECRET` remains in `memo`, which is inserted into
`log.philips_cv_eventlog` and can appear in `first_row`/`last_row` notes. The
optional space before the tag also accepts a tag with no preceding space.
There is no validation that this delimiter is the structural end of the value.

**Failure B — a physical line break inside a value:** put a literal LF between
`first` and `SYNTHETIC_SECRET` in the same record's memo:

```text
Memo: [FUSION_COMMAND]  SetLongReportText Execute() first
SYNTHETIC_SECRET [UI_DEVICE_NAME]  .
```

`readline` splits before masking. The first fragment is masked to its end;
the second has no `Execute()` and passes through unchanged. Running the real
daily job produced **one INSERT**, advanced the pointer, and put
`SYNTHETIC_SECRET` in the real logger's `NO MATCH FOUND` note. CR/CRLF
continuations have the same issue. Even if such a value makes a malformed
record, the warning path must not persist the remaining value verbatim.

**Change:** determine the value's end from validated record/memo structure,
and handle ambiguous delimiters conservatively. Preserve redaction context
across physical fragments, or suppress raw unmatched/continuation text from
diagnostics when it cannot be established safe. Choosing a greedy tag match
alone does not fix the continuation sink. Keep the agreed command list and
procedure-name behavior. Add both cases through `read_lines` and the actual
daily/LOD warning and row paths; assert that the synthetic value occurs in
neither parsed rows nor serialized run-log notes. These checks need no PHI.

### 2. P2 — The empty-file branch permanently acknowledges an entirely rejected file

**Location:** [eventlog.js:165](/home/matt-teixeira/hep3/hhm_rpp_philips/jobs/Philips/CV/eventlog.js:165),
following the unmatched-line branch at line 113.

**Input → wrong result:** start with pointer `daily_2026_11_19` and an
`EventLog.txe` in `daily_2026_11_20` containing the nonblank line
`NOT A RECORD\r\n`. The real job emits `NO MATCH FOUND`, then **`No records
in file`**, inserts **zero rows**, and sets the pointer to
`daily_2026_11_20`. Replacing that file with valid records before the next run
does not recover it: `folders_to_parse` excludes dates at or before the pointer.
Later folders can then move the pointer still further.

`data.length === 0` means no lines matched, not that the file was empty.
Consequently an unsupported or damaged export gets the same acknowledgment
as the deliberately supported blank-file case. In the previous implementation
an empty INSERT threw before this folder's pointer update; this new branch
makes the zero-match case look completed even with no later folder present.
The supplied no-record test covers only blank/whitespace lines.

**Change:** distinguish blank input from rejected nonblank records. Advance
for a genuinely empty/blank file as agreed, but stop without acknowledging a
file whose records were all rejected, and give an explicit parse-failure
diagnostic with safe content. This does not require changing the existing
policy for files with some matched rows. Add a two-run test: reject a nonblank
file without moving the pointer, replace it with valid records, and verify
that the next run inserts them.

## Follow-up that can wait

### 3. P3 — Backfill duplicate checks do not serialize overlapping loads

**Locations:** [cv_backfill.js:80](/home/matt-teixeira/hep3/hhm_rpp_philips/tooling/cv_backfill.js:80)
through the transaction at
[cv_backfill.js:96](/home/matt-teixeira/hep3/hhm_rpp_philips/tooling/cv_backfill.js:96).

**Input → wrong result:** two invocations target the same not-yet-loaded
folder. Both finish the capture and coverage SELECTs before either writes;
both see zero rows. Each then inserts the whole export in its own transaction.
The probe called the actual `load_folder` twice concurrently on a one-record
synthetic file with that query interleaving: both returned `inserted: 1`,
and **two INSERT statements** were issued. The same gap exists if the live
parser loads a selected folder after the guard reads and before the backfill
INSERT. Per-folder transaction atomicity protects against partial writes,
but does not cover the guard reads or provide exclusion between these callers.

A sequential rerun after a successful committed backfill is protected by the
capture check. A live load already committed and visible before the guard
reads is protected by the coverage check. This finding concerns overlapping
execution, not those established sequential cases.

**Change:** serialize overlapping backfill invocations and exclude live
ingestion of selected folders during an apply, or place rechecked guards and
the write inside a section serialized against all relevant writers. Merely
moving the SELECTs into otherwise independent transactions is insufficient
to prevent both callers from observing absence.

This can wait for the authorized one-off operation if only one apply runs and
its selected historical folders are already behind the live parser's pointer.
Verify that condition for the final list, and do not describe these guards as
protection against concurrent loads. If overlapping execution is required,
fix this before applying the backfill.

## Disposition of the other handoff questions

- **Latin-1 and separator restoration:** no finding. The change preserves
  the agreed separator representation; the supplied oracle supports the
  other-byte correction. The added `eventlog_2` cases pass.
- **NUL and indefinite errors:** stopping after a rejected INSERT is the
  agreed policy, and a poison record will indeed repeat until remediated.
  The supplied samples contain no NUL. I would not silently strip it as a
  prerequisite for this patch; keep any future sanitization or quarantine
  explicit and observable. Fixing finding 2 must not replace this error-stop
  behavior with an automatic acknowledgment of rejected input.
- **Folder mtime:** no additional defect found in the current collector
  fetch scripts, which create the directory and fetch the zip into it. The
  planned temporary extraction directory must remain outside the daily
  folder, as the working-tree §7.3 now requires. The replacement collector
  implementation still needs its own review.
- **Skip and genuinely blank files:** moving their pointers is the agreed
  behavior. Finding 2 concerns nonblank rejected input. Starting a system
  with no pointer at its newest folder is also explicitly preserved by design.
- **Capture age and repeat loads:** the zip-mtime and 24-hour guards keep the
  backfill outside the alert window. The capture/coverage guards protect the
  sequential cases above; they do not resolve finding 3. The acknowledged May
  partition failures remain an operational limitation, not a new finding.
- **LOD rereads and raw `saved_files`:** unchanged as agreed; neither is
  proposed for expansion in this review.
