import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@tzed/shared';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ApiError = {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', details: err.issues },
    };
  } else if (
    err instanceof SyntaxError &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    status = 400;
    body = { error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } };
  }

  if (status >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  }

  res.status(status).json(body);
};
