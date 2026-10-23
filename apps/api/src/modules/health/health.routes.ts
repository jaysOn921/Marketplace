import { Router } from 'express';
import { APP_NAME, type HealthResponse } from '@tzed/shared';
import { config } from '../../config.js';
import { prisma } from '../../db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const db = await prisma.$queryRaw`SELECT 1`.then(
    () => 'ok' as const,
    () => 'error' as const,
  );
  const body: HealthResponse = {
    status: db === 'ok' ? 'ok' : 'degraded',
    app: APP_NAME,
    version: config.version,
    time: new Date().toISOString(),
    db,
  };
  res.status(db === 'ok' ? 200 : 503).json(body);
});
