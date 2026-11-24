"use strict";
const test = require("node:test");
const assert = require("assert");
const { decodeFile } = require("../csv");
const { buildRow, buildRows, parseKey, kindOf, HEADERS } = require("../rows");

const EAL_H = HEADERS.eal.join(",");
const EV_H = HEADERS.events.join(",");
const ealLine = (o = {}) => {
  const f = { DTime: '"2026/10/30 12:27:18.203"', Controller: "0", DataType: '"ERROR"', LogNumber: "0", TmStamp: "0", ERR_TYPE: '"FATAL"', ErrNum: "", vxwErrNo: "0", File: "", Line: "0", Param1: "0", Param2: "0", Info: '"Sensor  "', EalTime: '"2026-10-30 12:27:18"', ...o };
  return HEADERS.eal.map((h) => f[h]).join(",");
};
const evLine = (o = {}) => {
  const f = { Type: '"INFO"', Level: "4", Module: '"Gantry"', TStampNum: "63928960038", DataTime: '"2026/10/30 12:27:18.203"', Msg: '"CStateSeriesNotLoaded now"', EAL: '"Yes"', BLOB: "", EventTime: '"2026-10-30 12:27:18"', ...o };
  return HEADERS.events.map((h) => f[h]).join(",");
};
const build = (header, lines, kind) => buildRows(decodeFile(Buffer.from([header, ...lines].join("\n") + "\n")), kind);

test("key: format, suffix kept, real dates only", () => {
  assert.deepStrictEqual(parseKey("2026/10/30 12:27:18.203__05"), { host_date: "2026/10/30", host_time: "12:27:18.203__05", wall: "2026/10/30 12:27:18.203" });
  assert.ok(parseKey("2026/02/30 00:00:00.000").error); // impossible date
  assert.ok(parseKey("2026/10/30 24:00:00.000").error);
  assert.ok(parseKey("2026/10/30 12:27:18").error);
  assert.ok(parseKey("2026/10/30 12:27:18.203__5").error);
  assert.ok(parseKey(null).error);
});

test("EAL row: Q28 text, Info right-trimmed, NULL vs empty", () => {
  const r = build(EAL_H, [ealLine()], "eal");
  assert.strictEqual(r.formatChange, null);
  assert.strictEqual(r.rows.length, 1);
  const row = r.rows[0].row;
  assert.strictEqual(row.info, "Sensor");
  assert.strictEqual(row.eal_time, "2026-10-30 12:27:18");
  assert.strictEqual(row.err_number, null);
  assert.strictEqual(row.host_time, "12:27:18.203");
  assert.strictEqual(kindOf(row), "eal");
  assert.strictEqual(build(EAL_H, [ealLine({ Info: '"   "' })], "eal").rows[0].row.info, null); // all blank -> NULL
  assert.strictEqual(build(EAL_H, [ealLine({ File: '""' })], "eal").rows[0].row.file, ""); // empty text kept
});

test("time text: new form or NULL; old form and other text are bad records (Q38)", () => {
  assert.strictEqual(build(EAL_H, [ealLine({ EalTime: "" })], "eal").rows[0].row.eal_time, null);
  for (const t of ['"10/30/26 12:27:18"', '"2026-10-30"', '"2026-02-30 00:00:00"', '"2026-10-30 24:00:00"']) {
    const r = build(EAL_H, [ealLine({ EalTime: t })], "eal");
    assert.strictEqual(r.rows.length, 0, t);
    assert.strictEqual(r.bad[0].field, "EalTime");
  }
  assert.strictEqual(build(EV_H, [evLine({ EventTime: '"10/30/26 12:27:18"' })], "events").bad.length, 1);
});

test("Events row: Msg whole, EAL as given, BLOB ignored, multi-line message", () => {
  const r = build(EV_H, [evLine({ Msg: '"a, b\\nc \\\\x"', EAL: '"No"', BLOB: '""' })], "events");
  const row = r.rows[0].row;
  assert.strictEqual(row.message, "a, b\nc \\x");
  assert.strictEqual(row.eal, "No");
  assert.strictEqual(kindOf(row), "events");
});

test("Events: an all-NULL payload is a bad record (it would read back as EAL)", () => {
  const line = evLine({ Type: "", Level: "", Module: "", TStampNum: "", Msg: "", EAL: "", EventTime: "" });
  const r = build(EV_H, [line], "events");
  assert.strictEqual(r.rows.length, 0);
  assert.strictEqual(r.bad[0].reason, "no Events column set");
});

test("field count and header checks", () => {
  assert.ok(buildRow("eal", ["x"]).error);
  assert.ok(build(EV_H, [evLine()], "eal").formatChange); // wrong table for the configured file
  assert.ok(build(EAL_H + ",Extra", [], "eal").formatChange);
});

test("thresholds: max(10, floor(1%)) bad lines", () => {
  const run = (total, badN) => {
    const lines = [];
    for (let i = 0; i < total; i++) lines.push(i < badN ? '"bad' : ealLine({ DTime: `"2026/10/30 12:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000"` }));
    return build(EAL_H, lines, "eal").formatChange === null;
  };
  assert.strictEqual(run(1000, 10), true);
  assert.strictEqual(run(1000, 11), false);
  assert.strictEqual(run(1100, 11), true);
  assert.strictEqual(run(1100, 12), false);
  assert.strictEqual(run(999, 10), true);
  assert.strictEqual(run(999, 11), false);
  assert.strictEqual(run(1001, 10), true);
  assert.strictEqual(run(1001, 11), false);
});

test("a partial file keeps its good rows and lists the bad ones", () => {
  const r = build(EAL_H, [ealLine(), '"broken', ealLine({ DTime: '"2026/13/01 00:00:00.000"' })], "eal");
  assert.strictEqual(r.rows.length, 1);
  assert.deepStrictEqual(r.bad.map((b) => b.line), [3, 4]);
  assert.strictEqual(r.formatChange, null);
});
