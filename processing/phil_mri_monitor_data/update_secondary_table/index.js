const maxValue = require("./maxValue");
const booleanValue = require("./booleanValue");
const minValue = require("./minValue");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det },
} = require("../../../utils/logger/enums");

async function philMonitorTableUpdate(
  job_id,
  sme,
  col_name,
  file_config,
  data,
  capture_datetime,
  run_log,
  time_zone_id
) {
  let processType = file_config.agg;
  let successful_agg = false;
  let note = {
    job_id,
    sme,
    file: file_config.file_name,
    process_type: processType,
  };
  try {
    await addLogEvent(I, run_log, "update_secondary: philMonitorTableUpdate", cal, note, null);

    switch (processType) {
      case "max":
        successful_agg = await maxValue(
          run_log,
          sme,
          data,
          col_name,
          capture_datetime,
          time_zone_id
        );
        break;
      case "min":
        successful_agg = await minValue(
          run_log,
          sme,
          data,
          col_name,
          capture_datetime,
          time_zone_id
        );
        break;
      case "bool":
        successful_agg = await booleanValue(
          run_log,
          sme,
          data,
          col_name,
          capture_datetime,
          time_zone_id
        );
        break;
      default:
        break;
    }
    note.successful_agg = successful_agg;
    await addLogEvent(I, run_log, "update_secondary: philMonitorTableUpdate", det, note, null);
    return successful_agg;
  } catch (error) {
    await addLogEvent(E, run_log, "update_secondary: philMonitorTableUpdate", cat, note, error);
    return false;
  }
}

module.exports = philMonitorTableUpdate;

/*
file_config
{
  column: 'tech_room_temp_value',
  parsers: [ 'monitor_System_TempTechRoom' ],
  file_name: 'monitor_System_TempTechRoom.dat',
  pg_tables: [ 'philips_mri_json', 'philips_mri_monitoring_data' ],
  aggregation: 'max'
}
*/
