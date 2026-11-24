"use strict";
// PCT-1b coverage.js: the alert window (plan §9.5; Q31 -> Q36 -> Q40 -> Q41, Q45).
//
// The alert processor reads rows with `capture_datetime > NOW() - 30 min` from cron at the nominal
// minutes N = :24 and :54. Contract S (Q45): each scheduled run's CT snapshot is at DB time within
// [slot - 60 s, slot + 5 min]. Under S, an attempt is read by exactly one scheduled reader if:
//  - its capture text is strictly inside the phase (N + 6 min, N_next - 2 min);
//  - the guard: the DB time just before COMMIT is before N_next - 2 min;
//  - t1 (the DB time after COMMIT returns) is before N_next - 90 s -> DELIVERED, else LATE.
// Plus the clock check: ingest only if |host - DB offset| + round trip <= 10 s.
//
// All times are DB-clock microseconds since the epoch, parsed from PostgreSQL's text output so no
// precision is lost (a JS Date truncates to milliseconds). Pure: no I/O.

const MIN = 60 * 1e6; // microseconds
const PERIOD = 30 * MIN;
const SLOT_OFFSET = 24 * MIN; // slots at :24 and :54
const PHASE_START = 6 * MIN; // strictly after N + 6 min
const PHASE_END = 28 * MIN; // strictly before N_next - 2 min
const DELIVER_BY = 28 * MIN + 30 * 1e6; // t1 strictly before N_next - 90 s
const CLOCK_LIMIT_MS = 10000;
const OFFSET_CHANGE_MS = 10000;

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:([+-])(\d{2})(?::?(\d{2}))?(?::(\d{2}))?|Z)?$/;

/**
 * PostgreSQL timestamptz text (e.g. `2026-11-24 18:18:07.123456+00`) -> microseconds since the epoch.
 * Throws on anything else: a capture time is never guessed.
 */
function parseTs(text) {
  const m = TS_RE.exec(String(text));
  if (!m) throw new Error(`not a timestamp: ${JSON.stringify(text)}`);
  if (m[8] === undefined && !/Z$/.test(text)) throw new Error(`timestamp without a zone: ${JSON.stringify(text)}`);
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const frac = m[7] ? Number(m[7].padEnd(6, "0")) : 0;
  let us = ms * 1000 + frac;
  if (m[8]) {
    const sign = m[8] === "+" ? 1 : -1;
    const off = (+m[9] * 3600 + (m[10] ? +m[10] : 0) * 60 + (m[11] ? +m[11] : 0)) * 1e6;
    us -= sign * off;
  }
  return us;
}

const mod = (a, b) => ((a % b) + b) % b;

/** The last nominal slot N at or before t (µs), and t's position after it. */
function slotOf(us) {
  const pos = mod(us - SLOT_OFFSET, PERIOD);
  return { slot: us - pos, pos };
}

/** Is the capture strictly inside (N + 6 min, N_next - 2 min)? */
function inPhase(captureUs) {
  const { pos } = slotOf(captureUs);
  return pos > PHASE_START && pos < PHASE_END;
}

/** The phase end for a capture: N_next - 2 min. The guard and the deadline use it. */
function phaseEnd(captureUs) {
  return slotOf(captureUs).slot + PHASE_END;
}

/** The guard: is the DB time just before COMMIT still before the phase end? */
function guardOk(captureUs, t0Us) {
  return t0Us < phaseEnd(captureUs);
}

/** DELIVERED iff t1 < N_next - 90 s for the capture's slot; else LATE. */
function classify(captureUs, t1Us) {
  return t1Us < slotOf(captureUs).slot + DELIVER_BY ? "DELIVERED" : "late";
}

/**
 * The clock check: offset = host - DB (ms), measured with a round trip of rtt ms.
 * @returns {{ok: boolean, bound: number}}
 */
function clockOk(offsetMs, rttMs) {
  const bound = Math.abs(offsetMs) + rttMs;
  return { ok: bound <= CLOCK_LIMIT_MS, bound };
}

/** Did the offset move more than 10 s since the previous run's sample? */
function offsetChanged(prevOffsetMs, offsetMs) {
  if (prevOffsetMs === null || prevOffsetMs === undefined) return false;
  return Math.abs(offsetMs - prevOffsetMs) > OFFSET_CHANGE_MS;
}

/**
 * Measure host - DB offset from one round trip: host times before/after, DB time in between.
 * @returns {{offsetMs: number, rttMs: number}}
 */
function offsetFromSample(hostBeforeMs, dbUs, hostAfterMs) {
  const rttMs = hostAfterMs - hostBeforeMs;
  const mid = (hostBeforeMs + hostAfterMs) / 2;
  return { offsetMs: mid - dbUs / 1000, rttMs };
}

module.exports = {
  MIN, PERIOD, parseTs, slotOf, inPhase, phaseEnd, guardOk, classify, clockOk, offsetChanged, offsetFromSample,
};
