"use strict";
// CV-1b backfill (PLAN-PHILIPS-CV-INSIGHTS.md §7.4, Q4): load daily exports that never reached
// log.philips_cv_eventlog (I3), through the same line pipeline as the job (jobs/Philips/CV/decode.js).
//
//   DRY_RUN=1 DEV_ENV=prod node tooling/cv_backfill.js <list.tsv>     records the INSERTs, writes nothing
//   node tooling/cv_backfill.js <list.tsv> --apply                    writes (prod: the user runs it)
//   ... --root <dir>   read folders from <dir>/<SME>/<folder> instead of the collector folder (rehearsal)
//
// <list.tsv>: one "<SME>\t<daily folder>" per line; "#" starts a comment.
//
// Per folder, all or nothing (one transaction):
// - capture_datetime = the mtime of the folder's Event.zip: the device's export time, kept by lftp.
//   Not the folder mtime: unzipping EventLog.txe into the folder later moves that to "now". It must
//   be at least 24 h old (never inside the alert processor's 30-minute window) and on or after
//   2026-05-01 (the oldest attached partition when this was written).
// - Refused, and nothing written, when: EventLog.txe or Event.zip is missing; a line doesn't match;
//   a datetime is null; rows with that (system_id, capture_datetime) exist (already loaded); or the
//   system's daily rows already cover more than 10% of the file's records in its time window.
// - Refused when the folder is not strictly before the system's live pointer
//   (`<SME>.last_parsed_phil_cv_daily`, read with GET): the live job only loads folders after its
//   pointer, so it can never load the same folder (review CV1B P3). With no pointer, refused on
//   --apply; under DRY_RUN (the dev Redis) the check is reported, not enforced.
// - The duplicate guards and the INSERT run in one transaction that first takes the advisory lock
//   `philips_cv_backfill`, so two overlapping runs can't both see "not loaded" (review CV1B P3).
// - Rows only: no Redis writes, log.saved_files, offline upsert or metadata (they describe the live state).
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { install, isDryRun } = require("../util/dry_run");
install();
const db = require("../utils/db/pg-pool");
const pgp = require("pg-promise")();
const queries = require("../data_acquisition/on_boot_queries");
const { philips_re } = require("../parse/parsers");
const mapDataToSchema = require("../persist/map-data-to-schema");
const { philips_cv_eventlog_schema } = require("../persist/pg-schemas");
const { pg_column_sets: pg_cs } = require("../utils/db/sql/pg-helpers_hhm");
const generateDateTime = require("../processing/date_processing/generateDateTimes");
const { read_lines, parse_line } = require("../jobs/Philips/CV/decode");
const { folder_key, before_pointer } = require("../jobs/Philips/CV/folders");
const { get_last_parsed_daily } = require("../redis/redisHelpers");

const MIN_CAPTURE = new Date("2026-05-01T00:00:00Z");
const MIN_AGE_MS = 24 * 3600 * 1000;
const MAX_COVERED_SHARE = 0.1;
const CHUNK = 20000;

function read_list(file) {
  return fs.readFileSync(file, "utf8").split("\n")
    .map((l) => l.replace(/#.*/, "").trim()).filter(Boolean)
    .map((l) => { const [sme, folder] = l.split(/\s+/); return { sme, folder }; });
}

async function load_folder(sys, folder, root) {
  const out = { sme: sys.id, folder };
  if (folder_key(folder) === null) return { ...out, refused: "not a daily_* folder name" };
  const ev = sys.log_config.find((f) => f.dir_name === "EventLog");
  if (!ev) return { ...out, refused: "no EventLog config" };
  const dir = path.join(root ? path.join(root, sys.id) : sys.debian_server_path, folder);
  const txe = path.join(dir, ev.file_name);
  const zip = path.join(dir, "Event.zip");
  if (!fs.existsSync(txe)) return { ...out, refused: "no EventLog.txe (the collector sweep unzips it)" };
  if (!fs.existsSync(zip)) return { ...out, refused: "no Event.zip (capture time unknown)" };
  const pointer = await get_last_parsed_daily(sys.id);
  out.live_pointer = pointer;
  if (pointer === null || folder_key(pointer) === null) {
    if (!isDryRun()) return { ...out, refused: "no live pointer for this system" };
    out.pointer_check = "not enforced (DRY_RUN, no pointer)";
  } else if (!before_pointer(folder, pointer)) {
    return { ...out, refused: `not before the live pointer ${pointer}` };
  }
  const capture = new Date(fs.statSync(zip).mtimeMs);
  out.capture_datetime = capture.toISOString();
  if (capture < MIN_CAPTURE) return { ...out, refused: `capture ${out.capture_datetime} before ${MIN_CAPTURE.toISOString()}` };
  if (Date.now() - capture.getTime() < MIN_AGE_MS) return { ...out, refused: "capture less than 24 h old" };

  const data = [];
  let nomatch = 0, nulldt = 0;
  for await (const line of read_lines(txe)) {
    const g = parse_line(line, philips_re.cv[ev.parsers[0]]);
    if (g === null) { if (!/^[ \t\n]*$/.test(line)) nomatch++; continue; }
    g.system_id = sys.id;
    g.host_datetime = await generateDateTime("cv_backfill", sys.id, ev.pg_tables[0], g.host_date, g.host_time, sys.time_zone_id);
    if (g.host_datetime === null) nulldt++;
    g.capture_datetime = capture;
    data.push(g);
  }
  out.records = data.length;
  if (nomatch || nulldt) return { ...out, refused: `${nomatch} unmatched lines, ${nulldt} null datetimes` };
  if (!data.length) return { ...out, refused: "no records" };

  let lo = Infinity, hi = -Infinity; // a loop: one export can hold 444k rows (too many for Math.min(...))
  for (const g of data) { const t = new Date(g.host_datetime).getTime(); if (t < lo) lo = t; if (t > hi) hi = t; }
  const hmin = new Date(lo), hmax = new Date(hi);
  out.window = [hmin.toISOString(), hmax.toISOString()];
  const rows = mapDataToSchema(data, philips_cv_eventlog_schema);

  // The guards and the INSERT, in one serialized section (apply) or recorded as is (DRY_RUN).
  const guarded_write = async (t) => {
    const same = await t.one(
      "SELECT count(*)::int n FROM log.philips_cv_eventlog WHERE system_id = $1 AND capture_datetime = $2", [sys.id, capture]);
    if (same.n > 0) return { ...out, refused: `already loaded (${same.n} rows at this capture_datetime)` };
    const covered = await t.one(
      "SELECT count(*)::int n FROM log.philips_cv_eventlog WHERE system_id = $1 AND lod IS NOT TRUE AND host_datetime BETWEEN $2 AND $3",
      [sys.id, hmin, hmax]);
    const r = { ...out, rows_already_in_window: covered.n };
    if (covered.n > MAX_COVERED_SHARE * data.length) return { ...r, refused: "the window is already covered by daily rows" };
    for (let i = 0; i < rows.length; i += CHUNK) {
      await t.any(pgp.helpers.insert(rows.slice(i, i + CHUNK), pg_cs.log.philips.philips_cv_eventlog));
    }
    return { ...r, inserted: rows.length };
  };
  if (isDryRun()) return guarded_write(db);
  return db.tx(async (t) => {
    await t.one("SELECT pg_advisory_xact_lock(hashtext('philips_cv_backfill'))");
    return guarded_write(t);
  });
}

(async () => {
  const args = process.argv.slice(2);
  const list = args[0];
  const root = args.includes("--root") ? args[args.indexOf("--root") + 1] : null;
  if (!list || (!isDryRun() && !args.includes("--apply"))) {
    console.error("usage: DRY_RUN=1 node tooling/cv_backfill.js <list.tsv>   |   node tooling/cv_backfill.js <list.tsv> --apply");
    process.exit(2);
  }
  const systems = new Map((await db.any(queries.PHILIPS_CV)).map((s) => [s.id, s]));
  let inserted = 0, refused = 0;
  for (const { sme, folder } of read_list(list)) {
    const sys = systems.get(sme);
    let r;
    try {
      r = sys ? await load_folder(sys, folder, root) : { sme, folder, refused: "not a PHILIPS_CV system" };
    } catch (e) {
      r = { sme, folder, refused: `error: ${e.message}` };
    }
    if (r.refused) refused++; else inserted += r.inserted;
    console.log(JSON.stringify(r));
  }
  console.log(JSON.stringify({ summary: { inserted, refused_folders: refused, dry_run: isDryRun() } }));
  process.exit(0);
})();
