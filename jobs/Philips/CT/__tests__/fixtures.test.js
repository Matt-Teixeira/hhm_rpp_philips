"use strict";
// Masked real records (Q18; built by the evidence script pct1b/scripts/build_fixtures.js from one
// copy). expected.json says, per record, whether it matches an old row stored at its key, computed
// by the evidence projection from the REAL mdb-export records, independent of this code.
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { decodeFile } = require("../csv");
const { buildRows } = require("../rows");
const { matchRuleP } = require("../legacy");

const DIR = path.join(__dirname, "fixtures", "philips_ct");
const expected = JSON.parse(fs.readFileSync(path.join(DIR, "expected.json"), "utf8"));
const stored = JSON.parse(fs.readFileSync(path.join(DIR, "stored.json"), "utf8"));

function load(file, kind) {
  const d = decodeFile(fs.readFileSync(path.join(DIR, file)));
  const b = buildRows(d, kind);
  const byLine = new Map(d.records.map((r) => [r.line, r.fields]));
  return { b, incoming: b.rows.map((x) => ({ row: x.row, fields: byLine.get(x.line) })) };
}

const ev = load("Events.csv", "events");
const eal = load("EALInfo.csv", "eal");

test("fixtures: every hard case is present", () => {
  const rows = ev.incoming.map((x) => x.row);
  assert.ok(rows.some((r) => /__\d\d$/.test(r.host_time)), "suffixed key");
  assert.ok(rows.some((r) => (r.message || "").includes(",")), "comma in Msg");
  assert.ok(rows.some((r) => (r.message || "").includes("\n")), "line break in Msg");
  assert.ok(rows.some((r) => r.type === "ERROR_BLOB"), "ERROR_BLOB");
  assert.ok(rows.some((r) => r.eal === null), "EAL NULL (I6)");
  assert.ok(rows.some((r) => /Series .*cancelled/i.test(r.message || "")), "Series ... cancelled");
  const er = eal.incoming.map((x) => x.row);
  assert.ok(er.some((r) => r.info === null), "NULL Info");
  assert.ok(er.some((r) => r.tm_stamp !== "0"), "coded EAL row");
  const evKeys = new Set(rows.map((r) => `${r.host_date} ${r.host_time}`));
  assert.ok(er.some((r) => evKeys.has(`${r.host_date} ${r.host_time}`)), "EAL/Events twin");
  assert.ok(expected.eal.some((x) => !x.matches_old) && expected.eal.some((x) => x.matches_old), "revised and matched EAL rows");
  assert.ok(expected.events.some((x) => x.why === "I6" && x.matches_old), "an I6 row matched by the wildcard");
  assert.ok(!/SME(?!00001)\d{5}/.test(JSON.stringify(stored)), "masked system ids");
});

test("fixtures: every record decodes and builds; none is bad", () => {
  assert.strictEqual(ev.b.bad.length, 0);
  assert.strictEqual(eal.b.bad.length, 0);
  assert.strictEqual(ev.incoming.length, expected.events.length);
  assert.strictEqual(eal.incoming.length, expected.eal.length);
});

for (const [kind, set] of [["events", ev], ["eal", eal]]) {
  test(`fixtures: rule P agrees with the independent projection, record by record (${kind})`, () => {
    const pool = stored.filter((s) => s.kind === kind);
    const { insert } = matchRuleP(kind, set.incoming, pool);
    const inserted = new Set(insert);
    set.incoming.forEach((x, i) => {
      const e = expected[kind][i];
      assert.strictEqual(`${x.row.host_date} ${x.row.host_time}`, e.key);
      assert.strictEqual(!inserted.has(i), e.matches_old, `${kind} ${e.key}: matches_old`);
    });
    // A repeat with the new rows stored inserts nothing.
    const again = matchRuleP(kind, set.incoming, [...pool, ...insert.map((i) => set.incoming[i].row)]);
    assert.deepStrictEqual(again.insert, []);
  });
}
