"use strict";
// PCT-1b run.js: the per-system orchestration (plan §9.5 index.js, spool.js; Q34, Q39, Q41-Q43,
// Q47). Called once per CT system per cron run.
//
// Per system: take the system's spool lock; spool each configured file that changed; then process
// the system's entries oldest first, EVEN WHEN the configured file is missing now. Per configured
// file: missing -> silent skip; not `.csv` -> WARN. The clock check gates ingest, never spooling.

const fs = require("fs");
const path = require("path");
const pgp = require("pg-promise")();
const db = require("../../../utils/db/pg-pool");
const initRedis = require("../../../redis");
const { isDryRun } = require("../../../util/dry_run");
const [addLogEvent] = require("../../../utils/logger/log");
const { type: { I, W, E }, tag: { cal, det, cat } } = require("../../../utils/logger/enums");
const { Spool, lockSystem, sha256 } = require("./spool");
const ingest = require("./ingest");
const cov = require("./coverage");
const { saveInTx } = require("./save");
const { matchRuleP } = require("./legacy");

const KIND_BY_DIR = { eal: "eal", events: "events" };
const kindOfFile = (f) => KIND_BY_DIR[f.dir_name] || (/^EALInfo\./.test(f.file_name) ? "eal" : /^Events\./.test(f.file_name) ? "events" : null);
const MIN = 60 * 1000;

// ---------- Redis: the done-hash and the seen-hash ----------
async function redisGetJson(key) {
  const c = await initRedis();
  try {
    const v = await c.get(key);
    return v ? JSON.parse(v) : null;
  } finally {
    await c.quit();
  }
}
async function redisSetJson(key, value) {
  const c = await initRedis();
  try {
    await c.set(key, JSON.stringify(value));
  } finally {
    await c.quit();
  }
}
const doneKey = (sme, file) => `${sme}.${file}`;
const seenKey = (sme, file) => `${sme}.${file}.seen`;

/** An in-memory stand-in for a spool entry, when the spool write failed (`unspooled`). */
class MemorySpool {
  constructor(buf) {
    this.buf = buf;
    this.state = null;
  }
  readBytes() {
    return this.buf;
  }
  writeState(_dir, state) {
    this.state = state;
  }
}

async function log(level, run_log, func, tag, note, err = null) {
  await addLogEvent(level, run_log, func, tag, note, err);
}

// ---------- the clock check (Q41) ----------
async function clockSample(conn, spool) {
  const before = Date.now();
  const { now } = await conn.one("SELECT clock_timestamp()::text AS now");
  const after = Date.now();
  const s = cov.offsetFromSample(before, cov.parseTs(now), after);
  const file = path.join(spool.sysDir, "clock.json");
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    prev = null;
  }
  const changed = prev ? cov.offsetChanged(prev.offsetMs, s.offsetMs) : false;
  return { ...s, ok: cov.clockOk(s.offsetMs, s.rttMs).ok, changed, prev, file };
}

function saveClock(spool, sample, committedSince) {
  spool.writeAtomic(sample.file, Buffer.from(JSON.stringify({ offsetMs: sample.offsetMs, rttMs: sample.rttMs, sampled_at: new Date().toISOString(), committed_since: committedSince })));
}

// ---------- completion (Q47): spool.finish with the Redis writes ----------
async function complete(spool, entry, state, run_log, note) {
  const r = await spool.finish(entry.dir, state, {
    setDone: (st) => redisSetJson(doneKey(st.sme, st.file), { size: st.size, sha256: st.sha256 }),
    setSeen: (st) => redisSetJson(seenKey(st.sme, st.file), { sha256: st.sha256 }),
  });
  if (r === "late") {
    await log(E, run_log, "philips_ct_late", det, { ...note, entry: entry.name, capture: state.capture, t1: state.t1, eal_ids: state.eal_ids.length, repair: "tooling/philips_ct_restamp.js" });
  }
  return r;
}

// ---------- per system ----------
async function runSystem(job_id, sys, run_log) {
  const sme = sys.id;
  const note = { job_id, sme };
  const spool = new Spool({ sme });
  const files = (sys.log_config || []).filter((f) => kindOfFile(f));

  const lock = await lockSystem(spool.sysDir);
  if (!lock) {
    await log(W, run_log, "philips_ct_run", det, { ...note, message: "system spool lock busy; next run" });
    return;
  }
  let conn = null;
  const memoryEntries = [];
  try {
    // 1. Spool every changed snapshot first.
    for (const f of files) {
      const p = `${sys.debian_server_path}/${f.file_name}`;
      if (!fs.existsSync(p)) continue; // missing: silent
      if (!f.file_name.endsWith(".csv")) {
        await log(W, run_log, "philips_ct_run", det, { ...note, file: f.file_name, message: "configured file is not .csv" });
        continue;
      }
      const buf = fs.readFileSync(p);
      const hash = sha256(buf);
      const pendingForFile = spool.entries().some((e) => e.file === f.file_name && (!e.state || e.state.status !== "complete"));
      const done = await redisGetJson(doneKey(sme, f.file_name));
      if (done && done.sha256 === hash && !pendingForFile) continue;
      const seen = await redisGetJson(seenKey(sme, f.file_name));
      if (seen && seen.sha256 === hash) {
        await log(E, run_log, "philips_ct_run", det, { ...note, file: f.file_name, message: "format change: this snapshot is retained; fix or replay (retained/)" });
        continue;
      }
      try {
        spool.spoolSnapshot(f.file_name, buf, kindOfFile(f));
      } catch (e) {
        await log(E, run_log, "philips_ct_run", cat, { ...note, file: f.file_name, message: "unspooled: the snapshot is lost if replaced before an attempt commits" }, e);
        memoryEntries.push({ file: f.file_name, kind: kindOfFile(f), buf, hash });
      }
    }

    const cap = spool.capacity();
    const ageMs = cap.oldest_pending ? Date.now() - Date.parse(cap.oldest_pending) : 0;
    const total = cap.spool.bytes + cap.retained.bytes + cap.replayed.bytes + cap.done.bytes;
    if (total >= 5 * 2 ** 30 || ageMs >= 6 * 60 * MIN) await log(E, run_log, "philips_ct_capacity", det, { ...note, ...cap, total });
    else if (total >= 2 ** 30 || ageMs >= 60 * MIN) await log(W, run_log, "philips_ct_capacity", det, { ...note, ...cap, total });

    for (const d of spool.repairOrphans((file) => kindOfFile({ file_name: file }))) {
      await log(W, run_log, "philips_ct_run", det, { ...note, entry: d, message: "spool write cut short: state rebuilt from the complete bytes" });
    }
    const entries = spool.entries();
    if (entries.length === 0 && memoryEntries.length === 0) return;

    // 2. The ingest connection (Q43) and the clock check (Q41).
    conn = await db.connect({ direct: true });
    await conn.none("SET TimeZone = 'UTC'");
    await conn.none("SET idle_in_transaction_session_timeout = '2min'");
    await conn.none("SET application_name = 'hhm_rpp_philips.philips_ct'");
    const clock = await clockSample(conn, spool);
    const committedSince = clock.prev && !clock.changed ? clock.prev.committed_since || [] : [];
    if (clock.changed) {
      await log(W, run_log, "philips_ct_clock", det, { ...note, offsetMs: clock.offsetMs, previous: clock.prev.offsetMs, check_attempts: clock.prev.committed_since || [] });
    }
    if (!clock.ok) {
      await log(W, run_log, "philips_ct_clock", det, { ...note, offsetMs: clock.offsetMs, rttMs: clock.rttMs, message: "host/DB offset + round trip over 10 s: spooled, not ingested" });
      saveClock(spool, clock, committedSince);
      return;
    }

    // 3. Entries oldest first. A busy lock, the phase or an unknown outcome holds that file's later entries.
    const held = new Set();
    for (const entry of entries) {
      if (held.has(entry.file)) continue;
      const st = entry.state;
      const fcfg = { sme, kind: st ? st.kind : null, fileName: entry.file, timeZoneId: sys.time_zone_id };
      if (!st) {
        if (!spool.removeIfEmpty(entry.dir)) await log(E, run_log, "philips_ct_run", det, { ...note, entry: entry.name, message: "spool entry without state.json" });
        continue;
      }
      if (st.status === "complete") {
        spool.removeEntry(entry.dir);
        continue;
      }
      if (st.status === "late") {
        await complete(spool, entry, st, run_log, note);
        continue;
      }
      if (st.status === "committing") {
        const r = await ingest.resolveUnknown({ conn, state: st, sme, kind: st.kind, fileName: entry.file });
        if (r.outcome === "committed") {
          Object.assign(st, { status: "committed", t1: r.t1, resolved: "barrier", classification: ingest.classifyAttempt(st, r.t1) });
          if (r.receiptMissing) await log(W, run_log, "philips_ct_unknown", det, { ...note, entry: entry.name, message: "committed; receipt already cleaned up" });
          spool.writeState(entry.dir, st);
        } else if (r.outcome === "aborted") {
          Object.assign(st, { status: "spooled", previous_attempt: st.attempt_id });
          spool.writeState(entry.dir, st);
        } else {
          held.add(entry.file);
          const ageMin = (Date.now() - Date.parse(st.attempt_started || st.spooled_at)) / MIN;
          const level = r.outcome === "contradiction" || ageMin >= 120 ? E : ageMin >= 30 ? W : I;
          await log(level, run_log, "philips_ct_unknown", det, { ...note, entry: entry.name, outcome: r.outcome, reason: r.reason, diagnostics: r.diagnostics || null, attempt: st.attempt_id });
          continue;
        }
      }
      if (st.status === "spooled" || st.status === "attempting") {
        const r = await ingest.attempt({ conn, spool, entry, sme, kind: st.kind, timeZoneId: sys.time_zone_id, fileName: entry.file });
        if (r.prepared && r.prepared.zoneError) await log(E, run_log, "philips_ct_time", det, { ...note, entry: entry.name, message: r.prepared.zoneError });
        if (r.outcome === "committed") {
          committedSince.push(r.state.attempt_id);
          if (r.prepared.bad.length) {
            r.state.bad_reasons = r.prepared.bad.slice(0, 1000);
            spool.writeState(entry.dir, r.state);
            await log(E, run_log, "philips_ct_bad_input", det, { ...note, entry: entry.name, bad: r.prepared.bad.length, of: r.prepared.dataLines, format_change: r.prepared.formatChange });
          }
          await log(I, run_log, "philips_ct_ingest", det, { ...note, file: entry.file, inserted: r.state.ids.length, matched_old: r.state.matched_old, matched_new: r.state.matched_new, capture: r.state.capture, classification: r.state.classification });
          entry.state = r.state;
        } else if (r.outcome === "unknown") {
          held.add(entry.file);
          await log(W, run_log, "philips_ct_unknown", det, { ...note, entry: entry.name, detail: r.detail });
          continue;
        } else {
          held.add(entry.file);
          const level = r.outcome === "aborted" ? E : I;
          await log(level, run_log, "philips_ct_attempt", det, { ...note, entry: entry.name, outcome: r.outcome, detail: r.detail }, r.error || null);
          if (r.outcome === "phase" || r.outcome === "deadline") break; // outside the window: the next run
          continue;
        }
      }
      if (entry.state.status === "committed") await complete(spool, entry, entry.state, run_log, note);
    }

    // 4. Unspooled snapshots: an attempt from memory (rows and receipt in one transaction).
    for (const m of memoryEntries) {
      if (held.has(m.file)) continue;
      const ms = new MemorySpool(m.buf);
      const st = { status: "spooled", sme, file: m.file, kind: m.kind, sha256: m.hash, size: m.buf.length };
      const r = await ingest.attempt({ conn, spool: ms, entry: { dir: null, file: m.file, state: st }, sme, kind: m.kind, timeZoneId: sys.time_zone_id, fileName: m.file });
      if (r.outcome === "committed" && r.prepared.bad.length === 0 && r.state.classification !== "late") {
        await redisSetJson(doneKey(sme, m.file), { size: m.buf.length, sha256: m.hash });
      } else {
        await log(E, run_log, "philips_ct_run", det, { ...note, file: m.file, outcome: r.outcome, message: "unspooled snapshot not completed; its bytes are in log.saved_files only if it committed" });
      }
    }
    saveClock(spool, clock, committedSince.slice(-200));
  } catch (e) {
    await log(E, run_log, "philips_ct_run", cat, note, e);
  } finally {
    if (conn) conn.done();
    await lock.release();
  }
}

// ---------- DRY_RUN (plan §9.5): no lock, no transaction, no spool writes ----------
async function dryRunSystem(job_id, sys, run_log) {
  const sme = sys.id;
  const note = { job_id, sme, dry_run: true };
  for (const f of (sys.log_config || []).filter((x) => kindOfFile(x))) {
    const p = `${sys.debian_server_path}/${f.file_name}`;
    if (!fs.existsSync(p)) continue;
    if (!f.file_name.endsWith(".csv")) {
      await log(W, run_log, "philips_ct_run", det, { ...note, file: f.file_name, message: "configured file is not .csv" });
      continue;
    }
    const kind = kindOfFile(f);
    const buf = fs.readFileSync(p);
    const started = Date.now();
    const prepared = ingest.prepare(buf, kind, sys.time_zone_id);
    const rows = prepared.formatChange ? [] : prepared.incoming;
    let insert = [];
    if (rows.length) {
      const span = ingest.candidateSpan(rows);
      const stored = await db.any(ingest.CANDIDATE_SQL(kind), [sme, span.lo, span.hi, span.dates]);
      insert = matchRuleP(kind, rows, stored).insert.map((i) => rows[i].row);
    }
    const { now } = await db.one("SELECT clock_timestamp()::text AS now");
    const capture = now;
    for (let i = 0; i < insert.length; i += 5000) {
      const data = insert.slice(i, i + 5000).map((r) => ({ ...r, system_id: sme, capture_datetime: capture }));
      await db.none(pgp.helpers.insert(data, ingest.INSERT_CS));
    }
    if (kind === "eal" && insert.length) {
      const newest = insert.map((r) => r.host_datetime).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      if (newest) await db.none(ingest.UPSERT_SQL, [sme, newest]);
    }
    await saveInTx(db, sme, f.file_name, buf, capture);
    await redisSetJson(doneKey(sme, f.file_name), { size: buf.length, sha256: sha256(buf) });
    await log(I, run_log, "philips_ct_dry_run", det, {
      ...note, file: f.file_name, rows: rows.length, bad: prepared.bad.length, format_change: prepared.formatChange,
      would_insert: insert.length, ms: Date.now() - started, phase_now: cov.inPhase(cov.parseTs(capture)), zone_error: prepared.zoneError,
    });
  }
}

const philips_ct_parsers = async (job_id, sysConfigData, run_log) => {
  const note = { job_id, sme: sysConfigData.id };
  try {
    await log(I, run_log, "philips_ct_parsers", cal, note);
    if (isDryRun()) await dryRunSystem(job_id, sysConfigData, run_log);
    else await runSystem(job_id, sysConfigData, run_log);
  } catch (error) {
    await log(E, run_log, "philips_ct_parsers", cat, note, error);
  }
};

module.exports = { philips_ct_parsers, runSystem, dryRunSystem, complete, kindOfFile, MemorySpool };
