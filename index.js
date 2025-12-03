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
] = require("./utils/logger/log");
const {
    type: { I, W, E },
    tag: { cal, det, cat, seq, qaf },
} = require("./utils/logger/enums");
const { v4: uuidv4 } = require("uuid");

// Only Philips is supported now
const determineManufacturer = async (job_id, system, run_log) => {
    let note = {
        job_id: job_id,
        sme: system.id,
    };
    try {
        await addLogEvent(I, run_log, "determineManufacturer", cal, note, null);
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

const onBoot = async () => {
    const run_log = await makeAppRunLog();

    let note = {
        LOGGER: process.env.LOGGER,
        REDIS_IP: process.env.REDIS_IP,
        PG_USER: process.env.PG_USER,
        PG_DB: process.env.PG_DB,
        argv: process.argv,
    };

    try {
        await addLogEvent(I, run_log, "onBoot", cal, note, null);
        console.time();

        let shell_value = [process.argv[2]];

        if (shell_value[0] === "file_dt") {
            await update_file_datetimes(run_log);
            await writeLogEvents(run_log);
            return;
        }

        if (shell_value[0] === "delete_old_files") {
            await delete_old_db_files();
            return;
        }

        if (shell_value[0] === "reset_daily_system_totals") {
            await reset_daily_system_totals();
            return;
        }

        let queryString = queries[shell_value];
        const system_array = await pgPool.any(queryString);

        for await (const system of system_array) {
            const job_id = uuidv4();
            await determineManufacturer(job_id, system, run_log);
        }

        await dbInsertLogEvents(pgp, run_log);
        await writeLogEvents(run_log);

        console.timeEnd();

        process.exit();
    } catch (error) {
        console.log(error);
        await addLogEvent(E, run_log, "onBoot", cat, null, error);
        await dbInsertLogEvents(pgp, run_log);
        await writeLogEvents(run_log);
    }
};

onBoot();
