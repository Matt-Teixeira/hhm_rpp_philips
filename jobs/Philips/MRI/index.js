const phil_mri_logcurrent = require("./logcurrent");
const phil_mri_rmmu_short = require("./rmmu_short_cryogenic");
const phil_mri_rmmu_long = require("./rmmu_long_cryogenic");
const phil_mri_rmmu_magnet = require("./rmmu_magnet");
const phil_rmmu_history = require("./rmmu_history");
const stt_parser = require("./stt");
const { type_1 } = require("./monitoring");
const { gzip_n_save } = require("../../../util");
const { dt_now } = require("../../../util/dates");
const PHILIPS_MRI_MONITORING = require("../../../data_acquisition/Philips_MRI_Monitor");
const PHILIPS_MRI_LOGCURRENT_STT = require("../../../data_acquisition/Philips_MRI_Logcurrent");
const PHILIPS_MRI_RMMU = require("../../../data_acquisition/Philips_MRI_Rmmu");
const [addLogEvent] = require("../../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat, det }
} = require("../../../utils/logger/enums");

const philips_mri_parsers = async (job_id, sysConfigData, run_log) => {
  let note = {
    job_id: job_id,
    sme: sysConfigData.id
  };

  try {
    await addLogEvent(I, run_log, "philips_mri_parsers", cal, note, null);

    if (sysConfigData.monitoring_config) {
      await addLogEvent(
        I,
        run_log,
        "philips_mri_parsers: monitoring",
        det,
        note,
        null
      );
      const System_Monitor = new PHILIPS_MRI_MONITORING(
        job_id,
        sysConfigData,
        run_log
      );
      await type_1(System_Monitor, sysConfigData.monitoring_config);
      return;
    }

    if (sysConfigData.log_config) {
      const capture_datetime = dt_now();
      await addLogEvent(
        I,
        run_log,
        "philips_mri_parsers: log",
        det,
        note,
        null
      );
      const Logcurrent_System = new PHILIPS_MRI_LOGCURRENT_STT(
        sysConfigData,
        sysConfigData.log_config,
        job_id,
        run_log,
        sysConfigData.log_config.dir_name
      );
      await phil_mri_logcurrent(
        sysConfigData.log_config,
        Logcurrent_System,
        capture_datetime
      );

      // Save logcurrent log to DB
      const path = `${sysConfigData.debian_server_path}/${sysConfigData.log_config.file_name}`;

      await gzip_n_save(
        job_id,
        run_log,
        sysConfigData.id,
        sysConfigData.log_config.file_name,
        capture_datetime,
        path
      );

      return;
    }

    for await (const directory of sysConfigData.rmmu_config) {
      //let dir = Object.keys(directory)[0];
      let dir = directory.dir_name;
      note.dir_name = dir;

      await addLogEvent(
        I,
        run_log,
        "philips_mri_parsers: rmmu",
        det,
        note,
        null
      );
      switch (dir) {
        case "rmmu": // Needs re-config
          const Rmmu_System = new PHILIPS_MRI_RMMU(
            sysConfigData,
            directory,
            job_id,
            run_log,
            dir
          );

          await phil_rmmu_history(Rmmu_System);
          break;

        case "rmmu_short":
          const Rmmu_Short_System = new PHILIPS_MRI_RMMU(
            sysConfigData,
            directory,
            job_id,
            run_log,
            dir
          );

          await phil_mri_rmmu_short(Rmmu_Short_System);
          break;

        case "rmmu_long":
          const Rmmu_Long_System = new PHILIPS_MRI_RMMU(
            sysConfigData,
            directory,
            job_id,
            run_log,
            dir
          );
          await phil_mri_rmmu_long(Rmmu_Long_System);
          break;

        case "rmmu_magnet":
          const Rmmu_Magnet_System = new PHILIPS_MRI_RMMU(
            sysConfigData,
            directory,
            job_id,
            run_log,
            dir
          );
          await phil_mri_rmmu_magnet(Rmmu_Magnet_System);
          break;

        case "stt_magnet":
          const STT_Magnet_System = new PHILIPS_MRI_LOGCURRENT_STT(
            sysConfigData,
            directory,
            job_id,
            run_log,
            dir
          );

          await stt_parser(directory, STT_Magnet_System);
          break;
        default:
          break;
      }
    }
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "philips_mri_parsers", cat, note, error);
  }
};

module.exports = philips_mri_parsers;
