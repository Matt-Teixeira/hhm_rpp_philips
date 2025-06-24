const [addLogEvent] = require("../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat },
} = require("../utils/logger/enums");

const convertRowsToColumns = async (job_id, sme, rows, run_log) => {
  // PG INSERT PAYLOADS ARE 2D ARRAYS, EACH SUB ARRAY REPRESENTS A COLUMN OF DATA

  let note = { job_id };

  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const dbColumnCount = firstRow.length;

  note.first_row = firstRow;
  note.last_row = lastRow;
  note.db_column_count = dbColumnCount;

  await addLogEvent(I, run_log, "convertRowsToColumns", cal, note, null);

  const dbPayload = Array.from(new Array(dbColumnCount), () => []);

  rows.forEach((row) => {
    row.forEach((columnValue, idx) => {
      dbPayload[idx].push(columnValue);
    });
  });

  return dbPayload;
};

module.exports = convertRowsToColumns;
