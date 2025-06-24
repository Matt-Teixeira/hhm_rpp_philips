const [addLogEvent] = require("../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat, seq, qaf }
} = require("../utils/logger/enums");
const { getLastModifiedTime } = require("../util/isFileModified");
const { push_file_dt_queue } = require("../redis/redisHelpers");

class System {
  constructor(sysConfigData, file_config, job_id, run_log) {
    this.sysConfigData = sysConfigData;
    this.file_config = file_config;
    this.job_id = job_id;
    this.run_log = run_log;
    this.sme = this.sysConfigData.id;
    this.parsers = file_config.parsers;
    this.I = I;
    this.W = W;
    this.E = E;
    this.cal = cal;
    this.det = det;
    this.cat = cat;
    this.seq = seq;
    this.qaf = qaf;
  }

  async addLogEvent(type, run_log, name, tag, note = null, error = null) {
    await addLogEvent(type, run_log, name, tag, note, error);
  }

  async getLastModifiedTime(file_path) {
    return getLastModifiedTime(file_path);
  }

  async push_file_dt_queue(run_log, system_file_metadata) {
    push_file_dt_queue(run_log, system_file_metadata);
  }
}

module.exports = System;