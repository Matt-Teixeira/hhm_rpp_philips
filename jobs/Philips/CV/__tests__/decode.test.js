"use strict";
// CV-1b: decode + PHI mask + both regexes (PLAN-PHILIPS-CV-INSIGHTS.md §7.2). Hand-built, masked lines.
const test = require("node:test");
const assert = require("assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { decode_line, mask_phi, prepare_line, parse_line, read_lines, safe_head, SEPARATOR, MASK } = require("../decode");
const { philips_re } = require("../../../../parse/parsers");

const A = "\u00e1"; // byte 0xE1 read as Latin-1: the field separator
const RE1 = philips_re.cv.eventlog;
const RE2 = philips_re.cv.eventlog_2;

// A full `eventlog` record (14 fields), Latin-1 view.
const full = (o = {}) => {
  const f = {
    cat: "Acquisition", date: "2026-11-25", time: "07:01:17", type: "Information", num: "20481",
    teid: "Technical Event ID:   510999921", desc: "Description: Command: StartFluoroscopy ",
    chan: "Channel Identification: X-Ray Channel Undefined", mod: "Module: C:\\PMS\\Acq.exe",
    src: "Source File: U:\\Acq\\Cmd.cpp", line: "Line Number: 167 ",
    memo: "Memo: [FUSION_COMMAND]  StartFluoroscopy Execute() [UI_DEVICE_NAME]  . ",
    sub: "SubsystemNumber: 1", thr: "ThreadName: 4528", ...o
  };
  return [f.cat, f.date, f.time, f.type, f.num, f.teid, f.desc, f.chan, f.mod, f.src, f.line, f.memo, f.sub, f.thr].join(A);
};
// An `eventlog_2` record (13 fields: no Channel Identification).
const full2 = (o = {}) => {
  const f = {
    cat: "Image Detector", date: "2026-11-20", time: "13:59:11", type: "Information", num: "20481",
    teid: "Technical Event ID:   103262103", desc: "Description: Frontal FDC:  Gigalink lock dropped",
    mod: "Module: tRouterRdQ4", src: "Source File: ITINT.c", line: "Line Number: 785", memo: "Memo: ",
    sub: "SubsystemNumber: 2", thr: "ThreadName: tRouterRdQ4", ...o
  };
  return [f.cat, f.date, f.time, f.type, f.num, f.teid, f.desc, f.mod, f.src, f.line, f.memo, f.sub, f.thr].join(A);
};
const parse = (latin1, re) => parse_line(prepare_line(latin1), re);

test("decode: only 0xE1 becomes the separator; other bytes keep their characters", () => {
  assert.strictEqual(decode_line(`a${A}b`), `a${SEPARATOR}b`);
  assert.strictEqual(decode_line("pivot\u00a0potmeter \u0083 \u0005"), "pivot\u00a0potmeter \u0083 \u0005");
  assert.strictEqual(decode_line("plain ascii"), "plain ascii");
});

test("eventlog: a plain record parses exactly as before CV-1b", () => {
  const g = parse(full(), RE1);
  assert.strictEqual(g.category, "Acquisition");
  assert.strictEqual(g.technical_event_id, "510999921");
  assert.strictEqual(g.description, "Command: StartFluoroscopy ");
  assert.strictEqual(g.channel_id, "X-Ray Channel Undefined");
  assert.strictEqual(g.line, "167");
  assert.strictEqual(g.subsystem_number, "1");
  assert.strictEqual(g.thread_name, "4528");
  assert.strictEqual(g.message, undefined);
});

test("eventlog: a non-breaking space in Memo no longer cuts it (I2)", () => {
  const g = parse(full({ memo: "Memo: [FREE_TEXT]  involved FRU's: pivot\u00a0potmeter\u00a0assy" }), RE1);
  assert.strictEqual(g.memo, "[FREE_TEXT]  involved FRU's: pivot\u00a0potmeter\u00a0assy");
  assert.strictEqual(g.subsystem_number, "1");
  assert.strictEqual(g.thread_name, "4528");
});

test("eventlog: a short record keeps its separators as before in message", () => {
  const g = parse(["McLogEvent", "2026-11-17", "07:39:46", "Information", "5000", "McShield service started.", "Engine version : 1"].join(A), RE1);
  assert.strictEqual(g.technical_event_id, undefined);
  assert.strictEqual(g.message, `McShield service started.${SEPARATOR}Engine version : 1`);
});

test("eventlog_2: full record, and the binary SubsystemNumber of Image Detector events (I1)", () => {
  let g = parse(full2(), RE2);
  assert.strictEqual(g.description, "Frontal FDC:  Gigalink lock dropped");
  assert.strictEqual(g.subsystem_number, "2");
  assert.strictEqual(g.thread_name, "tRouterRdQ4");
  g = parse(full2({ sub: "SubsystemNumber: \u0005" }), RE2);
  assert.notStrictEqual(g, null);
  assert.strictEqual(g.technical_event_id, "103262103");
  assert.strictEqual(g.subsystem_number, undefined); // stored NULL
  assert.strictEqual(g.thread_name, "tRouterRdQ4");
});

test("eventlog_2: empty SubsystemNumber, a 0x83 byte in Memo, and short records (I1, I2)", () => {
  let g = parse(full2({ sub: "SubsystemNumber: ", memo: "Memo: [FUNCTION_RESULT]  Success" }), RE2);
  assert.strictEqual(g.memo, "[FUNCTION_RESULT]  Success");
  assert.strictEqual(g.thread_name, "tRouterRdQ4");
  // read as UTF-8, 0x83 became a second separator and the record was dropped; as Latin-1 it is text
  g = parse(full2({ memo: "Memo: [FUSION_COMMAND]  Move \u0083 done" }), RE2);
  assert.strictEqual(g.memo, "[FUSION_COMMAND]  Move \u0083 done");
  assert.strictEqual(g.subsystem_number, "2");
  assert.strictEqual(g.thread_name, "tRouterRdQ4");
  g = parse(["EventLog", "2026-11-23", "08:05:53", "Information", "6005", ""].join(A), RE2);
  assert.strictEqual(g.num_1, "6005");
  assert.strictEqual(g.message, ""); // empty text; mapDataToSchema stores NULL, as for eventlog
  g = parse(["MSDTC", "2026-11-17", "07:39:08", "Information", "4097", "MS DTC has started."].join(A), RE2);
  assert.strictEqual(g.message, "MS DTC has started.");
});

test("mask: every PHI command's value is masked; empty values and procedure names are kept (C2)", () => {
  const cmds = ["SetPatientDateOfBirth", "SetPatientID", "SetPatientName", "SetPatientType", "SetPatientHeight",
    "SetPatientWeight", "SetGender", "SetStudyID", "SetExaminationID", "SetOperatorName", "SetAttendingPhysician", "SetLongReportText"];
  for (const c of cmds) {
    const memo = `Memo: [FUSION_COMMAND]  ${c} Execute() Value 01 "x, y" [UI_DEVICE_NAME]  . `;
    const g = parse(full({ desc: `Description: Command: ${c} `, memo }), RE1);
    assert.strictEqual(g.memo, `[FUSION_COMMAND]  ${c} Execute() ${MASK}`, c);
    assert.strictEqual(g.thread_name, "4528", c);
  }
  const empty = "[FUSION_COMMAND]  SetPatientName Execute() [UI_DEVICE_NAME]  . ";
  assert.strictEqual(mask_phi(empty), empty);
  const proc = "[FUSION_COMMAND]  SetProcedure Execute() Left Coronary [UI_DEVICE_NAME]  . ";
  assert.strictEqual(mask_phi(proc), proc);
});

test("mask: a value holding the separator, or with no [UI_DEVICE_NAME] after it, is masked whole", () => {
  // a name containing byte 0xE1 would split the field; the whole value is still masked
  const line = prepare_line(full({ memo: `Memo: [FUSION_COMMAND]  SetOperatorName Execute() Ann ${A}lvarez [UI_DEVICE_NAME]  . ` }));
  assert.ok(!/Ann|lvarez/.test(line));
  const tail = mask_phi("[FUSION_COMMAND]  SetPatientID Execute() 0123456");
  assert.strictEqual(tail, `[FUSION_COMMAND]  SetPatientID Execute() ${MASK}`);
  assert.strictEqual(mask_phi("Command: SetPatientID"), "Command: SetPatientID"); // the description holds no value
});

test("read_lines: real bytes from disk (0xE1, 0xA0, 0x83, 0x05, CRLF), decoded and masked", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cv1b-"));
  const file = path.join(dir, "EventLog.txe");
  const latin1 = [
    full({ memo: "Memo: pivot\u00a0assy \u0083" }),
    full2({ sub: "SubsystemNumber: \u0005" }),
    full({ desc: "Description: Command: SetPatientDateOfBirth ", memo: "Memo: [FUSION_COMMAND]  SetPatientDateOfBirth Execute() 1950-01-01 [UI_DEVICE_NAME]  . " })
  ].join("\r\n") + "\r\n";
  fs.writeFileSync(file, Buffer.from(latin1, "latin1"));
  const raw = fs.readFileSync(file);
  assert.ok(raw.includes(0xe1) && raw.includes(0xa0) && raw.includes(0x83) && raw.includes(0x05));
  const lines = [];
  for await (const l of read_lines(file)) lines.push(l);
  fs.rmSync(dir, { recursive: true });
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(parse_line(lines[0], RE1).memo, "pivot\u00a0assy \u0083");
  assert.strictEqual(parse_line(lines[1], RE2).thread_name, "tRouterRdQ4");
  assert.ok(!lines[2].includes("1950"));
  assert.ok(lines.every((l) => !l.includes(A)));
});

const SECRET = "SYNTHETIC_SECRET";
const phiMemo = (value) => `Memo: [FUSION_COMMAND]  SetLongReportText Execute() ${value} [UI_DEVICE_NAME]  . `;

test("mask (review P1-A): a tag inside the typed value doesn't end it; the structural tail does", () => {
  const line = prepare_line(full({ desc: "Description: Command: SetLongReportText ", memo: phiMemo(`note [UI_DEVICE_NAME] ${SECRET}`) }));
  assert.ok(!line.includes(SECRET));
  const g = parse_line(line, RE1);
  assert.strictEqual(g.memo, `[FUSION_COMMAND]  SetLongReportText Execute() ${MASK}`);
  assert.strictEqual(g.subsystem_number, "1");
  assert.strictEqual(g.thread_name, "4528");
  // a tag with no space before it, and a record with no SubsystemNumber field (12 fields): to the end
  assert.ok(!mask_phi(`x${A}Memo: [FUSION_COMMAND]  SetPatientID Execute() a[UI_DEVICE_NAME]${SECRET}`).includes(SECRET));
  const twelve = prepare_line(full({ memo: phiMemo(SECRET) }).split(A).slice(0, 12).join(A));
  assert.ok(!twelve.includes(SECRET) && twelve.endsWith(`Execute() ${MASK}`));
});

test("mask: empty values and the 'Confirmed command' form are left alone", () => {
  const empty = full({ memo: "Memo: [FUSION_COMMAND]  SetPatientName Execute() [UI_DEVICE_NAME]  . " });
  assert.strictEqual(prepare_line(empty), decode_line(empty));
  const confirmed = full({ memo: "Memo: [FUSION_COMMAND]  SetPatientID Confirmed command, logged before confirmation:  Execute() [UI_DEVICE_NAME]  . " });
  assert.strictEqual(prepare_line(confirmed), decode_line(confirmed));
  const typed = full({ memo: `Memo: [FUSION_COMMAND]  SetPatientID Confirmed command, logged before confirmation:  Execute() ${SECRET} [UI_DEVICE_NAME]  . ` });
  assert.ok(!prepare_line(typed).includes(SECRET));
});

test("read_lines (review P1-B): LF, CR or CRLF inside a value is joined to its record and masked", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cv1b-"));
  const file = path.join(dir, "EventLog.txe");
  const rec = (memo, o = {}) => full({ desc: "Description: Command: SetLongReportText ", memo, ...o });
  const latin1 = [
    full({ time: "07:00:04" }),
    rec(phiMemo(`first\n${SECRET}`), { time: "07:00:03" }),
    rec(phiMemo(`first\r${SECRET}`), { time: "07:00:02" }),
    rec(phiMemo(`first\r\n${SECRET}`), { time: "07:00:01" }),
    full({ time: "07:00:00", desc: "Description: Two\nlines" }),
    ""
  ].join("\r\n");
  fs.writeFileSync(file, Buffer.from(latin1, "latin1"));
  const recs = [];
  for await (const l of read_lines(file)) recs.push(l);
  fs.rmSync(dir, { recursive: true });
  assert.strictEqual(recs.length, 5);
  assert.ok(recs.every((l) => !l.includes(SECRET)));
  for (const l of recs.slice(1, 4)) assert.strictEqual(parse_line(l, RE1).memo, `[FUSION_COMMAND]  SetLongReportText Execute() ${MASK}`);
  assert.strictEqual(parse_line(recs[4], RE1).description, "Two lines");
});

test("safe_head: category, date and time of a record; null for anything else", () => {
  assert.strictEqual(safe_head(decode_line(full())), "Acquisition | 2026-11-25 | 07:01:17");
  assert.strictEqual(safe_head(`${SECRET} [UI_DEVICE_NAME]`), null);
  assert.strictEqual(safe_head("NOT A RECORD"), null);
});
