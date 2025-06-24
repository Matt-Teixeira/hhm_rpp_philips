const db = require("../../utils/db/pg-pool");

const delete_old_db_files = async () => {
  try {
    const query = `DELETE FROM log.saved_files
WHERE capture_datetime < NOW() - INTERVAL '48 hours';`;
    await db.any(query);
  } catch (error) {
    console.log(error);
  }
};

module.exports = delete_old_db_files;