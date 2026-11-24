"use strict";
// PCT-1b save.js: archival inside the ingest transaction (plan §9.5; Q39, Q42).
//
// gzip the spooled bytes and INSERT them into log.saved_files in the SAME transaction as the rows,
// at the attempt's exact capture time (text, cast by the server). Its key (system_id, file_name,
// capture_datetime) makes it the attempt's receipt, a cross-check: delete_old_files removes rows
// after 48 h, so an unknown outcome is decided by the recorded row ids (Q42).
//
// A plain INSERT, never ON CONFLICT DO NOTHING: a pre-existing receipt at this key must fail the
// attempt before it can become `committing`. The shared util/gzip_file.js doesn't await its insert
// and swallows errors, so the CT path doesn't use it.

const zlib = require("zlib");

const SAVE_SQL = "INSERT INTO log.saved_files (system_id, file_name, buffer, capture_datetime) VALUES ($1, $2, $3, $4::timestamptz)";
const RECEIPT_SQL = "SELECT 1 FROM log.saved_files WHERE system_id = $1 AND file_name = $2 AND capture_datetime = $3::timestamptz";

/** @param {object} t  a pg-promise transaction/task */
async function saveInTx(t, sme, fileName, buf, captureText) {
  const gz = zlib.gzipSync(buf);
  await t.none(SAVE_SQL, [sme, fileName, gz, captureText]);
  return gz.length;
}

async function receiptExists(t, sme, fileName, captureText) {
  return (await t.oneOrNone(RECEIPT_SQL, [sme, fileName, captureText])) !== null;
}

module.exports = { saveInTx, receiptExists, SAVE_SQL, RECEIPT_SQL };
