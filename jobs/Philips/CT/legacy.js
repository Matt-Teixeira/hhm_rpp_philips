"use strict";
// PCT-1b legacy.js: rule P (plan §9.3, Q27, Q38).
//
// A stored row matches an incoming row at the same key in one of two ways:
//  (a) an OLD-parser row (its time text is old-form `MM/dd/yy HH:mm:ss`) equals the PROJECTION of
//      the incoming row through the old pipeline;
//  (b) any other row (new form, NULL, other text) equals the incoming row's new representation
//      exactly.
// Each stored row is consumed at most once (a multiset).
//
// The projection replays, from the decoded .csv fields:
//  1. the plain `mdb-export` record (quotes doubled, NULL empty, datetime `MM/dd/yy HH:mm:ss`);
//  2. EAL: `awk 'NF>2'`, the repo's real `ct_eal_v_2` regex, `remove_dub_quotes`, '' -> NULL;
//  3. Events: the collector's `tr -cd` set, the `awk -F,` reorder, the `sed '^"dd/'` filter, the
//     repo's real `ct_events_v2` regex, '' -> NULL. With EAL NULL the old regex ran into the next
//     line of the sorted file and stored that line's event time in `eal` (I6): such a projection
//     matches any stored `eal` that is an old-form datetime.
//
// The old regexes and helpers are required from the repo, not copied, so the projection is the
// old code's behaviour by construction. Pure: no I/O.

const { philips_re } = require("../../../parse/parsers");
const { remove_dub_quotes } = require("../../../util/regExHelpers");
const { HEADERS, EAL_COLS, EVENTS_COLS, CONTENT_COLS } = require("./rows");

const OLD_TIME_RE = /^\d\d\/\d\d\/\d\d \d\d:\d\d:\d\d$/;

// mdb-export column kinds: t = text (quoted), n = number (bare), d = datetime (quoted, old form),
// b = BLOB (stripped in the .csv; it follows every field the old regexes store).
const TYPES = {
  eal: { DTime: "t", Controller: "n", DataType: "t", LogNumber: "n", TmStamp: "n", ERR_TYPE: "t", ErrNum: "t", vxwErrNo: "n", File: "t", Line: "n", Param1: "n", Param2: "n", Info: "t", EalTime: "d" },
  events: { Type: "t", Level: "n", Module: "t", TStampNum: "n", DataTime: "t", Msg: "t", EAL: "t", BLOB: "b", EventTime: "d" },
};

function oldDatetime(v) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d:\d\d)$/.exec(v);
  if (!m) return null;
  return `${m[2]}/${m[3]}/${m[1].slice(2)} ${m[4]}`;
}

/** The plain `mdb-export` record for decoded fields (header order). null if a datetime can't be rebuilt. */
function plainRecord(kind, fields) {
  const names = HEADERS[kind];
  const parts = [];
  for (let i = 0; i < names.length; i++) {
    const t = TYPES[kind][names[i]];
    const v = fields[i];
    if (t === "b" || v === null) {
      parts.push("");
      continue;
    }
    if (t === "n") {
      parts.push(v);
      continue;
    }
    const s = t === "d" ? oldDatetime(v) : v;
    if (s === null) return null;
    parts.push('"' + s.replace(/"/g, '""') + '"');
  }
  return parts.join(",");
}

// The collector's `tr -cd 'A-Za-z0-9\n ",[]:\-_./='` set, applied byte by byte.
const TR_KEEP = /[A-Za-z0-9\n ",\[\]:\-_.\/=]/;
function trStrip(s) {
  let out = "";
  for (const b of Buffer.from(s, "utf8")) {
    const c = String.fromCharCode(b);
    if (TR_KEEP.test(c)) out += c;
  }
  return out;
}

function nullify(groups) {
  const o = {};
  for (const [k, v] of Object.entries(groups)) o[k] = v === "" || v === undefined ? null : v;
  return o;
}

function projectEal(rec) {
  // awk 'NF>2': keep lines with more than two blank-separated fields.
  const lines = rec.split("\n").filter((l) => l.split(/[ \t]+/).filter(Boolean).length > 2);
  const re = new RegExp(philips_re.ct_eal_v_2.source, "g");
  const m = [...lines.join("\n").matchAll(re)];
  if (m.length !== 1) return { dropped: m.length === 0 ? "no regex match" : "multiple matches" };
  const match = { groups: { ...m[0].groups } };
  // As the old eal_parser.js did, in its order.
  if (match.groups.file !== "" || match.groups.err_number) remove_dub_quotes(match, "file");
  if (match.groups.err_number !== "") remove_dub_quotes(match, "err_number");
  return nullify(match.groups);
}

function projectEvents(rec) {
  const out = [];
  for (const line of trStrip(rec).split("\n")) {
    const f = line.split(",");
    const g = (i) => (f[i - 1] === undefined ? "" : f[i - 1]);
    const l2 = [g(9), g(1), g(2), g(3), g(4), g(5), g(6), g(7), g(8)].join(" "); // awk -F, '{print $9,$1..$8}'
    if (/^"[0-9][0-9]\//.test(l2)) out.push(l2); // sed: keep lines starting "dd/
  }
  if (out.length === 0) return { dropped: "line filter" };
  const re = new RegExp(philips_re.ct_events_v2.source, "g");
  let m = [...out.join("\n").matchAll(re)];
  if (m.length === 1) return nullify(m[0].groups);
  if (m.length > 1) return { dropped: "multiple matches" };
  // I6: replay with a placeholder next line; `eal` then only has to be an old-form datetime.
  m = [...(out.join("\n") + '\n"00/00/00 00:00:00" ').matchAll(re)];
  if (m.length !== 1 || m[0].groups.eal !== "00/00/00 00:00:00") return { dropped: "no regex match" };
  return { ...nullify(m[0].groups), eal: null, eal_wildcard: true };
}

/**
 * Project decoded fields through the old pipeline.
 * @returns {object} the old parser's stored columns (host_date, host_time, content), or {dropped}
 */
function project(kind, fields) {
  const rec = plainRecord(kind, fields);
  if (rec === null) return { dropped: "datetime not rebuildable" };
  return kind === "eal" ? projectEal(rec) : projectEvents(rec);
}

/** Is a stored row an old-parser row? Only old-form time text says so (Q38). */
function isOldRow(kind, stored) {
  const t = kind === "eal" ? stored.eal_time : stored.event_time;
  return typeof t === "string" && OLD_TIME_RE.test(t);
}

const same = (a, b) => (a === undefined ? null : a) === (b === undefined ? null : b);

function matchesProjection(kind, p, stored) {
  if (p.dropped) return false;
  if (!same(p.host_date, stored.host_date) || !same(p.host_time, stored.host_time)) return false;
  const cols = kind === "eal" ? EAL_COLS : EVENTS_COLS;
  return cols.every((c) => (c === "eal" && p.eal_wildcard ? typeof stored.eal === "string" && OLD_TIME_RE.test(stored.eal) : same(p[c], stored[c])));
}

function matchesExact(row, stored) {
  return same(row.host_date, stored.host_date) && same(row.host_time, stored.host_time) && CONTENT_COLS.every((c) => same(row[c], stored[c]));
}

/**
 * Rule P as a multiset match.
 * @param {"eal"|"events"} kind
 * @param {Array<{row: object, fields: (string|null)[]}>} incoming  built rows with their raw fields
 * @param {Array<object>} stored  candidate rows of this system and kind (host_date, host_time, content)
 * @returns {{insert: number[], matchedOld: number, matchedNew: number}}  insert = indexes into incoming
 */
function matchRuleP(kind, incoming, stored) {
  const pool = new Map();
  for (const s of stored) {
    const k = `${s.host_date} ${s.host_time}`;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push({ s, old: isOldRow(kind, s), used: false });
  }
  const insert = [];
  let matchedOld = 0;
  let matchedNew = 0;
  incoming.forEach(({ row, fields }, i) => {
    const cands = pool.get(`${row.host_date} ${row.host_time}`);
    if (cands) {
      const n = cands.find((c) => !c.used && !c.old && matchesExact(row, c.s));
      if (n) {
        n.used = true;
        matchedNew++;
        return;
      }
      if (cands.some((c) => !c.used && c.old)) {
        const p = project(kind, fields);
        const o = cands.find((c) => !c.used && c.old && matchesProjection(kind, p, c.s));
        if (o) {
          o.used = true;
          matchedOld++;
          return;
        }
      }
    }
    insert.push(i);
  });
  return { insert, matchedOld, matchedNew };
}

module.exports = { OLD_TIME_RE, plainRecord, project, isOldRow, matchRuleP, trStrip };
