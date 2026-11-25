"use strict";
// CV-1b decode.js: read a Philips CV EventLog.txe / lod_EventLog.txe (PLAN-PHILIPS-CV-INSIGHTS.md §7.2, §7.9).
//
// The file is ISO-8859-1 text with CRLF line ends. Fields are separated by byte 0xE1 ("á" in
// Latin-1). Before CV-1b the file was read as UTF-8, so 0xE1 became U+FFFD ("�"), which is what the
// `philips_re.cv` regexes split on. Every other non-UTF-8 byte also became "�"; inside `Memo` that
// cut the memo and lost `subsystem_number` / `thread_name` (I2).
//
// Now: read as Latin-1 (one byte = one code point, lossless), then turn only "á" back into "�".
// The regexes, and the separators stored inside `message`, stay exactly as before; every other byte
// keeps its real character. A genuine "á" in text was already a separator before; that is the
// format, not a change.
//
// Records: a physical line that does not start like a record (`<category>�YYYY-MM-DD�HH:MM:SS�`) is
// a continuation of the previous record: a CR or LF inside a field. It is joined to that record with
// one space, so a value never escapes the mask by being on its own line (review CV1B P1-B).
//
// mask_phi (Q6, C2; review CV1B P1-A): `Command: Set<Field>` UI commands log the value typed at the
// console after `Execute()`. The value's end is taken from the record's structure, not from a tag
// the value itself could contain: everything from `Execute()` to the record's last
// `�SubsystemNumber:` field (or to the end of the record when it has none) becomes `<masked>`.
// Ambiguity over-masks, never under-masks. A value that is empty (nothing, or only the
// `[UI_DEVICE_NAME]  .` tag) is left as it is.
//
// Pure apart from read_lines (file I/O). Node 16.

const fs = require("node:fs");
const readline = require("node:readline");

const SEPARATOR = "�";
const LATIN1_SEPARATOR = /á/g;
const RECORD_START = /^[^�\r\n]*�\d{4}-\d{2}-\d{2}�\d{2}:\d{2}:\d{2}�/;
const BLANK = /^[ \t]*$/;

// The 12 commands seen carrying identifying values (§7.1, C2): any SetPatient*, plus these.
// Procedure names (SetProcedure, SetAcquisitionProcedure, ...) are not identifying and are kept.
const PHI_COMMAND = "Set(?:Patient\\w*|Gender|StudyID|ExaminationID|OperatorName|AttendingPhysician|LongReportText)";
// The command, then (within its field) `Execute()`: the value starts right after it.
const PHI_START = new RegExp(`${PHI_COMMAND}\\b[^\\ufffd]*?Execute\\(\\)`);
const STRUCTURAL_END = "�SubsystemNumber:";
const EMPTY_VALUE = /^\s*(\[UI_DEVICE_NAME\]\s*\.?\s*)?$/;
const MASK = "<masked>";

/** Latin-1 text of one line -> the parser's view: 0xE1 ("á") becomes the "�" separator. */
function decode_line(latin1_line) {
  return latin1_line.replace(LATIN1_SEPARATOR, SEPARATOR);
}

/** Replace the typed value of a PHI command with `<masked>`, up to the record's structural end. */
function mask_phi(record) {
  const m = PHI_START.exec(record);
  if (!m) return record;
  const start = m.index + m[0].length;
  const tail = record.lastIndexOf(STRUCTURAL_END);
  const end = tail >= start ? tail : record.length;
  if (EMPTY_VALUE.test(record.slice(start, end))) return record;
  return `${record.slice(0, start)} ${MASK}${record.slice(end)}`;
}

/** decode + mask of one already-joined record: what the jobs match against. */
function prepare_line(latin1_record) {
  return mask_phi(decode_line(latin1_record));
}

/** Match one prepared record. Returns the named groups (a fresh object) or null. */
function parse_line(line, regex) {
  const m = line.match(regex);
  return m ? { ...m.groups } : null;
}

/** "category | date | time" of a record, for diagnostics; null when the text isn't a record start. */
function safe_head(record) {
  if (!RECORD_START.test(record)) return null;
  return record.split(SEPARATOR).slice(0, 3).join(" | ").slice(0, 80);
}

/**
 * Stream a .txe file as Latin-1 (the files reach 258 MB) and yield prepared records: physical lines
 * joined into records (continuations appended with one space), blank lines dropped, decoded, masked.
 */
async function* read_lines(file_path) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file_path, { encoding: "latin1" }),
    crlfDelay: Infinity
  });
  let held = null;
  for await (const raw of rl) {
    if (BLANK.test(raw)) continue;
    const line = decode_line(raw);
    if (RECORD_START.test(line)) {
      if (held !== null) yield mask_phi(held);
      held = line;
    } else if (held !== null) {
      held += " " + line;
    } else {
      yield mask_phi(line); // text before the first record: matched (and rejected) on its own
    }
  }
  if (held !== null) yield mask_phi(held);
}

module.exports = { decode_line, mask_phi, prepare_line, parse_line, read_lines, safe_head, SEPARATOR, MASK };
