("use strict");
require("dotenv").config();
const pgp = require("pg-promise")();
const pgPool = require("./utils/db/pg-pool");
const philips_parser = require("./jobs/Philips");
const update_file_datetimes = require("./jobs/aux_jobs/update_file_datetimes");
const delete_old_db_files = require("./jobs/aux_jobs/clear_old_db_files");
const reset_daily_system_totals = require("./jobs/aux_jobs/reset_daily_system_reset_totals");
const queries = require("./data_acquisition/on_boot_queries");

const [
    addLogEvent,
    writeLogEvents,
    dbInsertLogEvents,
    makeAppRunLog,
    ,
    ,
    ,
    addRunSummary,
] = require("./utils/logger/log");
const {
    type: { I, W, E },
    tag: { cal, det, cat, seq, qaf },
} = require("./utils/logger/enums");
const { v4: uuidv4 } = require("uuid");

// FAIL-LOUDLY EXIT-CODE CONTRACT (see DESIGN.md):
//   0 = success or skipped, 1 = failed (fatal error reached onBoot),
//   2 = partial (tolerated per-system errors) or self-log persistence failure,
//   3 = usage error (unknown run group -> operator must fix the crontab).
const EXIT = { SUCCESS: 0, FAILED: 1, PARTIAL: 2, USAGE: 3 };

// Only Philips is supported now
const determineManufacturer = async (job_id, system, run_log) => {
    let note = {
        job_id: job_id,
        sme: system.id,
    };
    try {
        await addLogEvent(I, run_log, "determineManufacturer", cal, note, null);
        console.log("\nOk, we are here");
        await philips_parser(job_id, system, run_log);
    } catch (error) {
        await addLogEvent(
            E,
            run_log,
            "determineManufacturer",
            cat,
            note,
            error,
        );
    }
};

// DERIVE THE FINAL RUN OUTCOME FROM THE EVENTS THE RUN ACTUALLY RECORDED.
// TOLERATED (PER-SYSTEM) FAILURES WERE CAUGHT BY determineManufacturer'S
// PER-UNIT CATCH (NOTE KEYED ON sme) AND LOGGED AS ERROR EVENTS; A FATAL
// ERROR IS ONE THAT ESCAPED TO onBoot'S CATCH. SEE DESIGN.md ("run_outcome/v1").
const deriveOutcome = (run_log, fatal_error) => {
    const events = run_log.log_events || [];
    const error_events = events.filter((e) => e.type === "ERROR").length;
    const warn_events = events.filter((e) => e.type === "WARN").length;
    const failed_systems = [
        ...new Set(
            events
                .filter((e) => e.type === "ERROR" && e.note)
                .map((e) => e.note.sme || e.note.system_id)
                .filter(Boolean)
        ),
    ];

    let outcome;
    let exit_code;
    if (fatal_error) {
        outcome = "failed";
        exit_code =
            fatal_error.code === "E_UNKNOWN_RUN_GROUP" ? EXIT.USAGE : EXIT.FAILED;
    } else if (error_events > 0) {
        outcome = "partial";
        exit_code = EXIT.PARTIAL;
    } else if (run_log.outcome === "skipped") {
        // JOBS MAY OPT IN: run_log.outcome = "skipped" WHEN THERE WAS NO WORK.
        outcome = "skipped";
        exit_code = EXIT.SUCCESS;
    } else {
        outcome = "success";
        exit_code = EXIT.SUCCESS;
    }

    return {
        outcome: outcome,
        exit_code: exit_code,
        error_events: error_events,
        warn_events: warn_events,
        systems: {
            failed_count: failed_systems.length,
            failed: failed_systems.slice(0, 50),
        },
        fatal: fatal_error
            ? {
                  code: fatal_error.code || null,
                  message: String(fatal_error.message || fatal_error),
              }
            : null,
        contract: "run_outcome/v1",
    };
};

const onBoot = async () => {
    const run_log = await makeAppRunLog();

    let note = {
        LOGGER: process.env.LOGGER,
        REDIS_IP: process.env.REDIS_IP,
        PG_USER: process.env.PG_USER,
        PG_DB: process.env.PG_DB,
        argv: process.argv,
    };

    // EVENT 0'S NOTE SHAPE IS LOAD-BEARING: ops-dashboard DERIVES THIS APP'S
    // JOB LABEL FROM verbose_log->0->'note'->'argv'->>2. DO NOT RESHAPE IT.
    await addLogEvent(I, run_log, "onBoot", cal, note, null);
    console.time();

    let fatal_error = null;
    try {
        let shell_value = [process.argv[2]];

        if (shell_value[0] === "file_dt") {
            // AUX BRANCHES NO LONGER RETURN EARLY: THEY FALL THROUGH TO THE
            // SHARED finally SO EVERY INVOCATION PERSISTS ITS SELF-LOG AND
            // EXITS WITH AN HONEST CODE.
            await update_file_datetimes(run_log);
        } else if (shell_value[0] === "delete_old_files") {
            await delete_old_db_files();
        } else if (shell_value[0] === "reset_daily_system_totals") {
            await reset_daily_system_totals();
        } else {
            let queryString = queries[shell_value];

            if (!queryString) {
                // FAIL LOUDLY: A TYPO'D CRONTAB ENTRY MUST NOT EXIT 0 AS A
                // SILENT NO-OP (PREVIOUSLY THIS FELL INTO pgPool.any(undefined)).
                const err = new Error(
                    `Unknown run group: ${JSON.stringify(process.argv[2])}`
                );
                err.code = "E_UNKNOWN_RUN_GROUP";
                throw err;
            }

            const system_array = await pgPool.any(queryString);

            for await (const system of system_array) {

                system.debian_server_path = `/opt/resources/acqu_files/${system.id}`;

                const job_id = uuidv4();
                await determineManufacturer(job_id, system, run_log);
            }
        }
    } catch (error) {
        fatal_error = error;
        console.error(error);
        await addLogEvent(E, run_log, "onBoot", cat, null, error);
    } finally {
        // 1) DECIDE THE OUTCOME AND SET THE (HONEST) EXIT CODE. NEVER process.exit():
        //    process.exitCode LETS PENDING I/O FLUSH AND THE LOOP DRAIN NATURALLY.
        //    (THE OLD MID-TRY process.exit() WAS THE FLUSH BUG: IT TORE DOWN THE
        //    PROCESS BEFORE THE RUN-LOG WRITE STREAM REACHED DISK.)
        const outcome = deriveOutcome(run_log, fatal_error);
        process.exitCode = outcome.exit_code;

        // 2) APPEND SUMMARY + TERMINAL run_outcome EVENT (type INFO ON PURPOSE:
        //    IT MUST NEVER LAND IN warn_error_logs -- ops-dashboard DERIVES STATUS
        //    AND incident-engine MATERIALIZES INCIDENTS FROM THAT COLUMN).
        await addRunSummary(run_log);
        await addLogEvent(I, run_log, "run_outcome", det, outcome, null);

        // 3) PERSIST THE SELF-LOG, DB FIRST THEN DISK (DISK CAPTURES ANY DB-INSERT
        //    ERROR EVENT). BOTH NOW REPORT FAILURE INSTEAD OF SWALLOWING IT.
        const db_insert_ok = await dbInsertLogEvents(pgp, run_log);
        const disk_write_ok = await writeLogEvents(run_log);
        if (!db_insert_ok || !disk_write_ok) {
            // MONITORING IS BLIND FOR THIS RUN -- NEVER REPORT A CLEAN SUCCESS.
            if (process.exitCode === EXIT.SUCCESS) process.exitCode = EXIT.PARTIAL;
            console.error(
                `[run_outcome] self-log persistence failed (db=${db_insert_ok} disk=${disk_write_ok})`
            );
        }

        console.log(
            `[run_outcome] ${outcome.outcome} exit=${process.exitCode}` +
                ` errors=${outcome.error_events} warns=${outcome.warn_events}` +
                ` failed_systems=${outcome.systems.failed_count}`
        );
        console.timeEnd();

        // 4) RELEASE THE SHARED POOL SO THE EVENT LOOP CAN DRAIN. THIS APP HAS
        //    EXACTLY ONE LIVE POOL (utils/db/pg-pool); PER-CALL REDIS CLIENTS
        //    quit() IN redis/redisHelpers.js.
        try {
            await pgPool.$pool.end();
        } catch (e) {
            console.error(`[run_outcome] utils/db/pg-pool close: ${e.message}`);
        }
        pgp.end();

        // 5) FAILSAFE: IF A LEAKED HANDLE (REDIS CLIENT, CHILD PROCESS) KEEPS THE
        //    LOOP ALIVE, FORCE-EXIT WITH THE SAME HONEST CODE INSTEAD OF HANGING
        //    UNDER CRON. unref() SO THE TIMER ITSELF NEVER HOLDS THE LOOP OPEN.
        const failsafe = setTimeout(() => {
            console.error(
                "[run_outcome] event loop did not drain within 30s; forcing exit"
            );
            process.exit(process.exitCode);
        }, 30_000);
        failsafe.unref();
    }
};

onBoot().catch((error) => {
    // BOOTSTRAP FAILURE (makeAppRunLog / FIRST LOG EVENT): NOTHING WAS RECORDED,
    // SO AT LEAST CRASH HONESTLY.
    console.error(error);
    process.exit(EXIT.FAILED);
});
