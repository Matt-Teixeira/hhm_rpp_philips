"use strict";
const test = require("node:test");
const assert = require("assert");
const { makeLog } = require("../log");
const { type: { I, W, E } } = require("../../../../utils/logger/enums");

/** The app logger's contract for ERROR, as utils/logger/log.js implements it: `err.stack ? err.stack : err`. */
function strictLogger(events) {
  return async (type, run_log, func, tag, note, err) => {
    const ev = { type, func, note };
    if (type === E) ev.err_msg = err.stack ? err.stack : err; // throws on null, as the real one does
    events.push(ev);
  };
}

test("log: an ERROR without an exception carries a description (review finding 2)", async () => {
  const events = [];
  const log = makeLog(strictLogger(events), E);
  await log(E, {}, "philips_ct_capacity", "DETAILS", { pending: 3 });
  await log(E, {}, "philips_ct_late", "DETAILS", { message: "late entry" });
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].err_msg, "philips_ct_capacity: see note");
  assert.strictEqual(events[1].err_msg, "philips_ct_late: late entry");
});

test("log: a real exception keeps its stack; INFO/WARN pass through", async () => {
  const events = [];
  const log = makeLog(strictLogger(events), E);
  const x = new Error("boom");
  await log(E, {}, "f", "CATCH", {}, x);
  await log(I, {}, "f", "DETAILS", {});
  await log(W, {}, "f", "DETAILS", {});
  assert.strictEqual(events[0].err_msg, x.stack);
  assert.deepStrictEqual(events.slice(1).map((e) => e.type), [I, W]);
});

test("log: a logger that throws never aborts the caller", async () => {
  const log = makeLog(async () => {
    throw new Error("logger down");
  }, E);
  const orig = console.error;
  console.error = () => {};
  try {
    await log(E, {}, "f", "DETAILS", {});
  } finally {
    console.error = orig;
  }
});
