const chalk = require("chalk");

const levels = {
  info: { label: "INFO", color: chalk.blue },
  warn: { label: "WARN", color: chalk.yellow },
  error: { label: "ERROR", color: chalk.red },
};

function log(level = "info", message, meta) {
  const { label, color } = levels[level] || levels.info;
  const timestamp = new Date().toISOString();

  const prefix = chalk.gray(`[${timestamp}]`) + " " + color(`[${label}]`);

  if (meta) {
    console.log(prefix, message, chalk.cyan(JSON.stringify(meta)));
  } else {
    console.log(prefix, message);
  }
}

module.exports = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
};