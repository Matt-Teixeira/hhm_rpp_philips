"use strict";
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const L = require("../lib/philips_ct_legacy_export");
const { coverage } = require("../philips_ct_rollback");
const { candidateMonths } = require("../philips_ct_outcome");
const { verdict } = require("../philips_ct_reader_monitor");
const { HEADERS } = require("../../jobs/Philips/CT/rows");

const EAL_CSV = Buffer.from(
  [HEADERS.eal.join(","),
    '"2026/10/30 12:27:19.000",0,"ERROR",0,0,"FATAL",,0,,0,0,0,"B second",2026-10-30 12:27:19'.replace("2026-10-30 12:27:19", '"2026-10-30 12:27:19"'),
    '"2026/10/30 12:27:18.203",0,"ERROR",0,0,"FATAL","E1",0,"f.c",12,0,0,"A ""quoted"", text","2026-10-30 12:27:18"',
  ].join("\n") + "\n"
);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

test("legacy export: the csv route rebuilds an .output and proves it byte for byte", () => {
  const raw = L.rawFromCsv(EAL_CSV, "eal");
  const out = L.legacyOutput("eal", raw, "C");
  const lines = out.toString().split("\n");
  assert.strictEqual(lines[0], HEADERS.eal.join(","));
  assert.ok(lines[1].startsWith('"2026/10/30 12:27:18.203"'), "sorted");
  assert.ok(out.toString().includes('"10/30/26 12:27:18"'), "old-form datetime");
  assert.strictEqual(L.reproduces("eal", raw, out).covered, true);
  const altered = Buffer.concat([out, Buffer.from("x")]);
  assert.strictEqual(L.reproduces("eal", raw, altered).covered, false);
});

function fakeRedis(map) {
  return { get: async (k) => (k in map ? map[k] : null) };
}

test("rollback coverage: the .csv route needs a complete csv (done-hash), and byte identity", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pct1b-rb-"));
  fs.writeFileSync(path.join(dir, "EALInfo.csv"), EAL_CSV);
  const output = L.legacyOutput("eal", L.rawFromCsv(EAL_CSV, "eal"), null);
  fs.writeFileSync(path.join(dir, "EALInfo.output"), output);
  const o = { output: "EALInfo.output", csv: "EALInfo.csv", kind: "eal" };
  const ok = await coverage("SME00001", dir, o, fakeRedis({ "SME00001.EALInfo.csv": JSON.stringify({ sha256: sha(EAL_CSV) }) }));
  assert.strictEqual(ok.status, "COVERED");
  assert.strictEqual(ok.by, "EALInfo.csv");
  assert.strictEqual(ok.size, output.length);
  // Not the done-hash: the csv may not be completely ingested -> UNCOVERED, whatever the bytes.
  const notDone = await coverage("SME00001", dir, o, fakeRedis({ "SME00001.EALInfo.csv": JSON.stringify({ sha256: "0".repeat(64) }) }));
  assert.strictEqual(notDone.status, "UNCOVERED");
  // An .output newer than the csv (a partial publish): one more line -> UNCOVERED.
  fs.writeFileSync(path.join(dir, "EALInfo.output"), Buffer.concat([output, Buffer.from('"2026/10/30 12:30:00.000",0,"X",0,0,"Y",,0,,0,0,0,"Z","10/30/26 12:30:00"\n')]));
  const newer = await coverage("SME00001", dir, o, fakeRedis({ "SME00001.EALInfo.csv": JSON.stringify({ sha256: sha(EAL_CSV) }) }));
  assert.strictEqual(newer.status, "UNCOVERED");
  // No .output at all: nothing to set.
  fs.unlinkSync(path.join(dir, "EALInfo.output"));
  assert.strictEqual((await coverage("SME00001", dir, o, fakeRedis({}))).status, "ABSENT");
});

test("outcome tool: archive months either side of the capture's UTC month", () => {
  assert.deepStrictEqual(candidateMonths("2026-12-01 03:00:00.5+00"), ["2026_11", "2026_12", "2027_01"]);
  assert.deepStrictEqual(candidateMonths("2026-01-15 00:00:00+00"), ["2025_12", "2026_01", "2026_02"]);
});

test("reader monitor: verdict levels", () => {
  const base = { missed: 0, multi: 0, early_definite: 0, with_error: 0, no_start: 0, start_early_uncertain: 0, end_late_uncertain: 0, cross_clock: 0 };
  assert.strictEqual(verdict(base).label, "CONSISTENT");
  assert.strictEqual(verdict({ ...base, cross_clock: 1 }).label, "UNCERTAIN");
  assert.strictEqual(verdict({ ...base, missed: 1 }).label, "VIOLATION");
  assert.strictEqual(verdict({ ...base, early_definite: 1, cross_clock: 1 }).exit, 2);
});
