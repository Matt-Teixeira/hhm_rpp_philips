const db = require("../../utils/db/pg-pool");

const reset_daily_system_totals = async () => {
  try {
    const query = `
    UPDATE alert.offline_hhm_conn 
        SET 
            daily_total_history = daily_total_history || daily_total,
            daily_total = 0;`;
    await db.any(query);
  } catch (error) {
    console.log(error);
  }
};

module.exports = reset_daily_system_totals;