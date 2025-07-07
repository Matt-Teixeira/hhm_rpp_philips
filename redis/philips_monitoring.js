const initRedis = require(".");
const [addLogEvent] = require("../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat, seq, qaf },
} = require("../utils/logger/enums");

async function getRedisLine(sme, file, run_log) {
  const redisClient = await initRedis();
  let note = {
    sme,
    file,
  };
  try {
    const key = `${sme}.${file}`;
    let line = await redisClient.get(key);
    await redisClient.quit();
    if (line === null) {
      note.file = file;
      note.message = "No line data in Redis";
      await addLogEvent(W, run_log, "getRedisLine", det, note, null);
    }
    return line;
  } catch (error) {
    await addLogEvent(E, run_log, "getRedisLine", cat, note, error);
    await redisClient.quit();
  }
}

async function updateRedisLine(sme, file, first_line, run_log) {
  let note = {
    sme,
    file,
    first_line,
  };
  if (!first_line) return;
  try {
    const redisClient = await initRedis();

    const setKey = `${sme}.${file}`;

    await redisClient.set(setKey, first_line);
    await redisClient.quit();
    return;
  } catch (error) {
    await addLogEvent(E, run_log, "updateRedisLine", cat, note, error);
    console.log(error);
    await redisClient.quit();
  }
}

async function update_redis_last_file(sme, file, rmmu_file_type, run_log) {
  let note = {
    sme,
    file,
    rmmu_file_type,
  };
  const redisClient = await initRedis();
  try {
    const setKey = `${sme}.${rmmu_file_type}`;
    await redisClient.set(setKey, file);
    await redisClient.quit();
    return;
  } catch (error) {
    await addLogEvent(E, run_log, "update_redis_last_file", cat, note, error);
    await redisClient.quit();
  }
}

async function get_last_cached_file(sme, rmmu_file_type, run_log) {
  let note = {
    sme,
    rmmu_file_type,
  };
  const redisClient = await initRedis();
  try {
    const key = `${sme}.${rmmu_file_type}`;
    let line = await redisClient.get(key);
    await redisClient.quit();
    return line;
  } catch (error) {
    await addLogEvent(E, run_log, "get_last_cached_file", cat, note, error);
    await redisClient.quit();
  }
}

module.exports = {
  getRedisLine,
  updateRedisLine,
  update_redis_last_file,
  get_last_cached_file,
};
