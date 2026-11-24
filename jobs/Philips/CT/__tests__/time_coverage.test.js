"use strict";
const test = require("node:test");
const assert = require("assert");
const { hostDatetime } = require("../time");
const cov = require("../coverage");

test("time: NULL zone -> America/New_York", () => {
  assert.strictEqual(hostDatetime("2026/10/30 12:27:18.203", null).value, "2026-10-30T12:27:18.203-04:00");
});

test("time: the fall-back hour takes the earlier offset, whatever the clock now", () => {
  assert.strictEqual(hostDatetime("2026/11/01 01:30:00.000", "America/New_York").value, "2026-11-01T01:30:00.000-04:00");
  assert.strictEqual(hostDatetime("2026/11/01 00:59:59.999", "America/New_York").value, "2026-11-01T00:59:59.999-04:00");
  assert.strictEqual(hostDatetime("2026/11/01 02:00:00.000", "America/New_York").value, "2026-11-01T02:00:00.000-05:00");
});

test("time: the spring gap moves forward", () => {
  assert.strictEqual(hostDatetime("2026/03/08 02:30:00.000", "America/New_York").value, "2026-03-08T03:30:00.000-04:00");
  assert.strictEqual(hostDatetime("2026/03/08 01:59:59.000", "America/New_York").value, "2026-03-08T01:59:59.000-05:00");
});

test("time: other zones, and an invalid zone -> NULL with an error", () => {
  assert.strictEqual(hostDatetime("2026/07/01 12:00:00.000", "America/Chicago").value, "2026-07-01T12:00:00.000-05:00");
  const bad = hostDatetime("2026/07/01 12:00:00.000", "Not/AZone");
  assert.strictEqual(bad.value, null);
  assert.ok(bad.error);
});

const us = (s) => cov.parseTs(s);

test("coverage: capture text round-trips at microsecond precision", () => {
  assert.strictEqual(us("2026-11-24 18:18:07.123456+00") % 1000000, 123456);
  assert.strictEqual(us("2026-11-24 13:18:07.5-05"), us("2026-11-24 18:18:07.5+00"));
  assert.strictEqual(us("2026-11-24 18:18:07+05:30"), us("2026-11-24 12:48:07+00"));
  assert.throws(() => us("2026-11-24 18:18:07"));
  assert.throws(() => us("garbage"));
});

test("coverage: the phase is strict (N + 6 min, N_next - 2 min)", () => {
  const p = (s) => cov.inPhase(us(s));
  assert.strictEqual(p("2026-11-24 18:30:00+00"), false); // N + 6 min exactly
  assert.strictEqual(p("2026-11-24 18:30:00.000001+00"), true);
  assert.strictEqual(p("2026-11-24 18:29:59.999999+00"), false);
  assert.strictEqual(p("2026-11-24 18:51:59.999999+00"), true);
  assert.strictEqual(p("2026-11-24 18:52:00+00"), false); // N_next - 2 min exactly
  assert.strictEqual(p("2026-11-24 18:18:00+00"), true); // the :18 cron
  assert.strictEqual(p("2026-11-24 18:48:00+00"), true); // the :48 cron
  assert.strictEqual(p("2026-11-24 18:24:10+00"), false); // Codex's :24:10 timeline
  assert.strictEqual(p("2026-11-24 19:00:00.000001+00"), true); // hour boundary
  assert.strictEqual(p("2026-11-25 00:00:00.000001+00"), true); // day boundary: N = 23:54 the day before
  assert.strictEqual(p("2026-11-24 23:58:00+00"), false); // 23:54 + 4 min
});

test("coverage: the guard and the classification", () => {
  const c = us("2026-11-24 18:48:00+00"); // N = 18:24, N_next = 18:54
  assert.strictEqual(cov.guardOk(c, us("2026-11-24 18:51:59.999999+00")), true);
  assert.strictEqual(cov.guardOk(c, us("2026-11-24 18:52:00+00")), false);
  assert.strictEqual(cov.classify(c, us("2026-11-24 18:52:29.999999+00")), "DELIVERED");
  assert.strictEqual(cov.classify(c, us("2026-11-24 18:52:30+00")), "late"); // N_next - 90 s exactly
});

test("coverage: exactly one reader under contract S (grid)", () => {
  // Readers at N, N + 30 and N + 60 min; each snapshot anywhere in [slot - 60 s, slot + 5 min].
  // A row (capture c, commit t1) is read by snapshot s iff t1 < s and s - 30 min < c.
  const N = us("2026-11-24 18:24:00+00");
  const M = 60e6;
  const snaps = [-60e6, -1, 0, 1, 2.8e6, 53e6, 5 * M - 1, 5 * M];
  const caps = [6 * M + 1, 15 * M, 28 * M - 1];
  let checked = 0;
  for (const dc of caps) {
    const c = N + dc;
    if (!cov.inPhase(c)) continue;
    for (const dt of [0, 1, 60e6, 30.5e6 + 28 * M - dc - 1]) {
      const t1 = c + dt;
      if (cov.classify(c, t1) !== "DELIVERED") continue;
      for (const a of snaps) for (const b of snaps) for (const d of snaps) {
        const reads = [N + a, N + 30 * M + b, N + 60 * M + d].filter((s) => t1 < s && s - 30 * M < c).length;
        assert.strictEqual(reads, 1, `c=${dc} t1=${dt} snaps=${[a, b, d]}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1000);
});

test("coverage: the clock check and the offset change", () => {
  assert.deepStrictEqual(cov.clockOk(9000, 1000), { ok: true, bound: 10000 });
  assert.strictEqual(cov.clockOk(-9000, 1001).ok, false); // signed offsets
  assert.strictEqual(cov.offsetChanged(null, 50000), false);
  assert.strictEqual(cov.offsetChanged(0, 10000), false);
  assert.strictEqual(cov.offsetChanged(0, -10001), true);
  const o = cov.offsetFromSample(1000, 990 * 1000, 1020);
  assert.deepStrictEqual(o, { offsetMs: 20, rttMs: 20 });
});
