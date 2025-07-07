("use strict");
const db = require("../../utils/db/pg-pool");
const { DateTime } = require("luxon");
const [addLogEvent] = require("../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det },
} = require("../../utils/logger/enums");

async function insertJsonB(job_id, run_log, values_array) {
  const sme = values_array[0];
  let note = {
    job_id,
    sme,
  };

  try {
    await addLogEvent(I, run_log, "insertJsonB", cal, note, null);

    // capture_datetime
    const date = DateTime.local().toISO();
    values_array.unshift(date);
    const queryString =
      "INSERT INTO mag.philips_mri_json(capture_time, system_id, monitoring_data) VALUES($1, $2, $3)";

    await db.none(queryString, values_array);

    return date;
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "insertJsonB", cat, note, error);
  }
}

module.exports = insertJsonB;
