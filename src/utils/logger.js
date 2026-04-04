const path = require('node:path');
const chalk = require('chalk');

const levels = {
  info: { label: 'INFO', color: chalk.blue },
  warn: { label: 'WARN', color: chalk.yellow },
  error: { label: 'ERROR', color: chalk.red },
};

function safeStringify(value) {
  const seen = new WeakSet();

  return JSON.stringify(value, (_key, currentValue) => {
    if (currentValue && typeof currentValue === 'object') {
      if (seen.has(currentValue)) {
        return '[Circular]';
      }
      seen.add(currentValue);
    }

    return currentValue;
  });
}

function parseStackLine(line) {
  const withFunction = line.match(/^at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/);
  if (withFunction) {
    return {
      functionName: withFunction[1],
      filePath: withFunction[2],
      line: Number(withFunction[3]),
      column: Number(withFunction[4]),
    };
  }

  const withoutFunction = line.match(/^at\s+(.+):(\d+):(\d+)$/);
  if (withoutFunction) {
    return {
      functionName: 'anonymous',
      filePath: withoutFunction[1],
      line: Number(withoutFunction[2]),
      column: Number(withoutFunction[3]),
    };
  }

  return null;
}

function getCallerSource() {
  const stack = String(new Error().stack || '')
    .split('\n')
    .map((line) => line.trim());

  for (const line of stack.slice(2)) {
    const parsed = parseStackLine(line);
    if (!parsed) {
      continue;
    }

    if (parsed.filePath === __filename) {
      continue;
    }

    return {
      functionName: parsed.functionName,
      file: path.relative(process.cwd(), parsed.filePath).replace(/\\/g, '/'),
      line: parsed.line,
      column: parsed.column,
    };
  }

  return null;
}

function normalizeMeta(meta) {
  if (!meta) {
    return null;
  }

  if (meta instanceof Error) {
    return {
      error: meta.message,
      stack: meta.stack,
    };
  }

  if (typeof meta === 'object') {
    return { ...meta };
  }

  return { value: meta };
}

function log(level = "info", message, meta) {
  const { label, color } = levels[level] || levels.info;
  const timestamp = new Date().toISOString();

  const prefix = chalk.gray(`[${timestamp}]`) + ' ' + color(`[${label}]`);
  const payload = normalizeMeta(meta);
  const source = getCallerSource();

  if (source) {
    if (payload) {
      payload.source = source;
    } else {
      // Include source even when no extra metadata is provided.
      console.log(prefix, message, chalk.cyan(safeStringify({ source })));
      return;
    }
  }

  if (payload) {
    console.log(prefix, message, chalk.cyan(safeStringify(payload)));
  } else {
    console.log(prefix, message);
  }
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};