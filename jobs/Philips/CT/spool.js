"use strict";
// PCT-1b spool.js: durable pending work, the audit copy, retention (plan §9.5 spool.js; Q29, Q34,
// Q39, Q41, Q47).
//
// Layout under the app directory (all gitignored):
//   spool/philips_ct/<SME>/.lock                         the per-system lock (flock)
//   spool/philips_ct/<SME>/<file>/<utc>_<sha12>/data       the snapshot's exact bytes
//   spool/philips_ct/<SME>/<file>/<utc>_<sha12>/state.json its state
//   retained/philips_ct/<SME>/<utc>_<sha12>_<file>/        bytes + reasons.json (bad input, Q29)
//   replayed/philips_ct/<SME>/...                          retained files fully replayed
//   done/philips_ct/<SME>/<yyyy-mm>/<attempt id>.json      the audit copy (Q47)
//
// Every write is atomic and durable: temp name, fsync, rename, fsync the folder. State moves
// spooled -> attempting -> committing -> committed -> complete (or late). Completion (Q47):
//   1. the audit copy (idempotent by attempt id); 2. the done-hash (the caller);
//   3. state -> complete; 4. delete data, then state.json, then the folder.
// state.json is deleted last, so the bytes are never left without it.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

// Where spool/, retained/, replayed/ and done/ live: the app directory, unless PHILIPS_CT_STATE_ROOT says otherwise.
const APP_ROOT = process.env.PHILIPS_CT_STATE_ROOT ? path.resolve(process.env.PHILIPS_CT_STATE_ROOT) : path.resolve(__dirname, "../../..");

/** The real filesystem operations; tests wrap this to fail at any step. */
const realIo = {
  mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
  readFile: (p) => fs.readFileSync(p),
  readdir: (p) => (fs.existsSync(p) ? fs.readdirSync(p) : []),
  exists: (p) => fs.existsSync(p),
  isDir: (p) => fs.existsSync(p) && fs.statSync(p).isDirectory(),
  size: (p) => fs.statSync(p).size,
  unlink: (p) => fs.unlinkSync(p),
  rmdir: (p) => fs.rmdirSync(p),
  rename: (a, b) => fs.renameSync(a, b),
  writeTemp: (p, buf) => {
    const fd = fs.openSync(p, "w");
    try {
      fs.writeFileSync(fd, buf);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  },
  fsyncDir: (p) => {
    const fd = fs.openSync(p, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  },
};

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const utcStamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, "$1Z"); // 20261124T181807123Z

class Spool {
  /**
   * @param {{sme: string, root?: string, io?: object, now?: () => Date}} o
   */
  constructor({ sme, root = APP_ROOT, io = realIo, now = () => new Date() }) {
    if (!/^SME\d{5}$/.test(sme)) throw new Error(`bad system id ${sme}`);
    this.sme = sme;
    this.root = root;
    this.io = io;
    this.now = now;
    this.sysDir = path.join(root, "spool", "philips_ct", sme);
    this.retainedDir = path.join(root, "retained", "philips_ct", sme);
    this.replayedDir = path.join(root, "replayed", "philips_ct", sme);
    this.doneDir = path.join(root, "done", "philips_ct", sme);
  }

  /** Write a file atomically and durably. */
  writeAtomic(file, buf) {
    const dir = path.dirname(file);
    this.io.mkdirp(dir);
    const tmp = `${file}.tmp-${process.pid}`;
    this.io.writeTemp(tmp, buf);
    this.io.rename(tmp, file);
    this.io.fsyncDir(dir);
  }

  /** All entries of this system, oldest first: [{file, name, dir, state}]. */
  entries() {
    const out = [];
    for (const file of this.io.readdir(this.sysDir)) {
      const fdir = path.join(this.sysDir, file);
      if (file.startsWith(".") || !this.io.isDir(fdir)) continue;
      for (const name of this.io.readdir(fdir)) {
        const dir = path.join(fdir, name);
        if (name.includes(".tmp-") || !this.io.isDir(dir)) continue;
        out.push({ file, name, dir, state: this.readState(dir) });
      }
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  readState(dir) {
    const p = path.join(dir, "state.json");
    if (!this.io.exists(p)) return null;
    return JSON.parse(this.io.readFile(p).toString("utf8"));
  }

  writeState(dir, state) {
    this.writeAtomic(path.join(dir, "state.json"), Buffer.from(JSON.stringify(state, null, 1)));
  }

  readBytes(dir) {
    return this.io.readFile(path.join(dir, "data"));
  }

  /** Is this exact snapshot already pending (not complete) for this file? */
  pendingWithHash(file, hash) {
    return this.entries().find((e) => e.file === file && e.state && e.state.sha256 === hash && e.state.status !== "complete") || null;
  }

  /**
   * Spool a snapshot: the bytes first, then state.json (`spooled`). An identical pending snapshot
   * isn't written again.
   * @returns {{dir: string, created: boolean}}
   */
  spoolSnapshot(file, buf, kind) {
    const hash = sha256(buf);
    const existing = this.pendingWithHash(file, hash);
    if (existing) return { dir: existing.dir, created: false };
    const now = this.now();
    const name = `${utcStamp(now)}_${hash.slice(0, 12)}`;
    const dir = path.join(this.sysDir, file, name);
    this.io.mkdirp(dir);
    this.io.fsyncDir(path.dirname(dir));
    this.writeAtomic(path.join(dir, "data"), buf);
    this.writeState(dir, { status: "spooled", sme: this.sme, file, kind, sha256: hash, size: buf.length, spooled_at: now.toISOString() });
    return { dir, created: true };
  }

  /** Q47 step 1: the audit copy, idempotent by attempt id. */
  publishAudit(state) {
    if (!state.attempt_id) throw new Error("audit copy without an attempt id");
    const month = (state.t1_text || state.capture || this.now().toISOString()).slice(0, 7);
    const file = path.join(this.doneDir, month, `${state.attempt_id}.json`);
    const body = Buffer.from(JSON.stringify(state, null, 1));
    if (this.io.exists(file) && this.io.readFile(file).equals(body)) return file;
    this.writeAtomic(file, body);
    return file;
  }

  /** Q47 step 4: delete the bytes, then state.json, then the folder. Safe to repeat. */
  removeEntry(dir) {
    const data = path.join(dir, "data");
    const st = path.join(dir, "state.json");
    if (this.io.exists(data)) this.io.unlink(data);
    this.io.fsyncDir(dir);
    if (this.io.exists(st)) this.io.unlink(st);
    // Only temp files can remain here (finish() removed a resolved restamp.json first).
    for (const n of this.io.readdir(dir)) if (n.includes(".tmp-")) this.io.unlink(path.join(dir, n));
    if (this.io.exists(dir)) this.io.rmdir(dir);
    this.io.fsyncDir(path.dirname(dir));
  }

  /** Remove an empty leftover folder (never taken as a new snapshot). */
  removeIfEmpty(dir) {
    if (this.io.isDir(dir) && this.io.readdir(dir).length === 0) {
      this.io.rmdir(dir);
      this.io.fsyncDir(path.dirname(dir));
      return true;
    }
    return false;
  }

  /**
   * Retain a snapshot's bytes with its reasons (Q29), before the entry can complete. Idempotent:
   * a retained folder for the same entry is reused.
   */
  retain(entryDir, file, buf, reasons) {
    const name = `${path.basename(entryDir)}_${file}`;
    const dir = path.join(this.retainedDir, name);
    this.io.mkdirp(dir);
    this.writeAtomic(path.join(dir, "data"), buf);
    this.writeAtomic(path.join(dir, "reasons.json"), Buffer.from(JSON.stringify(reasons, null, 1)));
    return dir;
  }

  /**
   * Repair a spool write cut short: a folder holding `data` but no state.json. The bytes are
   * complete (written under a temp name, then renamed), so the `spooled` state is rebuilt from them.
   * (After completion state.json is deleted LAST, so this shape only comes from spooling.)
   * @param {(file: string) => string|null} kindOf
   * @returns {string[]} repaired folders
   */
  repairOrphans(kindOf) {
    const repaired = [];
    for (const e of this.entries()) {
      // A temp file is an atomic write that never reached its rename; under the system lock no
      // write is in progress, so it is garbage.
      for (const n of this.io.readdir(e.dir)) if (n.includes(".tmp-")) this.io.unlink(path.join(e.dir, n));
      if (e.state) continue;
      const data = path.join(e.dir, "data");
      if (!this.io.exists(data)) continue;
      const buf = this.io.readFile(data);
      const kind = kindOf(e.file);
      if (!kind) continue;
      this.writeState(e.dir, { status: "spooled", sme: this.sme, file: e.file, kind, sha256: sha256(buf), size: buf.length, spooled_at: this.now().toISOString(), repaired: true });
      repaired.push(e.dir);
    }
    return repaired;
  }

  /**
   * Completion (Q47) of a committed entry. Every step is idempotent and safe to repeat after a crash.
   * @param {{setDone: (state) => Promise<void>, setSeen: (state) => Promise<void>}} hooks  the Redis writes
   * @returns {Promise<"late"|"complete">}
   */
  async finish(dir, state, hooks) {
    // A repair's intent file (review finding 3): resolved (its operation is recorded in the state)
    // -> removed; unresolved -> the entry is held, never completed over it.
    const opFile = path.join(dir, "restamp.json");
    if (this.io.exists(opFile)) {
      const op = JSON.parse(this.io.readFile(opFile).toString("utf8"));
      const recorded = (state.restamps || []).some((r) => r.op_id === op.op_id);
      if (!recorded) return "held";
      this.io.unlink(opFile);
      this.io.fsyncDir(dir);
    }
    if ((state.bad_lines > 0 || state.format_change) && !state.retained) {
      state.retained = this.retain(dir, state.file, this.readBytes(dir), { reasons: state.bad_reasons || [], format_change: state.format_change || null });
      this.writeState(dir, state);
    }
    if (state.classification === "late") {
      if (state.status !== "late") {
        state.status = "late";
        this.writeState(dir, state);
      }
      await hooks.setDone(state); // the rows are in; the folder stays until repaired
      return "late";
    }
    this.publishAudit(state); // 1.
    if (state.format_change) await hooks.setSeen(state); // retained once; never the done-hash
    else await hooks.setDone(state); // 2.
    state.status = "complete"; // 3.
    this.writeState(dir, state);
    this.removeEntry(dir); // 4.
    return "complete";
  }

  /** Capacity (round-2 finding 7): bytes and counts per area, and the oldest pending entry. */
  capacity() {
    const walk = (p) => {
      let bytes = 0;
      let files = 0;
      if (!this.io.exists(p)) return { bytes, files };
      for (const n of this.io.readdir(p)) {
        const q = path.join(p, n);
        if (this.io.isDir(q)) {
          const s = walk(q);
          bytes += s.bytes;
          files += s.files;
        } else {
          bytes += this.io.size(q);
          files++;
        }
      }
      return { bytes, files };
    };
    const pending = this.entries().filter((e) => !e.state || e.state.status !== "complete");
    const oldest = pending.length ? pending[0].state && pending[0].state.spooled_at : null;
    return {
      spool: walk(this.sysDir), retained: walk(this.retainedDir), replayed: walk(this.replayedDir), done: walk(this.doneDir),
      pending: pending.length, oldest_pending: oldest,
    };
  }
}

/**
 * Take a flock on `lockFile`, held by a file descriptor THIS process owns (review finding 5).
 * `flock(1)` locks the descriptor we pass it as fd 3 and exits; flock locks belong to the open file
 * description, so the lock stays held exactly as long as this process keeps the fd open: released
 * by release(), or by the kernel when this process exits or crashes. No helper process can die
 * and silently drop it. Compatible with the collector's `exec 9>file; flock -n 9`.
 * @param {string} lockFile
 * @param {number|null} waitS  null: don't wait (-n); else wait up to waitS seconds (-w)
 * @returns {Promise<{release: () => Promise<void>} | null>} null when busy (or the wait timed out)
 */
function flockFile(lockFile, waitS = null) {
  const fd = fs.openSync(lockFile, fs.constants.O_RDWR | fs.constants.O_CREAT, 0o644);
  const args = waitS === null ? ["-n", "-E", "75", "3"] : ["-w", String(waitS), "-E", "75", "3"];
  return new Promise((resolve, reject) => {
    const child = spawn("flock", args, { stdio: ["ignore", "ignore", "inherit", fd] });
    child.on("error", (e) => {
      fs.closeSync(fd);
      reject(e);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        let released = false;
        resolve({
          release: async () => {
            if (!released) {
              released = true;
              fs.closeSync(fd);
            }
          },
        });
      } else {
        fs.closeSync(fd);
        if (code === 75) resolve(null);
        else reject(new Error(`flock exited ${code}`));
      }
    });
  });
}

/** The system's spool lock, without waiting. @returns {Promise<{release}|null>} null when busy */
function lockSystem(sysDir) {
  fs.mkdirSync(sysDir, { recursive: true });
  return flockFile(path.join(sysDir, ".lock"), null);
}

module.exports = { Spool, lockSystem, flockFile, realIo, sha256, utcStamp, APP_ROOT };
