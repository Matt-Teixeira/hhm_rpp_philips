const System = require("./System");
const fsp = require("node:fs").promises;
const exec_move_to_archive = require("../read/exec-move_to_archive");
const {
  update_redis_last_file,
  get_last_cached_file,
} = require("../redis/philips_monitoring");

// sysConfigData, file_config, job_id, run_log, file_prop_name
class PHILIPS_MRI_RMMU extends System {
  constructor(sysConfigData, file_config, job_id, run_log, file_prop_name) {
    super(sysConfigData, file_config, job_id, run_log);
    this.directory_path = `${sysConfigData.debian_server_path}/${file_config.dir_name}`;
    this.file_config_prop_name = file_prop_name;
  }

  files_in_dir = [];
  last_file_parsed;
  last_file_in_dir;

  exec_archive_path = "./read/sh/move_to_archive.sh";

  async get_directory_files() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config,
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "PHILIPS_MRI_RMMU: get_directory_files",
      this.cal,
      note,
      null
    );
    try {
      // Ex directory_path: Files in  /opt/hhm-files/C0137/SHIP013/SME01138/rmmu_long
      this.files_in_dir = await fsp.readdir(this.directory_path);
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_RMMU: get_directory_files",
        this.cat,
        note,
        error
      );
    }
  }

  /*    No longer use with new data acquisition 
async read_files() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "PHILIPS_MRI_RMMU: read_files",
      this.cal,
      note,
      null
    );
    try {
      for await (const file of this.files_in_dir) {
        const complete_file_path = `${this.directory_path}/${file}`;

        const fileData = (await fsp.readFile(complete_file_path)).toString();
      }
    } catch (error) {}
  } */

  /*  No longer use with new data acquisition 
async archive_file(complete_file_path) {
    const archive_file_path = `${this.sysConfigData.hhm_config.file_path}/archive`;

    await exec_move_to_archive(this.job_id, this.sme, this.exec_archive_path, [
      complete_file_path,
      archive_file_path,
    ]);
  } 
  */

  // RMMU FILE DIRECTORY PROCESS

  // Set last file in rmmu directory
  async update_files_to_process() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
    };
    try {
      const index = this.files_in_dir.indexOf(this.last_file_parsed);
      this.files_in_dir = this.files_in_dir.slice(index + 1);
      this.last_file_in_dir = this.files_in_dir[this.files_in_dir.length - 1];
      note.last_file_in_dir = this.last_file_in_dir;
      await this.addLogEvent(
        this.I,
        this.run_log,
        "PHILIPS_MRI_RMMU: update_files_to_process",
        this.det,
        note,
        null
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_RMMU: update_files_to_process",
        this.cat,
        note,
        error
      );
    }
  }

  async cache_last_file_name(file, rmmu_file_type) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file,
      rmmu_file_type,
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "PHILIPS_MRI_RMMU: cache_last_file_name",
      this.cal,
      note,
      null
    );
    try {
      await update_redis_last_file(
        this.sme,
        file,
        rmmu_file_type,
        this.run_log
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_RMMU: cache_last_file_name",
        this.cat,
        note,
        error
      );
    }
  }

  async get_last_file_parsed(rmmu_file_type) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      rmmu_file_type,
      last_file_parsed: this.last_file_parsed,
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "PHILIPS_MRI_RMMU: get_last_file_parsed",
      this.cal,
      note,
      null
    );
    try {
      this.last_file_parsed = await get_last_cached_file(
        this.sme,
        rmmu_file_type,
        this.run_log
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_RMMU: get_last_file_parsed",
        this.cat,
        note,
        error
      );
    }
  }
}

module.exports = PHILIPS_MRI_RMMU;
