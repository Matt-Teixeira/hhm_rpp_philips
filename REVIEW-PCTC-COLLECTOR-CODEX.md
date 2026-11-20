Review of `aca5b3d` on `hhm_data_acquisition/DEV` — 2026-11-20.

The handoff and commit are in the adjacent `hhm_data_acquisition` repository. This report is in `hhm_rpp_philips`, as requested after that workspace mismatch was identified. Source references below are relative to `hhm_data_acquisition` unless explicitly prefixed with `hhm_rpp_philips`.

**Result: four new findings — P1: 1, P2: 2, P3: 1.** A separate, confirmed pre-existing P1 failure path is described below and excluded from those counts. No new CSV-dialect or dash-syntax bug, or new credential leak through the normal application logging path, was established.

**New correctness findings, most severe first**

**F1 — P1: an orphaned download can overwrite the next grab's staging directory.** `read/sh/Philips/phil_ct_data_grab_1.sh:48`, together with lines 38–44.

The entire `lftp` process has fd 9 closed, although it writes into the fixed, shared `.incoming` directory. If the collector shell is terminated while `lftp` survives, the lock is released while that writer is still active. The next grab acquires the lock, removes and recreates `.incoming`, and starts its own download. The orphan can subsequently open or replace `Logger.mdb` through the same pathname. The second grab can export the wrong database, or read one while another process is modifying it. That defeats both the lock and the intended staging isolation and can break ingest or discard a newer downloaded snapshot.

Reproduced with two stubbed grabs and explicit coordination: terminate shell A while its `lftp` stub waits; start B and let it write database marker B; release A to write marker A through its saved staging pathname; let B finish. B exits 0 and publishes marker A. The experiment also confirmed that `lftp` lacks fd 9 while `mdb-export` inherits it. This does not require a scanner or network connection.

Suggested fix: use a private staging directory per invocation, for example `mktemp -d "$4/.incoming.XXXXXX"`, and only clean up that invocation's directory. Alternatively, keep the lock in the active `lftp` writer and close it specifically in the SSH child through a verified wrapper. Closing it for all of `lftp` is too broad. A TERM trap alone would not cover SIGKILL or guarantee descendant termination.

**F2 — P2: skipped grabs and lock-operation failures become successful acquisitions.** `read/sh/Philips/phil_ct_data_grab_1.sh:33–35`; dependent behavior at `read/exec-hhm_data_grab.js:144–154`.

On contention, the script exits 0 with stderr that matches no connection regex. The runner therefore queues `successful_acquisition: true`, even though this invocation downloaded nothing. If the holder later fails or remains stuck, overlapping runs still report success. In addition, `if ! flock -n 9` treats every nonzero status as contention: a missing `flock`, unsupported locking, or another lock-operation error suppresses acquisition and takes the same success path indefinitely.

Reproduced an operational lock failure using a stub returning 69: no outputs changed and the collector exited 0 with the contention message. A locally mocked execution of the actual runner confirmed that the skip message produces an online-queue entry with `successful_acquisition: true`.

Suggested fix: preserve and inspect `flock`'s status, distinguishing its contention status from execution/locking errors. Fail operational errors. Give genuine skips an explicit outcome understood by the runner so they do not assert a fresh successful acquisition; a generic nonzero status without corresponding runner handling would merely move skips into its error logger.

**F3 — P2, conditional on reader permissions: atomic replacement discards existing output access permissions.** `read/sh/Philips/phil_ct_data_grab_1.sh:98`; staged files are created at lines 76 and 86.

The previous script truncated existing `.output` files and retained their mode, owner, group and ACL. The new script replaces them with newly created staging files. If the collector has umask 077 and existing outputs are 0644 for a parser running as another account, a successful grab replaces them with 0600 files. The parser then cannot read its input even though collection reports success. Other preconfigured group/ACL arrangements can suffer the same regression. The explicit chmod applies only to `Logger.mdb`.

Reproduced with synthetic files initially mode 0644 and umask 077: the old script retained 0644 for both legacy exports; the new script published both as 0600. Whether production relies on cross-account access was not inspected or established; this finding applies when it does.

Suggested fix: establish the required reader access on staged outputs before publishing, using the deployment's intended mode/group/ACL policy or carefully preserving existing access metadata. Do not rely on the collector's ambient umask. Add a permission regression check with an existing readable output and a restrictive umask.

**F4 — P3: a publish failure incorrectly claims the previous outputs were kept.** `read/sh/Philips/phil_ct_data_grab_1.sh:63`, as called from lines 96–98.

If publishing `Logger.mdb` and `EALInfo.output` succeeds but publishing `Events.output` fails, `fail()` reports “previous outputs kept.” In fact, the database and one output have already changed, and the EXIT trap deletes the remaining staged exports. This gives operators an incorrect recovery state after a real I/O or rename failure. Independent parser offsets make a mixed legacy pair tolerable; they do not make this diagnostic true.

Reproduced by failing only the move to `Events.output`: exit 1, the preservation message, and changed `Logger.mdb` plus `EALInfo.output`.

Suggested fix: distinguish failures before publication from failures after publication has begun. Report that publication is partial and identify the failed file. Retain the uninstalled generation for recovery if that is part of the operational policy. A generation-directory switch would be needed if publication of the entire set must eventually be atomic.

**Confirmed inherited correctness issue, excluded from new-finding counts**

**R1 — P1 when triggered: failed legacy transformations can still replace usable parser input.** `read/sh/Philips/phil_ct_data_grab_1.sh:84` and `:87`.

The script checks `mdb-export` and the CSV `tr` commands, but it does not check either legacy transformation pipeline or its header writes. An upstream pipeline failure is hidden by dash's last-command status; even the final command's status is not tested here. For example, a `sort` failure caused by unavailable scratch space or resource exhaustion can leave header-only legacy files while the CSV exports succeed. The publish loop then replaces good legacy files and exits 0. The current production parser still reads those legacy files.

A `sort` stub that consumed stdin and exited 2 reproduced exactly that result: both legacy outputs contained only their headers, all published files were replaced, and the collector exited 0. This unchecked-pipeline behavior also exists in the parent commit; it is not an introduced regression. It nevertheless limits the new guarantee that failed exports preserve the old outputs.

Suggested fix: retain the same transformations but execute them through checked intermediate files, checking every command and redirection before publishing. Adding `|| fail` only to the end of a pipeline cannot detect its earlier failures under dash. Similarly, `mdb-tables` is piped through `sed` without checking its own status; nonempty stdout alone does not prove that command succeeded.

**Answers to the seven “Please look hard at” questions**

1. **Agree, with a narrow scope.** Each successful same-filesystem rename provides a complete individual file. The current legacy parsers maintain separate file cursors and do not require `EALInfo.output` and `Events.output` to represent one acquisition generation. A mixed pair is therefore not itself a new cross-file correctness bug. This is not a transaction over the database and four exports, does not justify the preservation message after a partial publish (F4), and should not automatically become the consistency contract for a future CSV reader.

2. **Agree about descriptor lifetime and inode replacement; qualify the broader safety claim.** In `hhm_rpp_philips/data_acquisition/Philips_CT.js:188`, reads use `fs.readFile` by pathname; lines 232–236 launch a new tail command. `read/sh/tail.sh:9` opens that pathname for that invocation. No descriptor retained across scheduled grabs was found. A reader already holding the old inode can finish reading it after a rename. However, size measurement, reading and cursor advancement are separate path-based operations: `redis/redisHelpers.js:42–49` re-reads the current file size when updating the cursor. Publication between those steps can still cause cursor/snapshot races. Those races also existed with the old whole-file rewrite and are not a new finding here. Unchanged bytes do not establish permission compatibility; see F3.

3. **Disagree with the overall lock-safety conclusion.** `flock` on the dedicated lock file is advisory and does not impede the parser reading other files in the directory. Other external commands inherit fd 9, including the export and transformation processes and cleanup commands; they ordinarily release it on exit. Closing it for `lftp` also closes it for SSH descendants, but leaves an active staging writer unprotected after shell termination (F1). Exit 0 on contention produces a false fresh-acquisition signal in this runner, and operational lock errors are conflated with contention (F2).

4. **Unsure about actual Cygwin SFTP behavior and latency; local command syntax agrees with the handoff.** Real installed lftp 4.8.4 with `--norc` and only `file://` successfully handled `cd … && cls -l > …; mget …; exit`. I also confirmed that a listing command or listing-redirection failure can be followed by a successful download and exit 0. Thus the listing is best effort in that sequence, but its stderr is not isolated from acquisition classification. Feeding a synthetic listing timeout followed by successful download into the actual mocked runner sent the system to the reset queue, because `util/tools/connection_regex.js:19`/`:28` match the earlier diagnostic. Whether that transient sequence occurs on these servers remains unverified; it is a test gap, not an additional counted finding. A directory listing can involve multiple protocol requests and scales with directory size; the per-operation network timeout is not an overall acquisition deadline. Extra latency is plausible, especially if old databases accumulate. No remote server was contacted.

5. **Agree for the documented dialect, with a decoder requirement.** The installed `mdb-export --help` documents default quote doubling and `-e` escaping CR, LF, tab and backslash. That distinguishes a literal backslash followed by `n` from an actual newline. The future reader must first parse the CSV quoting, then perform one left-to-right unescape pass over each field. Repeated replacement passes can turn a literal backslash-plus-`n` into a newline incorrectly; treating backslash as a general CSV quote-escape character would also be wrong. Include literal backslashes, doubled quotes, tabs, CRLF and adjacent escapes in parser tests. “Complete” means all rows with the explicitly documented NUL removal and BLOB omission, not a byte-for-byte preservation of every database value. I did not independently rerun the handoff's real-data equivalence evidence.

6. **Agree on dash portability.** `exec 9>`, fd closure, `trap … EXIT`, the function used in `||` lists, and the final `[ … ] && mv` followed by explicit `exit 0` are accepted by the stated dash environment. Bare `exit` after the successful timeout `echo` retains status 0 as intended. `sh -n` passes, and the local experiments exercised those paths using `/bin/sh`. Missing pipeline-status checks are a semantic issue (R1), not a reason to assume bash `pipefail`. An EXIT trap also does not guarantee cleanup after signal termination; F1 explicitly exercised that case.

7. **Agree that the listed behaviors predate this commit.** The legacy `tr` operand, URL/argv credential exposure, and synthetic timeout plus exit 0 for a nonzero `lftp` result are retained. They are not counted as new findings. The normal application's error logging now matters more because exports can fail with status 1: inspection confirmed credential registration in `util/encrypt/index.js`, console guarding at `index.js:4–5`, and run-log scrubbing through `util/flush_run_log.js:9–14`. The catch branch logs the raw exec error, but the normal entrypoint's sinks provide the described redaction. I did not inspect or execute any production deployment, so I cannot attest that its copies are identical. No actual credential is included in this report or the experiment fixtures.

**Test gaps**

The permitted Jest suite passes 10/10, and `sh -n` passes. These checks do not cover the following plausible regressions or failure states:

- Terminating the collector shell while a download survives, followed by a second grab (F1). The contention test holds an external lock; it does not exercise descriptor lifetime or shared staging after termination.
- The runner's queue behavior for a skip or a lock-operation error (F2). Testing only `extractConnectionError(...) === null` does not establish an appropriate acquisition result. Unexpected `flock` statuses and a missing executable are untested.
- Output mode/group/ACL preservation (F3), or a restrictive collector umask.
- A failed move after some files have been published, and the actual on-disk state and diagnostic afterward (F4). No publish failure is injected in the Jest suite.
- Failed `sort`, `awk`, `sed`, `tail`, header writes, or a failing `mdb-tables` that emits partial plausible stdout (R1). Checked CSV `tr` failures are also untested.
- Exact legacy Events equivalence. At test lines 118–121, the only data-row assertion uses `every` after filtering: an export with zero data rows passes vacuously. Missing or altered Events rows can therefore survive the suite. Assert the entire expected legacy fixture, including a nonempty row count. The EAL check covers only its first data row.
- Actual `mdb-export` option behavior. The stub distinguishes CSV mode solely by `$1 === '-e'`; omitting `-b strip` or changing/removing `-T` would still return the canned expected CSV. Assert the full argv, and retain a separate synthetic-MDB integration fixture if one can be created safely.
- CSV fields containing literal backslash-plus-`n`, embedded quotes, CRLF, tabs, adjacent escapes, empty text versus NULL, and non-ASCII text. The present newline example and NUL stripping check do not validate those cases.
- A listing failure or slow listing followed by successful download, especially stderr that matches a connection regex. The lftp stub copies command text but does not execute lftp's control flow.
- Failure of only the second table export within each mode. Existing failure injection stops at the first export of the selected mode, leaving the later checked calls unexercised.

**Handoff claims that need correction or qualification**

The publish-failure row's “previous outputs kept” claim is false after an earlier successful move (F4). Before publication, ordinary checked download/export failures do preserve published contents; failed legacy transformations are an uncovered exception to the broader export guarantee (R1).

The lock discussion overlooks the surviving `lftp` writer once fd 9 is closed (F1), and a skipped grab is recorded as a successful acquisition rather than merely a harmless no-op (F2). The latter runner mapping is accurately described by the handoff, but I disagree that it is the right acquisition signal.

A successful download does not guarantee empty stderr. Listing failures can leave diagnostics even when lftp exits 0; matching those diagnostics can change the runner outcome. This is separate from the valid observation that `&&` skips the listing after a failed `cd`.

The disk estimate should distinguish steady-state additions from peak staging requirements. During acquisition the old published files coexist with a second database, two legacy raw exports, two CSV raw exports, both staged legacy outputs and both staged CSV outputs. Peak free-space demand is materially larger than just the two additional final CSVs. I did not verify the numerical steady-state estimate against real data.

The real-data row counts, byte-equivalence results, reachability claims and production redaction deployment claims were not independently verified. They are not contradicted merely because this review used synthetic data.

**Validation and scope**

Executed `npx --no-install jest read/__tests__/phil_ct_data_grab_1.test.js --runInBand` in the target repository: 10 tests passed. Executed `sh -n read/sh/Philips/phil_ct_data_grab_1.sh`: passed. Additional experiments were confined to temporary directories, synthetic data, PATH stubs, a mocked runner with no database/Redis imports, and real lftp using only local `file://` with startup configuration disabled. No scanner or remote host was contacted; nothing under the prohibited production tree was read or executed. No tracked source, unrelated WIP, staging area or commit was changed.
