("use strict");
require("dotenv").config();
const phil_ct_eal = require("./eal_parser");
const phil_ct_events = require("./events_parser");
const { Philips_CT } = require("../../../data_acquisition/Philips_CT");
const { gzip_n_save } = require("../../../util");
const { dt_now } = require("../../../util/dates");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det }
} = require("../../../utils/logger/enums");

const philips_ct_parsers = async (job_id, sysConfigData, run_log) => {
  let note = {
    job_id: job_id,
    sme: sysConfigData.id
  };

  try {
    await addLogEvent(I, run_log, "philips_ct_parsers", cal, note, null);

    for await (const file of sysConfigData.log_config) {
      const capture_datetime = dt_now();
      switch (file.dir_name) {
        case "eal":
          const Eal_System = new Philips_CT(
            sysConfigData,
            file,
            job_id,
            run_log
          );
          await phil_ct_eal(Eal_System, capture_datetime);
          break;
        case "events":
          const Events_System = new Philips_CT(
            sysConfigData,
            file,
            job_id,
            run_log
          );
          await phil_ct_events(Events_System, capture_datetime);
          break;
        default:
          break;
      }

      // SAVE LOG

      let path = `${sysConfigData.debian_server_path}/${file.file_name}`;

      await gzip_n_save(
        job_id,
        run_log,
        sysConfigData.id,
        file.file_name,
        capture_datetime,
        path
      );
    }
  } catch (error) {
    await addLogEvent(E, run_log, "philips_ct_parsers", cat, note, error);
  }
};

module.exports = philips_ct_parsers;
