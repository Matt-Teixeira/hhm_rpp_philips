const db = require("../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const {
  get_file_dt_queue,
  clear_file_dt_queue
} = require("../../redis/redisHelpers");
const [addLogEvent] = require("../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat, seq, qaf }
} = require("../../utils/logger/enums");

async function update_file_datetimes(run_log) {
  await addLogEvent(I, run_log, "update_file_datetimes", cal, null, null);
  const data = await get_file_dt_queue(run_log);

  const cs = new pgp.helpers.ColumnSet(
    [
      { name: "system_id", cnd: true },
      { name: "file_name", cnd: true },
      "last_mod",
      "source"
    ],
    { table: { schema: "alert", table: "file_mod_dt" } }
  );

  const insertSQL = pgp.helpers.insert(data, cs);
  const conflictFields = ["system_id", "file_name"];
  const updates = cs.columns
    .map((c) => `${c.name}=EXCLUDED.${c.name}`)
    .join(", ");

  const upsertSQL = `
    ${insertSQL}
    ON CONFLICT (${conflictFields.join(", ")})
    DO UPDATE SET ${updates}, inserted_at = current_timestamp`;

  try {
    await db.none(upsertSQL);
    await clear_file_dt_queue(run_log);
    console.log("Upsert Successful!");
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "update_file_datetimes", cat, null, error);
  }
}

module.exports = update_file_datetimes;