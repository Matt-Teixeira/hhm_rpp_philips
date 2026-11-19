const redis = require("redis");
const { guardRedis } = require("../util/dry_run");

async function initRedis() {
  // SETUP ENV BASED RESOURCES -> REDIS CLIENT, JOB SCHEDULES
  const clienConfig = {
    socket: {
      port: 6379,
      host: process.env.REDIS_IP,
    },
  };

  const redisClient = redis.createClient(clienConfig);

  redisClient.on("error", async (error) => console.log(error));

  await redisClient.connect();

  // DRY_RUN=1: reads pass through, writes are recorded and skipped
  return guardRedis(redisClient);
}

module.exports = initRedis;
