"use strict";
// PCT-1b rows.js: validate decoded records and build table rows (plan §9.5, §9.3, Q28, Q38).
//
// Exact header per table. Per record: the field count; the key `yyyy/MM/dd HH:mm:ss.SSS[__NN]`,
// a real calendar date and time; for Events, at least one stored Events column set. Output:
// host_date / host_time (suffix kept, as the old EAL regex stored it), message = Msg whole,
// eal = EAL as given. Q28 text: eal_time / event_time = the export's `YYYY-MM-DD HH:MM:SS` or NULL
// (any other time text is a bad record, so a new row is never old-form: Q38's invariant); Info
// right-trimmed (/\s+$/, all-blank -> NULL); everything else exact. Each built row is checked to
// classify back into its own kind.
//
// Pure: no I/O. host_datetime and capture_datetime are added elsewhere (time.js, ingest.js).

const { DateTime } = require("luxon");

const HEADERS = {
  eal: ["DTime", "Controller", "DataType", "LogNumber", "TmStamp", "ERR_TYPE", "ErrNum", "vxwErrNo", "File", "Line", "Param1", "Param2", "Info", "EalTime"],
  events: ["Type", "Level", "Module", "TStampNum", "DataTime", "Msg", "EAL", "BLOB", "EventTime"],
};

/** Content columns of log.philips_ct_eal_events, in table order. */
const EAL_COLS = ["controller", "data_type", "log_number", "tm_stamp", "err_type", "err_number", "vxw_err_no", "file", "line", "param_1", "param_2", "info", "eal_time"];
const EVENTS_COLS = ["type", "level", "module", "time_stamp", "message", "eal", "event_time"];
const CONTENT_COLS = EAL_COLS.concat(EVENTS_COLS);

const KEY_RE = /^(\d{4}\/\d{2}\/\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})(__\d{2})?$/;
const NEW_TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** The kind predicate, identical to the SQL one: Events iff any Events column is non-NULL. */
function kindOf(row) {
  return EVENTS_COLS.some((c) => row[c] !== null && row[c] !== undefined) ? "events" : "eal";
}

/** SQL text of the same predicate, for the candidate read. */
const KIND_SQL = "num_nonnulls(type, level, module, time_stamp, message, eal, event_time) > 0";

function headerKind(header) {
  for (const [kind, h] of Object.entries(HEADERS)) {
    if (header && header.length === h.length && header.every((f, i) => f === h[i])) return kind;
  }
  return null;
}

/** Parse and check a key. @returns {{host_date, host_time, wall} | {error}} wall = without suffix. */
function parseKey(key) {
  if (key === null) return { error: "key is NULL" };
  const m = KEY_RE.exec(key);
  if (!m) return { error: "key format" };
  const wall = `${m[1]} ${m[2]}`;
  const dt = DateTime.fromFormat(wall, "yyyy/MM/dd HH:mm:ss.SSS", { zone: "UTC" });
  // Round trip: luxon normalises some values (24:00:00.000 -> the next day), so require identity.
  if (!dt.isValid || dt.toFormat("yyyy/MM/dd HH:mm:ss.SSS") !== wall) return { error: "key is not a real date and time" };
  return { host_date: m[1], host_time: m[2] + (m[3] || ""), wall };
}

function timeText(v, name) {
  if (v === null) return { value: null };
  if (!NEW_TIME_RE.test(v)) return { error: `${name} is not YYYY-MM-DD HH:MM:SS` };
  const dt = DateTime.fromFormat(v, "yyyy-MM-dd HH:mm:ss", { zone: "UTC" });
  if (!dt.isValid || dt.toFormat("yyyy-MM-dd HH:mm:ss") !== v) return { error: `${name} is not a real date and time` };
  return { value: v };
}

function rtrimInfo(v) {
  if (v === null) return null;
  const t = v.replace(/\s+$/, "");
  return t === "" ? null : t;
}

function emptyRow() {
  const row = {};
  for (const c of CONTENT_COLS) row[c] = null;
  return row;
}

/**
 * Build one row from a decoded record.
 * @param {"eal"|"events"} kind
 * @param {(string|null)[]} fields
 * @returns {{row: object, wall: string} | {error: string, field?: string}}
 */
function buildRow(kind, fields) {
  const h = HEADERS[kind];
  if (fields.length !== h.length) return { error: `field count ${fields.length}, expected ${h.length}` };
  const f = {};
  h.forEach((name, i) => (f[name] = fields[i]));
  const row = emptyRow();
  let key;
  if (kind === "eal") {
    key = parseKey(f.DTime);
    if (key.error) return { error: key.error, field: "DTime" };
    const t = timeText(f.EalTime, "EalTime");
    if (t.error) return { error: t.error, field: "EalTime" };
    Object.assign(row, {
      controller: f.Controller, data_type: f.DataType, log_number: f.LogNumber, tm_stamp: f.TmStamp,
      err_type: f.ERR_TYPE, err_number: f.ErrNum, vxw_err_no: f.vxwErrNo, file: f.File, line: f.Line,
      param_1: f.Param1, param_2: f.Param2, info: rtrimInfo(f.Info), eal_time: t.value,
    });
  } else {
    key = parseKey(f.DataTime);
    if (key.error) return { error: key.error, field: "DataTime" };
    const t = timeText(f.EventTime, "EventTime");
    if (t.error) return { error: t.error, field: "EventTime" };
    Object.assign(row, {
      type: f.Type, level: f.Level, module: f.Module, time_stamp: f.TStampNum,
      message: f.Msg, eal: f.EAL, event_time: t.value,
    });
    if (EVENTS_COLS.every((c) => row[c] === null)) return { error: "no Events column set" };
  }
  row.host_date = key.host_date;
  row.host_time = key.host_time;
  if (kindOf(row) !== kind) return { error: `row classifies as ${kindOf(row)}, not ${kind}` };
  return { row, wall: key.wall };
}

/**
 * Validate a decoded file and build its rows.
 * @param {{header, headerError, records, dataLines}} decoded  from csv.decodeFile
 * @param {"eal"|"events"} expectedKind  from the configured file name
 * @returns {{kind, rows: Array<{row, wall, line}>, bad: Array<{line, field?, reason}>, formatChange: string|null, dataLines}}
 */
function buildRows(decoded, expectedKind) {
  const { header, headerError, records, dataLines } = decoded;
  if (headerError) return { kind: expectedKind, rows: [], bad: [], formatChange: `header: ${headerError}`, dataLines };
  const kind = headerKind(header);
  if (kind !== expectedKind) return { kind: expectedKind, rows: [], bad: [], formatChange: "header does not match the expected table", dataLines };
  const rows = [];
  const bad = [];
  for (const rec of records) {
    if (rec.error) {
      bad.push({ line: rec.line, reason: rec.error });
      continue;
    }
    const b = buildRow(kind, rec.fields);
    if (b.error) bad.push({ line: rec.line, field: b.field, reason: b.error });
    else rows.push({ row: b.row, wall: b.wall, line: rec.line });
  }
  // Q29: more than max(10, floor(1% of data lines)) bad lines is a format change: nothing ingested.
  const limit = Math.max(10, Math.floor(dataLines / 100));
  const formatChange = bad.length > limit ? `${bad.length} bad lines of ${dataLines} (limit ${limit})` : null;
  return { kind, rows: formatChange ? [] : rows, bad, formatChange, dataLines };
}

module.exports = {
  HEADERS, EAL_COLS, EVENTS_COLS, CONTENT_COLS, KIND_SQL, NEW_TIME_RE,
  kindOf, headerKind, parseKey, buildRow, buildRows, rtrimInfo,
};
