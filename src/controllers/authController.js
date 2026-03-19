const { validateCredentials, createToken, verifyToken } = require('../services/authService');

async function login(req, res) {
  const { username, password } = req.body;

  if (!validateCredentials(username, password)) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = createToken(username);
  return res.json({ token });
}

async function me(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  return res.json({ username: payload.username, exp: payload.exp });
}

module.exports = {
  login,
  me,
};
