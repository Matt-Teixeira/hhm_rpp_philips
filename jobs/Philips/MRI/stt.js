const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const { philips_re } = require("../../../parse/parsers");
const mapDataToSchema = require("../../../persist/map-data-to-schema");
const { stt_magnet, mag_stt_magnet } = require("../../../persist/pg-schemas");
const { blankLineTest } = require("../../../util/regExHelpers");
const generateDateTime = require("../../../processing/date_processing/generateDateTimes");
const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

const { dt_now } = require("../../../util/dates");

async function stt_parser(file_config, System) {
  const capture_datetime = dt_now();

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

    await System.getRedisFileSize();

    await System.getCurrentFileSize();

    await System.getFileData();

    if (System.file_data === null) return;

    let line_number = 1;
    for await (const line of System.file_data) {
      let matches = await line.match(philips_re[parsers[0]]);

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
            "stt_parser",
            System.det,
            note,
            null
          );
          line_number++;
          continue;
        }
      } else if (matches.groups === undefined) continue;
      else {
        line_number++;
        matches.groups.system_id = System.sme;

        // 23-JUL-2023 03:06:20.81
        // Add 0 to end of time string for Lexon: 03:06:20.81 = 03:06:20.810
        matches.groups.host_time += "0";

        const dtObject = await generateDateTime(
          System.job_id,
          matches.groups.system_id,
          "stt_magnet",
          matches.groups.host_date,
          matches.groups.host_time,
          System.sysConfigData.time_zone_id
        );

        // magnet_meu group does not have datetime. Ex: '0114,2022,04,01,00,06,08,17,14,00000,'
        if (dtObject === null) {
          let note = {
            job_id: System.job_id,
            sme: System.sme,
            file: file_config,
            line,
            match_group: matches.groups,
            message: "date_time object null"
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

        matches.groups.host_datetime = dtObject;
        matches.groups.capture_datetime = capture_datetime;

        data.push(matches.groups);
      }
    }

    // Homogenize data to prep for insert to db
    const mappedData = mapDataToSchema(data, stt_magnet);

    // console.log("\nmappedData - stt_magnet");
    // console.log(System.sme);
    // console.log(mappedData[mappedData.length - 1]);

    const mag_stt_magnet_data = [];

    for (let obj of mappedData) {
      let new_obj = {
        system_id: obj.system_id,
        field_name: obj.header_2.toLowerCase(),
        he_level_value: null,
        he_pressure_value: null,
        he_boil_off_value: null,
        host_datetime: obj.host_datetime,
        capture_datetime: obj.capture_datetime
      };
      if (obj.header_2 === "MMU_pressure" && obj.status_value !== null) {
        new_obj.he_pressure_value = obj.status_value;
        mag_stt_magnet_data.push(new_obj);
      }
      if (obj.header_2 === "MMU_helium_level" && obj.status_value !== null) {
        // obj.status_value IS A STRING SO I'M GETTING FIRST SIX CHARS TO THEN PARSE TO FLOAT WHILE ALSO TRUNCATING ALL DIGITS PAST THE 3rd SIG FIG.
        // let status_value = obj.status_value.slice(0, 6);
        new_obj.he_level_value = obj.status_value;
        mag_stt_magnet_data.push(new_obj);
      }
      if (
        obj.header_2 === "MMU_helium_boil_off_UlPh" &&
        obj.status_value !== null
      ) {
        new_obj.he_boil_off_value = obj.status_value;
        mag_stt_magnet_data.push(new_obj);
      }
    }

    // ** End Parse **

    // ** Begin Persist **

    const query = pgp.helpers.insert(mappedData, pg_cs.log.philips.stt_magnet);
    const query_2 = pgp.helpers.insert(
      mag_stt_magnet_data,
      pg_cs.mag.philips.mag_stt_magnet
    );

    await db.any(query);
    await db.any(query_2);

    // ** End Persist **

    // Update Redis Cache

    await System.updateRedisFileSize();
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

module.exports = stt_parser;
