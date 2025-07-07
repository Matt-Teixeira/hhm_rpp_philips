const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const fsp = require("node:fs").promises;
const { philips_re } = require("../../../parse/parsers");
const mapDataToSchema = require("../../../persist/map-data-to-schema");
const { philips_mri_rmmu_history } = require("../../../persist/pg-schemas");
const generateDateTime = require("../../../processing/date_processing/generateDateTimes");
const execLastMod = require("../../../read/exec-file_last_mod");
const {
  seconds_past_midnight
} = require("../../../processing/date_processing/incoming_date_cleaning");
const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

const { dt_now } = require("../../../util/dates");

async function phil_rmmu_history(System) {
  const capture_datetime = dt_now();

  const parsers = System.file_config.parsers;
  const data = [];

  lastModPath = "./read/sh/get_dir_last_mod.sh";

  let note = {
    job_id: System.job_id,
    sme: System.sme,
    file: System.file_config
  };

  try {
    await System.addLogEvent(
      System.I,
      System.run_log,
      "phil_rmmu_history",
      System.cal,
      note,
      null
    );

    // ** Start Data Acquisition **

    // An array for files in rmmu directory (/opt/files/SME15802/hhm/rmmu)
    await System.get_directory_files();

    // Get cached last file in directory from Redis
    await System.get_last_file_parsed("last_rmmu_file");

    // Set last file in rmmu directory
    System.update_files_to_process();

    if (System.files_in_dir.length === 0) {
      const file_mod_datetime = await execLastMod(lastModPath, [
        `${System.sysConfigData.debian_server_path}`,
        "rmmu"
      ]);

      note.message = "No new files detected";
      note.path = System.directory_path;
      note.last_mod = file_mod_datetime;

      await System.addLogEvent(
        System.W,
        System.run_log,
        "phil_rmmu_history",
        System.det,
        note,
        null
      );
      return;
    }

    // ** End Data Acquisition **

    // Loops through each file in the dir
    // Change to loop backwards
    for await (const file of System.files_in_dir) {
      const complete_file_path = `${System.directory_path}/${file}`;

      const fileData = (await fsp.readFile(complete_file_path)).toString();

      // ** Begin Parse **

      let matches = fileData.matchAll(philips_re.mri[parsers[0]]);
      if (!matches) {
        let note = {
          job_id: System.job_id,
          sme: System.sme,
          file: System.file_config,
          re: `${philips_re.mri[parsers[0]]}`,
          message: "NO MATCH FOUND"
        };

        await System.addLogEvent(
          System.W,
          System.run_log,
          "phil_rmmu_history",
          System.det,
          note,
          null
        );
      }
      let metaData = fileData.match(philips_re.mri[parsers[1]]);

      // Date Formatting
      let file_date = file.match(philips_re.mri[parsers[2]]);

      // Date from file name: 2014-03-25
      const date = `${file_date.groups.year}-${file_date.groups.month}-${file_date.groups.day}`;

      // Loops through each match in 1 file in dir
      for await (const match of matches) {
        if (!match) {
          let note = {
            job_id: System.job_id,
            sme: System.sme,
            file: System.file_config,
            message: "NO MATCH FOUND"
          };

          await System.addLogEvent(
            System.W,
            System.run_log,
            "phil_rmmu_history",
            System.det,
            note,
            null
          );
          continue;
        }
        match.groups.system_id = System.sme;
        match.groups.system_reference_number =
          metaData.groups.system_reference_number;
        match.groups.hospital_name = metaData.groups.hospital_name;

        // Time associated with each data entry as seconds past midnight (line): 00:07:46
        const time = seconds_past_midnight(match.groups.time);

        const dtObject = await generateDateTime(
          System.job_id,
          match.groups.system_id,
          System.file_config.pg_tables[0],
          date,
          time,
          System.sysConfigData.time_zone_id
        );

        if (dtObject === null) {
          let note = {
            job_id: System.job_id,
            sme: System.sme,
            file: System.file_config,
            message: "date_time object null"
          };
          await System.addLogEvent(
            System.W,
            System.run_log,
            "phil_rmmu_history",
            System.det,
            note,
            null
          );
        }

        match.groups.host_datetime = dtObject;
        match.groups.capture_datetime = capture_datetime;

        data.push(match.groups);
      }

      const mappedData = mapDataToSchema(data, philips_mri_rmmu_history);

      // console.log("\nmappedData - rmmu_history");
      // console.log(System.sme);
      // console.log(mappedData.length);
      // console.log(mappedData[mappedData.length - 1]);

      // ** End Parse **

      // ** Begin Persist **

      const query = pgp.helpers.insert(
        mappedData,
        pg_cs.mag.philips.rmmu_history
      );

      await db.any(query);

      // ** End Persist **

      note.file = file;
      note.number_of_rows = mappedData.length;
      note.first_row = mappedData[0];
      note.last_row = mappedData[mappedData.length - 1];
      note.message = "Successful Insert";

      await System.addLogEvent(
        System.I,
        System.run_log,
        "phil_rmmu_history",
        System.det,
        note,
        null
      );

      // Reset data array for next file's data
      data.length = 0;
    }

    // Cache name of last file parsed
    await System.cache_last_file_name(
      System.last_file_in_dir,
      "last_rmmu_file"
    );

    return;
  } catch (error) {
    console.log(error);
    await System.addLogEvent(
      System.I,
      System.run_log,
      "phil_rmmu_history",
      System.cat,
      note,
      null
    );
  }
}

module.exports = phil_rmmu_history;
