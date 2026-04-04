const { verifyToken } = require('../services/authService');

const AUTH_COOKIE_NAME = 'swoop_token';
const AUTH_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

function getCookieValue(cookieHeader, name) {
  const source = String(cookieHeader || '');
  if (!source) {
    return null;
  }

  for (const segment of source.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed.startsWith(`${name}=`)) {
      continue;
    }

    return decodeURIComponent(trimmed.slice(name.length + 1));
  }

  return null;
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = getCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
  const token = headerToken || cookieToken;
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (headerToken && !cookieToken) {
    res.cookie(AUTH_COOKIE_NAME, headerToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
  }

  req.auth = payload;
  return next();
}

module.exports = {
  requireAuth,
};
