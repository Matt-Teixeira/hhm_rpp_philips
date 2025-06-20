const System = require("./System");
const fs = require("node:fs");
const readline = require("readline");
const {
  getRedisFileSize,
  getCurrentFileSize,
  updateRedisFileSize,
} = require("../redis/redisHelpers");
const execTail = require("../read/exec-tail");
const execLastMod = require("../read/exec-file_last_mod");
const execFileLineRange = require("../read/exec-line_range");
const util = require("node:util");
const exec = util.promisify(require("node:child_process").exec);

class PHILIPS_MRI_LOGCURRENT extends System {
  constructor(sysConfigData, file_config, job_id, run_log, file_prop_name) {
    super(sysConfigData, file_config, job_id, run_log);
    this.file_config_prop_name = file_prop_name;
    this.complete_file_path = `${sysConfigData.debian_server_path}/${file_config.file_name}`;
  }

  updateSizePath = "./read/sh/readFileSize.sh";
  fileSizePath = "./read/sh/readFileSize.sh";
  tailPath = "./read/sh/tail.sh";
  lastModPath = "./read/sh/get_file_last_mod.sh";
  line_range_path = "./read/sh/get_line_range.sh";

  prev_file_size;
  current_file_size;
  delta;
  file_data_type;
  file_data;

  async getRedisFileSize() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config,
    };
    try {
      this.prev_file_size = await getRedisFileSize(
        this.sme,
        this.file_config.file_name,
        this.run_log
      );

      note.prev_file_size = this.prev_file_size;
      await this.addLogEvent(
        this.I,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: getRedisFileSize",
        this.det,
        note,
        null
      );
    } catch (error) {
      console.log(error);
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: getRedisFileSize",
        this.cat,
        note,
        error
      );
    }
  }

  async getCurrentFileSize() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config,
    };

    try {
      this.current_file_size = await getCurrentFileSize(
        this.sme,
        this.fileSizePath,
        this.sysConfigData.debian_server_path,
        this.file_config.file_name,
        this.run_log
      );
      note.current_file_size = this.current_file_size;

      await this.addLogEvent(
        this.I,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: getCurrentFileSize",
        this.det,
        note,
        null
      );
    } catch (error) {
      console.log(error);
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: getCurrentFileSize",
        this.cat,
        note,
        error
      );
    }
    let isFile = this.checkFileExists();
    if (!isFile) return null;
    this.getFileSizeDelta();
  }

  checkFileExists() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name,
    };
    try {
      if (!this.current_file_size) {
        note.message = "no such file or directory";
        this.addLogEvent(
          this.W,
          this.run_log,
          "PHILIPS_MRI_LOGCURRENT: checkFileExists",
          this.cat,
          note,
          null
        );
        return false;
      }
      return true;
    } catch (error) {
      console.log(error);
      this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: checkFileExists",
        this.cat,
        note,
        error
      );
    }
  }

  getFileSizeDelta() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name,
    };

    this.delta = this.current_file_size - this.prev_file_size;
    note.delta = this.delta;

    this.addLogEvent(
      this.I,
      this.run_log,
      "PHILIPS_MRI_LOGCURRENT: getFileSizeDelta",
      this.det,
      note,
      null
    );
  }

  async updateRedisFileSize() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name,
    };
    try {
      await updateRedisFileSize(
        this.sme,
        this.updateSizePath,
        this.sysConfigData.debian_server_path,
        this.file_config.file_name,
        this.run_log
      );
    } catch (error) {
      console.log(error);
      this.addLogEvent(
        this.I,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: updateRedisFileSize",
        this.cat,
        note,
        error
      );
    }
  }

  async getFileLineCount() {
    const { stdout, stderr } = await exec(
      `grep -c "" ${this.complete_file_path}`
    );

    return parseInt(stdout.trim());
  }

  async getFileData() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name,
    };
    try {
      if (
        this.prev_file_size === null ||
        this.prev_file_size === 0 ||
        this.delta < 0
      ) {
        // Reads entire file if redis reference is null or 0. Delt will be negative if new file on system.
        await this.readEntireFile(note);
      }
      if (this.prev_file_size > 0) {
        await this.readFileDelta(note);
      }
    } catch (error) {
      console.log(error);
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: getFileData",
        this.det,
        note,
        error
      );
    }
  }

  async readEntireFile(note) {
    try {
      // CHECK: Delta will be negative number if file turned over. Log event
      if (this.delta < 0) {
        note.message = `Delta was a negative value: ${this.delta}. Reading entire file.`;
        await this.addLogEvent(
          this.I,
          this.run_log,
          "PHILIPS_MRI_LOGCURRENT: readEntireFile",
          this.det,
          note,
          null
        );
      }
      this.file_data = readline.createInterface({
        input: fs.createReadStream(this.complete_file_path),
        crlfDelay: Infinity,
      });

      return;
    } catch (error) {
      console.log(error);
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: readEntireFile",
        this.det,
        note,
        error
      );
    }
  }

  async readFileDelta(note) {
    note.delta = this.delta;
    await this.addLogEvent(
      this.I,
      this.run_log,
      "PHILIPS_MRI_LOGCURRENT: readFileDelta",
      this.det,
      note,
      null
    );

    if (this.delta === 0) {
      // Get file's last mod datetime
      const file_mod_datetime = await execLastMod(this.lastModPath, [
        this.complete_file_path,
      ]);
      note.message = `No file data to read. Delta: ${this.delta}`;
      note.last_mod = file_mod_datetime;
      await this.addLogEvent(
        this.I,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: readFileDelta",
        this.det,
        note,
        null
      );
      this.file_data = null;
      return;
    }

    const tailDelta = await execTail(
      this.tailPath,
      this.delta,
      this.complete_file_path
    );

    // Place file data back into a format in which it can be read line by line. In this case, an array
    this.file_data = tailDelta.toString().split(/(?:\r\n|\r|\n)/g);
    return;
  }
}

module.exports = PHILIPS_MRI_LOGCURRENT;

/* 
async readEntireFile(note) {
    const file_line_count = await this.getFileLineCount();
    try {
      // CHECK: Delta will be negative number if file turned over. Log event
      if (this.delta < 0) {
        note.message = `Delta was a negative value: ${this.delta}. Reading entire file.`;
        await this.addLogEvent(
          this.I,
          this.run_log,
          "PHILIPS_MRI_LOGCURRENT: readEntireFile",
          this.det,
          note,
          null
        );
      }
      this.file_data = readline.createInterface({
        input: fs.createReadStream(this.complete_file_path),
        crlfDelay: Infinity,
      });

      return;
    } catch (error) {
      console.log(error);
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_LOGCURRENT: readEntireFile",
        this.det,
        note,
        error
      );
    }
  }
*/
