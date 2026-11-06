'use strict';

const { USERS } = require('./constants');

/**
 * Anonymous write access keeps the local sandbox frictionless. Set
 * S4_ALLOW_ANONYMOUS_WRITE=false before exposing the server to a network.
 */
const ALLOW_ANONYMOUS_WRITE = process.env.S4_ALLOW_ANONYMOUS_WRITE !== 'false';

const ANONYMOUS = {
  id: 'ANONYMOUS',
  name: 'Anonymous Developer',
  roles: ALLOW_ANONYMOUS_WRITE ? ['SAP_ALL'] : ['READ_ONLY'],
  anonymous: true
};

function unauthorized(res, message, realm = 'S4H-SANDBOX') {
  res.status(401);
  res.set('WWW-Authenticate', `Basic realm="${realm}"`);
  return res.json({
    error: {
      code: '401',
      message: { lang: 'en', value: message }
    }
  });
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    req.user = ANONYMOUS;
    return next();
  }
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) return unauthorized(res, 'Only Basic authentication is supported.');
  let decoded;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch (_) {
    return unauthorized(res, 'Malformed Basic authentication header.');
  }
  const separator = decoded.indexOf(':');
  const userId = separator === -1 ? decoded : decoded.slice(0, separator);
  const password = separator === -1 ? '' : decoded.slice(separator + 1);
  const user = USERS.find((u) => u.id.toUpperCase() === userId.toUpperCase() && u.password === password);
  if (!user) return unauthorized(res, 'Invalid user name or password.');
  req.user = { id: user.id, name: user.name, roles: user.roles, anonymous: false };
  return next();
}

function requireWrite(req, res, next) {
  if (req.user && req.user.roles.includes('READ_ONLY')) {
    return res.status(403).json({
      error: {
        code: '403',
        message: { lang: 'en', value: `User ${req.user.id} has read-only authorisation and cannot modify data.` }
      }
    });
  }
  return next();
}

module.exports = { authenticate, requireWrite, ANONYMOUS, USERS };
