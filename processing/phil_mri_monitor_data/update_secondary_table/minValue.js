const {
  get_captured_datetime_entry,
  insert_into_secondary_table,
  update_secondary_table
} = require("../../../util/phil_mri_monitor_helpers"); //cryo_comp_malf_minutes
const { convertDT, dt_from_pattern } = require("../../../util/dates");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det }
} = require("../../../utils/logger/enums");

async function minValue(
  run_log,
  sme,
  data,
  column,
  capture_datetime,
  time_zone_id
) {
  try {
    // Get date ranges for smaller query and loop
    let previous_entries = await get_captured_datetime_entry(run_log, sme, [
      capture_datetime
    ]);

    // min_value will be object whoes colunm property has lowest value
    let min_value;

    let current_smallest_value = 9999;
    for (const data_entry of data) {
      if (parseInt(data_entry[column]) < current_smallest_value) {
        min_value = data_entry;
        current_smallest_value = parseInt(data_entry[column]);
      }
    }

    if (previous_entries.length < 1) {
      let host_datetime;
      if (sme == "SME15816") {
        host_datetime = await dt_from_pattern(
          `${min_value.host_date} ${min_value.host_time}`,
          "dd-MMM-yyyy HH:mm:ss", // Adjust format for '21-OCT-2024'
          time_zone_id
        );
      } else {
        host_datetime = await dt_from_pattern(
          `${min_value.host_date} ${min_value.host_time}`,
          "yyyy-MM-dd HH:mm:ss",
          time_zone_id
        );
      }
      // const c = await convertDT(min_value.host_date);
      await insert_into_secondary_table(run_log, sme, column, [
        sme,
        capture_datetime,
        host_datetime,
        min_value.host_date,
        min_value[column]
      ]);
    } else {
      await update_secondary_table(run_log, sme, column, [
        min_value[column],
        sme,
        capture_datetime
      ]);
    }
    return true;
  } catch (error) {
    console.log(error);
    let note = {
      sme: sme,
      column: column
    };

    await addLogEvent(
      E,
      run_log,
      "update_secondary: minValue",
      cat,
      note,
      error
    );

    return false;
  }
}

module.exports = minValue;
