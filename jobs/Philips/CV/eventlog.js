const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const fs = require("node:fs");
const readline = require("readline");
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
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat, war }
} = require("../../../utils/logger/enums");

const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

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

  const unfiltered_dirs_arr = dir_list.split(" ");

  const daily_re = /daily_\d{4}_\d{2}_\d{2}|daily_\d{4}\d{2}\d{2}/;

  const filtered_dirs_arr = [];
  for (let dir of unfiltered_dirs_arr) {
    const matching_file = daily_re.test(dir);
    if (matching_file) {
      dir = dir.trim();
      filtered_dirs_arr.push(dir);
    }
  }

  // RETURN FROM RPP FUNCTION IF THERE ARE NO daily DIRECTORIES
  if (!filtered_dirs_arr.length) {
    let note = {
      id: sme,
      message: "THERE ARE NO DAILY DIRECTORIES ON DEBIAN FOR THIS SYSTEM"
    };
    await addLogEvent(I, run_log, "phil_cv_eventlog", war, note, null);
    return null;
  }

  let files_to_parse = [];
  // if !previous_daily_file BLOCK WILL RUN IF NO REFERENCE TO A DAILY DIRECTORY IN REDIS: NEW SYSTEM STATE
  if (!previous_daily_file) {
    files_to_parse.push(filtered_dirs_arr[filtered_dirs_arr.length - 1].trim());
  }
  // IF REDIS REFERENC: BUILD ARRAY OF DIRECORIES THAT NEED TO BE ACCESSED AND PARSED. COULD BE A SINGLE NEW DIR OR MORE THAN ONE
  else {
    for (let i = filtered_dirs_arr.length - 1; i >= 0; i--) {
      if (previous_daily_file === filtered_dirs_arr[i]) {
        break;
      } else {
        files_to_parse.unshift(filtered_dirs_arr[i]);
      }
    }
  }

  // TRACK LAST DIR/INDEX TO THEN SAVE THE LAST FILE IN log.saved_files
  let index = 0;

  for await (let file of files_to_parse) {
    // data ARRAY HOLDS ALL PARSED DATA TO INSERT INTO TABLE
    const data = [];
    // memo_data: HOLDS EXTRACTED 'Power-On hours' and 'Commercial Version' DATA TO INSERT INTO logfile_event_history_metadata TABLE
    const memo_data = [];
    // isLast: SET TO true IF LAST ITER OF ARRAY OF DIRECTORIES
    let isLast = index === files_to_parse.length - 1;

    const complete_file_path = `${sysConfigData.debian_server_path}/${file}/${file_config.file_name}`;

    let note = {
      job_id,
      id: sme,
      dir: file,
      path: complete_file_path
    };

    try {
      await addLogEvent(I, run_log, "phil_cv_eventlog", cal, note, null);

      // ENSURE FILE EXISTS
      if (!fs.existsSync(complete_file_path)) {
        let note = {
          job_id,
          id: sme,
          file: file_config.file_name,
          path: complete_file_path,
          message: "File not found"
        };
        await addLogEvent(W, run_log, "phil_cv_eventlog", war, note, null);
        return;
      }

      // CREATE READLINE INTERFACE TO PROCESS A FILE LINE-BY-LINE: PREVENTS LOADING FILE ENTIRELY INTO MEMORY
      let rl;
      rl = readline.createInterface({
        input: fs.createReadStream(complete_file_path),
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        let matches = line.match(philips_re.cv[parsers[0]]);
        if (matches === null) {
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
          matches.groups.system_id = sme;

          const dtObject = await generateDateTime(
            job_id,
            matches.groups.system_id,
            file_config.pg_tables[0],
            matches.groups.host_date,
            matches.groups.host_time,
            sysConfigData.time_zone_id
          );

          // CHECK FOR null DATETIME VALUES
          if (dtObject === null) {
            let note = {
              job_id,
              id: sme,
              line,
              match_group: matches.groups,
              message: "datetime object null"
            };
            await addLogEvent(W, run_log, "phil_cv_eventlog", det, note, null);
          }

          matches.groups.capture_datetime = capture_datetime;
          matches.groups.host_datetime = dtObject;

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

      // UPDATE: alert.offline_hhm_conn TABLE WITH HOST_DATETIME
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

      index++;
    } catch (error) {
      console.log(error);
      await addLogEvent(E, run_log, "phil_cv_eventlog", cat, note, error);
    }
  }
}

module.exports = phil_cv_eventlog;
