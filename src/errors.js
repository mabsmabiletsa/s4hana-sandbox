'use strict';

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status || 500;
    this.code = code || String(this.status);
  }
}

module.exports = { ApiError };
