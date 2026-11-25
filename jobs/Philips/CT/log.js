"use strict";
// PCT-1b log.js: the CT job's logging adapter (review finding 2).
// The app logger (utils/logger/log.js) reads `err.stack` for every ERROR, so an ERROR that describes
// a condition (no exception) must still carry an error value; and a logging failure must never abort
// processing.

/**
 * @param {Function} addLogEvent  the app logger's addLogEvent(type, run_log, func, tag, note, err)
 * @param {string} E  the logger's ERROR type
 * @returns {(level, run_log, func, tag, note, err?) => Promise<void>}  never rejects
 */
function makeLog(addLogEvent, E) {
  return async function log(level, run_log, func, tag, note, err = null) {
    try {
      const e = level === E && (err === null || err === undefined) ? `${func}: ${(note && (note.message || note.outcome || note.reason)) || "see note"}` : err;
      await addLogEvent(level, run_log, func, tag, note, e);
    } catch (x) {
      console.error(`philips_ct: logging failed (${x && x.message}) for ${func}`, JSON.stringify(note).slice(0, 500));
    }
  };
}

module.exports = { makeLog };
