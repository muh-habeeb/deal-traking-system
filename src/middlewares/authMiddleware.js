const { verifyToken } = require('../services/authService');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  req.auth = payload;
  return next();
}

module.exports = {
  requireAuth,
};
