const fs = require('node:fs');
const path = require('node:path');
const env = require('../config/env');

const settingsPath = path.resolve(process.cwd(), 'data/runtime-settings.json');

function ensureSettingsFile() {
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ receiverEmail: env.alertTo || '' }, null, 2),
      'utf8'
    );
  }
}

function readSettings() {
  ensureSettingsFile();
  const raw = fs.readFileSync(settingsPath, 'utf8');
  return JSON.parse(raw);
}

function writeSettings(nextSettings) {
  ensureSettingsFile();
  fs.writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2), 'utf8');
  return nextSettings;
}

function getReceiverEmail() {
  const settings = readSettings();
  return settings.receiverEmail || env.alertTo || '';
}

function setReceiverEmail(receiverEmail) {
  const settings = readSettings();
  return writeSettings({ ...settings, receiverEmail });
}

module.exports = {
  getReceiverEmail,
  setReceiverEmail,
};
