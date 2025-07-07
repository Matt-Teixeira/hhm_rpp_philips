const db = require("../../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const mapDataToSchema = require("../../../persist/map-data-to-schema");
const {
  philips_ct_events_schema,
  philips_ct_eal_events_schema
} = require("../../../persist/pg-schemas");
const generateDateTime = require("../../../processing/date_processing/generateDateTimes");
const {
  pg_column_sets: pg_cs
} = require("../../../utils/db/sql/pg-helpers_hhm");

async function phil_ct_events(System, capture_datetime) {
  const data = [];

  let note = {
    job_id: System.job_id,
    sme: System.sme,
    file: System.file_config.file_name
  };

  try {
    await System.addLogEvent(
      System.I,
      System.run_log,
      "phil_ct_events",
      System.cal,
      note,
      null
    );

    // ** Start Data Acquisition
    await System.getRedisFileSize();
    await System.getCurrentFileSize();
    await System.getFileSizeDelta();
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

    // Break out of function if no file found
    if (System.current_file_size === null) {
      note.message = "File not found in dir";
      await System.addLogEvent(
        System.I,
        System.run_log,
        "phil_ct_events",
        System.det,
        note,
        null
      );
      return;
    }

    await System.getFileData();

    if (System.file_data === null) return;

    // ** End Data Acquisition

    // ** Start rpp

    const matches = System.getMatchBlocks();

    if (matches === null) {
      let note = {
        job_id: System.job_id,
        sme: System.sme,
        file: System.file_config.file_name,
        message: "NO MATCH FOUND"
      };

      await System.addLogEvent(
        System.W,
        System.run_log,
        "phil_ct_events",
        System.det,
        note,
        null
      );
      return;
    }

    for await (const match of matches) {
      match.groups.system_id = System.sme;
      const dtObject = await generateDateTime(
        System.job_id,
        match.groups.system_id,
        System.file_config.pg_tables[0],
        match.groups.host_date,
        match.groups.host_time,
        System.sysConfigData.time_zone_id
      );

      if (dtObject === null) {
        let note = {
          job_id: System.job_id,
          sme: System.sme,
          match_group: matches.groups,
          message: "date_time object null"
        };
        await System.addLogEvent(
          System.W,
          System.run_log,
          "phil_ct_events",
          System.det,
          note,
          null
        );
      }

      match.groups.capture_datetime = capture_datetime;
      match.groups.host_datetime = dtObject;

      data.push(match.groups);
    }

    const mappedData = mapDataToSchema(data, philips_ct_eal_events_schema);

    console.log("\nmappedData - philips_ct - events");
    console.log(System.sme);
    console.log(mappedData[mappedData.length - 1]);

    // ** End Parse

    // ** Begin Persist

    const query = pgp.helpers.insert(
      mappedData,
      pg_cs.log.philips.philips_ct_eal_events
    );

    await db.any(query);

    // ** End Persist

    note.number_of_rows = mappedData.length;
    note.first_row = mappedData[0];
    note.last_row = mappedData[mappedData.length - 1];
    note.message = "Successful Insert";

    await System.addLogEvent(
      System.I,
      System.run_log,
      "phil_ct_events",
      System.det,
      note,
      null
    );

    // Update Redis Cache

    await System.push_file_dt_queue(System.run_log, file_metadata);

    await System.updateRedisFileSize();
  } catch (error) {
    await System.addLogEvent(
      System.E,
      System.run_log,
      "phil_ct_events",
      System.cat,
      note,
      error
    );
  }
}

module.exports = phil_ct_events;
