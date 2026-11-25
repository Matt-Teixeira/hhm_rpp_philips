"use strict";
// CV-1b folders.js: which daily_* folders to parse, and what to do at each (plan §7.2, C3).
//
// The collector writes one folder per device export: daily_YYYY_MM_DD or daily_YYYYMMDD. Redis
// `<SME>.last_parsed_phil_cv_daily` holds the last folder parsed (the pointer).
//
// - No pointer (a new system): only the newest folder, as before.
// - Pointer: every folder whose date is after the pointer's, oldest first. Compared on the date
//   digits, so a pointer folder that no longer exists can't make the job re-read all history (the
//   old code did), and the two name formats can't mis-order.
// - At each folder: parse it if EventLog.txe is there. If not, wait (stop this system's run, the
//   pointer stays) until the folder is older than WAIT_HOURS, then skip it with a warning. A skipped
//   folder stays recoverable with tooling/cv_backfill.js.
//
// Pure. Node 16.

const DAILY_RE = /^daily_(\d{4})_?(\d{2})_?(\d{2})$/;
const WAIT_HOURS = 48;

/** "daily_2026_11_25" or "daily_20261125" -> "20261125"; anything else -> null. */
function folder_key(name) {
  const m = DAILY_RE.exec(String(name).trim());
  return m ? m[1] + m[2] + m[3] : null;
}

/** Folder names from a directory listing -> the folders to try, oldest first. */
function folders_to_parse(listing, pointer) {
  const dailies = listing
    .map((n) => String(n).trim())
    .filter((n) => folder_key(n) !== null)
    .sort((a, b) => (folder_key(a) < folder_key(b) ? -1 : folder_key(a) > folder_key(b) ? 1 : a < b ? -1 : a > b ? 1 : 0));
  if (!dailies.length) return [];
  if (!pointer) return [dailies[dailies.length - 1]];
  const pkey = folder_key(pointer);
  if (pkey === null) return [dailies[dailies.length - 1]]; // unreadable pointer: behave like a new system
  return dailies.filter((n) => folder_key(n) > pkey);
}

/** At one folder: "parse" | "wait" (stop, keep the pointer) | "skip" (warn, move on). */
function folder_action({ has_txe, age_hours }) {
  if (has_txe) return "parse";
  return age_hours > WAIT_HOURS ? "skip" : "wait";
}

module.exports = { folder_key, folders_to_parse, folder_action, WAIT_HOURS };
