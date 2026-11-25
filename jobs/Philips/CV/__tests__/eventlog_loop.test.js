"use strict";
// CV-1b: the daily-folder loop of eventlog.js (PLAN-PHILIPS-CV-INSIGHTS.md §7.2, C3), run on real temp
// folders with the DB, Redis, directory listing and logger replaced by in-memory stubs.
const test = require("node:test");
const assert = require("assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CV = path.join(__dirname, "..");
const ROOT = path.join(CV, "../../..");
const at = (rel) => require.resolve(path.join(ROOT, rel));

// ---- stubs (installed before eventlog.js is loaded) ----
const state = {};
function reset(pointer, { failInsert = false } = {}) {
  Object.assign(state, { pointer, inserts: [], saved: [], upserts: 0, logs: [], failInsert });
}
const stub = (rel, exports) => { require.cache[at(rel)] = { id: at(rel), filename: at(rel), loaded: true, exports }; };
stub("utils/db/pg-pool.js", {
  any: async (q) => {
    if (/^insert into "log"\."philips_cv_eventlog"/i.test(q)) {
      if (state.failInsert) throw new Error("insert failed (test)");
      state.inserts.push(q);
    } else state.upserts++;
    return [];
  }
});
stub("redis/redisHelpers.js", {
  get_last_parsed_daily: async () => state.pointer,
  update_last_parsed_daily: async (sme, dir) => { state.pointer = dir; }
});
stub("read/exec-dir_list.js", async (_script, [dir]) => fs.readdirSync(dir).join(" ") + "\n");
stub("processing/date_processing/generateDateTimes.js", async () => "2026-11-25T12:00:00.000Z");
stub("processing/date_processing/phil_cv/extract_memo_data.js", async () => {});
stub("util/index.js", {
  build_upsert_str: () => "upsert",
  gzip_n_save: async (_j, _r, sme, name, _c, file) => { state.saved.push(path.basename(path.dirname(file))); }
});
stub("utils/logger/log.js", [async (type, _run, fn, _tag, note, error) => {
  state.logs.push({ type, fn, msg: note && note.message, dir: note && note.dir, json: JSON.stringify({ note, error: error && String(error) }) });
}]);

const phil_cv_eventlog = require(path.join(CV, "eventlog.js"));

// ---- temp system folder ----
const A = "á";
const record = (time, desc = "Command: StartFluoroscopy ", memo = "") => ["Acquisition", "2026-11-25", time, "Information", "20481",
  "Technical Event ID:   510999921", `Description: ${desc}`, "Channel Identification: X", "Module: M", "Source File: S",
  "Line Number: 1 ", `Memo: ${memo}`, "SubsystemNumber: 1", "ThreadName: 2"].join(A);
const SECRET = "SYNTHETIC_SECRET";
function write_txe(root, name, lines) {
  fs.writeFileSync(path.join(root, name, "EventLog.txe"), Buffer.from(lines.join("\r\n") + "\r\n", "latin1"));
}
function system(folders) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cv1b-loop-"));
  for (const [name, spec] of Object.entries(folders)) {
    const d = path.join(root, name);
    fs.mkdirSync(d);
    if (spec.lines) fs.writeFileSync(path.join(d, "EventLog.txe"), Buffer.from(spec.lines.join("\r\n") + "\r\n", "latin1"));
    if (spec.age_hours) {
      const t = (Date.now() - spec.age_hours * 3600000) / 1000;
      fs.utimesSync(d, t, t);
    }
  }
  return root;
}
const run = (root) => phil_cv_eventlog("job", { id: "SME00001", debian_server_path: root, time_zone_id: "America/New_York" },
  { file_name: "EventLog.txe", parsers: ["eventlog"], pg_tables: ["log.philips_cv_eventlog"] }, []);
const rows = (q) => (q.match(/\('SME00001'/g) || []).length;

test("a folder without EventLog.txe younger than 48 h: stop, the pointer stays, later folders wait", async () => {
  const root = system({ daily_2026_11_10: { lines: [record("07:00:00")] }, daily_2026_11_11: {}, daily_2026_11_12: { lines: [record("07:00:01")] } });
  reset("daily_2026_11_10");
  await run(root);
  assert.strictEqual(state.inserts.length, 0);
  assert.strictEqual(state.pointer, "daily_2026_11_10");
  assert.ok(state.logs.some((l) => /pointer stays/.test(l.msg || "") && l.dir === "daily_2026_11_11"));
  fs.rmSync(root, { recursive: true });
});

test("older than 48 h: skipped with a warning, then the next folder is parsed and saved", async () => {
  const root = system({ daily_2026_11_11: { age_hours: 72 }, daily_2026_11_12: { lines: [record("07:00:02"), record("07:00:01"), ""] } });
  reset("daily_2026_11_10");
  await run(root);
  assert.ok(state.logs.some((l) => l.type === "WARN" && /skipped/.test(l.msg || "") && l.dir === "daily_2026_11_11"));
  assert.strictEqual(state.inserts.length, 1);
  assert.strictEqual(rows(state.inserts[0]), 2);
  assert.strictEqual(state.pointer, "daily_2026_11_12");
  assert.deepStrictEqual(state.saved, ["daily_2026_11_12"]);
  fs.rmSync(root, { recursive: true });
});

test("a failed insert stops the run: the pointer stays and no later folder is tried", async () => {
  const root = system({ daily_2026_11_11: { lines: [record("07:00:00")] }, daily_2026_11_12: { lines: [record("07:00:01")] } });
  reset("daily_2026_11_10", { failInsert: true });
  await run(root);
  assert.strictEqual(state.pointer, "daily_2026_11_10");
  assert.strictEqual(state.logs.filter((l) => l.type === "ERROR").length, 1);
  assert.ok(!state.logs.some((l) => l.dir === "daily_2026_11_12"));
  fs.rmSync(root, { recursive: true });
});

test("several folders: each parsed in date order, only the newest saved; a file with no records moves on", async () => {
  const root = system({
    daily_2026_11_13: { lines: [record("07:00:03")] }, daily_2026_11_11: { lines: [record("07:00:01")] },
    daily_2026_11_12: { lines: ["", "  "] }
  });
  reset("daily_2026_11_10");
  await run(root);
  assert.strictEqual(state.inserts.length, 2);
  assert.ok(state.logs.some((l) => /No records/.test(l.msg || "") && l.dir === "daily_2026_11_12"));
  assert.strictEqual(state.pointer, "daily_2026_11_13");
  assert.deepStrictEqual(state.saved, ["daily_2026_11_13"]);
  fs.rmSync(root, { recursive: true });
});

test("a new system (no pointer) parses only its newest folder, as before", async () => {
  const root = system({ daily_2026_11_11: { lines: [record("07:00:01")] }, daily_2026_11_12: { lines: [record("07:00:02")] } });
  reset(null);
  await run(root);
  assert.strictEqual(state.inserts.length, 1);
  assert.strictEqual(state.pointer, "daily_2026_11_12");
  fs.rmSync(root, { recursive: true });
});

test("review P1: a typed value split over lines, and an unmatched record, reach neither rows nor run-log notes", async () => {
  const root = system({
    daily_2026_11_20: {
      lines: [
        record("07:00:02"),
        record("07:00:01", "Command: SetLongReportText ", `[FUSION_COMMAND]  SetLongReportText Execute() first\n${SECRET} [UI_DEVICE_NAME]  . `),
        ["Acquisition", "2026-11-25", "07:00:00", "Information", "not-a-number", `${SECRET}`].join(A)
      ]
    }
  });
  reset("daily_2026_11_19");
  await run(root);
  assert.strictEqual(state.inserts.length, 1);
  assert.strictEqual(rows(state.inserts[0]), 2);
  assert.ok(!state.inserts[0].includes(SECRET));
  assert.ok(state.logs.some((l) => l.msg === "NO MATCH FOUND"));
  assert.ok(state.logs.every((l) => !l.json.includes(SECRET)), "a run-log note holds the value");
  assert.strictEqual(state.pointer, "daily_2026_11_20");
  fs.rmSync(root, { recursive: true });
});

test("review P2: a file whose every record is rejected keeps the pointer; once replaced, the next run loads it", async () => {
  const root = system({ daily_2026_11_20: { lines: ["NOT A RECORD"] } });
  reset("daily_2026_11_19");
  await run(root);
  assert.strictEqual(state.inserts.length, 0);
  assert.strictEqual(state.pointer, "daily_2026_11_19");
  assert.ok(state.logs.some((l) => l.type === "ERROR" && /All 1 records rejected/.test(l.msg || "")));
  assert.ok(state.logs.every((l) => !l.json.includes("NOT A RECORD")));
  write_txe(root, "daily_2026_11_20", [record("07:00:01"), record("07:00:00")]);
  const pointer = state.pointer;
  reset(pointer);
  await run(root);
  assert.strictEqual(state.inserts.length, 1);
  assert.strictEqual(rows(state.inserts[0]), 2);
  assert.strictEqual(state.pointer, "daily_2026_11_20");
  fs.rmSync(root, { recursive: true });
});

test("NO MATCH notes are capped per file, with one summary of the total", async () => {
  const bad = Array.from({ length: 25 }, (_, i) => ["Acquisition", "2026-11-25", "07:00:00", "Information", "x", String(i)].join(A));
  const root = system({ daily_2026_11_20: { lines: [record("07:00:01"), ...bad] } });
  reset("daily_2026_11_19");
  await run(root);
  assert.strictEqual(state.logs.filter((l) => l.msg === "NO MATCH FOUND").length, 20);
  assert.ok(state.logs.some((l) => /NO MATCH FOUND for 25 records/.test(l.msg || "")));
  assert.strictEqual(state.inserts.length, 1);
  fs.rmSync(root, { recursive: true });
});
