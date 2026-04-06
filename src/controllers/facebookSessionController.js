const {
  getFacebookSessionStatus,
  startFacebookLoginFlow,
  saveFacebookSession,
  logoutFacebookSession,
  importFacebookSession,
} = require('../services/facebookSessionService');
const env = require('../config/env');

function getLoginViewerUrl(req) {
  if (env.noVncPublicUrl) {
    return env.noVncPublicUrl;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();

  if (!forwardedHost) {
    return '';
  }

  const hostname = forwardedHost.split(':')[0];
  if (!hostname) {
    return '';
  }

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (env.nodeEnv === 'production' && !isLocalHost) {
    return `${forwardedProto}://${hostname}/novnc/vnc.html?autoconnect=true&path=novnc/websockify`;
  }

  return `${forwardedProto}://${hostname}:${env.noVncPort}/vnc.html?autoconnect=true`;
}

async function getSessionStatus(req, res) {
  const status = getFacebookSessionStatus();
  const loginViewerUrl = getLoginViewerUrl(req);

  if (!status.exists) {
    return res.json({
      ...status,
      loginViewerUrl,
      hint: status.loginInProgress
        ? 'Complete Facebook login in the Login Screen. Session auto-saves after login.'
        : 'Click Start Facebook Login, then open Login Screen and sign in.',
    });
  }

  return res.json({ ...status, loginViewerUrl });
}

async function startSessionLogin(req, res, next) {
  try {
    const status = await startFacebookLoginFlow();
    const loginViewerUrl = getLoginViewerUrl(req);
    return res.json({
      message: 'Facebook login started. Open Login Screen and sign in. Session will auto-save.',
      loginViewerUrl,
      ...status,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function saveSession(req, res, next) {
  try {
    const status = await saveFacebookSession();
    const loginViewerUrl = getLoginViewerUrl(req);
    return res.json({
      message: 'Facebook session saved successfully.',
      loginViewerUrl,
      ...status,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function logoutSession(req, res, next) {
  try {
    const status = await logoutFacebookSession();
    const loginViewerUrl = getLoginViewerUrl(req);
    return res.json({
      message: 'Facebook session cleared.',
      loginViewerUrl,
      ...status,
    });
  } catch (error) {
    return next(error);
  }
}

async function importSession(req, res, next) {
  try {
    const payload = req.body || {};
    const input = payload.storageStateJson || payload.storageState || payload;
    const status = await importFacebookSession(input);
    const loginViewerUrl = getLoginViewerUrl(req);

    return res.json({
      message: 'Facebook session imported successfully.',
      loginViewerUrl,
      ...status,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

module.exports = {
  getSessionStatus,
  startSessionLogin,
  saveSession,
  logoutSession,
  importSession,
};
