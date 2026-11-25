"use strict";
// CV-1b: which daily folders to parse, and the wait/skip rule (PLAN-PHILIPS-CV-INSIGHTS.md §7.2, C3).
const test = require("node:test");
const assert = require("assert");
const { folder_key, folders_to_parse, folder_action, before_pointer, WAIT_HOURS } = require("../folders");

test("folder_key: both name formats; anything else is not a daily folder", () => {
  assert.strictEqual(folder_key("daily_2026_11_25"), "20261125");
  assert.strictEqual(folder_key("daily_20261125"), "20261125");
  assert.strictEqual(folder_key(" daily_2026_11_25\n"), "20261125");
  assert.strictEqual(folder_key("EventLog.txe"), null);
  assert.strictEqual(folder_key("lod_20250414_1627"), null);
  assert.strictEqual(folder_key("daily_2026_11_25.bak"), null);
});

test("no pointer (a new system): only the newest folder, as before", () => {
  assert.deepStrictEqual(folders_to_parse(["EventLog.txe", "daily_2026_11_23", "daily_2026_11_25", "daily_2026_11_24"], null), ["daily_2026_11_25"]);
  assert.deepStrictEqual(folders_to_parse(["EventLog.txe", "lod_EventLog.txe"], null), []);
});

test("pointer: every later folder, oldest first; none when the pointer is the newest", () => {
  const ls = ["daily_2026_11_25", "daily_2026_11_11", "daily_2026_11_12", "daily_2026_11_18", "Event.zip"];
  assert.deepStrictEqual(folders_to_parse(ls, "daily_2026_11_11"), ["daily_2026_11_12", "daily_2026_11_18", "daily_2026_11_25"]);
  assert.deepStrictEqual(folders_to_parse(ls, "daily_2026_11_25"), []);
});

test("a pointer folder that no longer exists does not re-read history (the old code did)", () => {
  const ls = ["daily_2026_11_10", "daily_2026_11_12", "daily_2026_11_18"];
  assert.deepStrictEqual(folders_to_parse(ls, "daily_2026_11_11"), ["daily_2026_11_12", "daily_2026_11_18"]);
});

test("compact names order by date", () => {
  assert.deepStrictEqual(folders_to_parse(["daily_20261124", "daily_20261109", "daily_20251231"], "daily_20251231"), ["daily_20261109", "daily_20261124"]);
});

test("folder_action: parse; wait while young; skip after WAIT_HOURS", () => {
  assert.strictEqual(WAIT_HOURS, 48);
  assert.strictEqual(folder_action({ has_txe: true, age_hours: 0 }), "parse");
  assert.strictEqual(folder_action({ has_txe: true, age_hours: 500 }), "parse");
  assert.strictEqual(folder_action({ has_txe: false, age_hours: 0.5 }), "wait");
  assert.strictEqual(folder_action({ has_txe: false, age_hours: 48 }), "wait");
  assert.strictEqual(folder_action({ has_txe: false, age_hours: 48.1 }), "skip");
});

test("before_pointer (backfill, review P3): strictly before the live pointer; unknown means no", () => {
  assert.strictEqual(before_pointer("daily_2026_11_11", "daily_2026_11_25"), true);
  assert.strictEqual(before_pointer("daily_20261111", "daily_2026_11_25"), true); // mixed formats compare by date
  assert.strictEqual(before_pointer("daily_2026_11_25", "daily_2026_11_25"), false);
  assert.strictEqual(before_pointer("daily_2026_11_26", "daily_2026_11_25"), false);
  assert.strictEqual(before_pointer("daily_2026_11_11", null), false);
  assert.strictEqual(before_pointer("daily_2026_11_11", "garbage"), false);
  assert.strictEqual(before_pointer("EventLog.txe", "daily_2026_11_25"), false);
});
