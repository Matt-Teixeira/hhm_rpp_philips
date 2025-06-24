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

async function maxValue(run_log, sme, data, column, capture_datetime, time_zone_id) {
  try {
    // Get date ranges for smaller query and loop
    let previous_entries = await get_captured_datetime_entry(run_log, sme, [
      capture_datetime
    ]);

    // max_value will be
    let max_value;

    let current_largest_value = -9999;
    for (const data_entry of data) {
      if (parseInt(data_entry[column]) > current_largest_value) {
        max_value = data_entry;
        current_largest_value = parseInt(data_entry[column]);
      }
    }

    if (previous_entries.length < 1) {
      const host_datetime = await dt_from_pattern(
        `${max_value.host_date} ${max_value.host_time}`,
        "yyyy-MM-dd HH:mm:ss",
        time_zone_id
      );
      //const c = await convertDT(max_value.host_date);
      await insert_into_secondary_table(run_log, sme, column, [
        sme,
        capture_datetime,
        host_datetime,
        max_value.host_date,
        max_value[column]
      ]);
    } else {
      await update_secondary_table(run_log, sme, column, [
        max_value[column],
        sme,
        capture_datetime
      ]);
    }
    return true;
  } catch (error) {
    console.log(error);
    let note = { sme: sme, column: column };
    await addLogEvent(
      E,
      run_log,
      "update_secondary: maxValue",
      cat,
      note,
      error
    );
    return false;
  }
}

module.exports = maxValue;
