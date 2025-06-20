const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const { philips_re } = require("../../../parse/parsers");
const mapDataToSchema = require("../../../persist/map-data-to-schema");
const { phil_mri_logcurrent_schema } = require("../../../persist/pg-schemas");
const { blankLineTest } = require("../../../util/regExHelpers");
const generateDateTime = require("../../../processing/date_processing/generateDateTimes");
const { build_upsert_str } = require("../../../util");

const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

async function phil_mri_logcurrent(file_config, System, capture_datetime) {
  const parsers = file_config.parsers;
  const data = [];

  let note = {
    job_id: System.job_id,
    sme: System.sme,
    file: file_config
  };

  try {
    await System.addLogEvent(
      System.I,
      System.run_log,
      "phil_mri_logcurrent",
      System.cal,
      note,
      null
    );

    // ** Start Data Acquisition

    await System.getRedisFileSize();

    await System.getCurrentFileSize();

    const last_mod = (
      await System.getLastModifiedTime(System.complete_file_path)
    ).toISOString();

    const file_metadata = {
      system_id: System.sme,
      file_name: System.file_config.file_name,
      last_mod,
      source: "hhm"
    };

    if (System.delta === 0) {
      await System.push_file_dt_queue(System.run_log, file_metadata);
      return;
    }

    await System.getFileData();

    if (!System.file_data) return;

    // ** End Data Acquisition

    // ** Begin Parse

    let line_number = 1;
    for await (const line of System.file_data) {
      let matches = await line.match(philips_re[parsers[0]]);

      // Account for lines that are blank (\n)
      if (matches === null) {
        const isNewLine = blankLineTest(line);
        if (isNewLine) {
          line_number++;
          continue;
        } else {
          let note = {
            job_id: System.job_id,
            sme: System.sme,
            file: file_config,
            line,
            line_number,
            message: "NO MATCH FOUND"
          };
          await System.addLogEvent(
            System.I,
            System.run_log,
            "phil_mri_logcurrent",
            System.cal,
            note,
            null
          );
          line_number++;
        }
      } else {
        line_number++;
        matches.groups.system_id = System.sme;
        const dtObject = await generateDateTime(
          System.job_id,
          matches.groups.system_id,
          System.file_config.pg_tables[0],
          matches.groups.host_date,
          matches.groups.host_time,
          System.sysConfigData.time_zone_id
        );

        // Matches astray data no related to anything. Skip this iteration
        if (
          !!matches.groups.reconstructor ||
          !!matches.groups.data_created_value ||
          !!matches.groups.packets_created ||
          !!matches.groups.size_copy_value ||
          !!matches.groups.magnet_meu
        ) {
          continue;
        }

        // magnet_meu group does not have datetime. Ex: '0114,2022,04,01,00,06,08,17,14,00000,'
        if (dtObject === null && matches.groups.magnet_meu === undefined) {
          let note = {
            job_id: System.job_id,
            sme: System.sme,
            file: file_config,
            line,
            match_group: matches.groups,
            message: "datetime object null"
          };
          await System.addLogEvent(
            System.W,
            System.run_log,
            "phil_mri_logcurrent",
            System.det,
            note,
            null
          );
        }

        matches.groups.capture_datetime = capture_datetime;
        matches.groups.host_datetime = dtObject;

        data.push(matches.groups);
      }
    }

    // Homogenize data to prep for insert to db
    const mappedData = mapDataToSchema(data, phil_mri_logcurrent_schema);

    // console.log("\nmappedData - logcurrent.log");
    // console.log(System.sme);
    // console.log(mappedData[mappedData.length - 1]);
    // console.log(mappedData.length);

    if (mappedData.length > 1_000_000) {
      // Cut array in half
      const mappedData_2 = mappedData.splice(
        0,
        Math.floor(mappedData.length / 2)
      );

      const query = pgp.helpers.insert(
        mappedData_2,
        pg_cs.log.philips.logcurrent
      );

      await db.any(query);
    }

    // ** End Parse

    // ** Begin Persist

    const query = pgp.helpers.insert(mappedData, pg_cs.log.philips.logcurrent);

    await db.any(query);

    // ** End Persist

    note.number_of_rows = mappedData.length;
    note.first_row = mappedData[0];
    note.last_row = mappedData[mappedData.length - 1];
    note.message = "Successful Insert";

    await System.addLogEvent(
      System.I,
      System.run_log,
      "phil_mri_logcurrent",
      System.det,
      note,
      null
    );

    // Update Redis Cache
    await System.push_file_dt_queue(System.run_log, file_metadata);

    await System.updateRedisFileSize();

    // Update alert.offline_hhm_conn table with host_datetime
    const resent_host_datetime =
      mappedData[mappedData.length - 1].host_datetime;

    const upsert_str = build_upsert_str(System.sme, resent_host_datetime);

    await db.any(upsert_str);
  } catch (error) {
    console.log(error);
    await System.addLogEvent(
      System.E,
      System.run_log,
      "phil_mri_logcurrent",
      System.cat,
      note,
      error
    );
  }
}

module.exports = phil_mri_logcurrent;
