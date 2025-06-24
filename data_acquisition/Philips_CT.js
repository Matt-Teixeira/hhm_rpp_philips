const System = require("./System");
const fs = require("node:fs").promises;
const {
  getRedisFileSize,
  getCurrentFileSize,
  updateRedisFileSize
} = require("../redis/redisHelpers");
const { getLastModifiedTime } = require("../util/isFileModified");
const execTail = require("../read/exec-tail");
const execLastMod = require("../read/exec-file_last_mod");
const { philips_re } = require("../parse/parsers");

class Philips_CT extends System {
  updateSizePath = "./read/sh/readFileSize.sh";
  fileSizePath = "./read/sh/readFileSize.sh";
  tailPath = "./read/sh/tail.sh";
  lastModPath = "./read/sh/get_file_last_mod.sh";

  prev_file_size;
  current_file_size;
  delta;
  file_data;

  constructor(sysConfigData, file_config, job_id, run_log) {
    super(sysConfigData, file_config, job_id, run_log);
    this.complete_file_path = `${sysConfigData.debian_server_path}/${file_config.file_name}`;
  }

  async getRedisFileSize() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name
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
        "Philips_CT: getRedisFileSize",
        this.det,
        note
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Philips_CT: getRedisFileSize",
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
      file: this.file_config.file_name
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
        "Philips_CT: getCurrentFileSize",
        this.det,
        note
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Philips_CT: getCurrentFileSize",
        this.cat,
        note,
        error
      );
    }
  }

  async getFileSizeDelta() {
    this.delta = this.current_file_size - this.prev_file_size;

    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name,
      delta: this.delta
    };
    this.addLogEvent(
      this.I,
      this.run_log,
      "Philips_CT: getFileSizeDelta",
      this.det,
      note
    );

    console.log("\ndelta");
    console.log(this.delta);

    try {
      if (this.delta === 0) {
        const last_mod_dt = await getLastModifiedTime(this.complete_file_path);
        note.last_mod_dt = last_mod_dt;
        console.log("\nLAST MOD:");
        console.log(last_mod_dt);
        await this.addLogEvent(
          this.I,
          this.run_log,
          "Philips_CT: getLastModifiedTime",
          this.det,
          note
        );
        return;
      }
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Philips_CT: getFileSizeDelta",
        this.cat,
        note,
        error
      );
    }
  }

  async updateRedisFileSize() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name
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
      this.addLogEvent(
        this.E,
        this.run_log,
        "Philips_CT: updateRedisFileSize",
        this.cat,
        note,
        error
      );
    }
  }

  async getFileData() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config.file_name
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "Philips_CT: getFileData",
      this.cal,
      note
    );
    try {
      // prev_file_size = null: no entry in redis
      // prev_file_size = 0: rotated cache and file (reset)
      // delta < 0: File has rotated without prior knowledge and is now smaller than previous
      if (
        this.prev_file_size === null ||
        this.prev_file_size === 0 ||
        this.delta < 0
      ) {
        this.file_data = (
          await fs.readFile(this.complete_file_path)
        ).toString();
        if (this.delta < 0) {
          note.message = `Delta is negative value: ${this.delta}. Reading entire file.`;
          note.file = this.complete_file_path;
          await this.addLogEvent(
            this.W,
            this.run_log,
            "Philips_CT: getFileData",
            this.det,
            note
          );
        }
        return;
      }

      if (this.prev_file_size > 0) {
        note.delta = this.delta;
        await this.addLogEvent(
          this.I,
          this.run_log,
          "Philips_CT: getFileData",
          this.det,
          note
        );

        if (this.delta === 0) {
          // Get file's last mod datetime
          const file_mod_datetime = await execLastMod(this.lastModPath, [
            this.complete_file_path
          ]);
          note.message = `No new file data. Delta: ${this.delta}`;
          note.last_mod = file_mod_datetime;
          await this.addLogEvent(
            this.W,
            this.run_log,
            "Philips_CT: getFileData",
            this.det,
            note
          );
          this.file_data = null;
          return;
        }

        const tailDelta = await execTail(
          this.tailPath,
          this.delta,
          this.complete_file_path
        );

        this.file_data = tailDelta.toString();
        return;
      }
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Philips_CT: getFileData",
        this.cat,
        note,
        error
      );
    }
  }

  getMatchBlocks() {
    return this.file_data.matchAll(philips_re[this.parsers[0]]);
  }
}

module.exports = { Philips_CT };
