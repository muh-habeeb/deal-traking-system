const crypto = require('node:crypto');
const env = require('../config/env');

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function validateCredentials(username, password) {
  return (
    timingSafeEqualString(username, env.appLogin.username) &&
    timingSafeEqualString(password, env.appLogin.password)
  );
}

function signPayload(base64Payload) {
  return crypto
    .createHmac('sha256', env.appAuthSecret)
    .update(base64Payload)
    .digest('base64url');
}

function createToken(username) {
  const payload = {
    username,
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = signPayload(encodedPayload);
    if (!timingSafeEqualString(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  validateCredentials,
  createToken,
  verifyToken,
};
