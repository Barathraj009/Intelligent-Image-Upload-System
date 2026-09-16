/**
 * Express app factory for the reusable Gmail OTP auth module.
 *
 * Mounting hooks for host applications:
 *   - app.use('/api/auth', authRoutes)  → the whole auth API
 *   - require('src/middleware/auth').requireSession → protect own routes
 *
 * `createApp()` is also what `server.js` (standalone/demo) uses, and what
 * the automated test suite uses to boot an in-process instance.
 */
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

/**
 * @param {object} [options]
 * @param {boolean} [options.serveDemo] If true, serve the self-contained
 *   frontend/ demo UI at `/`. Defaults to true for the standalone module;
 *   pass false when you only want the API (microservice/host use).
 */
function createApp(options = {}) {
  const { serveDemo = true } = options;
  const app = express();

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // ---- Core middleware ----
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // ---- Health check ----
  app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'ok', env: config.env });
  });

  // ---- Auth module routes (the reusable part) ----
  app.use('/api/auth', authRoutes);

  // ---- Demo mode: serve the standalone frontend so this module can be
  // tried end-to-end without a separate host application. A real
  // integration would typically NOT use this block — the frontend would
  // instead be served by (or embedded into) the host app. See
  // INTEGRATION.md. ----
  if (serveDemo) {
    const frontendDir = path.join(__dirname, '..', '..', 'frontend');
    // Dev-only convenience: never cache the demo frontend so edits show up
    // without a hard refresh. A host integration serves its own frontend and
    // controls its own caching.
    app.use(
      express.static(frontendDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-store');
          }
        },
      })
    );
    app.get('/', (req, res) => {
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  // ---- 404 + error handling (must be last) ----
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };