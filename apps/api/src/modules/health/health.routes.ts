import { Router } from 'express';
import { APP_NAME, type HealthResponse } from '@tzed/shared';
import { config } from '../../config.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    app: APP_NAME,
    version: config.version,
    time: new Date().toISOString(),
  };
  res.json(body);
});
