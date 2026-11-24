"use strict";
// PCT-1b time.js: host_datetime from the key's wall clock and the site zone (plan §9.5, Q23, Q33).
//
// - NULL zone -> America/New_York, as today.
// - Deterministic in the DST fold: the repeated hour takes the EARLIER offset (the first pass).
//   luxon alone resolves the fold by the moment it runs (out/16), so the result is computed here.
// - In the spring gap (a wall time that doesn't exist), the offset from before the transition is
//   used, which moves the time forward (as luxon and Temporal's "compatible" mode do).
// - An invalid zone string -> host_datetime NULL; the caller logs an ERROR (Q33).
// Pure: no I/O.

const { DateTime, IANAZone } = require("luxon");

const DEFAULT_ZONE = "America/New_York";

function zoneOf(timeZoneId) {
  return timeZoneId === null || timeZoneId === undefined || timeZoneId === "" ? DEFAULT_ZONE : timeZoneId;
}

function isValidZone(timeZoneId) {
  return IANAZone.isValidZone(zoneOf(timeZoneId));
}

/**
 * @param {string} wall  "yyyy/MM/dd HH:mm:ss.SSS" (no suffix)
 * @param {string|null} timeZoneId
 * @returns {{value: string|null, error?: string}} value = ISO 8601 with the zone's offset
 */
function hostDatetime(wall, timeZoneId) {
  const zoneName = zoneOf(timeZoneId);
  if (!IANAZone.isValidZone(zoneName)) return { value: null, error: `invalid time zone ${JSON.stringify(timeZoneId)}` };
  const zone = IANAZone.create(zoneName);
  const naive = DateTime.fromFormat(wall, "yyyy/MM/dd HH:mm:ss.SSS", { zone: "UTC" });
  if (!naive.isValid) return { value: null, error: `invalid wall time ${JSON.stringify(wall)}` };
  const local = naive.toMillis(); // the wall clock read as if it were UTC
  // Candidate offsets: the zone's offsets a day either side cover every transition (minutes).
  const offsets = [...new Set([zone.offset(local - 86400000), zone.offset(local + 86400000), zone.offset(local)])];
  const valid = offsets
    .map((o) => local - o * 60000)
    .filter((ts) => ts + zone.offset(ts) * 60000 === local)
    .sort((a, b) => a - b);
  let ts;
  if (valid.length > 0) {
    ts = valid[0]; // the fold: the earlier instant (the first pass)
  } else {
    ts = local - zone.offset(local - 86400000) * 60000; // the gap: the offset from before
  }
  return { value: DateTime.fromMillis(ts, { zone }).toISO() };
}

module.exports = { DEFAULT_ZONE, hostDatetime, isValidZone, zoneOf };
