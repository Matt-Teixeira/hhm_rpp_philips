const pgp = require("pg-promise")();
const db = require("../../../utils/db/pg-pool");
const fsp = require("node:fs").promises;
const { philips_re } = require("../../../parse/parsers");
const mapDataToSchema = require("../../../persist/map-data-to-schema");
const {
  philips_mri_rmmu_magnet_schema,
} = require("../../../persist/pg-schemas");
const generateDateTime = require("../../../processing/date_processing/generateDateTimes");
const execLastMod = require("../../../read/exec-file_last_mod");
const {
  pg_column_sets: pg_cs,
} = require("../../../utils/db/sql/pg-helpers_hhm");

const { dt_now } = require("../../../util/dates");

async function phil_mri_rmmu_magnet(System) {
  const capture_datetime = dt_now();

  const parsers = System.file_config.parsers;
  const data = [];
  lastModPath = "./read/sh/get_dir_last_mod.sh";

  let note = {
    job_id: System.job_id,
    sme: System.sme,
    file: System.file_config,
  };

  try {
    await System.addLogEvent(
      System.I,
      System.run_log,
      "phil_mri_rmmu_magnet",
      System.cal,
      note,
      null
    );

    // ** Start Data Acquisition

    await System.get_directory_files();

    if (System.files_in_dir.length === 0) {
      const file_mod_datetime = await execLastMod(lastModPath, [
        System.sysConfigData.debian_server_path,
        "rmmu_magnet",
      ]);

      note.path = System.directory_path;
      note.last_mod = file_mod_datetime;
      note.message = "No new files detected";

      await System.addLogEvent(
        System.I,
        System.run_log,
        "phil_mri_rmmu_magnet",
        System.cal,
        note,
        null
      );
      return;
    }

    // Get cached last file in directory from Redis
    await System.get_last_file_parsed("last_rmmu_magnet_file");

    // Set last file in rmmu directory
    System.update_files_to_process();

    // ** End Data Acquisition

    // Loops through each file in the dir
    for await (const file of System.files_in_dir) {
      const complete_file_path = `${System.directory_path}/${file}`;
      const fileData = (await fsp.readFile(complete_file_path)).toString();

      // ** Begin Parse

      let matches = fileData.matchAll(philips_re.mri[parsers[0]]);
      if (!matches) {
        let note = {
          job_id: System.job_id,
          sme: System.sme,
          file: System.file_config,
          re: `${philips_re.mri[parsers[0]]}`,
          message: "NO MATCH FOUND",
        };

        await System.addLogEvent(
          System.W,
          System.run_log,
          "phil_mri_rmmu_magnet",
          System.det,
          note,
          null
        );
      }
      let metaData = fileData.match(philips_re.mri[parsers[1]]);

      // Loops through each match in 1 file in dir
      for await (const match of matches) {
        if (!match) {
          let note = {
            job_id: System.job_id,
            sme: System.sme,
            file: System.file_config,
            message: "NO MATCH FOUND",
          };

          await System.addLogEvent(
            System.W,
            System.run_log,
            "phil_mri_rmmu_magnet",
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
        match.groups.serial_number_magnet =
          metaData.groups.serial_number_magnet;
        match.groups.serial_number_meu = metaData.groups.serial_number_meu;

        const date = `${match.groups.year}-${match.groups.mo}-${match.groups.dy}`;
        const time = `${match.groups.hr}:${match.groups.mn}:${match.groups.ss}.${match.groups.hs}`;

        const dtObject = await generateDateTime(
          System.jobId,
          match.groups.system_id,
          System.file_config.pg_tables[0],
          date,
          time,
          System.sysConfigData.time_zone_id
        );

        if (dtObject === null) {
          note.file = file;
          note.date = date;
          note.time = time;
          await System.addLogEvent(
            System.W,
            System.run_log,
            "phil_mri_rmmu_magnet",
            System.det,
            note,
            null
          );
        }

        match.groups.host_datetime = dtObject;
        match.groups.capture_datetime = capture_datetime;

        data.push(match.groups);
      }

      const mappedData = mapDataToSchema(data, philips_mri_rmmu_magnet_schema);

      // console.log("\nmappedData - rmmu_magnet");
      // console.log(System.sme);
      // console.log(mappedData[mappedData.length - 1]);

      // ** End Parse

      // ** Begin Persist

      const query = pgp.helpers.insert(
        mappedData,
        pg_cs.mag.philips.rmmu_magnet
      );

      await db.any(query);

      // ** End Persist

      note.file = file;
      note.number_of_rows = mappedData.length;
      note.first_row = mappedData[0];
      note.last_row = mappedData[mappedData.length - 1];
      note.message = "Successful Insert";

      await System.addLogEvent(
        System.I,
        System.run_log,
        "phil_mri_rmmu_magnet",
        System.det,
        note,
        null
      );

      // ** Upon successfull db insert, move file to archive dir

      await System.cache_last_file_name(
        System.last_file_in_dir,
        "last_rmmu_magnet_file"
      );

      data.length = 0;
    }

    return;
  } catch (error) {
    await System.addLogEvent(
      System.E,
      System.run_log,
      "phil_mri_rmmu_magnet",
      System.det,
      note,
      error
    );
  }
}

module.exports = phil_mri_rmmu_magnet;
