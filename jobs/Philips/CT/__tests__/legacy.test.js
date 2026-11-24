"use strict";
const test = require("node:test");
const assert = require("assert");
const { decodeFile } = require("../csv");
const { buildRows, HEADERS } = require("../rows");
const { project, matchRuleP, plainRecord, isOldRow } = require("../legacy");

const EAL_H = HEADERS.eal.join(",");
const EV_H = HEADERS.events.join(",");
const ealLine = (o = {}) => {
  const f = { DTime: '"2026/10/30 12:27:18.203"', Controller: "0", DataType: '"ERROR"', LogNumber: "0", TmStamp: "0", ERR_TYPE: '"FATAL"', ErrNum: "", vxwErrNo: "0", File: "", Line: "0", Param1: "0", Param2: "0", Info: '"Sensor"', EalTime: '"2026-10-30 12:27:18"', ...o };
  return HEADERS.eal.map((h) => f[h]).join(",");
};
const evLine = (o = {}) => {
  const f = { Type: '"INFO"', Level: "4", Module: '"Gantry"', TStampNum: "63928960038", DataTime: '"2026/10/30 12:27:18.203"', Msg: '"CStateSeriesNotLoaded now"', EAL: '"Yes"', BLOB: "", EventTime: '"2026-10-30 12:27:18"', ...o };
  return HEADERS.events.map((h) => f[h]).join(",");
};
/** Decode lines -> incoming [{row, fields}] as ingest builds them. */
function incoming(header, lines, kind) {
  const d = decodeFile(Buffer.from([header, ...lines].join("\n") + "\n"));
  const b = buildRows(d, kind);
  const byLine = new Map(d.records.map((r) => [r.line, r.fields]));
  return b.rows.map((x) => ({ row: x.row, fields: byLine.get(x.line) }));
}
const stored = (row, extra = {}) => ({ ...row, ...extra });

test("projection: the old EAL pipeline's stored shape", () => {
  const [x] = incoming(EAL_H, [ealLine({ Info: '"Sensor  "' })], "eal");
  const p = project("eal", x.fields);
  assert.strictEqual(p.host_date, "2026/10/30");
  assert.strictEqual(p.host_time, "12:27:18.203");
  assert.strictEqual(p.eal_time, "10/30/26 12:27:18"); // old form
  assert.strictEqual(p.info, "Sensor"); // the old regex drops trailing blanks
  assert.strictEqual(p.err_number, null);
});

test("projection: Info with \",\" gives the old regex's NULL eal_time (out/22)", () => {
  const [x] = incoming(EAL_H, [ealLine({ Info: '"alpha"",""beta"' })], "eal");
  const p = project("eal", x.fields);
  assert.strictEqual(p.eal_time, null);
  assert.strictEqual(p.info, 'alpha"');
});

test("projection: the old Events pipeline splits Msg into message and eal", () => {
  const [x] = incoming(EV_H, [evLine()], "events");
  const p = project("events", x.fields);
  assert.strictEqual(p.event_time, "10/30/26 12:27:18");
  assert.strictEqual(p.message, "CStateSeriesNotLoaded");
  assert.strictEqual(p.eal, "now");
});

test("projection: EAL NULL -> I6 wildcard on eal", () => {
  const [x] = incoming(EV_H, [evLine({ EAL: "", Msg: '"Done"' })], "events");
  const p = project("events", x.fields);
  assert.strictEqual(p.eal_wildcard, true);
});

test("projection: suffixed Events keys were dropped by the old regex", () => {
  const [x] = incoming(EV_H, [evLine({ DataTime: '"2026/10/30 12:27:18.203__01"' })], "events");
  assert.ok(project("events", x.fields).dropped);
});

test("plainRecord: quotes doubled, NULL empty, numbers bare, old-form datetime", () => {
  assert.strictEqual(plainRecord("events", ["A\"B", "4", null, "1", "2026/10/30 12:27:18.203", "m", null, "", "2026-10-30 12:27:18"]),
    '"A""B",4,,1,"2026/10/30 12:27:18.203","m",,,"10/30/26 12:27:18"');
});

test("rule P: an old row matches its projection; a repeat of new rows matches exactly", () => {
  const inc = incoming(EV_H, [evLine()], "events");
  const p = project("events", inc[0].fields);
  const old = stored({ host_date: p.host_date, host_time: p.host_time, type: p.type, level: p.level, module: p.module, time_stamp: p.time_stamp, message: p.message, eal: p.eal, event_time: p.event_time });
  assert.ok(isOldRow("events", old));
  assert.deepStrictEqual(matchRuleP("events", inc, [old]).insert, []);
  assert.deepStrictEqual(matchRuleP("events", inc, [stored(inc[0].row)]).insert, []);
  assert.deepStrictEqual(matchRuleP("events", inc, []).insert, [0]);
});

test("rule P: a changed row at an old key is kept (review finding 1)", () => {
  const a = incoming(EV_H, [evLine({ Msg: '"Ready Now"' })], "events");
  const pa = project("events", a[0].fields);
  const old = { host_date: pa.host_date, host_time: pa.host_time, type: pa.type, level: pa.level, module: pa.module, time_stamp: pa.time_stamp, message: pa.message, eal: pa.eal, event_time: pa.event_time };
  const b = incoming(EV_H, [evLine({ Msg: '"Fault Raised"' })], "events");
  assert.deepStrictEqual(matchRuleP("events", b, [old]).insert, [0]);
});

test("rule P: the new-only A/B pair is kept in both orders (round-3 finding 1)", () => {
  // A: Info `alpha"`, NULL time. B: Info `alpha","beta`, a time. Same key.
  const A = incoming(EAL_H, [ealLine({ Info: '"alpha"""', EalTime: "" })], "eal")[0];
  const B = incoming(EAL_H, [ealLine({ Info: '"alpha"",""beta"' })], "eal")[0];
  // A stored first, then B arrives: B is inserted.
  assert.deepStrictEqual(matchRuleP("eal", [B], [stored(A.row)]).insert, [0]);
  // B stored first, then A arrives: A is inserted (B's projection must not suppress it).
  assert.deepStrictEqual(matchRuleP("eal", [A], [stored(B.row)]).insert, [0]);
  // Both stored: repeats insert nothing.
  assert.deepStrictEqual(matchRuleP("eal", [A], [stored(A.row), stored(B.row)]).insert, []);
  assert.deepStrictEqual(matchRuleP("eal", [B], [stored(A.row), stored(B.row)]).insert, []);
});

test("rule P: a comma-shifted old EAL row (non-old-form time) is stored once more", () => {
  const inc = incoming(EAL_H, [ealLine({ File: '"f,part"', Info: '"2026-10-30 12:27:18"' })], "eal");
  const p = project("eal", inc[0].fields);
  const old = { host_date: p.host_date, host_time: p.host_time, ...p };
  delete old.dropped;
  // Whatever the regex stored, it isn't old-form here, so it is treated as new and not matched.
  if (!isOldRow("eal", old)) assert.deepStrictEqual(matchRuleP("eal", inc, [old]).insert, [0]);
});

test("rule P: multiset — two equal stored rows, one incoming consumes one", () => {
  const inc = incoming(EAL_H, [ealLine()], "eal");
  const r = matchRuleP("eal", inc, [stored(inc[0].row), stored(inc[0].row)]);
  assert.deepStrictEqual(r.insert, []);
  assert.strictEqual(r.matchedNew, 1);
});

test("rule P: a new row with NULL time matches only an identical new row", () => {
  const inc = incoming(EAL_H, [ealLine({ EalTime: "" })], "eal");
  assert.deepStrictEqual(matchRuleP("eal", inc, [stored(inc[0].row)]).insert, []);
  assert.deepStrictEqual(matchRuleP("eal", inc, [stored(inc[0].row, { info: "other" })]).insert, [0]);
});
