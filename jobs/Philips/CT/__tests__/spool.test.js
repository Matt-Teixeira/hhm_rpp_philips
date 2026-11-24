"use strict";
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Spool, lockSystem, realIo, sha256 } = require("../spool");

const MUTATING = ["mkdirp", "writeTemp", "rename", "fsyncDir", "unlink", "rmdir"];
const kindOf = (file) => (file.startsWith("EALInfo") ? "eal" : file.startsWith("Events") ? "events" : null);

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pct1b-spool-"));
}

/** realIo that throws on the n-th mutating call (a crash at that point); n = Infinity never. */
function faultIo(n) {
  let calls = 0;
  const io = {};
  for (const [k, f] of Object.entries(realIo)) {
    io[k] = (...a) => {
      if (MUTATING.includes(k) && ++calls === n) throw new Error(`injected crash at call ${n} (${k})`);
      return f(...a);
    };
  }
  io.count = () => calls;
  return io;
}

const fixedNow = () => new Date("2026-11-24T18:18:07.123Z");
const BUF = Buffer.from("DTime,Info\n\"2026/10/30 12:27:18.203\",\"x\"\n");

test("spool: a snapshot is written once; an identical pending one is not written again", () => {
  const root = tmpRoot();
  const sp = new Spool({ sme: "SME00001", root, now: fixedNow });
  const a = sp.spoolSnapshot("EALInfo.csv", BUF, "eal");
  const b = sp.spoolSnapshot("EALInfo.csv", BUF, "eal");
  assert.strictEqual(a.created, true);
  assert.strictEqual(b.created, false);
  assert.strictEqual(a.dir, b.dir);
  const [e] = sp.entries();
  assert.strictEqual(e.state.status, "spooled");
  assert.strictEqual(e.state.sha256, sha256(BUF));
  assert.ok(sp.readBytes(e.dir).equals(BUF));
});

test("spool: a crash at every step of spooling leaves nothing, an empty folder, or a repairable one", () => {
  const total = (() => {
    const io = faultIo(Infinity);
    new Spool({ sme: "SME00001", root: tmpRoot(), io, now: fixedNow }).spoolSnapshot("EALInfo.csv", BUF, "eal");
    return io.count();
  })();
  assert.ok(total >= 6);
  for (let n = 1; n <= total; n++) {
    const root = tmpRoot();
    const crashed = new Spool({ sme: "SME00001", root, io: faultIo(n), now: fixedNow });
    assert.throws(() => crashed.spoolSnapshot("EALInfo.csv", BUF, "eal"), /injected crash/);
    // The next run, with a healthy filesystem.
    const sp = new Spool({ sme: "SME00001", root, now: fixedNow });
    sp.repairOrphans(kindOf);
    for (const e of sp.entries()) {
      if (!e.state) assert.ok(sp.removeIfEmpty(e.dir), `call ${n}: a stateless folder must be empty`);
      else {
        assert.strictEqual(e.state.status, "spooled", `call ${n}`);
        assert.ok(sp.readBytes(e.dir).equals(BUF), `call ${n}: bytes intact`);
      }
    }
    // Spooling again ends with exactly one complete entry.
    sp.spoolSnapshot("EALInfo.csv", BUF, "eal");
    const after = sp.entries().filter((e) => e.state);
    assert.strictEqual(after.length, 1, `call ${n}`);
    assert.ok(sp.readBytes(after[0].dir).equals(BUF));
  }
});

function committedState(sp, dir, extra = {}) {
  const st = { ...sp.readState(dir), status: "committed", attempt_id: "a-1", capture: "2026-11-24 18:18:07.5+00", t0: "x", t1: "2026-11-24 18:18:08+00", t1_text: "2026-11-24", ids: ["1", "2"], eal_ids: ["1", "2"], classification: "DELIVERED", bad_lines: 0, ...extra };
  sp.writeState(dir, st);
  return st;
}

test("completion: a crash after every step finishes on the next run with the same attempt, once", async () => {
  const count = async () => {
    const root = tmpRoot();
    const sp = new Spool({ sme: "SME00001", root, now: fixedNow });
    const { dir } = sp.spoolSnapshot("EALInfo.csv", BUF, "eal");
    const st = committedState(sp, dir);
    const io = faultIo(Infinity);
    const sp2 = new Spool({ sme: "SME00001", root, io, now: fixedNow });
    await sp2.finish(dir, st, { setDone: async () => {}, setSeen: async () => {} });
    return io.count();
  };
  const total = await count();
  for (let n = 1; n <= total + 1; n++) {
    const root = tmpRoot();
    const sp = new Spool({ sme: "SME00001", root, now: fixedNow });
    const { dir } = sp.spoolSnapshot("EALInfo.csv", BUF, "eal");
    committedState(sp, dir);
    const hashes = [];
    const hooks = { setDone: async (s) => hashes.push(s.sha256), setSeen: async () => assert.fail("no seen-hash") };
    const crashed = new Spool({ sme: "SME00001", root, io: faultIo(n), now: fixedNow });
    try {
      await crashed.finish(dir, crashed.readState(dir), hooks);
    } catch (e) {
      assert.match(e.message, /injected crash/);
    }
    // The next run: what run.js does with the entry it finds.
    const next = new Spool({ sme: "SME00001", root, now: fixedNow });
    for (const e of next.entries()) {
      if (!e.state) assert.ok(next.removeIfEmpty(e.dir), `call ${n}`);
      else if (e.state.status === "complete") next.removeEntry(e.dir);
      else {
        assert.strictEqual(e.state.status, "committed", `call ${n}`);
        assert.strictEqual(e.state.attempt_id, "a-1", `call ${n}: the original attempt survives`);
        await next.finish(e.dir, e.state, hooks);
      }
    }
    assert.deepStrictEqual(next.entries(), [], `call ${n}: the folder is gone`);
    const audits = fs.readdirSync(path.join(root, "done/philips_ct/SME00001/2026-11"));
    assert.deepStrictEqual(audits, ["a-1.json"], `call ${n}: one audit copy`);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, "done/philips_ct/SME00001/2026-11/a-1.json"))).attempt_id, "a-1");
    assert.ok(hashes.length >= 1, `call ${n}: the done-hash was set`);
  }
});

test("completion: late keeps the folder and sets the done-hash; bad lines are retained first", async () => {
  const root = tmpRoot();
  const sp = new Spool({ sme: "SME00001", root, now: fixedNow });
  const { dir } = sp.spoolSnapshot("EALInfo.csv", BUF, "eal");
  const st = committedState(sp, dir, { classification: "late", bad_lines: 2, bad_reasons: [{ line: 3, reason: "x" }] });
  let done = 0;
  const r = await sp.finish(dir, st, { setDone: async () => done++, setSeen: async () => {} });
  assert.strictEqual(r, "late");
  assert.strictEqual(done, 1);
  assert.strictEqual(sp.readState(dir).status, "late");
  assert.ok(fs.existsSync(path.join(dir, "data")));
  const retained = fs.readdirSync(path.join(root, "retained/philips_ct/SME00001"));
  assert.strictEqual(retained.length, 1);
  assert.ok(fs.existsSync(path.join(root, "retained/philips_ct/SME00001", retained[0], "reasons.json")));
});

test("completion: a format change sets the seen-hash, never the done-hash", async () => {
  const root = tmpRoot();
  const sp = new Spool({ sme: "SME00001", root, now: fixedNow });
  const { dir } = sp.spoolSnapshot("EALInfo.csv", BUF, "eal");
  // A header change has no bad lines, only format_change: it must still be retained (rehearsal s5).
  const st = committedState(sp, dir, { ids: [], eal_ids: [], classification: "no_eal_rows", bad_lines: 0, format_change: "header does not match the expected table" });
  const calls = [];
  await sp.finish(dir, st, { setDone: async () => calls.push("done"), setSeen: async () => calls.push("seen") });
  assert.deepStrictEqual(calls, ["seen"]);
  const retained = fs.readdirSync(path.join(root, "retained/philips_ct/SME00001"));
  assert.strictEqual(retained.length, 1);
  const reasons = JSON.parse(fs.readFileSync(path.join(root, "retained/philips_ct/SME00001", retained[0], "reasons.json"), "utf8"));
  assert.strictEqual(reasons.format_change, "header does not match the expected table");
});

test("entries: oldest first across files; capacity counts every area", () => {
  const root = tmpRoot();
  let t = Date.parse("2026-11-24T18:18:00Z");
  const sp = new Spool({ sme: "SME00001", root, now: () => new Date((t += 1000)) });
  sp.spoolSnapshot("Events.csv", Buffer.from("b"), "events");
  sp.spoolSnapshot("EALInfo.csv", Buffer.from("a"), "eal");
  assert.deepStrictEqual(sp.entries().map((e) => e.file), ["Events.csv", "EALInfo.csv"]);
  const c = sp.capacity();
  assert.strictEqual(c.pending, 2);
  assert.ok(c.spool.bytes > 0);
  assert.strictEqual(c.oldest_pending, "2026-11-24T18:18:01.000Z");
});

test("lock: one holder per system; released on release", async () => {
  const dir = path.join(tmpRoot(), "spool/philips_ct/SME00001");
  const a = await lockSystem(dir);
  assert.ok(a);
  assert.strictEqual(await lockSystem(dir), null);
  await a.release();
  const b = await lockSystem(dir);
  assert.ok(b);
  await b.release();
});
