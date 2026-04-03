const fs = require('node:fs');
const path = require('node:path');
const env = require('../config/env');

const settingsPath = path.resolve(process.cwd(), 'data/runtime-settings.json');
const DEFAULT_SETTINGS = {
  receiverEmail: env.alertTo || '',
  emailSendingEnabled: true,
  telegramSendingEnabled: env.telegram.enabled,
};

function ensureSettingsFile() {
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(DEFAULT_SETTINGS, null, 2),
      'utf8'
    );
  }
}

function normalizeSettings(rawSettings) {
  const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};

  return {
    receiverEmail: source.receiverEmail || env.alertTo || '',
    emailSendingEnabled:
      typeof source.emailSendingEnabled === 'boolean'
        ? source.emailSendingEnabled
        : DEFAULT_SETTINGS.emailSendingEnabled,
    telegramSendingEnabled:
      typeof source.telegramSendingEnabled === 'boolean'
        ? source.telegramSendingEnabled
        : DEFAULT_SETTINGS.telegramSendingEnabled,
  };
}

function readSettings() {
  ensureSettingsFile();
  const raw = fs.readFileSync(settingsPath, 'utf8');
  const parsed = JSON.parse(raw);
  return normalizeSettings(parsed);
}

function writeSettings(nextSettings) {
  ensureSettingsFile();
  const normalized = normalizeSettings(nextSettings);
  fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function getReceiverEmail() {
  const settings = readSettings();
  return settings.receiverEmail || env.alertTo || '';
}

function setReceiverEmail(receiverEmail) {
  const settings = readSettings();
  return writeSettings({ ...settings, receiverEmail });
}

function getEmailSendingEnabled() {
  const settings = readSettings();
  return settings.emailSendingEnabled;
}

function setEmailSendingEnabled(emailSendingEnabled) {
  const settings = readSettings();
  return writeSettings({
    ...settings,
    emailSendingEnabled: Boolean(emailSendingEnabled),
  });
}

function getTelegramSendingEnabled() {
  const settings = readSettings();
  return settings.telegramSendingEnabled;
}

function setTelegramSendingEnabled(telegramSendingEnabled) {
  const settings = readSettings();
  return writeSettings({
    ...settings,
    telegramSendingEnabled: Boolean(telegramSendingEnabled),
  });
}

module.exports = {
  getReceiverEmail,
  setReceiverEmail,
  getEmailSendingEnabled,
  setEmailSendingEnabled,
  getTelegramSendingEnabled,
  setTelegramSendingEnabled,
};
