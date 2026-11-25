const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const fs = require("node:fs");
const path = require("node:path");
const { philips_re } = require("../../../parse/parsers");
const mapDataToSchema = require("../../../persist/map-data-to-schema");
const { philips_cv_eventlog_schema } = require("../../../persist/pg-schemas");
const { blankLineTest } = require("../../../util/regExHelpers");
const {
  get_last_parsed_daily,
  update_last_parsed_daily
} = require("../../../redis/redisHelpers");
const exec_read_dir = require("../../../read/exec-dir_list");
const generateDateTime = require("../../../processing/date_processing/generateDateTimes");
const extract = require("../../../processing/date_processing/phil_cv/extract_memo_data");
const { dt_now } = require("../../../util/dates");
const { build_upsert_str } = require("../../../util");
const { gzip_n_save } = require("../../../util");
const { read_lines, parse_line } = require("./decode");
const { folders_to_parse, folder_action, WAIT_HOURS } = require("./folders");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat, war }
} = require("../../../utils/logger/enums");

const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

// CV-1b (PLAN-PHILIPS-CV-INSIGHTS.md §7.2): the file is read as Latin-1 and PHI is masked
// (decode.js); folders are taken in date order and the pointer never moves past a folder that has
// no EventLog.txe yet, or one that failed (folders.js).
async function phil_cv_eventlog(job_id, sysConfigData, file_config, run_log) {
  const capture_datetime = dt_now();
  const sme = sysConfigData.id;
  // an array in each config accossiated with a file
  const parsers = file_config.parsers;

  const read_directories_path = "./read/sh/phil_cv_file_list.sh";

  // READ DIRECTORIES IN FILE

  const dir_list = await exec_read_dir(read_directories_path, [
    sysConfigData.debian_server_path
  ]);

  //Get Last daily_dir that was parsed!

  let previous_daily_file = await get_last_parsed_daily(sysConfigData.id); // Some Redis Ref

  const files_to_parse = folders_to_parse(dir_list.split(" "), previous_daily_file);

  // RETURN FROM RPP FUNCTION IF THERE ARE NO NEW daily DIRECTORIES
  if (!files_to_parse.length) {
    if (!dir_list.split(" ").some((d) => /daily_/.test(d))) {
      let note = {
        id: sme,
        message: "THERE ARE NO DAILY DIRECTORIES ON DEBIAN FOR THIS SYSTEM"
      };
      await addLogEvent(I, run_log, "phil_cv_eventlog", war, note, null);
    }
    return null;
  }

  for (let i = 0; i < files_to_parse.length; i++) {
    const file = files_to_parse[i];
    // data ARRAY HOLDS ALL PARSED DATA TO INSERT INTO TABLE
    const data = [];
    // memo_data: HOLDS EXTRACTED 'Power-On hours' and 'Commercial Version' DATA TO INSERT INTO logfile_event_history_metadata TABLE
    const memo_data = [];
    // isLast: THE NEWEST FOLDER OF THIS RUN (ITS FILE IS SAVED TO log.saved_files)
    const isLast = i === files_to_parse.length - 1;

    const folder_path = path.join(sysConfigData.debian_server_path, file);
    const complete_file_path = `${sysConfigData.debian_server_path}/${file}/${file_config.file_name}`;

    let note = {
      job_id,
      id: sme,
      dir: file,
      path: complete_file_path
    };

    try {
      await addLogEvent(I, run_log, "phil_cv_eventlog", cal, note, null);

      // NO EventLog.txe YET: WAIT (STOP, POINTER STAYS) OR, AFTER WAIT_HOURS, SKIP WITH A WARNING
      if (!fs.existsSync(complete_file_path)) {
        const age_hours = (Date.now() - fs.statSync(folder_path).mtimeMs) / 3600000;
        const action = folder_action({ has_txe: false, age_hours });
        let note = {
          job_id,
          id: sme,
          dir: file,
          file: file_config.file_name,
          age_hours: Math.round(age_hours * 10) / 10
        };
        if (action === "wait") {
          note.message = "No EventLog.txe yet: stop, the pointer stays";
          await addLogEvent(I, run_log, "phil_cv_eventlog", det, note, null);
          break;
        }
        note.message = `No EventLog.txe after ${WAIT_HOURS} h: skipped (recoverable with tooling/cv_backfill.js)`;
        await addLogEvent(W, run_log, "phil_cv_eventlog", war, note, null);
        await update_last_parsed_daily(sme, file);
        continue;
      }

      // READ LINE BY LINE AS LATIN-1 (NOT LOADED ENTIRELY INTO MEMORY); LINES ARE DECODED AND MASKED
      for await (const line of read_lines(complete_file_path)) {
        let groups = parse_line(line, philips_re.cv[parsers[0]]);
        if (groups === null) {
          const isNewLine = blankLineTest(line);
          if (isNewLine) {
            continue;
          } else {
            let note = {
              job_id,
              id: sme,
              file: file_config,
              line,
              message: "NO MATCH FOUND"
            };
            await addLogEvent(W, run_log, "phil_cv_eventlog", det, note, null);
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

          // CHECK FOR null DATETIME VALUES
          if (dtObject === null) {
            let note = {
              job_id,
              id: sme,
              line,
              match_group: groups,
              message: "datetime object null"
            };
            await addLogEvent(W, run_log, "phil_cv_eventlog", det, note, null);
          }

          groups.capture_datetime = capture_datetime;
          groups.host_datetime = dtObject;

          data.push(groups);
          if (groups.memo !== undefined && groups.memo !== "") {
            memo_data.push({
              system_id: groups.system_id,
              memo: groups.memo,
              host_datetime: groups.host_datetime
            });
          }
        }
      }

      // A FILE WITH NO RECORDS: NOTHING TO INSERT; MOVE ON
      if (!data.length) {
        note.message = "No records in file";
        await addLogEvent(W, run_log, "phil_cv_eventlog", war, note, null);
        await update_last_parsed_daily(sme, file);
        continue;
      }

      // HOMOGENIZE DATA TO PREP FOR INSERT TO DB
      const mappedData = mapDataToSchema(data, philips_cv_eventlog_schema);

      // ** End Parse

      // ** Begin Persist

      const query = pgp.helpers.insert(
        mappedData,
        pg_cs.log.philips.philips_cv_eventlog
      );

      await db.any(query);

      // ** End Persist

      note.number_of_rows = mappedData.length;
      note.first_row = mappedData[0];
      note.last_row = mappedData[mappedData.length - 1];
      note.message = "Successful Insert";

      await addLogEvent(I, run_log, "phil_cv_eventlog", det, note, null);

      // UPDATE REDIS WITH DIRECTORY THAT WAS JUST PARSED
      await update_last_parsed_daily(sme, file);

      // INSERT METADATA
      if (memo_data.length > 0) await extract(job_id, memo_data, run_log);

      // UPDATE: alert.offline_hhm_conn TABLE WITH HOST_DATETIME (THE FILE IS NEWEST FIRST)
      const resent_host_datetime = mappedData[0].host_datetime;

      const upsert_str = build_upsert_str(sme, resent_host_datetime);

      await db.any(upsert_str);

      // SAVE EventLog.txe FILE TO DB TABLE log.saved_files
      if (isLast) {
        await gzip_n_save(
          job_id,
          run_log,
          sme,
          file_config.file_name,
          capture_datetime,
          complete_file_path
        );
      }
    } catch (error) {
      // STOP THIS SYSTEM'S RUN: NO LATER FOLDER MAY MOVE THE POINTER PAST A FAILED ONE
      console.log(error);
      await addLogEvent(E, run_log, "phil_cv_eventlog", cat, note, error);
      break;
    }
  }
}

module.exports = phil_cv_eventlog;
