import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { API_PREFIX } from '@tzed/shared';
import { config } from './config.js';
import { logger } from './logger.js';
import { loadUser } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createRateLimits } from './middleware/rate-limit.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { PrismaSessionStore, SESSION_COOKIE } from './modules/auth/session-store.js';
import { geoRouter } from './modules/geo/geo.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { helpRouter } from './modules/help/help.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { supportRouter } from './modules/support/support.routes.js';
import { listingsRouter } from './modules/listings/listings.routes.js';
import { UPLOADS_URL_PREFIX } from './modules/media/storage.js';
import { messagingRouter } from './modules/messaging/messaging.routes.js';
import { moderationRouter } from './modules/moderation/moderation.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { reviewsRouter } from './modules/reviews/reviews.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export interface AppOptions {
  /** Rate limiting is on by default, except in tests (which opt in). */
  rateLimit?: boolean;
}

export function createApp(options: AppOptions = {}) {
  const rateLimit = options.rateLimit ?? !config.isTest;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  if (!config.isTest) {
    app.use(pinoHttp({ logger }));
  }

  // Uploaded photos. File names are random and never change, so they can be cached for long.
  app.use(
    UPLOADS_URL_PREFIX,
    express.static(config.UPLOAD_DIR, {
      index: false,
      maxAge: '30d',
      immutable: true,
      fallthrough: false,
    }),
  );

  const api = Router();
  api.use(
    session({
      name: SESSION_COOKIE,
      secret: config.SESSION_SECRET,
      store: new PrismaSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  api.use(csrfProtection);
  api.use(loadUser);

  api.use('/health', healthRouter);
  api.use(geoRouter);
  api.use('/auth', authRouter(rateLimit ? createRateLimits() : null));
  api.use(notificationsRouter); // includes /me/counts, so it comes before the /me router
  api.use('/me', usersRouter);
  api.use(listingsRouter);
  api.use(searchRouter);
  api.use(reviewsRouter);
  api.use('/help', helpRouter);
  api.use('/support', supportRouter(rateLimit));
  api.use(reportsRouter(rateLimit));
  api.use('/admin', adminRouter);
  api.use('/orders', ordersRouter);
  api.use('/conversations', messagingRouter(rateLimit));
  api.use('/admin/listings', moderationRouter);
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
