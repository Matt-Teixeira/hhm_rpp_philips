const util = require("util");
const execFile = util.promisify(require("node:child_process").execFile);
const { isDryRun, recordFileMove } = require("../util/dry_run");

async function exec_move_to_archive(jobId, sme, exec_path, args) {
  const execOptions = {
    maxBuffer: 1024 * 1024 * 500,
  };
  if (isDryRun()) {
    recordFileMove(args);
    return "";
  }
  try {
    const { stdout: newData } = await execFile(exec_path, args, execOptions);

    return newData;
  } catch (error) {
    
    return null;
  }
}

module.exports = exec_move_to_archive;
