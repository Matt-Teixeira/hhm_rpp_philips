"use strict";
// CV-1b decode.js: read a Philips CV EventLog.txe / lod_EventLog.txe (PLAN-PHILIPS-CV-INSIGHTS.md §7.2).
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
// mask_phi (Q6, C2): `Command: Set<Field>` UI commands log the value typed at the console after
// `Execute()`. The value is replaced with `<masked>` before the line is matched, so it reaches
// neither the DB nor the run-log notes. Empty values are left alone.
//
// Pure apart from read_lines (file I/O). Node 16.

const fs = require("node:fs");
const readline = require("node:readline");

const SEPARATOR = "�";
const LATIN1_SEPARATOR = /á/g;

// The 12 commands seen carrying identifying values (§7.1, C2): any SetPatient*, plus these.
// Procedure names (SetProcedure, SetAcquisitionProcedure, ...) are not identifying and are kept.
const PHI_COMMAND = "Set(?:Patient\\w*|Gender|StudyID|ExaminationID|OperatorName|AttendingPhysician|LongReportText)";
// The value runs from `Execute() ` to the first ` [UI_DEVICE_NAME]`; with no such tag after it, to
// the end of the line (privacy first: that row then loses its trailing fields).
const PHI_RE = new RegExp(`(${PHI_COMMAND} Execute\\(\\) )(.*?)( ?\\[UI_DEVICE_NAME\\]|$)`, "g");
const MASK = "<masked>";

/** Latin-1 text of one line -> the parser's view: 0xE1 ("á") becomes the "�" separator. */
function decode_line(latin1_line) {
  return latin1_line.replace(LATIN1_SEPARATOR, SEPARATOR);
}

/** Replace the typed value of the PHI commands with `<masked>`; empty values stay empty. */
function mask_phi(line) {
  if (line.indexOf("Execute()") === -1) return line;
  return line.replace(PHI_RE, (m, head, value, tail) => (value.trim() === "" ? m : `${head}${MASK}${tail}`));
}

/** decode + mask: what the jobs match against. */
function prepare_line(latin1_line) {
  return mask_phi(decode_line(latin1_line));
}

/** Match one prepared line. Returns the named groups (a fresh object) or null. */
function parse_line(line, regex) {
  const m = line.match(regex);
  return m ? { ...m.groups } : null;
}

/** Stream a .txe file line by line as Latin-1 (the files reach 258 MB). Yields prepared lines. */
async function* read_lines(file_path) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file_path, { encoding: "latin1" }),
    crlfDelay: Infinity
  });
  for await (const line of rl) yield prepare_line(line);
}

module.exports = { decode_line, mask_phi, prepare_line, parse_line, read_lines, SEPARATOR, MASK };
