const {
  getExistingDates,
  updateTable_agg,
  insertData_agg
} = require("../../../util/phil_mri_monitor_helpers"); //cryo_comp_comm_error
const { dt_from_pattern } = require("../../../util/dates");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det }
} = require("../../../utils/logger/enums");

async function booleanValue(
  run_log,
  sme,
  data,
  column,
  capture_datetime,
  time_zone_id
) {
  // Test to create a luxon host_datetime
  /* {
    host_date: '2023-10-02',
    host_time: '07:01:15',
    cryo_comp_comm_error_state: '0'
  }, */
  try {
    // Get all rows/dates for this sme
    const systemDates = await getExistingDates(run_log, sme);

    let bucket = [];
    let prevData = data[0].host_date; //Set to first date in file data(file capture groups)

    for await (const obs of data) {
      const insert_this_dt = await dt_from_pattern(
        `${obs.host_date} ${obs.host_time}`,
        "yyyy-MM-dd HH:mm:ss",
        time_zone_id
      );

      let currentDate = obs.host_date;

      if (currentDate === prevData) {
        bucket.push(obs[column]);
        prevData = currentDate;
        continue;
      }
      if (currentDate !== prevData) {
        // Not equal means a change in dates
        let maxValue = Math.max(...bucket);

        if (maxValue > 0) {
          maxValue = 1;
        } else {
          maxValue = 0;
        }

        if (systemDates.includes(prevData)) {
          // If date exists for sme: UPDATE row
          await updateTable_agg(run_log, column, [maxValue, sme, prevData]);
          bucket = [];
          prevData = obs.host_date;
          bucket.push(obs[column]);
        } else {
          // If date dose not exist: INSERT new row
          await insertData_agg(run_log, column, [
            sme,
            capture_datetime,
            insert_this_dt,
            prevData,
            maxValue
          ]);
          bucket = [];
          prevData = obs.host_date;
          bucket.push(obs[column]);
        }
      }
    }

    // Deal with last set of dates in array
    if (systemDates.includes(prevData)) {
      // If date exists for sme: UPDATE row
      let maxValue = Math.max(...bucket);

      if (maxValue > 0) {
        maxValue = 1;
      } else {
        maxValue = 0;
      }

      await updateTable_agg(run_log, column, [
        maxValue,
        sme,
        data[data.length - 1].host_date
      ]);
    } else {
      // If date dose not exist: INSERT new row
      let maxValue = Math.max(...bucket);

      const insert_this_dt = await dt_from_pattern(
        `${data[data.length - 1].host_date} ${data[data.length - 1].host_time}`,
        "yyyy-MM-dd HH:mm:ss",
        time_zone_id
      );

      if (maxValue > 0) {
        maxValue = 1;
      } else {
        maxValue = 0;
      }
      await insertData_agg(run_log, column, [
        sme,
        capture_datetime,
        insert_this_dt,
        data[data.length - 1].host_date,
        maxValue
      ]);
    }
    return true;
  } catch (error) {
    let note = {
      sme: sme,
      column: column
    };
    await addLogEvent(E, run_log, "initUpdate: booleanValue", cat, note, error);
    return false;
  }
}

module.exports = booleanValue;
