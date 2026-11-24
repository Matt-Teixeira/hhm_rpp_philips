#!/usr/bin/env node
"use strict";
// PCT-1b reader monitor for contract S (plan §9.5 coverage.js "The monitor"; Q45; round-6 finding 1).
// Read-only. Usage: node tooling/philips_ct_reader_monitor.js [days=1]
//
// S: each scheduled alert-processor run's CT snapshot is at DB time in [slot - 60 s, slot + 5 min].
// The snapshot isn't logged; it lies between the run's start (`dt`, HOST clock) and its end
// (`inserted_at`, DB clock). So this is a monitor, not a proof:
//   VIOLATION (definite, DB clock only): end < slot - 60 s; a missed slot; > 1 run in a slot; an ERROR entry.
//   UNCERTAIN: no start; start < slot - 50 s (host clock); end > slot + 5 min; start > end + 10 s.
//   CONSISTENT with S: none of the above (a proxy, never a measurement of the snapshot).
// Expected slots come from an explicit DB-clock interval, independent of the rows: every :24/:54
// slot whose S deadline (slot + 5 min) has passed. Runs are assigned to the nearest slot by
// `inserted_at`. Exit status: 0 all consistent, 1 uncertain only, 2 any violation.

/** The query for an interval given as two SQL expressions (DB clock). The source table is a parameter for fixture tests. */
const monitorSql = (lo, hi, source = "util.app_run_logs") => `
WITH p AS (SELECT ${lo} lo, ${hi} hi),
b AS (SELECT to_timestamp(ceil((extract(epoch FROM lo) - 1440) / 1800) * 1800 + 1440) first_slot,
             to_timestamp(floor((extract(epoch FROM hi - interval '5 min') - 1440) / 1800) * 1800 + 1440) last_slot FROM p),
g AS (SELECT generate_series(first_slot, last_slot, interval '30 min') slot FROM b),
r AS (
  SELECT a.run_id, a.inserted_at, (a.verbose_log->0->>'dt')::timestamptz start_dt,
         EXISTS (SELECT 1 FROM json_array_elements(a.warn_error_logs) w WHERE w->>'type'='ERROR') has_error,
         to_timestamp(round((extract(epoch FROM a.inserted_at) - 1440) / 1800) * 1800 + 1440) slot
  FROM ${source} a, b
  WHERE a.app_name='alert-processor'
    AND a.inserted_at >= b.first_slot - interval '15 min' AND a.inserted_at < b.last_slot + interval '15 min'),
f AS (
  SELECT r.*,
         r.inserted_at < r.slot - interval '60 s' early_definite,
         r.start_dt IS NULL no_start,
         coalesce(r.start_dt < r.slot - interval '50 s', false) start_early_uncertain,
         r.inserted_at > r.slot + interval '5 min' end_late_uncertain,
         coalesce(r.start_dt > r.inserted_at + interval '10 s', false) cross_clock
  FROM r JOIN g USING (slot)),
n AS (SELECT g.slot, count(f.run_id)::int runs FROM g LEFT JOIN f USING (slot) GROUP BY 1)
SELECT (SELECT first_slot FROM b)::text first_slot, (SELECT last_slot FROM b)::text last_slot,
       (SELECT count(*) FROM n)::int slots,
       (SELECT count(*) FROM n WHERE runs = 0)::int missed,
       (SELECT count(*) FROM n WHERE runs > 1)::int multi,
       (SELECT coalesce(json_agg(slot::text ORDER BY slot), '[]') FROM n WHERE runs <> 1) odd_slots,
       count(*)::int runs,
       count(*) FILTER (WHERE early_definite)::int early_definite,
       count(*) FILTER (WHERE has_error)::int with_error,
       count(*) FILTER (WHERE no_start)::int no_start,
       count(*) FILTER (WHERE start_early_uncertain)::int start_early_uncertain,
       count(*) FILTER (WHERE end_late_uncertain)::int end_late_uncertain,
       count(*) FILTER (WHERE cross_clock)::int cross_clock,
       count(*) FILTER (WHERE NOT (early_definite OR has_error OR no_start OR start_early_uncertain OR end_late_uncertain OR cross_clock))::int consistent
FROM f`;

function verdict(r) {
  if (r.missed || r.multi || r.early_definite || r.with_error) return { exit: 2, label: "VIOLATION" };
  if (r.no_start || r.start_early_uncertain || r.end_late_uncertain || r.cross_clock) return { exit: 1, label: "UNCERTAIN" };
  return { exit: 0, label: "CONSISTENT" };
}

async function main() {
  require("dotenv").config();
  const days = Number(process.argv[2] || 1);
  if (!(days > 0 && days <= 60)) throw new Error("days must be in (0, 60]");
  const db = require("../utils/db/pg-pool");
  const r = await db.one(monitorSql(`now() - interval '${days} days'`, "now()"));
  const v = verdict(r);
  console.log(JSON.stringify({ verdict: v.label, ...r }, null, 1));
  process.exit(v.exit);
}

if (require.main === module) main().catch((e) => (console.error(e), process.exit(3)));

module.exports = { monitorSql, verdict };
