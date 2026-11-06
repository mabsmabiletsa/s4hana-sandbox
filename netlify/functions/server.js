'use strict';

// Netlify functions have ephemeral storage. Keep the demo dataset in /tmp,
// and require authentication for writes on the publicly hosted deployment.
process.env.S4_DATA_FILE = process.env.S4_DATA_FILE || '/tmp/s4hana-sandbox.json';
process.env.S4_ALLOW_ANONYMOUS_WRITE = process.env.S4_ALLOW_ANONYMOUS_WRITE || 'false';

const serverless = require('serverless-http');
const { createApp } = require('../../server');

const app = createApp();
exports.handler = serverless(app, { basePath: '/.netlify/functions/server' });
