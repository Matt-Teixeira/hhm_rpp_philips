"use strict";
// Shared by the PCT-1b operator tools: an entry by system and name, the system's spool lock, and an
// ingest-style direct connection (UTC, 2 min idle-in-transaction limit).

const path = require("path");
const { Spool, lockSystem } = require("../../jobs/Philips/CT/spool");

function findEntry(sme, name) {
  const spool = new Spool({ sme });
  const e = spool.entries().find((x) => x.name === name || path.basename(x.dir) === name);
  if (!e) throw new Error(`no spool entry ${name} for ${sme} (see spool/philips_ct/${sme}/)`);
  return { spool, entry: e };
}

async function withSystemLock(spool, fn) {
  const lock = await lockSystem(spool.sysDir);
  if (!lock) throw new Error(`the ${spool.sme} spool lock is busy (a CT run in progress?); try again after it`);
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

async function directConn(db) {
  const conn = await db.connect({ direct: true });
  await conn.none("SET TimeZone = 'UTC'");
  await conn.none("SET idle_in_transaction_session_timeout = '2min'");
  await conn.none("SET application_name = 'hhm_rpp_philips.philips_ct_tool'");
  return conn;
}

module.exports = { findEntry, withSystemLock, directConn };
