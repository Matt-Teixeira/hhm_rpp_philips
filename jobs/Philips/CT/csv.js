"use strict";
// PCT-1b csv.js: decode the collector's EALInfo.csv / Events.csv (plan §9.5, §9.1).
//
// Dialect (phil_ct_data_grab_1.sh, `mdb-export -e -b strip -T '%Y-%m-%d %H:%M:%S'`, then
// `tr -d '\000'`): a header line, then one PHYSICAL line per record. `-e` escapes every line break
// inside a field, so a record never spans lines. Fields are comma-separated; text is quoted with
// `"`, and a quote inside text is doubled.
//
// Per line: a trailing CR is dropped (CRLF); the quoting is parsed first, then each field gets ONE
// left-to-right unescape pass (\n \r \t \\; any other backslash pair is kept as is). An unquoted
// empty field is NULL; `""` is empty text. A line with bad quoting is a bad record, not a fatal
// error: the caller decides (Q29).
//
// Pure: no I/O. Node 16.

const ESC = { n: "\n", r: "\r", t: "\t", "\\": "\\" };

/** One left-to-right pass: `\n` `\r` `\t` `\\` decoded; any other backslash pair kept. */
function unescapeField(s) {
  if (s.indexOf("\\") === -1) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && ESC[s[i + 1]] !== undefined) {
      out += ESC[s[i + 1]];
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * Parse one physical line (CR already removed).
 * @returns {{fields: (string|null)[]} | {error: string}}
 */
function parseLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false; // inside a quoted section
  let quoted = false; // this field was quoted
  let closed = false; // this field's closing quote has been seen
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
          closed = true;
        }
      } else {
        cur += c;
      }
    } else if (c === ",") {
      fields.push(quoted || cur !== "" ? unescapeField(cur) : null);
      cur = "";
      quoted = false;
      closed = false;
    } else if (c === '"') {
      if (quoted || cur !== "") return { error: "quote inside an unquoted field or after a closing quote" };
      inQuotes = true;
      quoted = true;
    } else {
      if (closed) return { error: "text after a closing quote" };
      cur += c;
    }
  }
  if (inQuotes) return { error: "unterminated quote" };
  fields.push(quoted || cur !== "" ? unescapeField(cur) : null);
  return { fields };
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Decode a whole file buffer.
 * @param {Buffer} buf
 * @returns {{
 *   header: string[] | null,       // null when the file has no header line or a bad one
 *   headerError: string | null,
 *   records: Array<{line: number, fields?: (string|null)[], error?: string}>,  // line = 1-based physical line
 *   dataLines: number               // physical lines after the header, not counting one final empty line
 * }}
 */
function decodeFile(buf) {
  // Split on LF at the byte level, so one bad UTF-8 sequence spoils only its own line.
  const lines = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      lines.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  lines.push(buf.subarray(start));
  // One final empty line (the file ends with LF) is not a record.
  if (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();

  const text = (b) => {
    const s = UTF8.decode(b);
    return s.endsWith("\r") ? s.slice(0, -1) : s;
  };

  let header = null;
  let headerError = null;
  if (lines.length === 0) {
    headerError = "empty file";
  } else {
    try {
      const p = parseLine(text(lines[0]));
      if (p.error) headerError = p.error;
      else if (p.fields.some((f) => f === null || f === "")) headerError = "empty header field";
      else header = p.fields;
    } catch (e) {
      headerError = "invalid UTF-8";
    }
  }

  const records = [];
  for (let n = 1; n < lines.length; n++) {
    const lineNo = n + 1;
    let s;
    try {
      s = text(lines[n]);
    } catch (e) {
      records.push({ line: lineNo, error: "invalid UTF-8" });
      continue;
    }
    if (s.indexOf("\0") !== -1) {
      records.push({ line: lineNo, error: "NUL byte" });
      continue;
    }
    const p = parseLine(s);
    records.push(p.error ? { line: lineNo, error: p.error } : { line: lineNo, fields: p.fields });
  }
  return { header, headerError, records, dataLines: Math.max(0, lines.length - 1) };
}

module.exports = { decodeFile, parseLine, unescapeField };
