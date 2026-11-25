// Database
const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

// Node utils
const fs = require("node:fs");

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
// CV-1b (plan §7.2): read as Latin-1, separator restored, PHI masked before matching
const { read_lines, parse_line, safe_head } = require("./decode");
const MAX_NO_MATCH_NOTES = 20;

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

    // The whole file is read whenever its size changed (delta !== 0, checked above): a new system
    // (prevFileSize null), a rotated log (0) or a new on-demand export. Lines are decoded and masked.

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

    let rejected = 0;
    for await (const line of read_lines(complete_file_path)) {
      const groups = parse_line(line, philips_re.cv[parsers[0]]);
      if (groups === null) {
        const isNewLine = blankLineTest(line);
        if (isNewLine) {
          continue;
        } else {
          // NO RAW TEXT IN THE RUN LOG (review CV1B P1): ONLY THE RECORD HEAD AND LENGTH
          rejected++;
          if (rejected <= MAX_NO_MATCH_NOTES) {
            let note = {
              job_id,
              sme: sme,
              file: file_config.file_name,
              record_head: safe_head(line),
              length: line.length,
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
        }
      } else {
        groups.system_id = sme;

        const dtObject = await generateDateTime(
          job_id,
          groups.system_id,
          file_config.pg_tables[0],
          groups.host_date,
          groups.host_time,
          sysConfigData.time_zone_id
        );

        if (dtObject === null) {
          let note = {
            job_id,
            sme: sme,
            match_group: groups,
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

        groups.capture_datetime = capture_datetime;
        groups.host_datetime = dtObject;

        groups.lod = true;

        data.push(groups);
        if (groups.memo !== "") {
          memo_data.push({
            system_id: groups.system_id,
            memo: groups.memo,
            host_datetime: groups.host_datetime
          });
        }
      }
    }

    if (rejected > MAX_NO_MATCH_NOTES) {
      note.message = `NO MATCH FOUND for ${rejected} records (the first ${MAX_NO_MATCH_NOTES} logged)`;
      await addLogEvent(W, run_log, "phil_cv_lod_eventlog", det, { ...note }, null);
    }

    // NO RECORD MATCHED: STOP WITHOUT UPDATING THE REDIS SIZE, SO THE FILE IS READ AGAIN (review CV1B P2)
    if (!data.length) {
      note.message = rejected > 0 ? `All ${rejected} records rejected: not acknowledged` : "No records in file (blank): not acknowledged";
      await addLogEvent(rejected > 0 ? E : W, run_log, "phil_cv_lod_eventlog", cat, note, null);
      return;
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
