const levels = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function log(level, message, meta) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${levels[level] || 'INFO'}]`;

  if (meta) {
    console.log(prefix, message, meta);
    return;
  }

  console.log(prefix, message);
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
