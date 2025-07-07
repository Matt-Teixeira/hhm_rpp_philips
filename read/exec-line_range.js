const util = require("util");
const execFile = util.promisify(require("node:child_process").execFile);

async function execFileLineRange(exec_path, args) {
  const execOptions = {
    maxBuffer: 1024 * 1024 * 500,
  };

  try {
    const { stdout: newData } = await execFile(
      exec_path,
      args,
      execOptions
    );
    return newData;
  } catch (error) {
    console.log(error);

    return null;
  }
}

module.exports = execFileLineRange;
