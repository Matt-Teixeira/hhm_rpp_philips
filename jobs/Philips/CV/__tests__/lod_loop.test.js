"use strict";
// CV-1b: lod_eventlog.js on a real temp file, with the DB, Redis, file helpers and logger stubbed
// (PLAN-PHILIPS-CV-INSIGHTS.md §7.9: review CV1B P1 and P2 on the on-demand path).
const test = require("node:test");
const assert = require("assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CV = path.join(__dirname, "..");
const ROOT = path.join(CV, "../../..");
const at = (rel) => require.resolve(path.join(ROOT, rel));
const state = {};
const reset = () => Object.assign(state, { inserts: [], sizes: [], logs: [] });
const stub = (rel, exports) => { require.cache[at(rel)] = { id: at(rel), filename: at(rel), loaded: true, exports }; };
stub("utils/db/pg-pool.js", { any: async (q) => { if (/^insert into "log"\."philips_cv_eventlog"/i.test(String(q))) state.inserts.push(q); return []; } });
stub("redis/redisHelpers.js", {
  getRedisFileSize: async () => null,
  getCurrentFileSize: async () => 1000,
  updateRedisFileSize: async (sme) => { state.sizes.push(sme); },
  push_file_dt_queue: async () => {}
});
stub("util/isFileModified.js", { getLastModifiedTime: async () => new Date("2026-11-25T12:00:00Z") });
stub("util/index.js", { gzip_n_save: async () => {} });
stub("processing/date_processing/generateDateTimes.js", async () => "2026-11-25T12:00:00.000Z");
stub("utils/logger/log.js", [async (type, _run, fn, _tag, note, error) => {
  state.logs.push({ type, msg: note && note.message, json: JSON.stringify({ note, error: error && String(error) }) });
}]);
const phil_cv_lod_eventlog = require(path.join(CV, "lod_eventlog.js"));

const A = "á";
const SECRET = "SYNTHETIC_SECRET";
const record = (time, desc = "Command: StartFluoroscopy ", memo = "") => ["Acquisition", "2026-11-25", time, "Information", "20481",
  "Technical Event ID:   510999921", `Description: ${desc}`, "Channel Identification: X", "Module: M", "Source File: S",
  "Line Number: 1 ", `Memo: ${memo}`, "SubsystemNumber: 1", "ThreadName: 2"].join(A);
function run_on(lines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cv1b-lod-"));
  fs.writeFileSync(path.join(root, "lod_EventLog.txe"), Buffer.from(lines.join("\r\n") + "\r\n", "latin1"));
  reset();
  return phil_cv_lod_eventlog("job", { id: "SME00001", debian_server_path: root, time_zone_id: "America/New_York" },
    { file_name: "lod_EventLog.txe", parsers: ["eventlog"], pg_tables: ["log.philips_cv_eventlog"] }, [])
    .finally(() => fs.rmSync(root, { recursive: true }));
}

test("review P1 (lod): a split typed value and an unmatched record reach neither rows nor run-log notes", async () => {
  await run_on([
    record("07:00:02"),
    record("07:00:01", "Command: SetPatientID ", `[FUSION_COMMAND]  SetPatientID Execute() 01\r${SECRET} [UI_DEVICE_NAME]  . `),
    ["Acquisition", "2026-11-25", "07:00:00", "Information", "x", SECRET].join(A)
  ]);
  assert.strictEqual(state.inserts.length, 1);
  assert.strictEqual((state.inserts[0].match(/\('SME00001'/g) || []).length, 2);
  assert.ok(!state.inserts[0].includes(SECRET));
  assert.ok(state.logs.some((l) => l.msg === "NO MATCH FOUND"));
  assert.ok(state.logs.every((l) => !l.json.includes(SECRET)));
  assert.deepStrictEqual(state.sizes, ["SME00001"]); // acknowledged
});

test("review P2 (lod): every record rejected: no insert, the size is not acknowledged", async () => {
  await run_on(["NOT A RECORD"]);
  assert.strictEqual(state.inserts.length, 0);
  assert.deepStrictEqual(state.sizes, []);
  assert.ok(state.logs.some((l) => l.type === "ERROR" && /All 1 records rejected/.test(l.msg || "")));
  assert.ok(state.logs.every((l) => !l.json.includes("NOT A RECORD")));
});
