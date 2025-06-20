// Database
const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

// Node utils
const fs = require("node:fs");
const readline = require("readline");

// App utils
const { philips_re } = require("../../../parse/parsers");
const mapDataToSchema = require("../../../persist/map-data-to-schema");
const { philips_cv_eventlog_schema } = require("../../../persist/pg-schemas");
const { blankLineTest } = require("../../../util/regExHelpers");
const { getLastModifiedTime } = require("../../../util/isFileModified");
const {
  getCurrentFileSize,
  getRedisFileSize,
  updateRedisFileSize,
  push_file_dt_queue
} = require("../../../redis/redisHelpers");
const generateDateTime = require("../../../processing/date_processing/generateDateTimes");
const { gzip_n_save } = require("../../../util");
const { dt_now } = require("../../../util/dates");

// Logger
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat }
} = require("../../../utils/logger/enums");

async function phil_cv_lod_eventlog(
  job_id,
  sysConfigData,
  file_config,
  run_log
) {
  const capture_datetime = dt_now();
  const sme = sysConfigData.id;
  const parsers = file_config.parsers;

  const updateSizePath = "./read/sh/readFileSize.sh";
  const fileSizePath = "./read/sh/readFileSize.sh";

  const data = [];

  // Extract 'Power-On hours' and 'Commercial Version' data from log file
  const memo_data = [];

  const complete_file_path = `${sysConfigData.debian_server_path}/${file_config.file_name}`;

  let note = {
    job_id,
    sme,
    file: file_config.file_name,
    path: complete_file_path
  };

  try {
    await addLogEvent(I, run_log, "phil_cv_lod_eventlog", cal, note, null);

    if (!fs.existsSync(complete_file_path)) {
      let note = {
        job_id,
        sme,
        file: file_config.file_name,
        path: complete_file_path,
        message: "File not found"
      };
      await addLogEvent(W, run_log, "phil_cv_lod_eventlog", det, note, null);
      return;
    }

    const last_mod = (
      await getLastModifiedTime(complete_file_path)
    ).toISOString();

    const file_metadata = {
      system_id: sme,
      file_name: file_config.file_name,
      last_mod,
      source: "hhm"
    };

    const prevFileSize = await getRedisFileSize(
      sme,
      file_config.file_name,
      run_log
    );

    // START: Check Redis delta. Delta === 0 if file not rotated (previously parsed data)
    const currentFileSize = await getCurrentFileSize(
      sme,
      fileSizePath,
      sysConfigData.debian_server_path,
      file_config.file_name,
      run_log
    );

    const delta = currentFileSize - prevFileSize;

    note.current_file_size = currentFileSize;
    note.delta = delta;

    await addLogEvent(I, run_log, "phil_cv_lod_eventlog", det, note, null);

    if (delta === 0) {
      let note = {
        job_id,
        sme,
        file: file_config.file_name,
        delta: delta,
        message: "Same file size. Do not parse"
      };
      await addLogEvent(I, run_log, "phil_cv_lod_eventlog", det, note, null);
      //await update_file_mod_dt(file_metadata);
      await push_file_dt_queue(run_log, file_metadata);
      return;
    }

    // END: Check Redis delta

    // Save LOD File to DB
    await gzip_n_save(
      job_id,
      run_log,
      sme,
      file_config.file_name,
      capture_datetime,
      complete_file_path
    );

    // rl is set conditionaly. Holds file data
    let rl;
    // prevFileSize will be null if it is new system (first time running rpp).
    // prevFileSize will be 0 if log has rotated.
    // In both scenarios, read and parse entire file.
    if (prevFileSize === null || prevFileSize === 0 || delta !== 0) {
      rl = readline.createInterface({
        input: fs.createReadStream(complete_file_path),
        crlfDelay: Infinity
      });
    }

    /*     Old condition prior to node data acquisition app
    if (prevFileSize > 0 && prevFileSize !== null) {
      const currentFileSize = await getCurrentFileSize(
        sme,
        fileSizePath,
        sysConfigData.hhm_config.file_path,
        file_config.file_name
    );

      const delta = currentFileSize - prevFileSize;
      

      if (delta === 0) {
        
        return;
      }

      let headDelta = await execHead(headPath, delta, complete_file_path);

      rl = headDelta.toString().split(/(?:\r\n|\r|\n)/g);
    } 
    */

    for await (const line of rl) {
      let matches = line.match(philips_re.cv[parsers[0]]);
      if (matches === null) {
        const isNewLine = blankLineTest(line);
        if (isNewLine) {
          continue;
        } else {
          let note = {
            job_id,
            sme: sme,
            file: file_config,
            line,
            message: "NO MATCH FOUND"
          };
          await addLogEvent(
            W,
            run_log,
            "phil_cv_lod_eventlog",
            det,
            note,
            null
          );
        }
      } else {
        matches.groups.system_id = sme;

        const dtObject = await generateDateTime(
          job_id,
          matches.groups.system_id,
          file_config.pg_tables[0],
          matches.groups.host_date,
          matches.groups.host_time,
          sysConfigData.time_zone_id
        );

        if (dtObject === null) {
          let note = {
            job_id,
            sme: sme,
            line,
            match_group: matches.groups,
            message: "datetime object null"
          };
          await addLogEvent(
            W,
            run_log,
            "phil_cv_lod_eventlog",
            det,
            note,
            null
          );
        }

        matches.groups.capture_datetime = capture_datetime;
        matches.groups.host_datetime = dtObject;

        matches.groups.lod = true;

        data.push(matches.groups);
        if (matches.groups.memo !== "") {
          memo_data.push({
            system_id: matches.groups.system_id,
            memo: matches.groups.memo,
            host_datetime: matches.groups.host_datetime
          });
        }
      }
    }

    // homogenize data to prep for insert to db
    const mappedData = mapDataToSchema(data, philips_cv_eventlog_schema);

    // console.log("\nmappedData - philips_cv");
    // console.log(sme);
    // console.log(mappedData[mappedData.length - 1]);

    // ** End Parse

    // ** Begin Persist

    const data_query = pgp.helpers.insert(
      mappedData,
      pg_cs.log.philips.philips_cv_eventlog
    );

    await db.any(data_query);

    const ref_query = `INSERT INTO log.lod_reference(system_id, capture_datetime) VALUES($1, $2)`;

    await db.any(ref_query, [sme, capture_datetime]);

    // ** End Persist

    note.number_of_rows = mappedData.length;
    note.first_row = mappedData[0];
    note.last_row = mappedData[mappedData.length - 1];
    note.message = "Successful Insert";

    await addLogEvent(I, run_log, "phil_cv_lod_eventlog", det, note, null);

    // Update Redis Cache
    await updateRedisFileSize(
      sme,
      updateSizePath,
      sysConfigData.debian_server_path,
      file_config.file_name,
      run_log
    );

    // insert metadata
    //if (memo_data.length > 0) await extract(job_id, memo_data, run_log);

    // Update file_dt
    //await update_file_mod_dt(file_metadata);
    await push_file_dt_queue(run_log, file_metadata);
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "phil_cv_lod_eventlog", cat, note, error);
  }
}

module.exports = phil_cv_lod_eventlog;
