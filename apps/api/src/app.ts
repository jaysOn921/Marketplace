import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { API_PREFIX } from '@tzed/shared';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { geoRouter } from './modules/geo/geo.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  if (!config.isTest) {
    app.use(pinoHttp({ logger }));
  }

  const api = Router();
  api.use('/health', healthRouter);
  api.use(geoRouter);
  api.use(notFoundHandler);
  app.use(API_PREFIX, api);

  // In production the API also serves the built React app (single origin).
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (config.isProduction && existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: webDist }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
