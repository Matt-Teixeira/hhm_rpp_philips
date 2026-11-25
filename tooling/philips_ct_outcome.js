#!/usr/bin/env node
"use strict";
// PCT-1b manual outcome check (plan §9.5 ingest.js "Manual check"; Q46; round-6 notes).
//
//   node tooling/philips_ct_outcome.js check   <SME> <entry>   read-only
//   node tooling/philips_ct_outcome.js resolve <SME> <entry>   records the answer when complete
//
// For an entry still `committing` that the run can't decide (past 24 h, or its partition detached):
// after the same advisory-lock barrier, it searches the active table AND the archive_log tables
// that could hold the capture time (the capture's UTC month and the months either side; a detached
// partition has no bound, so archive tables are found by name) for the recorded ids, and the
// receipt. Complete answers only:
//   - no ids recorded: the receipt decides; either way nothing was inserted, so "aborted" is safe;
//   - every recorded id found -> committed;
//   - none found, with every candidate table searched successfully -> aborted;
//   - anything else (a mix, a receipt without its ids, any query/permission/catalog failure) -> unknown.
// `resolve` runs its own fresh check under the barrier and the system's spool lock; it never
// records an earlier result.

const { findEntry, withSystemLock, directConn } = require("./lib/philips_ct_tool");
const { lockKey } = require("../jobs/Philips/CT/ingest");
const { receiptExists } = require("../jobs/Philips/CT/save");

function candidateMonths(captureText) {
  const d = new Date(Date.parse(captureText.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")));
  const out = [];
  for (const k of [-1, 0, 1]) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
    out.push(`${m.getUTCFullYear()}_${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** The archive tables that could hold the capture, and the parent's attached partitions. */
async function catalogState(conn, capture) {
  const archives = [];
  for (const m of candidateMonths(capture)) {
    const t = await conn.oneOrNone("SELECT format('%I.%I', n.nspname, c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'archive_log' AND c.relname = $1 AND c.relkind IN ('r', 'p')", [`philips_ct_eal_events_${m}`]);
    if (t) archives.push(t.t);
  }
  const attached = (await conn.any("SELECT c.oid::regclass::text AS p, i.inhdetachpending AS pending FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'log.philips_ct_eal_events'::regclass ORDER BY 1")).map((r) => `${r.p}${r.pending ? " (detach pending)" : ""}`);
  return { archives, attached };
}

/** @returns {{outcome, detail}} */
async function checkOutcome(conn, state, sme, fileName) {
  await conn.none("BEGIN");
  try {
    await conn.none("SET LOCAL lock_timeout = '10min'");
    await conn.one("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey(sme, state.kind)]);
    // Fence the archive job (review finding 4): its plain DETACH PARTITION needs ACCESS EXCLUSIVE on
    // the parent, so it waits while this transaction holds ACCESS SHARE. Taken BEFORE the catalog
    // is listed, and held through the reads; inserts (ROW EXCLUSIVE) are not blocked.
    await conn.none("LOCK TABLE log.philips_ct_eal_events IN ACCESS SHARE MODE");
    const { now } = await conn.one("SELECT clock_timestamp()::text AS now");
    const receipt = await receiptExists(conn, sme, fileName, state.capture);
    const ids = state.ids || [];
    if (ids.length === 0) return { outcome: receipt ? "committed" : "aborted", detail: { ids: 0, receipt, now } };
    const catalogBefore = await catalogState(conn, state.capture);
    const tables = ["log.philips_ct_eal_events", ...catalogBefore.archives];
    const found = new Set();
    const searched = [];
    for (const t of tables) {
      const rows = await conn.any(`SELECT id::text AS id FROM ${t} WHERE id = ANY($1::bigint[]) AND capture_datetime = $2::timestamptz`, [ids, state.capture]);
      for (const r of rows) found.add(r.id);
      searched.push({ table: t, found: rows.length });
    }
    // Belt and braces (a DETACH ... CONCURRENTLY isn't fenced by ACCESS SHARE): the catalog must be
    // unchanged after the reads, else the answer is incomplete.
    const catalogAfter = await catalogState(conn, state.capture);
    if (JSON.stringify(catalogAfter) !== JSON.stringify(catalogBefore)) return { outcome: "unknown", detail: { reason: "the partitions changed during the check", before: catalogBefore, after: catalogAfter } };
    const detail = { ids: ids.length, found: found.size, receipt, searched, now };
    if (found.size === ids.length) return { outcome: "committed", detail };
    if (found.size === 0 && !receipt) return { outcome: "aborted", detail };
    return { outcome: "unknown", detail };
  } catch (e) {
    return { outcome: "unknown", detail: { error: String(e.message) } }; // incomplete, never empty
  } finally {
    await conn.none("ROLLBACK").catch(() => {});
  }
}

async function main() {
  require("dotenv").config();
  const [mode, sme, name] = process.argv.slice(2);
  if (!["check", "resolve"].includes(mode) || !sme || !name) {
    console.error("usage: node tooling/philips_ct_outcome.js check|resolve <SME> <entry>");
    process.exit(64);
  }
  const db = require("../utils/db/pg-pool");
  const { spool, entry } = findEntry(sme, name);
  const run = async () => {
    const state = spool.readState(entry.dir);
    if (!state || state.status !== "committing") throw new Error(`entry is ${state ? state.status : "without state"}, not committing`);
    const conn = await directConn(db);
    try {
      const r = await checkOutcome(conn, state, sme, entry.file);
      console.log(JSON.stringify({ entry: entry.name, attempt: state.attempt_id, capture: state.capture, ...r }, null, 1));
      if (mode === "resolve") {
        if (r.outcome === "committed") {
          spool.writeState(entry.dir, { ...state, status: "committed", t1: r.detail.now, resolved: "manual", classification: (state.eal_ids || []).length ? "late" : "no_eal_rows" });
          console.log("recorded: committed (its window has passed: a late entry, repair with tooling/philips_ct_restamp.js)");
        } else if (r.outcome === "aborted") {
          spool.writeState(entry.dir, { ...state, status: "spooled", previous_attempt: state.attempt_id, resolved: "manual" });
          console.log("recorded: aborted (the next run makes a new attempt)");
        } else {
          console.log("not recorded: the answer is incomplete");
          process.exitCode = 2;
        }
      }
    } finally {
      conn.done();
    }
  };
  if (mode === "resolve") await withSystemLock(spool, run);
  else await run();
  process.exit(process.exitCode || 0);
}

if (require.main === module) main().catch((e) => (console.error(e.message), process.exit(1)));

module.exports = { checkOutcome, candidateMonths, catalogState };
