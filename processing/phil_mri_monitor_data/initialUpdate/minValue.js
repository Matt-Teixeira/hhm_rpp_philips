const {
  getExistingDates,
  updateTable_agg,
  insertData_agg
} = require("../../../util/phil_mri_monitor_helpers");
const { dt_from_pattern } = require("../../../util/dates");

async function minValue(
  run_log,
  sme,
  data,
  column,
  capture_datetime,
  time_zone_id
) {
  try {
    // Get all rows/dates for this sme
    const systemDates = await getExistingDates(run_log, sme);

    let bucket = [];
    let prevData = data[0].host_date; //Set to first date in file data(file capture groups)

    for await (const obs of data) {
      let insert_this_dt;
      if (sme == "SME15816") {
        insert_this_dt = await dt_from_pattern(
          `${obs.host_date} ${obs.host_time}`,
          "dd-MMM-yyyy HH:mm:ss", // Adjust format for '21-OCT-2024'
          time_zone_id
        );
      } else {
        insert_this_dt = await dt_from_pattern(
          `${obs.host_date} ${obs.host_time}`,
          "yyyy-MM-dd HH:mm:ss",
          time_zone_id
        );
      }

      let currentDate = obs.host_date;

      if (currentDate === prevData) {
        bucket.push(obs[column]);
        prevData = currentDate;
        continue;
      }
      if (currentDate !== prevData) {
        // Not equal means a change in dates
        const minValue = Math.min(...bucket);

        if (systemDates.includes(prevData)) {
          // If date exists for sme: UPDATE row
          await updateTable_agg(run_log, column, [minValue, sme, prevData]);
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
            minValue
          ]);
          bucket = [];
          prevData = obs.host_date;
          bucket.push(obs[column]);
        }
      }
    }

    // Work with last set of dates in array
    if (systemDates.includes(prevData)) {
      // If date exists for sme: UPDATE row
      const minValue = Math.min(...bucket);
      await updateTable_agg(run_log, column, [
        minValue,
        sme,
        data[data.length - 1].host_date
      ]);
    } else {
      let insert_this_dt;
      if ((sme = "SME15816")) {
        insert_this_dt = await dt_from_pattern(
          `${data[data.length - 1].host_date} ${
            data[data.length - 1].host_time
          }`,
          "dd-MMM-yyyy HH:mm:ss", // Adjust format for '21-OCT-2024'
          time_zone_id
        );
      } else {
        insert_this_dt = await dt_from_pattern(
          `${data[data.length - 1].host_date} ${
            data[data.length - 1].host_time
          }`,
          "yyyy-MM-dd HH:mm:ss",
          time_zone_id
        );
      }
      // If date dose not exist: INSERT new row
      const minValue = Math.min(...bucket);
      await insertData_agg(run_log, column, [
        sme,
        capture_datetime,
        insert_this_dt,
        data[data.length - 1].host_date,
        minValue
      ]);
    }
    return true;
  } catch (error) {
    let note = {
      sme: sme,
      column: column
    };
    console.log(error);
    await addLogEvent(E, run_log, "initUpdate: minValue", cat, note, error);
    return false;
  }
}

module.exports = minValue;
