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

const { IANAZone } = require("luxon");

const DEFAULT_ZONE = "America/New_York";

function zoneOf(timeZoneId) {
  return timeZoneId === null || timeZoneId === undefined || timeZoneId === "" ? DEFAULT_ZONE : timeZoneId;
}

function isValidZone(timeZoneId) {
  return IANAZone.isValidZone(zoneOf(timeZoneId));
}

// Per (zone, wall minute): the chosen offset and gap shift. Transitions fall on minute boundaries,
// so every wall time in the same minute resolves the same way; the cache makes a file of tens of
// thousands of rows cost a few hundred zone lookups instead of several per row.
const cache = new Map();
// IANAZone.isValidZone builds an Intl.DateTimeFormat on every call (~0.2 ms): cache it per name.
const validity = new Map();
function validZone(name) {
  let v = validity.get(name);
  if (v === undefined) {
    v = IANAZone.isValidZone(name);
    validity.set(name, v);
  }
  return v;
}
// A zone's UTC offset at an instant, cached per quarter hour of UTC: every IANA transition since
// 1970 falls on a quarter-hour boundary, so the offset is constant within each quarter hour.
const offsetCache = new Map();
function cachedZone(name) {
  const zone = IANAZone.create(name);
  return {
    offset(ts) {
      const k = `${name}|${Math.floor(ts / 900000)}`;
      let o = offsetCache.get(k);
      if (o === undefined) {
        o = zone.offset(Math.floor(ts / 900000) * 900000);
        if (offsetCache.size > 200000) offsetCache.clear();
        offsetCache.set(k, o);
      }
      return o;
    },
  };
}
const pad = (n, w = 2) => String(n).padStart(w, "0");
function isoWithOffset(local, offsetMin) {
  const d = new Date(local); // the wall clock, read as UTC
  const sign = offsetMin < 0 ? "-" : "+";
  const a = Math.abs(offsetMin);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/**
 * @param {string} wall  "yyyy/MM/dd HH:mm:ss.SSS" (no suffix)
 * @param {string|null} timeZoneId
 * @returns {{value: string|null, error?: string}} value = ISO 8601 with the zone's offset
 */
function hostDatetime(wall, timeZoneId) {
  const zoneName = zoneOf(timeZoneId);
  if (!validZone(zoneName)) return { value: null, error: `invalid time zone ${JSON.stringify(timeZoneId)}` };
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(wall);
  if (!m) return { value: null, error: `invalid wall time ${JSON.stringify(wall)}` };
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]); // the wall clock read as if it were UTC
  const key = `${zoneName}|${Math.floor(local / 60000)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return { value: isoWithOffset(local + hit.shift, hit.offset) };
  const zone = cachedZone(zoneName);
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
  const offset = zone.offset(ts);
  const shift = ts + offset * 60000 - local; // nonzero only in a gap (the wall time shown moves)
  if (cache.size > 100000) cache.clear();
  cache.set(key, { offset, shift });
  return { value: isoWithOffset(local + shift, offset) };
}

module.exports = { DEFAULT_ZONE, hostDatetime, isValidZone, zoneOf };
