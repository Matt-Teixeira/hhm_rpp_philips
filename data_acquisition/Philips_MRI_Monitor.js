const fs = require("node:fs").promises;
const {
  getRedisLine,
  updateRedisLine
} = require("../redis/philips_monitoring");
const exec_tail_last_line = require("../read/exec-tail-last-line");
const exec_monitor_delta = require("../read/exec-monitor_delta");
const execLastMod = require("../read/exec-file_last_mod");
const [addLogEvent] = require("../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat, seq, qaf }
} = require("../utils/logger/enums");

class PHILIPS_MRI_MONITORING {
  constructor(job_id, sysConfigData, run_log) {
    this.job_id = job_id;
    this.run_log = run_log;
    this.sysConfigData = sysConfigData;
    this.sme = this.sysConfigData.id;
  }

  exec_tail_path = "./read/sh/tail_late_line.sh";
  exec_monitor_delta_path = "./read/sh/get_monitor_delta.sh";
  lastModPath = "./read/sh/get_file_last_mod.sh";

  async get_all_monitor_data(complete_file_path) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: complete_file_path
    };
    try {
      await addLogEvent(
        I,
        this.run_log,
        "PHILIPS_MRI_MONITORING: get_all_monitor_data",
        cal,
        note,
        null
      );
      const file_data = await fs.readFile(complete_file_path);
      const file_data_str = file_data.toString();
      return file_data_str;
    } catch (error) {
      await addLogEvent(
        E,
        this.run_log,
        "PHILIPS_MRI_MONITORING: get_all_monitor_data",
        cat,
        note,
        error
      );
    }
  }

  async get_redis_line(file) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: file.file_name
    };

    await addLogEvent(
      I,
      this.run_log,
      "PHILIPS_MRI_MONITORING: get_redis_line",
      cal,
      note,
      null
    );

    let last_line = await getRedisLine(this.sme, file.file_name, this.run_log);

    note.last_line = last_line;
    await addLogEvent(
      I,
      this.run_log,
      "PHILIPS_MRI_MONITORING: get_redis_line",
      det,
      note,
      null
    );

    if (last_line === null || last_line === "") return null;

    const matched_last_line = last_line.match(
      /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d+-[A-Z]+-\d{4}\s+(-)?\d+|\d{4}-\d{2}-\d{2}\s+\d{2}:\d+/
    );

    if (!matched_last_line) {
      let note = {
        job_id: this.job_id,
        sme: this.sme,
        file: file.file_name,
        message: "last_line is null. Need to mod regex",
        re: /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d+-[A-Z]+-\d{4}\s+(-)?\d+|\d{4}-\d{2}-\d{2}\s+\d{2}:\d+/,
        last_line,
        matched_last_line
      };
      await addLogEvent(
        W,
        this.run_log,
        "PHILIPS_MRI_MONITORING: get_redis_line",
        det,
        note,
        null
      );
      return null;
    }

    return matched_last_line[0];
  }

  async get_last_monitor_line(complete_file_path, file_name) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: file_name
    };
    try {
      const last_line = await exec_tail_last_line(
        this.exec_tail_path,
        complete_file_path
      );

      console.log("\nLAST LINE IN FILE TO SAVE TO REDIS");
      console.log(last_line);

      note.last_line = last_line;
      await addLogEvent(
        I,
        this.run_log,
        "PHILIPS_MRI_MONITORING: get_last_monitor_line",
        det,
        note,
        null
      );

      console.log("\nfile_name");
      console.log(file_name);
      await this.update_redis_monitor_line(file_name, last_line);
    } catch (error) {
      console.log(error);
      await addLogEvent(
        E,
        this.run_log,
        "PHILIPS_MRI_MONITORING: get_last_monitor_line",
        cat,
        note,
        error
      );
    }
  }

  async update_redis_monitor_line(file_name, line) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: file_name,
      line
    };
    try {
      await addLogEvent(
        I,
        this.run_log,
        "PHILIPS_MRI_MONITORING: update_redis_monitor_line",
        cal,
        note,
        null
      );

      await updateRedisLine(this.sme, file_name, line, this.run_log);
    } catch (error) {
      await addLogEvent(
        E,
        this.run_log,
        "PHILIPS_MRI_MONITORING: update_redis_monitor_line",
        cat,
        note,
        error
      );
    }
  }

  async get_monitor_delta(complete_file_path, last_line) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: complete_file_path,
      last_line
    };

    try {
      await addLogEvent(
        I,
        this.run_log,
        "PHILIPS_MRI_MONITORING: get_monitor_delta",
        cal,
        note,
        null
      );
      // Gets delta based on last line parsed and cached in redis
      const delta = await exec_monitor_delta(
        this.job_id,
        this.exec_monitor_delta_path,
        [last_line, complete_file_path]
      );

      // Will return null if no new lines detected
      if (delta === null) {
        // Get file's last mod datetime
        const file_mod_datetime = await execLastMod(this.lastModPath, [
          complete_file_path
        ]);
        note.data = delta;
        note.message = "File does not have new data";
        note.last_mod = file_mod_datetime;
        await addLogEvent(
          I,
          this.run_log,
          "PHILIPS_MRI_MONITORING: get_monitor_delta",
          det,
          note,
          null
        );

        return null;
      }

      return delta.toString();
    } catch (error) {
      console.log(error);
      await addLogEvent(
        E,
        this.run_log,
        "PHILIPS_MRI_MONITORING: get_monitor_delta",
        cat,
        note,
        error
      );
    }
  }

  // Logcurrent.log
}

module.exports = PHILIPS_MRI_MONITORING;

// grep -P -na "2023-01-03\t15:38:35\t0\t00000\t " monitor_magnet_quench.dat | cut -d : -f 1
