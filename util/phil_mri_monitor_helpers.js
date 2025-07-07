const db = require("../utils/db/pg-pool");
const [addLogEvent] = require("../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det },
} = require("../utils/logger/enums");

async function getSystemDbData(job_id, run_log, sme) {
  let note = {
    job_id,
    sme,
  };
  try {
    await addLogEvent(I, run_log, "getSystemDbData", cal, note, null);
    const queryStr =
      "SELECT system_id, host_datetime FROM mag.philips_mri_monitoring_data_agg WHERE system_id = $1 ORDER BY host_datetime DESC LIMIT 1";

    return await db.any(queryStr, [sme]);
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "getSystemDbData", cat, note, error);
  }
}

async function getExistingDates(run_log, sme) {
  try {
    const queryStr =
      "SELECT date FROM mag.philips_mri_monitoring_data_agg WHERE system_id = $1";
    const v = [sme];
    const systemDates = await db.any(queryStr, v);

    const systemDatesToArray = [];
    for await (const date of systemDates) {
      systemDatesToArray.push(date.date);
    }
    return systemDatesToArray;
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "getExistingDates", cat, { sme }, error);
  }
}

async function updateTable(run_log, col_name, arr) {
  try {
    if (arr[0] === -Infinity) return;
    const queryStr = `UPDATE mag.philips_mri_monitoring_data SET ${col_name} = $1 WHERE system_id = $2 AND date = $3`;
    await db.none(queryStr, arr);
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "updateTable", cat, { col_name, arr }, error);
  }
}

async function updateTable_agg(run_log, col_name, arr) {
  try {
    if (arr[0] === -Infinity) return;
    const queryStr = `UPDATE mag.philips_mri_monitoring_data_agg SET ${col_name} = $1 WHERE system_id = $2 AND date = $3`;
    await db.none(queryStr, arr);
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "updateTable", cat, { col_name, arr }, error);
  }
}

async function insertData_agg(run_log, col_name, arr) {
  try {
    if (arr[3] === -Infinity) return;
    const queryStr = `INSERT INTO mag.philips_mri_monitoring_data_agg(system_id, capture_datetime, host_datetime, date, ${col_name}) VALUES($1, $2, $3, $4, $5)`;
    await db.none(queryStr, arr);
  } catch (error) {
    let note = { col_name, arr };
    console.log(error);
    await addLogEvent(E, run_log, "insertData", cat, note, error);
  }
}

async function insertData(run_log, col_name, arr) {
  try {
    if (arr[3] === -Infinity) return;
    const queryStr = `INSERT INTO mag.philips_mri_monitoring_data(system_id, host_datetime, date, ${col_name}) VALUES($1, $2, $3, $4)`;
    await db.none(queryStr, arr);
  } catch (error) {
    let note = { col_name, arr };
    console.log(error);
    await addLogEvent(E, run_log, "insertData", cat, note, error);
  }
}

async function update_jsonb_state(run_log, sme, values) {
  let note = {
    sme,
    values,
  };
  try {
    await addLogEvent(I, run_log, "update_jsonb_state", det, note, null);
    const queryStr = `UPDATE mag.philips_mri_json SET process_success = true WHERE capture_time = $1`;
    await db.none(queryStr, values);
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "update_jsonb_state", cat, note, error);
  }
}

async function get_captured_datetime_entry(run_log, sme, values) {
  let note = {
    sme,
    values,
  };
  try {
    await addLogEvent(
      I,
      run_log,
      "get_captured_datetime_entry",
      cat,
      note,
      null
    );
    const queryStr = `SELECT * FROM mag.philips_mri_monitoring_data_agg WHERE capture_datetime = $1`;
    const entry = await db.any(queryStr, values);
    return entry;
  } catch (error) {
    console.log(error);
    await addLogEvent(
      E,
      run_log,
      "get_captured_datetime_entry",
      cat,
      note,
      error
    );
  }
}

async function insert_into_secondary_table(run_log, sme, col_name, values) {
  let note = {
    sme,
    col_name,
    values,
  };
  try {
    await addLogEvent(
      I,
      run_log,
      "insert_into_secondary_table",
      det,
      note,
      null
    );
    const queryStr = `INSERT INTO mag.philips_mri_monitoring_data_agg(system_id, capture_datetime, host_datetime, date, ${col_name}) VALUES($1, $2, $3, $4, $5)`;
    await db.none(queryStr, values);
    return;
  } catch (error) {
    console.log(error);
    await addLogEvent(
      E,
      run_log,
      "insert_into_secondary_table",
      cat,
      note,
      error
    );
  }
}

async function update_secondary_table(run_log, sme, col_name, values) {
  let note = {
    sme,
    col_name,
    values,
  };
  try {
    await addLogEvent(I, run_log, "update_secondary_table", det, note, null);
    const queryStr = `UPDATE mag.philips_mri_monitoring_data_agg SET ${col_name} = $1 WHERE system_id = $2 AND capture_datetime = $3`;
    await db.none(queryStr, values);
    return;
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "update_secondary_table", cat, note, error);
  }
}

module.exports = {
  getSystemDbData,
  getExistingDates,
  updateTable,
  insertData,
  update_jsonb_state,
  get_captured_datetime_entry,
  insert_into_secondary_table,
  update_secondary_table,
  updateTable_agg,
  insertData_agg
};
