"use strict";
const test = require("node:test");
const assert = require("assert");
const { decodeFile, parseLine, unescapeField } = require("../csv");

const dec = (s) => decodeFile(Buffer.from(s, "utf8"));

test("unescape: one left-to-right pass", () => {
  assert.strictEqual(unescapeField("a\\nb"), "a\nb");
  assert.strictEqual(unescapeField("a\\rb\\tc"), "a\rb\tc");
  assert.strictEqual(unescapeField("C:\\\\dir"), "C:\\dir"); // literal backslash
  assert.strictEqual(unescapeField("\\\\n"), "\\n"); // escaped backslash then n, not a newline
  assert.strictEqual(unescapeField("\\\\\\n"), "\\\n"); // adjacent escapes
  assert.strictEqual(unescapeField("a\\x"), "a\\x"); // unknown pair kept
  assert.strictEqual(unescapeField("end\\"), "end\\"); // trailing lone backslash kept
});

test("parseLine: NULL vs empty, doubled quotes, commas", () => {
  assert.deepStrictEqual(parseLine('a,,"",""""'), { fields: ["a", null, "", '"'] });
  assert.deepStrictEqual(parseLine('"x,y","say ""hi"""'), { fields: ["x,y", 'say "hi"'] });
  assert.deepStrictEqual(parseLine("1,2"), { fields: ["1", "2"] });
  assert.deepStrictEqual(parseLine(""), { fields: [null] });
  assert.deepStrictEqual(parseLine('"\\t\\n"'), { fields: ["\t\n"] }); // unescape after quoting
});

test("parseLine: bad quoting is an error, not an exception", () => {
  assert.ok(parseLine('"open').error);
  assert.ok(parseLine('ab"c"').error);
  assert.ok(parseLine('"a"b').error);
  assert.ok(parseLine('"a""').error);
});

test("decodeFile: header, CRLF, final newline, line numbers", () => {
  const d = dec('H1,H2\r\n"a",1\r\n"b",2\r\n');
  assert.deepStrictEqual(d.header, ["H1", "H2"]);
  assert.strictEqual(d.dataLines, 2);
  assert.deepStrictEqual(d.records, [{ line: 2, fields: ["a", "1"] }, { line: 3, fields: ["b", "2"] }]);
});

test("decodeFile: a bad line is a bad record; the rest decode", () => {
  const d = dec('H\n"ok"\n"bad\n"ok2"');
  assert.strictEqual(d.records.length, 3);
  assert.ok(d.records[1].error);
  assert.deepStrictEqual(d.records[2].fields, ["ok2"]);
  assert.strictEqual(d.dataLines, 3);
});

test("decodeFile: non-ASCII text, invalid UTF-8 and NUL", () => {
  const good = dec('H\n"Café ☃"\n');
  assert.deepStrictEqual(good.records[0].fields, ["Café ☃"]);
  const buf = Buffer.concat([Buffer.from('H\n"a"\n"'), Buffer.from([0xff]), Buffer.from('"\n"\0"\n')]);
  const d = decodeFile(buf);
  assert.deepStrictEqual(d.records[0].fields, ["a"]);
  assert.strictEqual(d.records[1].error, "invalid UTF-8");
  assert.strictEqual(d.records[2].error, "NUL byte");
});

test("decodeFile: empty file and bad header", () => {
  assert.ok(dec("").headerError);
  assert.ok(dec('"H1",,H3\n').headerError);
  assert.strictEqual(dec("H1\n").dataLines, 0);
});
