const {
  getFacebookSessionStatus,
  startFacebookLoginFlow,
  saveFacebookSession,
  logoutFacebookSession,
  importFacebookSession,
} = require('../services/facebookSessionService');

async function getSessionStatus(_req, res) {
  const status = getFacebookSessionStatus();

  if (!status.exists) {
    return res.json({
      ...status,
      hint: status.loginInProgress
        ? 'Complete login in opened browser and click Save Session in dashboard.'
        : 'For hosted servers, use Import Session JSON from dashboard.',
    });
  }

  return res.json(status);
}

async function startSessionLogin(_req, res, next) {
  try {
    const status = await startFacebookLoginFlow();
    return res.json({
      message: 'Facebook login window opened. Complete login then click Save Session.',
      ...status,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function saveSession(_req, res, next) {
  try {
    const status = await saveFacebookSession();
    return res.json({
      message: 'Facebook session saved successfully.',
      ...status,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function logoutSession(_req, res, next) {
  try {
    const status = await logoutFacebookSession();
    return res.json({
      message: 'Facebook session cleared.',
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

    return res.json({
      message: 'Facebook session imported successfully.',
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
