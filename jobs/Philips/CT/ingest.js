"use strict";
// PCT-1b ingest.js: one attempt per spool entry, one transaction (plan §9.5 ingest.js; Q32, Q39,
// Q41, Q42, Q43, Q46).
//
// The attempt runs on its own DIRECT connection with manual BEGIN / COMMIT, so the state file is
// written before COMMIT is sent and a COMMIT failure is handled exactly:
//   1. state `attempting` (attempt uuid) before BEGIN;
//   2. pg_try_advisory_xact_lock first; busy -> roll back, the entry stays pending;
//   3. capture = clock_timestamp()::text, kept as text; must be inside the phase;
//   4. the candidate read; 5. rule P; inserts in batches of 5,000 RETURNING id;
//   6. EAL: alert.offline_hhm_conn upsert with GREATEST (Q32);
//   7. the receipt (save.js);
//   8. the guard (t0 before the phase end), then state `committing` with the ids and the pid;
//   9. COMMIT, t1, state `committed` and the classification.
// An unknown outcome is decided by resolveUnknown(): after the barrier, by the recorded ids.

const pgp = require("pg-promise")();
const { v4: uuidv4 } = require("uuid");
const { decodeFile } = require("./csv");
const { buildRows, CONTENT_COLS, KIND_SQL } = require("./rows");
const { matchRuleP } = require("./legacy");
const { hostDatetime } = require("./time");
const cov = require("./coverage");
const { saveInTx, receiptExists } = require("./save");
const { sha256 } = require("./spool");

const BATCH = 5000;
const HORIZON_US = 24 * 3600 * 1e6;

const lockKey = (sme, kind) => `philips_ct_ingest:${sme}:${kind}`;

const INSERT_CS = new pgp.helpers.ColumnSet(
  ["system_id", "host_date", "host_time", ...CONTENT_COLS, { name: "host_datetime", cast: "timestamptz" }, { name: "capture_datetime", cast: "timestamptz" }],
  { table: new pgp.helpers.TableName({ schema: "log", table: "philips_ct_eal_events" }) }
);

const CANDIDATE_SQL = (kind) => `
SELECT id, host_date, host_time, ${CONTENT_COLS.join(", ")}
FROM log.philips_ct_eal_events
WHERE system_id = $1
  AND ((host_datetime >= $2::timestamptz AND host_datetime <= $3::timestamptz) OR host_datetime IS NULL)
  AND host_date = ANY($4::text[])
  AND ${kind === "events" ? "" : "NOT "}(${KIND_SQL})`;

const UPSERT_SQL = `
INSERT INTO alert.offline_hhm_conn (system_id, rpp_host_datetime) VALUES ($1, $2::timestamptz)
ON CONFLICT (system_id) DO UPDATE
SET rpp_host_datetime = GREATEST(alert.offline_hhm_conn.rpp_host_datetime, EXCLUDED.rpp_host_datetime)`;

// The partition holding a capture time, by typed bound comparison (Q46): exactly one attached,
// bounded partition, no detach pending.
const ATTACHED_SQL = `
SELECT count(*)::int AS n
FROM pg_inherits i
JOIN pg_class c ON c.oid = i.inhrelid,
LATERAL regexp_match(pg_get_expr(c.relpartbound, c.oid), $$^FOR VALUES FROM \\('([^']*)'\\) TO \\('([^']*)'\\)$$) b
WHERE i.inhparent = 'log.philips_ct_eal_events'::regclass
  AND NOT i.inhdetachpending
  AND $1::timestamptz >= b[1]::timestamptz AND $1::timestamptz < b[2]::timestamptz`;

/**
 * Decode and build a snapshot's rows, with host_datetime.
 * @returns {{kind, rows, incoming, bad, formatChange, dataLines, zoneError}}
 */
function prepare(buf, kind, timeZoneId) {
  const decoded = decodeFile(buf);
  const built = buildRows(decoded, kind);
  const fieldsByLine = new Map(decoded.records.map((r) => [r.line, r.fields]));
  let zoneError = null;
  const incoming = built.rows.map((x) => {
    const hd = hostDatetime(x.wall, timeZoneId);
    if (hd.error) zoneError = hd.error;
    return { row: { ...x.row, host_datetime: hd.value }, fields: fieldsByLine.get(x.line), wall: x.wall };
  });
  return { ...built, incoming, zoneError };
}

/** The candidate span from the raw keys' wall clocks, ±2 days (never from host_datetime). */
function candidateSpan(incoming) {
  let lo = null;
  let hi = null;
  const dates = new Set();
  for (const { wall, row } of incoming) {
    const ms = Date.UTC(+wall.slice(0, 4), +wall.slice(5, 7) - 1, +wall.slice(8, 10), +wall.slice(11, 13), +wall.slice(14, 16), +wall.slice(17, 19), +wall.slice(20, 23));
    lo = lo === null || ms < lo ? ms : lo;
    hi = hi === null || ms > hi ? ms : hi;
    dates.add(row.host_date);
  }
  const day = 86400000;
  return { lo: new Date(lo - 2 * day).toISOString(), hi: new Date(hi + 2 * day).toISOString(), dates: [...dates] };
}

class Deadline extends Error {}

/** Read the DB clock; roll back at the phase end; bound the next statement by the time left. */
async function deadlineCheck(conn, captureUs) {
  const { now } = await conn.one("SELECT clock_timestamp()::text AS now");
  const left = cov.phaseEnd(captureUs) - cov.parseTs(now);
  if (left <= 0) throw new Deadline(`phase end reached at ${now}`);
  await conn.none(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(left / 1000))}`);
  return now;
}

/**
 * Run one attempt for a spool entry.
 * @param {{conn, spool, entry: {dir, file, state}, sme, kind, timeZoneId, fileName}} a
 * @returns {Promise<{outcome: string, state?: object, prepared?: object, detail?: string}>}
 *   outcome: committed | busy | phase | deadline | aborted | unknown
 */
async function attempt({ conn, spool, entry, sme, kind, timeZoneId, fileName }) {
  const buf = spool.readBytes(entry.dir);
  if (sha256(buf) !== entry.state.sha256) throw new Error(`spool bytes do not match their hash: ${entry.dir}`);
  const prepared = prepare(buf, kind, timeZoneId);
  const rows = prepared.formatChange ? [] : prepared.incoming;

  const state = { ...entry.state, status: "attempting", attempt_id: uuidv4(), attempt_started: new Date().toISOString() };
  delete state.capture;
  delete state.t0;
  delete state.t1;
  delete state.ids;
  delete state.eal_ids;
  spool.writeState(entry.dir, state);

  let committingWritten = false;
  try {
    await conn.none("BEGIN");
    const { got } = await conn.one("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS got", [lockKey(sme, kind)]);
    if (!got) {
      await conn.none("ROLLBACK");
      return { outcome: "busy", prepared };
    }
    const { capture } = await conn.one("SELECT clock_timestamp()::text AS capture");
    const captureUs = cov.parseTs(capture);
    if (!cov.inPhase(captureUs)) {
      await conn.none("ROLLBACK");
      return { outcome: "phase", prepared, detail: capture };
    }

    let insert = [];
    let matched = { matchedOld: 0, matchedNew: 0 };
    if (rows.length > 0) {
      const span = candidateSpan(rows);
      await deadlineCheck(conn, captureUs);
      const stored = await conn.any(CANDIDATE_SQL(kind), [sme, span.lo, span.hi, span.dates]);
      matched = matchRuleP(kind, rows, stored);
      insert = matched.insert.map((i) => rows[i].row);
    }

    const ids = [];
    for (let i = 0; i < insert.length; i += BATCH) {
      await deadlineCheck(conn, captureUs);
      const data = insert.slice(i, i + BATCH).map((r) => ({ ...r, system_id: sme, capture_datetime: capture }));
      const res = await conn.any(pgp.helpers.insert(data, INSERT_CS) + " RETURNING id");
      for (const r of res) ids.push(String(r.id));
    }
    if (ids.length !== insert.length) throw new Error(`RETURNING gave ${ids.length} ids for ${insert.length} rows`);

    if (kind === "eal" && insert.length > 0) {
      const newest = insert.map((r) => r.host_datetime).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      if (newest) {
        await deadlineCheck(conn, captureUs);
        await conn.none(UPSERT_SQL, [sme, newest]);
      }
    }

    await deadlineCheck(conn, captureUs);
    await saveInTx(conn, sme, fileName, buf, capture);

    // The guard (Q41) and the durable pre-COMMIT state (Q39).
    const { t0, pid } = await conn.one("SELECT clock_timestamp()::text AS t0, pg_backend_pid() AS pid");
    if (!cov.guardOk(captureUs, cov.parseTs(t0))) throw new Deadline(`guard: ${t0} at or after the phase end`);
    Object.assign(state, {
      status: "committing", capture, t0, pid, ids, eal_ids: kind === "eal" ? ids : [],
      matched_old: matched.matchedOld, matched_new: matched.matchedNew, bad_lines: prepared.bad.length,
      format_change: prepared.formatChange,
    });
    spool.writeState(entry.dir, state);
    committingWritten = true;

    try {
      await conn.none("COMMIT");
    } catch (e) {
      return { outcome: "unknown", state, prepared, detail: String(e && e.message) };
    }
    const { t1 } = await conn.one("SELECT clock_timestamp()::text AS t1");
    Object.assign(state, { status: "committed", t1, classification: classifyAttempt(state, t1) });
    spool.writeState(entry.dir, state);
    return { outcome: "committed", state, prepared };
  } catch (e) {
    if (committingWritten) return { outcome: "unknown", state, prepared, detail: String(e && e.message) };
    try {
      await conn.none("ROLLBACK");
    } catch (_) {
      /* the connection may be gone; COMMIT was never sent, so nothing committed */
    }
    if (e instanceof Deadline) return { outcome: "deadline", prepared, detail: e.message };
    return { outcome: "aborted", prepared, detail: String(e && e.message), error: e };
  }
}

/** DELIVERED or late (Q41). An attempt that inserted no EAL rows can't alert (§9.2): no window to meet. */
function classifyAttempt(state, t1) {
  if (!state.eal_ids || state.eal_ids.length === 0) return "no_eal_rows";
  return cov.classify(cov.parseTs(state.capture), cov.parseTs(t1));
}

/**
 * Decide an unknown outcome (state `committing`) after the barrier (Q39, Q42, Q43, Q46).
 * @returns {Promise<{outcome: "committed"|"aborted"|"unknown"|"contradiction", reason?: string, t1?: string}>}
 */
async function resolveUnknown({ conn, state, sme, kind, fileName }) {
  try {
    await conn.none("BEGIN");
    await conn.none("SET LOCAL lock_timeout = '10min'");
    try {
      await conn.one("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey(sme, kind)]);
    } catch (e) {
      await conn.none("ROLLBACK").catch(() => {});
      const diag = await conn.oneOrNone("SELECT state, xact_start::text, wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1", [state.pid]).catch(() => null);
      return { outcome: "unknown", reason: `barrier: ${e.message}`, diagnostics: diag };
    }
    // Fresh statements from here (Read Committed): each takes a new snapshot after the wait.
    const { now } = await conn.one("SELECT clock_timestamp()::text AS now");
    if (cov.parseTs(now) - cov.parseTs(state.t0) >= HORIZON_US) {
      await conn.none("ROLLBACK");
      return { outcome: "unknown", reason: "past the 24 h horizon: manual check (tooling/philips_ct_outcome.js)" };
    }
    const attached = async () => (await conn.one(ATTACHED_SQL, [state.capture])).n === 1;
    if (!(await attached())) {
      await conn.none("ROLLBACK");
      return { outcome: "unknown", reason: "the capture's partition is not attached: manual check" };
    }
    const receipt = await receiptExists(conn, sme, fileName, state.capture);
    const expected = state.ids || [];
    let found = 0;
    if (expected.length > 0) {
      const r = await conn.one("SELECT count(*)::int AS n FROM log.philips_ct_eal_events WHERE id = ANY($1::bigint[]) AND capture_datetime = $2::timestamptz", [expected, state.capture]);
      found = r.n;
    }
    if (!(await attached())) {
      await conn.none("ROLLBACK");
      return { outcome: "unknown", reason: "the partition changed during the check: manual check" };
    }
    await conn.none("COMMIT");
    if (expected.length === 0) return receipt ? { outcome: "committed", t1: now } : { outcome: "aborted" };
    if (found === expected.length) return { outcome: "committed", t1: now, receiptMissing: !receipt };
    if (found === 0 && !receipt) return { outcome: "aborted" };
    return { outcome: "contradiction", reason: `${found} of ${expected.length} ids present, receipt ${receipt ? "present" : "absent"}` };
  } catch (e) {
    await conn.none("ROLLBACK").catch(() => {});
    return { outcome: "unknown", reason: String(e && e.message) };
  }
}

module.exports = { attempt, resolveUnknown, prepare, candidateSpan, classifyAttempt, lockKey, CANDIDATE_SQL, ATTACHED_SQL, UPSERT_SQL, INSERT_CS, Deadline };
