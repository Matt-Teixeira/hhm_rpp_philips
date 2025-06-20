const phil_mri_monitor_jsonb = require("../insert_jsonb_data");
const phil_mri_monitor_display = require("../insert_display_data");
const {
  update_jsonb_state
} = require("../../../../util/phil_mri_monitor_helpers");
const [addLogEvent] = require("../../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det }
} = require("../../../../utils/logger/enums");

async function type_1(System, directory) {
  let note = {
    job_id: System.job_id,
    sme: System.sme
  };

  try {
    await addLogEvent(I, System.run_log, "type_1", cal, note, null);

    const [json_data, date, redis_cache] = await phil_mri_monitor_jsonb(
      System,
      directory
    );

    if (json_data) {
      // Find index of monitoring object within config data
      /* let monitoring_index;
      for (let i = 0; i < System.sysConfigData.monitoring_config.length; i++) {
        let key = Object.keys(System.sysConfigData.monitoring_config[i]);
        if (key[0] === "monitoring") monitoring_index = i;
      } */

      let successful_agg = await phil_mri_monitor_display(
        System.job_id,
        System.sysConfigData.id,
        System.sysConfigData.modality,
        System.sysConfigData.monitoring_config, // System.sysConfigData.hhm_file_config[monitoring_index].monitoring,
        json_data,
        date,
        System.run_log,
        System.sysConfigData.time_zone_id
      );

      if (successful_agg) {
        for await (const file_data of redis_cache) {
          await System.get_last_monitor_line(
            file_data.path,
            file_data.file_name
          );
        }
        await update_jsonb_state(System.run_log, System.sysConfigData.id, [
          date
        ]);
      }
    }
  } catch (error) {
    console.log(error);
    await addLogEvent(I, System.run_log, "type_1", cat, note, error);
  }
}

module.exports = type_1;
