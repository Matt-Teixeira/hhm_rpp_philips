// Compare a dry-run of this app against what the old app (hhm_rpp) really inserted.
//
//   node tooling/parity_check.js <dry_run_output/JOB.<ts>.sql> <since ISO timestamp>
//
// For each table the dry run would have INSERTed into, counts rows in prod with
// capture_datetime >= <since>, and prints both numbers side by side.
// Read-only: runs with the same DRY_RUN guard as the app.
process.env.DRY_RUN = "1";
require("dotenv").config();
const fs = require("fs");
const db = require("../utils/db/pg-pool");
require("../util/dry_run").install();

const [file, since] = process.argv.slice(2);
if (!file || !since || isNaN(Date.parse(since))) {
  console.error("usage: node tooling/parity_check.js <dry-run .sql file> <since ISO timestamp>");
  process.exit(2);
}

// Tables whose row counts are compared; others (logs, upserts) are listed only.
const SKIP = new Set(["util.app_run_logs", "alert.offline_hhm_conn"]);

(async () => {
  const expected = {};
  const text = fs.readFileSync(file, "utf8");
  // Some tables (log.saved_files) are shared with the GE/Siemens apps:
  // only count rows for the systems this dry run touched.
  const systems = [...new Set(text.match(/SME\d+/g) || [])];
  for (const line of text.split("\n")) {
    const m = line.match(/^-- \[pg\.\w+\] INSERT (\S+)(?: \(~(\d+) rows\))?/);
    if (!m) continue;
    expected[m[1]] = (expected[m[1]] || 0) + Number(m[2] || 1);
  }
  console.log(`dry run: ${file} (${systems.length} systems)\nprod rows with capture_datetime >= ${since}\n`);
  console.log("table".padEnd(45), "dry-run".padStart(10), "prod".padStart(10), "");
  for (const [table, want] of Object.entries(expected).sort()) {
    if (SKIP.has(table)) {
      console.log(table.padEnd(45), String(want).padStart(10), "(skipped)".padStart(10));
      continue;
    }
    const [schema, name] = table.split(".");
    try {
      const { n } = await db.one(
        "SELECT count(*)::int AS n FROM $1:name.$2:name WHERE capture_datetime >= $3 AND system_id IN ($4:csv)",
        [schema, name, since, systems]
      );
      const flag = n === want ? "OK" : "DIFF";
      console.log(table.padEnd(45), String(want).padStart(10), String(n).padStart(10), flag);
    } catch (e) {
      console.log(table.padEnd(45), String(want).padStart(10), "n/a".padStart(10), e.message);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
