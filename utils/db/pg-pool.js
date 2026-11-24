const fs = require('fs');
const pgp = require('pg-promise')();

const config = {
   host: process.env.PG_HOST,
   port: process.env.PG_PORT,
   database: process.env.PG_DB,
   user: process.env.PG_USER,
   password: process.env.PG_PW,
   // TCP keepalives: a backend whose client vanished is noticed (PCT-1b Q43).
   keepAlive: true,
   ssl: {
      require: true,
      cert: fs.readFileSync(process.env.PG_SSL_PATH),
      rejectUnauthorized: true,
   },
};

const db = pgp(config);

module.exports = db;
