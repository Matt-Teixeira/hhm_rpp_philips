("use strict");
require("dotenv").config();
const phil_cv_eventlog = require("./eventlog");
const phil_cv_lod_eventlog = require("./lod_eventlog");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det }
} = require("../../../utils/logger/enums");

const philips_cv_parsers = async (job_id, sysConfigData, run_log) => {
  let note = {
    job_id: job_id,
    sme: sysConfigData.id
  };
  try {
    await addLogEvent(I, run_log, "philips_ct_parsers", cal, note, null);
    for await (const file of sysConfigData.log_config) {
      switch (file.dir_name) {
        case "EventLog":
          await phil_cv_eventlog(job_id, sysConfigData, file, run_log);
          break;
        case "lod_EventLog":
          await phil_cv_lod_eventlog(job_id, sysConfigData, file, run_log);
          break;
        default:
          break;
      }
    }
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "philips_cv_parsers", cat, note, error);
  }
};

module.exports = philips_cv_parsers;
