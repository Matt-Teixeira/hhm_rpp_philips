#!/usr/bin/env node
"use strict";
// PCT-1b rollback tool (plan §9.4, Q30 -> Q35). You run it; `check` first, then `apply`.
//
//   node tooling/philips_ct_rollback.js check [SME...]   read-only: what apply would do
//   node tooling/philips_ct_rollback.js apply [SME...]   per system, under the collector's lock
//
// Before `apply`: comment out the CT cron line and wait until `pgrep -af 'index.js PHILIPS_CT'`
// prints nothing. Per system, `apply`:
//   1. takes the collector's own lock (<dir>/.grab.lock), waiting for a running grab (<= 630 s);
//   2. copies the five published files to retained/philips_ct/<SME>/rollback_<utc>/ with
//      manifest.json (name, size, sha256), fsynced, each copy read back and its sha256 compared;
//   3. per `.output`, proves coverage from content: COVERED by Logger.mdb if the collector's legacy
//      commands on the preserved Logger.mdb give the preserved `.output` byte for byte; or COVERED
//      by .csv if the preserved .csv is complete (its sha256 is the done-hash and nothing is
//      pending in the spool) and the `.output` rebuilt from it is byte-identical;
//   4. only for a covered `.output`: SET <SME>.<file>.output <size of the preserved copy>.
// Anything not preserved, verified or covered: UNCOVERED with the evidence, offset unchanged,
// exit status 2. Replay afterwards: `node index.js PHILIPS_CT_REPLAY <the rollback folder>`.

const fs = require("fs");
const path = require("path");
const { Spool, sha256, APP_ROOT, utcStamp, flockFile } = require("../jobs/Philips/CT/spool");
const { reproduces, rawFromMdb, rawFromCsv } = require("./lib/philips_ct_legacy_export");

const PUBLISHED = ["Logger.mdb", "EALInfo.output", "Events.output", "EALInfo.csv", "Events.csv"];
const OUTPUTS = [
  { output: "EALInfo.output", csv: "EALInfo.csv", kind: "eal" },
  { output: "Events.output", csv: "Events.csv", kind: "events" },
];

/** The collector's lock (<dir>/.grab.lock), waiting up to `waitS` seconds; held by our own fd. */
function collectorLock(dir, waitS) {
  return flockFile(path.join(dir, ".grab.lock"), waitS);
}

function writeDurable(file, buf) {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, buf);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}
function fsyncDir(dir) {
  const fd = fs.openSync(dir, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Preserve the five files; @returns {{folder, manifest, problems}} */
function preserve(sme, dir, stamp) {
  const folder = path.join(APP_ROOT, "retained", "philips_ct", sme, `rollback_${stamp}`);
  fs.mkdirSync(folder, { recursive: true });
  const manifest = [];
  const problems = [];
  for (const name of PUBLISHED) {
    const src = path.join(dir, name);
    if (!fs.existsSync(src)) {
      manifest.push({ name, present: false });
      continue;
    }
    const buf = fs.readFileSync(src);
    const hash = sha256(buf);
    writeDurable(path.join(folder, name), buf);
    const back = sha256(fs.readFileSync(path.join(folder, name)));
    if (back !== hash) problems.push(`${name}: copy read back with a different sha256`);
    manifest.push({ name, present: true, size: buf.length, sha256: hash });
  }
  writeDurable(path.join(folder, "manifest.json"), Buffer.from(JSON.stringify({ sme, source: dir, at: new Date().toISOString(), files: manifest }, null, 1)));
  fsyncDir(folder);
  fsyncDir(path.dirname(folder));
  return { folder, manifest, problems };
}

/** Coverage of one `.output` from the files in `base` (preserved copies, or the live dir for check). */
async function coverage(sme, base, o, redis) {
  const outPath = path.join(base, o.output);
  if (!fs.existsSync(outPath)) return { output: o.output, status: "ABSENT", note: "no .output: nothing to set" };
  const target = fs.readFileSync(outPath);
  const evidence = {};
  const mdb = path.join(base, "Logger.mdb");
  if (fs.existsSync(mdb)) {
    try {
      const r = reproduces(o.kind, rawFromMdb(mdb, o.kind), target);
      evidence.mdb = r;
      if (r.covered) return { output: o.output, status: "COVERED", by: "Logger.mdb", size: target.length, locale: r.locale };
    } catch (e) {
      evidence.mdb = { error: String(e.message).slice(0, 300) };
    }
  }
  const csvPath = path.join(base, o.csv);
  if (fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath);
    const done = await redis.get(`${sme}.${o.csv}`);
    const doneHash = done ? JSON.parse(done).sha256 : null;
    const pending = new Spool({ sme }).entries().some((e) => e.file === o.csv && (!e.state || e.state.status !== "complete"));
    evidence.csv = { sha256: sha256(csv), done_hash: doneHash, pending };
    if (doneHash === sha256(csv) && !pending) {
      const raw = rawFromCsv(csv, o.kind);
      const r = raw ? reproduces(o.kind, raw, target) : { covered: false, tried: "not rebuildable" };
      evidence.csv.rebuild = r;
      if (r.covered) return { output: o.output, status: "COVERED", by: o.csv, size: target.length, locale: r.locale };
    }
  }
  return { output: o.output, status: "UNCOVERED", evidence };
}

async function main() {
  require("dotenv").config();
  const [mode, ...only] = process.argv.slice(2);
  if (!["check", "apply"].includes(mode)) {
    console.error("usage: node tooling/philips_ct_rollback.js check|apply [SME...]");
    process.exit(64);
  }
  const db = require("../utils/db/pg-pool");
  const queries = require("../data_acquisition/on_boot_queries");
  const initRedis = require("../redis");
  const systems = (await db.any(queries.PHILIPS_CT)).filter((s) => only.length === 0 || only.includes(s.id));
  const redis = await initRedis();
  let exit = 0;
  try {
    for (const sys of systems) {
      const dir = sys.debian_server_path;
      if (!dir || !fs.existsSync(dir)) {
        console.log(`${sys.id}: no collector folder (${dir}); nothing to do`);
        continue;
      }
      if (mode === "check") {
        for (const o of OUTPUTS) {
          const c = await coverage(sys.id, dir, o, redis);
          const cur = await redis.get(`${sys.id}.${o.output}`);
          console.log(`${sys.id} ${o.output}: ${c.status}${c.by ? " by " + c.by : ""}${c.size !== undefined ? ` -> would SET ${sys.id}.${o.output} ${c.size} (now ${cur})` : ""}`);
          if (c.status === "UNCOVERED") console.log("   evidence:", JSON.stringify(c.evidence).slice(0, 1500));
        }
        continue;
      }
      const lock = await collectorLock(dir, 630);
      if (!lock) {
        console.log(`${sys.id}: UNCOVERED: the collector's lock was not released within 630 s`);
        exit = 2;
        continue;
      }
      try {
        const p = preserve(sys.id, dir, utcStamp());
        console.log(`${sys.id}: preserved -> ${p.folder}`);
        if (p.problems.length) {
          console.log(`${sys.id}: UNCOVERED: preservation failed: ${p.problems.join("; ")}`);
          exit = 2;
          continue;
        }
        for (const o of OUTPUTS) {
          const c = await coverage(sys.id, p.folder, o, redis);
          if (c.status === "COVERED") {
            await redis.set(`${sys.id}.${o.output}`, String(c.size));
            console.log(`${sys.id} ${o.output}: COVERED by ${c.by}; SET ${sys.id}.${o.output} ${c.size}`);
          } else if (c.status === "ABSENT") {
            console.log(`${sys.id} ${o.output}: absent; offset unchanged`);
          } else {
            console.log(`${sys.id} ${o.output}: UNCOVERED; offset unchanged. Evidence: ${JSON.stringify(c.evidence).slice(0, 1500)}`);
            exit = 2;
          }
        }
      } finally {
        await lock.release();
      }
    }
  } finally {
    await redis.quit();
  }
  process.exit(exit);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { coverage, preserve, collectorLock, OUTPUTS, PUBLISHED };
