'use strict';

function odataError(res, status, message, code) {
  res.status(status);
  res.type('application/json');
  return res.json({
    error: {
      code: String(code || status),
      message: { lang: 'en', value: message }
    }
  });
}

module.exports = { odataError };
