const fsp = require("fs").promises;

const does_file_exist = async path => {
  try {
    await fsp.access(path);
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = does_file_exist;
