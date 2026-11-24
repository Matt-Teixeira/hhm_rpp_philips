"use strict";
// The collector's LEGACY export steps (hhm_data_acquisition read/sh/Philips/phil_ct_data_grab_1.sh
// at aa68ceb, the "LEGACY EXPORTS" block), verbatim, applied to a raw plain `mdb-export` file.
// Used by tooling/philips_ct_rollback.js to prove an `.output` covered by content (plan §9.4, Q35).
//
// `sort` depends on the locale, and the cron environment's locale isn't recorded, so callers try
// several. A byte-identical result proves coverage whichever locale produced it.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { HEADERS } = require("../../jobs/Philips/CT/rows");
const { plainRecord } = require("../../jobs/Philips/CT/legacy");
const { decodeFile } = require("../../jobs/Philips/CT/csv");

const LOCALES = [null, "C", "C.UTF-8", "en_US.UTF-8"];

// Verbatim from the grab script (only $inc and the raw file names are parameters).
const EVENTS_SH = `
echo "Type,Level,Module,TStampNum,DataTime,Msg,EAL,BLOB,EventTime" >"$inc/Events.output"
tr -cd [:alnum:]'\\n''\\ ''"'',''['']'':''\\-''_''.''/''=' <"$inc/events.raw" >"$inc/ev.1"
awk -v FS="," '{print $9, $1, $2, $3, $4, $5, $6, $7, $8}' "$inc/ev.1" >"$inc/ev.2"
sort "$inc/ev.2" >"$inc/ev.3"
sed -n -e "/^\\"[0-9][0-9]\\/.*/p" "$inc/ev.3" >>"$inc/Events.output"
`;
const EAL_SH = `
echo "DTime,Controller,DataType,LogNumber,TmStamp,ERR_TYPE,ErrNum,vxwErrNo,File,Line,Param1,Param2,Info,EalTime" >"$inc/EALInfo.output"
tail -n +2 "$inc/ealinfo.raw" >"$inc/eal.1"
sort "$inc/eal.1" >"$inc/eal.2"
awk 'NF > 2' "$inc/eal.2" >>"$inc/EALInfo.output"
`;

/** Run the legacy steps on a raw plain export. @returns {Buffer} the `.output` bytes */
function legacyOutput(kind, rawBuf, locale) {
  const inc = fs.mkdtempSync(path.join(os.tmpdir(), "pct1b-legacy-"));
  try {
    const raw = kind === "eal" ? "ealinfo.raw" : "events.raw";
    fs.writeFileSync(path.join(inc, raw), rawBuf);
    const env = { PATH: process.env.PATH, inc };
    if (locale) env.LC_ALL = locale;
    else if (process.env.LANG) env.LANG = process.env.LANG;
    execFileSync("/bin/sh", ["-e", "-c", kind === "eal" ? EAL_SH : EVENTS_SH], { env, stdio: ["ignore", "ignore", "pipe"], timeout: 300000 });
    return fs.readFileSync(path.join(inc, kind === "eal" ? "EALInfo.output" : "Events.output"));
  } finally {
    fs.rmSync(inc, { recursive: true, force: true });
  }
}

/** The plain `mdb-export <mdb> <table>` output (the legacy raw input). */
function rawFromMdb(mdbPath, kind) {
  return execFileSync("mdb-export", [mdbPath, kind === "eal" ? "EALInfo" : "Events"], { maxBuffer: 1 << 30, timeout: 300000 });
}

/** A raw plain export rebuilt from a `.csv` (§9.3 check A). null if any record can't be rebuilt. */
function rawFromCsv(csvBuf, kind) {
  const d = decodeFile(csvBuf);
  if (d.headerError) return null;
  const lines = [HEADERS[kind].join(",")];
  for (const r of d.records) {
    if (r.error) return null;
    const rec = plainRecord(kind, r.fields);
    if (rec === null) return null;
    lines.push(rec);
  }
  return Buffer.from(lines.join("\n") + "\n", "utf8");
}

/**
 * Does some candidate locale reproduce `target` byte for byte from `raw`?
 * @returns {{covered: boolean, locale?: string|null, tried: Array<{locale, size, sha256?}>}}
 */
function reproduces(kind, raw, target) {
  const crypto = require("crypto");
  const tried = [];
  for (const locale of LOCALES) {
    let out;
    try {
      out = legacyOutput(kind, raw, locale);
    } catch (e) {
      tried.push({ locale, error: String(e.message).slice(0, 200) });
      continue;
    }
    tried.push({ locale, size: out.length, sha256: crypto.createHash("sha256").update(out).digest("hex") });
    if (out.equals(target)) return { covered: true, locale, tried };
  }
  return { covered: false, tried };
}

module.exports = { legacyOutput, rawFromMdb, rawFromCsv, reproduces, LOCALES };
