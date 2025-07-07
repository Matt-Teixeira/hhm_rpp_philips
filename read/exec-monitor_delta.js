const util = require("util");
const execFile = util.promisify(require("node:child_process").execFile);

// /home/matt-teixeira/hep3/hhm_rpp/read/sh/getLineNumber.sh

async function exec_monitor_delta(jobId, exec_path, args) {
  const execOptions = {
    maxBuffer: 1024 * 1024 * 500,
  };

  try {
    const { stdout: newData } = await execFile(exec_path, args, execOptions);

    if(newData === '') return null;
    
    return newData;
  } catch (error) {
   
    return null;
  }
}

module.exports = exec_monitor_delta;
