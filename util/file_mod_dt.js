const db = require("../utils/db/pg-pool"); // ../../../utils/db/pg-pool
const [addLogEvent] = require("../utils/logger/log");
const {
  type: { E },
  tag: { cat }
} = require("../utils/logger/enums");

const update_file_mod_dt = async (system) => {
  const values = `('${system.id}', '${system.file_name}', '${system.last_mod_dt}', '${system.source}') `;
  const insert_str =
    "INSERT INTO alert.file_mod_dt (system_id, file_name, last_mod, source) VALUES ";
  const on_conflict_str = "ON CONFLICT (system_id, file_name) DO UPDATE SET ";
  const set_str =
    "last_mod = EXCLUDED.last_mod, inserted_at = EXCLUDED.inserted_at;";

  const query_str = `${insert_str}${values}${on_conflict_str}${set_str}`;

  try {
    await db.any(query_str);
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "update_file_mod_dt", cat, {system}, error);
  }
};

module.exports = update_file_mod_dt;
