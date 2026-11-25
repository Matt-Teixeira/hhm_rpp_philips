// DRY RUN MODE
// Run any job with DRY_RUN=1 to do every read (Postgres, Redis, files on disk)
// but no writes. Writes are recorded to ./dry_run_output/<job>.<timestamp>.sql
// and summarised on stdout at exit, so output can be compared to a real run.
//
// Two layers of protection for Postgres:
//   1. PGOPTIONS puts every pooled connection in read-only mode, so the
//      server itself rejects INSERT/UPDATE/DELETE/DDL even if layer 2 misses one.
//   2. The shared pg-promise `db` is wrapped: statements that are not plain
//      SELECTs are recorded and skipped instead of being sent.
// Redis writes (SET/DEL/LPUSH/...) are recorded and skipped; reads pass through.
// File moves (move_to_archive) are recorded and skipped.

const fs = require("fs");
const path = require("path");

const isDryRun = () =>
  ["1", "true", "yes"].includes(String(process.env.DRY_RUN || "").toLowerCase());

const READ_ONLY_PG_OPTION = "-c default_transaction_read_only=on";
const WRITE_WORDS =
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|VACUUM|REINDEX|CALL|DO|LOCK|NEXTVAL|SETVAL)\b/i;
const PG_METHODS = [
  "none", "one", "many", "oneOrNone", "oneOrMany", "manyOrNone", "any",
  "result", "multiResult", "multi", "query", "func", "proc", "map", "each",
  "stream", "task", "taskIf", "tx", "txIf", "connect"
];
// Redis commands allowed through in dry run (all read-only)
const REDIS_READ_COMMANDS = new Set([
  "GET", "MGET", "EXISTS", "LRANGE", "LLEN", "LINDEX", "SMEMBERS", "SISMEMBER",
  "SCARD", "HGET", "HGETALL", "HMGET", "TTL", "TYPE", "STRLEN", "PING"
]);
const REDIS_PASSTHROUGH = new Set([
  "connect", "on", "once", "off", "removeListener", "quit", "close",
  "disconnect", "destroy", "isOpen", "isReady", "options",
  "get", "mGet", "exists", "lRange", "lLen", "sMembers", "sIsMember",
  "hGet", "hGetAll", "ping"
]);

const stats = { pg: {}, redis: {}, files: [] };
let outFile = null;

function out(line) {
  if (!outFile) {
    const dir = path.join(process.cwd(), "dry_run_output");
    fs.mkdirSync(dir, { recursive: true });
    const job = path.basename(process.argv[2] || "job").replace(/[^\w.-]/g, "_"); // a job name, or a tool's file argument
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    outFile = path.join(dir, `${job}.${ts}.sql`);
  }
  fs.appendFileSync(outFile, line + "\n");
}

function queryText(q) {
  if (typeof q === "string") return q;
  if (q && typeof q.toString === "function") {
    // QueryFile / PreparedStatement / ParameterizedQuery
    if (q.text) return String(q.text);
    if (q.query) return String(q.query);
    return q.toString();
  }
  return String(q);
}

function isReadOnlySql(sql) {
  const s = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  return /^(SELECT|SHOW|EXPLAIN)\b/i.test(s) && !WRITE_WORDS.test(s);
}

// "insert into "log"."philips_ct_eal"(...) values(...),(...)" -> log.philips_ct_eal
function describeWrite(sql) {
  const s = sql.replace(/\s+/g, " ").trim();
  const m =
    s.match(/^(insert into|update|delete from)\s+("?[\w]+"?(?:\."?[\w]+"?)?)/i) ||
    s.match(/^(\w+)\s+("?[\w.]+"?)/);
  const verb = m ? m[1].toUpperCase().split(" ")[0] : "UNKNOWN";
  const table = m ? m[2].replace(/"/g, "") : "?";
  let rows = null;
  if (verb === "INSERT") {
    const v = s.search(/\)\s*values\s*\(/i);
    // count tuples in a pgp multi-row insert; approximate if values contain "),("
    rows = v === -1 ? 1 : (s.slice(v).match(/\)\s*,\s*\(/g) || []).length + 1;
  }
  return { key: `${verb} ${table}`, rows };
}

function recordPg(method, q, values) {
  const sql = queryText(q);
  const { key, rows } = describeWrite(sql);
  const s = (stats.pg[key] = stats.pg[key] || { statements: 0, rows: 0 });
  s.statements += 1;
  s.rows += rows || 0;
  let valueNote = "";
  if (values !== undefined) {
    valueNote = JSON.stringify(values, (k, v) =>
      v && v.type === "Buffer" ? `<Buffer ${v.data.length} bytes>` : v
    );
    if (valueNote.length > 2000) valueNote = valueNote.slice(0, 2000) + "...";
  }
  out(`-- [pg.${method}] ${key}${rows ? ` (~${rows} rows)` : ""}`);
  out(sql.trim() + ";");
  if (valueNote) out(`-- values: ${valueNote}`);
  out("");
}

function guardPg(db) {
  // Layer 1: server-side read-only sessions. node-postgres reads PGOPTIONS when
  // each client is created, which happens lazily on first query.
  const existing = process.env.PGOPTIONS ? process.env.PGOPTIONS + " " : "";
  process.env.PGOPTIONS = existing + READ_ONLY_PG_OPTION;

  // Layer 2: skip and record writes before they reach the server.
  for (const method of PG_METHODS) {
    const original = db[method];
    if (typeof original !== "function") continue;
    db[method] = function (q, values, ...rest) {
      if (["task", "taskIf", "tx", "txIf", "connect", "stream", "map", "each"].includes(method)) {
        // Not used by this app; refuse rather than guess what they do.
        throw new Error(`DRY_RUN: db.${method}() is not supported in dry-run mode`);
      }
      const sql = queryText(q);
      if (isReadOnlySql(sql)) return original.call(db, q, values, ...rest);
      recordPg(method, q, values);
      switch (method) {
        case "none":
        case "oneOrNone":
          return Promise.resolve(null);
        case "result":
          return Promise.resolve({ rows: [], rowCount: 0, command: "DRY_RUN" });
        case "one":
        case "many":
        case "oneOrMany":
          return Promise.resolve(method === "one" ? {} : []);
        default:
          return Promise.resolve([]);
      }
    };
  }
}

function recordRedis(cmd, args) {
  const key = String(args[0] ?? "");
  const name = cmd.toUpperCase();
  stats.redis[name] = (stats.redis[name] || 0) + 1;
  let shown = args.map((a) => String(a)).join(" ");
  if (shown.length > 300) shown = shown.slice(0, 300) + "...";
  out(`-- [redis] ${name} ${shown}`);
  return key;
}

// Wrap a connected node-redis client so writes become no-ops.
function guardRedis(client) {
  if (!isDryRun()) return client;
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "sendCommand") {
        return async (args, ...rest) => {
          const cmd = String(args[0]).toUpperCase();
          if (REDIS_READ_COMMANDS.has(cmd)) return target.sendCommand(args, ...rest);
          recordRedis(cmd, args.slice(1));
          return cmd === "LPUSH" || cmd === "RPUSH" || cmd === "DEL" ? 0 : "OK";
        };
      }
      if (prop === "set" || prop === "del" || prop === "lPush" || prop === "rPush") {
        return async (...args) => {
          recordRedis(prop, args);
          return prop === "set" ? "OK" : 0;
        };
      }
      const value = Reflect.get(target, prop, target);
      if (typeof prop === "symbol" || REDIS_PASSTHROUGH.has(prop)) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      if (typeof value === "function") {
        return () => {
          throw new Error(`DRY_RUN: redis.${String(prop)}() is not allow-listed`);
        };
      }
      return value;
    }
  });
}

function recordFileMove(args) {
  stats.files.push(args);
  out(`-- [file] mv ${args.map((a) => JSON.stringify(a)).join(" ")}`);
}

function printSummary() {
  const lines = ["", "================ DRY RUN SUMMARY (nothing was written) ================"];
  const pgKeys = Object.keys(stats.pg).sort();
  lines.push(pgKeys.length ? "Postgres writes skipped:" : "Postgres writes skipped: none");
  for (const k of pgKeys) {
    const { statements, rows } = stats.pg[k];
    lines.push(`  ${k.padEnd(55)} statements=${statements}${rows ? `  rows~${rows}` : ""}`);
  }
  const rKeys = Object.keys(stats.redis).sort();
  lines.push(rKeys.length ? "Redis writes skipped:" : "Redis writes skipped: none");
  for (const k of rKeys) lines.push(`  ${k.padEnd(55)} count=${stats.redis[k]}`);
  lines.push(`File moves skipped: ${stats.files.length}`);
  if (outFile) lines.push(`Full detail: ${outFile}`);
  lines.push("=======================================================================");
  console.log(lines.join("\n"));
}

function install() {
  if (!isDryRun()) return false;
  const db = require("../utils/db/pg-pool");
  guardPg(db);
  process.on("exit", printSummary);
  console.log(
    `DRY_RUN enabled: Postgres sessions read-only (${READ_ONLY_PG_OPTION}); ` +
      "writes to Postgres/Redis/files are recorded, not executed."
  );
  return true;
}

module.exports = { install, isDryRun, guardRedis, recordFileMove, isReadOnlySql };
