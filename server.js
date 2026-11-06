'use strict';

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');

const store = require('./src/store');
const { authenticate, requireWrite } = require('./src/auth');
const { router: odataRouter } = require('./src/routes/odata');
const { router: apiRouter } = require('./src/routes/api');
const { odataError } = require('./src/http');

const PUBLIC_DIR = path.join(__dirname, 'public');
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestLogger(req, res, next) {
  req.id = crypto.randomUUID().slice(0, 8);
  res.set('X-Request-Id', req.id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/sap')) return;
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    const status = res.statusCode;
    const marker = status >= 500 ? '✖' : status >= 400 ? '▲' : '✓';
    console.log(`${marker} ${req.method.padEnd(6)} ${String(status).padEnd(3)} ${elapsed.toFixed(0).padStart(4)}ms  ${req.originalUrl}  [${req.id}]`);
  });
  next();
}

function createApp() {
  store.loadDatabase();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'If-Match', 'If-None-Match', 'X-Confirm-Reset'],
    exposedHeaders: ['DataServiceVersion', 'Location', 'X-Request-Id'],
    maxAge: 86400
  }));
  app.options('*', cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);

  // OData services
  app.use('/sap/opu/odata/sap', authenticate);
  app.use('/sap/opu/odata/sap', (req, res, next) => {
    if (WRITE_METHODS.has(req.method)) return requireWrite(req, res, next);
    return next();
  });
  app.use('/sap/opu/odata/sap', odataRouter);

  // UI backend-for-frontend
  app.use('/api', authenticate, apiRouter);
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: '404', message: `Unknown API route ${req.originalUrl}.`, requestId: req.id } });
  });

  // Static Fiori-style application
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: 0 }));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/sap') || req.path.startsWith('/api')) {
      if (req.path.startsWith('/sap')) return odataError(res, 404, `Unknown OData path ${req.path}.`, '404');
      return res.status(404).json({ error: { code: '404', message: `Unknown API route ${req.path}.`, requestId: req.id } });
    }
    const indexFile = path.join(PUBLIC_DIR, 'index.html');
    return res.sendFile(indexFile, (error) => {
      if (error) res.status(404).type('text/plain').send('S/4HANA sandbox UI has not been built yet.');
    });
  });

  // Central error handler
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(`[${req.id}] ${error.stack || error.message}`);
    if (res.headersSent) return next(error);
    if (req.path.startsWith('/sap/opu/odata')) {
      return odataError(res, status, status >= 500 ? 'Internal sandbox error.' : error.message, error.code);
    }
    return res.status(status).json({
      error: {
        code: error.code || String(status),
        message: status >= 500 ? 'Internal sandbox error.' : error.message,
        requestId: req.id
      }
    });
  });

  return app;
}

function banner(host, port) {
  const base = `http://${host}:${port}`;
  const lines = [
    '',
    '  ┌──────────────────────────────────────────────────────────────┐',
    '  │  S/4HANA SANDBOX                                             │',
    '  │  Mock SAP S/4HANA-style OData services + Fiori-style UI      │',
    '  └──────────────────────────────────────────────────────────────┘',
    '',
    `  UI              ${base}/`,
    `  OData catalog   ${base}/sap/opu/odata/sap`,
    `  Health          ${base}/api/health`,
    `  Data file       ${store.DATA_FILE}`,
    '',
    '  Auth            anonymous (sandbox)',
    '                  DEVELOPER / Password1   (full access)',
    '                  DEMO      / Demo1234    (read-only)',
    ''
  ];
  console.log(lines.join('\n'));
}

function start(options = {}) {
  const port = options.port !== undefined ? options.port : Number(process.env.PORT) || 4004;
  const host = options.host || process.env.HOST || '127.0.0.1';
  const app = createApp();
  const server = app.listen(port, host, () => {
    const address = server.address();
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    banner(displayHost, address.port);
    if (host === '0.0.0.0') {
      console.log(`  ⚠ Listening on all interfaces. Anonymous write access: ${process.env.S4_ALLOW_ANONYMOUS_WRITE === 'false' ? 'disabled' : 'ENABLED'}.`);
      console.log('    Set HOST=127.0.0.1 or S4_ALLOW_ANONYMOUS_WRITE=false when sharing the sandbox.\n');
    }
  });

  const shutdown = () => {
    console.log('\nShutting down S/4HANA sandbox…');
    server.close(() => {
      store.flush();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { createApp, start };
