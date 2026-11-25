#!/usr/bin/env node
"use strict";
// PCT-1b `late` repair (plan §9.5 tooling/philips_ct_restamp.js; Q44; round-5 notes).
//
//   node tooling/philips_ct_restamp.js <SME> <entry>
//
// Run it during the phase (after :30 and before :52, after :00 and before :22, UTC minutes). It
// takes the system's spool lock and follows the ingest protocol:
//   1. restamp.json in the entry, fsynced: an operation id, the EAL ids, the old capture text;
//   2. a transaction: the advisory lock, $new = clock_timestamp()::text inside the phase,
//      UPDATE ... SET capture_datetime = $new WHERE id = ANY($ids) AND capture_datetime = $old
//      (row count must equal the id count), the guard, restamp.json -> committing; COMMIT; t1;
//   3. an unknown outcome (restamp.json `committing` on a later run): the same barrier, horizon
//      and partition preconditions, then the ids counted against the list: all at $new ->
//      committed; all at $old -> aborted; any other mix -> ERROR. The operation id is kept; an
//      unresolved intent is never overwritten;
//   4. t1 classified like an ingest: DELIVERED -> the entry is `committed` and the next CT run
//      completes it; late -> it stays late, and a further repair starts from this $new.
// Rows moving partitions across a month boundary keep their ids. A late row that was in fact read
// is read again: two detections (accepted).

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { findEntry, withSystemLock, directConn } = require("./lib/philips_ct_tool");
const { lockKey, ATTACHED_SQL } = require("../jobs/Philips/CT/ingest");
const cov = require("../jobs/Philips/CT/coverage");

const HORIZON_US = 24 * 3600 * 1e6;

/** Count the ids at a capture text. */
async function countAt(conn, ids, capture) {
  return (await conn.one("SELECT count(*)::int AS n FROM log.philips_ct_eal_events WHERE id = ANY($1::bigint[]) AND capture_datetime = $2::timestamptz", [ids, capture])).n;
}

/** Decide an earlier operation's unknown outcome. @returns {"committed"|"aborted"|"unknown"|"contradiction"} */
async function resolveOp(conn, op, sme) {
  await conn.none("BEGIN");
  try {
    await conn.none("SET LOCAL lock_timeout = '10min'");
    await conn.one("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey(sme, "eal")]);
    const { now } = await conn.one("SELECT clock_timestamp()::text AS now");
    if (cov.parseTs(now) - cov.parseTs(op.t0) >= HORIZON_US) return { outcome: "unknown", reason: "past the 24 h horizon" };
    for (const c of [op.old, op.new]) if ((await conn.one(ATTACHED_SQL, [c])).n !== 1) return { outcome: "unknown", reason: `partition for ${c} not attached` };
    const atNew = await countAt(conn, op.ids, op.new);
    const atOld = await countAt(conn, op.ids, op.old);
    if (atNew === op.ids.length && atOld === 0) return { outcome: "committed", t1: now };
    if (atOld === op.ids.length && atNew === 0) return { outcome: "aborted" };
    return { outcome: "contradiction", reason: `${atNew} at new, ${atOld} at old, of ${op.ids.length}` };
  } catch (e) {
    return { outcome: "unknown", reason: String(e.message) };
  } finally {
    await conn.none("ROLLBACK").catch(() => {});
  }
}

async function main() {
  require("dotenv").config();
  const [sme, name] = process.argv.slice(2);
  if (!sme || !name) {
    console.error("usage: node tooling/philips_ct_restamp.js <SME> <entry>");
    process.exit(64);
  }
  const db = require("../utils/db/pg-pool");
  const { spool, entry } = findEntry(sme, name);
  const opFile = path.join(entry.dir, "restamp.json");
  await withSystemLock(spool, async () => {
    const state = spool.readState(entry.dir);
    if (!state || state.status !== "late") throw new Error(`entry is ${state ? state.status : "without state"}, not late`);
    const conn = await directConn(db);
    try {
      // 3. An earlier operation first.
      if (fs.existsSync(opFile)) {
        const op = JSON.parse(fs.readFileSync(opFile, "utf8"));
        if (op.status === "committing") {
          const r = await resolveOp(conn, op, sme);
          console.log(JSON.stringify({ earlier_operation: op.op_id, ...r }));
          if (r.outcome === "committed") return record(spool, entry, state, op, r.t1, opFile);
          if (r.outcome !== "aborted") {
            process.exitCode = 2;
            return console.log("the earlier operation's outcome is not decided; nothing done");
          }
        }
        fs.unlinkSync(opFile); // an intent never sent, or aborted
      }
      // 1. Intent.
      const ids = state.eal_ids || [];
      if (ids.length === 0) throw new Error("no EAL ids to re-stamp");
      const op = { op_id: uuidv4(), status: "intent", ids, old: state.capture, at: new Date().toISOString() };
      spool.writeAtomic(opFile, Buffer.from(JSON.stringify(op, null, 1)));
      // 2. The transaction.
      await conn.none("BEGIN");
      let committing = false;
      try {
        const { got } = await conn.one("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS got", [lockKey(sme, "eal")]);
        if (!got) throw new Error("the advisory lock is busy");
        const { cap } = await conn.one("SELECT clock_timestamp()::text AS cap");
        const capUs = cov.parseTs(cap);
        if (!cov.inPhase(capUs)) throw new Error(`outside the phase (${cap}); run it after :30 / :00 and before :52 / :22`);
        const res = await conn.result("UPDATE log.philips_ct_eal_events SET capture_datetime = $1::timestamptz WHERE id = ANY($2::bigint[]) AND capture_datetime = $3::timestamptz", [cap, ids, op.old]);
        if (res.rowCount !== ids.length) throw new Error(`UPDATE matched ${res.rowCount} of ${ids.length} ids at ${op.old}`);
        const { t0, pid } = await conn.one("SELECT clock_timestamp()::text AS t0, pg_backend_pid() AS pid");
        if (!cov.guardOk(capUs, cov.parseTs(t0))) throw new Error("guard: past the phase end");
        Object.assign(op, { status: "committing", new: cap, t0, pid });
        spool.writeAtomic(opFile, Buffer.from(JSON.stringify(op, null, 1)));
        committing = true;
        await conn.none("COMMIT");
      } catch (e) {
        if (committing) {
          process.exitCode = 2;
          return console.log(`COMMIT outcome unknown (${e.message}); run this tool again to decide it`);
        }
        await conn.none("ROLLBACK").catch(() => {});
        fs.unlinkSync(opFile);
        throw e;
      }
      const { t1 } = await conn.one("SELECT clock_timestamp()::text AS t1");
      record(spool, entry, state, op, t1, opFile);
    } finally {
      conn.done();
    }
  });
  process.exit(process.exitCode || 0);
}

/** 4. Record a committed operation in the entry's state; remove restamp.json last. */
function record(spool, entry, state, op, t1, opFile) {
  const classification = cov.classify(cov.parseTs(op.new), cov.parseTs(t1));
  // Idempotent (review finding 3): an operation already recorded is not appended again.
  const already = (state.restamps || []).some((r) => r.op_id === op.op_id);
  const restamps = already ? state.restamps : [...(state.restamps || []), { op_id: op.op_id, old: op.old, new: op.new, t1, classification }];
  const next = { ...state, capture: op.new, t1, classification, restamps, status: classification === "late" ? "late" : "committed" };
  spool.writeState(entry.dir, next);
  fs.unlinkSync(opFile);
  console.log(`re-stamped ${op.ids.length} EAL rows ${op.old} -> ${op.new}: ${classification}${classification === "late" ? " (still late: run again in the phase)" : " (the next CT run completes the entry)"}`);
}

if (require.main === module) main().catch((e) => (console.error(e.message), process.exit(1)));

module.exports = { resolveOp, record };
