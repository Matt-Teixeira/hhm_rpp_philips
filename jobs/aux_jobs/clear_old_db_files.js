"use strict";

// RETENTION FOR log.saved_files (RAW PHILIPS MACHINE-FILE BLOBS).
//
// HISTORY: THE OLD MONOLITHIC SERVER RAN THIS EVERY 30 MINUTES AS
// `cd /home/prod/hhm_rpp && npm run delete_old_db_files`. THE CRON LINE WAS
// LOST IN THE hhm_rpp -> ge/philips/siemens SPLIT AND THE TABLE GREW TO
// ~141 GB (AUDIT DB-05). 48-HOUR RETENTION CONFIRMED STILL CORRECT 2026-08-18.
//
// THE PREVIOUS IMPLEMENTATION WAS ONE UNBOUNDED `DELETE ... WHERE
// capture_datetime < NOW() - '48 hours'` WRAPPED IN A try/catch THAT SWALLOWED
// THE ERROR. AGAINST A 40-DAY BACKLOG THAT IS A MULTI-HOUR, MULTI-HUNDRED-GB
// SINGLE TRANSACTION THAT REPORTS SUCCESS WHEN IT FAILS. THIS VERSION:
//
//   * DELETES IN SMALL BATCHES, EACH ITS OWN COMMITTED TRANSACTION, DRIVEN BY
//     THE INDEXED capture_datetime COLUMN (idx_capture_datetime_desc).
//   * SETS lock_timeout / statement_timeout PER BATCH SO IT CAN NEVER PARK ON
//     A LOCK OR RUN AWAY PAST ITS 30-MINUTE CADENCE.
//   * TAKES A SESSION-LEVEL POSTGRES ADVISORY LOCK FOR THE WHOLE RUN SO TWO
//     OVERLAPPING CRON FIRINGS (OR A CONCURRENT ops/backlog-purge.sh) CANNOT
//     BOTH GRIND THE SAME TOAST PAGES. A RUN THAT CANNOT TAKE THE LOCK IS
//     `skipped`, NOT FAILED.
//   * AWAITS ITS OWN LOG EVENTS AND RETHROWS ON FAILURE SO index.js's
//     run_outcome/v1 CONTRACT SEES THE TRUTH (NO SWALLOWED ERRORS, NO EARLY
//     RETURN BEFORE LOGGING).

const db = require("../../utils/db/pg-pool");
const [addLogEvent] = require("../../utils/logger/log");
const {
    type: { I, W, E },
    tag: { cal, det, cat },
} = require("../../utils/logger/enums");

// SHARED WITH ops/backlog-purge.sh. DERIVED ONCE SO IT CANNOT COLLIDE WITH
// ANOTHER APP'S KEY:  SELECT hashtext('log.saved_files:retention'); -> 1248760002
const ADVISORY_LOCK_KEY = 1248760002;

const num = (raw, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

// RETENTION IS 48 HOURS (OWNER-CONFIRMED). EVERYTHING IS ENV-OVERRIDABLE SO AN
// OPERATOR CAN THROTTLE A CATCH-UP RUN WITHOUT EDITING CODE.
const RETENTION_HOURS = num(process.env.SAVED_FILES_RETENTION_HOURS, 48);
// ~381 kB OF TOAST PER ROW, SO 500 ROWS IS ~190 MB OF TOAST PAGES PER
// TRANSACTION -- WELL UNDER max_wal_size (1 GB) AND ~10-20 s OF WORK.
const BATCH_SIZE = num(process.env.SAVED_FILES_PURGE_BATCH, 500);
// CEILINGS SO A RUN CAN NEVER OUTLAST ITS OWN 30-MINUTE SCHEDULE.
const MAX_BATCHES = num(process.env.SAVED_FILES_PURGE_MAX_BATCHES, 40);
const DEADLINE_MS = num(process.env.SAVED_FILES_PURGE_DEADLINE_MS, 10 * 60 * 1000);
const LOCK_TIMEOUT = process.env.SAVED_FILES_PURGE_LOCK_TIMEOUT || "5s";
const STATEMENT_TIMEOUT = process.env.SAVED_FILES_PURGE_STATEMENT_TIMEOUT || "120s";

// ctid IS RESOLVED AND THE ROWS LOCKED INSIDE THE SAME STATEMENT, SO IT IS SAFE
// HERE. SKIP LOCKED MEANS A CONCURRENT DELETER PICKS DISJOINT ROWS INSTEAD OF
// BLOCKING (BELT AND BRACES BEHIND THE ADVISORY LOCK).
const BATCH_SQL = `
WITH victims AS (
    SELECT ctid
    FROM log.saved_files
    WHERE capture_datetime < now() - make_interval(hours => $1)
    ORDER BY capture_datetime
    LIMIT $2
    FOR UPDATE SKIP LOCKED
), deleted AS (
    DELETE FROM log.saved_files t
    USING victims v
    WHERE t.ctid = v.ctid
    RETURNING 1
)
SELECT count(*)::int AS rows_deleted FROM deleted`;

const REMAINING_SQL = `
SELECT count(*)::bigint AS remaining
FROM log.saved_files
WHERE capture_datetime < now() - make_interval(hours => $1)`;

const delete_old_db_files = async (run_log) => {
    const config = {
        retention_hours: RETENTION_HOURS,
        batch_size: BATCH_SIZE,
        max_batches: MAX_BATCHES,
        deadline_ms: DEADLINE_MS,
        lock_timeout: LOCK_TIMEOUT,
        statement_timeout: STATEMENT_TIMEOUT,
    };
    await addLogEvent(I, run_log, "delete_old_db_files", cal, config, null);

    const started_at = Date.now();
    let rows_deleted = 0;
    let batches = 0;
    let got_lock = false;
    let hit_ceiling = null;
    let remaining = null;

    try {
        // db.task() RESERVES ONE CONNECTION FOR THE WHOLE CALLBACK. THAT IS
        // LOAD-BEARING: A SESSION-LEVEL ADVISORY LOCK ONLY GUARDS ANYTHING IF
        // EVERY BATCH RUNS ON THE CONNECTION THAT HOLDS IT. DO NOT DEMOTE THIS
        // TO BARE db.tx()/db.one() CALLS AGAINST THE POOL.
        await db.task("saved_files_retention", async (t) => {
            got_lock = await t.one(
                "SELECT pg_try_advisory_lock($1) AS locked",
                [ADVISORY_LOCK_KEY],
                (r) => r.locked
            );

            if (!got_lock) {
                // ANOTHER RETENTION RUN (CRON PILE-UP OR ops/backlog-purge.sh)
                // OWNS THE TABLE. THAT IS NORMAL, NOT AN ERROR: SKIP AND EXIT 0.
                await addLogEvent(
                    W,
                    run_log,
                    "delete_old_db_files",
                    det,
                    {
                        txt: "advisory lock held by another retention run; skipping",
                        advisory_lock_key: ADVISORY_LOCK_KEY,
                    },
                    null
                );
                run_log.outcome = "skipped";
                return;
            }

            try {
                while (batches < MAX_BATCHES) {
                    if (Date.now() - started_at >= DEADLINE_MS) {
                        hit_ceiling = "deadline_ms";
                        break;
                    }

                    // ONE BATCH == ONE COMMITTED TRANSACTION. SET LOCAL SCOPES
                    // THE TIMEOUTS TO IT, SO A WEDGED BATCH DIES INSTEAD OF
                    // HOLDING ROW LOCKS ACROSS THE WHOLE RUN.
                    const deleted = await t.tx(async (tx) => {
                        await tx.none("SET LOCAL lock_timeout = $1", [LOCK_TIMEOUT]);
                        await tx.none("SET LOCAL statement_timeout = $1", [
                            STATEMENT_TIMEOUT,
                        ]);
                        return tx.one(
                            BATCH_SQL,
                            [RETENTION_HOURS, BATCH_SIZE],
                            (r) => r.rows_deleted
                        );
                    });

                    batches += 1;
                    rows_deleted += deleted;

                    // A SHORT BATCH MEANS THE BACKLOG IS DRAINED FOR THIS RUN.
                    if (deleted < BATCH_SIZE) break;
                }

                if (batches >= MAX_BATCHES && hit_ceiling === null) {
                    hit_ceiling = "max_batches";
                }

                remaining = Number(
                    await t.one(REMAINING_SQL, [RETENTION_HOURS], (r) => r.remaining)
                );
            } finally {
                // SESSION-LEVEL LOCKS SURVIVE THE CONNECTION GOING BACK TO THE
                // POOL -- RELEASING IS MANDATORY, NOT HOUSEKEEPING. (pg_advisory_unlock
                // RETURNS A boolean ROW, SO THIS MUST BE one(), NOT none().)
                await t.one("SELECT pg_advisory_unlock($1) AS unlocked", [ADVISORY_LOCK_KEY]);
            }
        });
    } catch (error) {
        // FAIL LOUDLY: RECORD WHAT WE GOT THROUGH, THEN RETHROW SO onBoot MARKS
        // THE RUN failed AND THE PROCESS EXITS 1. NEVER SWALLOW.
        await addLogEvent(
            E,
            run_log,
            "delete_old_db_files",
            cat,
            {
                rows_deleted: rows_deleted,
                batches: batches,
                duration_ms: Date.now() - started_at,
            },
            error
        );
        throw error;
    }

    const duration_ms = Date.now() - started_at;

    if (got_lock && hit_ceiling !== null) {
        // NOT A FAILURE (THE NEXT :18/:48 RUN CONTINUES), BUT IT MUST BE VISIBLE:
        // A STANDING BACKLOG MEANS RETENTION IS NOT KEEPING UP.
        await addLogEvent(
            W,
            run_log,
            "delete_old_db_files",
            det,
            {
                txt: `stopped on ${hit_ceiling} with rows still older than retention`,
                ceiling: hit_ceiling,
                rows_deleted: rows_deleted,
                batches: batches,
                remaining: remaining,
            },
            null
        );
    }

    await addLogEvent(
        I,
        run_log,
        "delete_old_db_files",
        det,
        {
            skipped: !got_lock,
            rows_deleted: rows_deleted,
            batches: batches,
            remaining: remaining,
            duration_ms: duration_ms,
            retention_hours: RETENTION_HOURS,
        },
        null
    );

    console.log(
        `[saved_files] ${got_lock ? "purged" : "skipped (lock busy)"}` +
            ` rows=${rows_deleted} batches=${batches}` +
            ` remaining=${remaining === null ? "n/a" : remaining}` +
            ` ms=${duration_ms}`
    );

    return { rows_deleted, batches, remaining, skipped: !got_lock };
};

module.exports = delete_old_db_files;
