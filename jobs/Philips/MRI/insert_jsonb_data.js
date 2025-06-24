const { philips_re } = require("../../../parse/parsers");
const insertJsonB = require("../../../processing/phil_mri_monitor_data/bulk_jsonb_insert");
const { does_file_exist, getLastModifiedTime } = require("../../../util");
const { push_file_dt_queue } = require("../../../redis/redisHelpers");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det }
} = require("../../../utils/logger/enums");

async function phil_mri_monitor(System, directory) {
  try {
    const jsonData = {};
    let redis_cache = [];

    // Loop through monitoring files in monitoring directory
    for await (const file of directory) {
      const complete_file_path = `${System.sysConfigData
        .debian_server_path}/monitoring/${file.file_name}`;
      let note = {
        job_id: System.job_id,
        sme: System.sme,
        file: file
      };

      // Check file existance
      const file_present = await does_file_exist(complete_file_path);
      // If not found - log and skip this file's iteration
      if (!file_present) {
        let note = {
          job_id: System.job_id,
          sme: System.sme,
          file: file,
          message: "File not found."
        };
        await addLogEvent(
          I,
          System.run_log,
          "phil_mri_monitor",
          det,
          note,
          null
        );
        continue;
      }

      

      const last_mod = (await getLastModifiedTime(
        complete_file_path
      )).toISOString();

      const file_metadata = {
        system_id: System.sme,
        file_name: file.file_name,
        last_mod,
        source: "hhm"
      };

      await push_file_dt_queue(System.run_log, file_metadata);

      await addLogEvent(I, System.run_log, "phil_mri_monitor", det, note, null);
      //if (file.file_name === "monitor_System_TempTechRoom.dat") {
      let file_data;

      // Remove .dat from file. EX: "monitor_magnet_quench.dat"
      const fileName = file.file_name.split(".")[0];

      const last_line = await System.get_redis_line(file);

      // last_line will be null if redis cache non-existent i.e., new system. Pull all data.
      if (last_line === null) {
        file_data = await System.get_all_monitor_data(complete_file_path);
      } else {
        file_data = await System.get_monitor_delta(
          complete_file_path,
          last_line
        );

        // consider removing. file_data will be null if no match for last line. Reset redis last line to file's
        // current last line to prevent a negative feedback loop in which no line is ever matched to stale cache
        if (file_data === null) {
          await System.get_last_monitor_line(
            complete_file_path,
            file.file_name
          );
          continue;
        }
      }

      // Catch and handle when file not present in dir.
      if (file_data === undefined) {
        note.message = "File not found";
        await addLogEvent(
          W,
          System.run_log,
          "phil_mri_monitor",
          det,
          note,
          null
        );
        continue;
      }

      const matches = file_data.matchAll(
        philips_re.mri.monitor[file.parsers[0]]
      );

      if (!matches) {
        note.re = `${philips_re.mri.monitor[file.parsers[0]]}`;
        note.message = "NO MATCH FOUND";

        await addLogEvent(
          W,
          System.run_log,
          "phil_mri_monitor",
          det,
          note,
          null
        );
        continue;
      }

      jsonData[fileName] = [];
      for (let match of matches) {
        if (!match.groups.host_time) match.groups.host_time = "00:00:01";
        jsonData[fileName].push({ ...match.groups });
      }
      // Cache last line in monitoring file
      redis_cache.push({ path: complete_file_path, file_name: file.file_name });
      //await System.get_last_monitor_line(complete_file_path, file.file_name);
    }

    // Skip db insert step if no new data was pushed into jsonData{}
    if (Object.keys(jsonData).length === 0) {
      let note = {
        job_id: System.job_id,
        sme: System.sme,
        message: "No new monitoring data found."
      };
      await addLogEvent(W, System.run_log, "phil_mri_monitor", det, note, null);
      return [null, null, null];
    }

    const date = await insertJsonB(System.job_id, System.run_log, [
      System.sme,
      jsonData
    ]);

    // send data to be aggregated
    return [jsonData, date, redis_cache];
  } catch (error) {
    let note = {
      job_id: System.job_id,
      sme: System.sme
    };
    console.log(error);
    await addLogEvent(E, System.run_log, "phil_mri_monitor", cat, note, error);
  }
}

module.exports = phil_mri_monitor;

/* FILES
monitor_cryocompressor_cerr -
monitor_cryocompressor_palm -
monitor_cryocompressor_talm -
monitor_cryocompressor_time_status -
monitor_magnet_helium_level_value -
monitor_magnet_lt_boiloff -
monitor_magnet_pressure_dps -
monitor_magnet_quench -
monitor_System_HumTechRoom
monitor_System_TempTechRoom
monitor_magnet_pressure_avg
*/
