import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@tzed/shared';
import { MulterError } from 'multer';
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
    // First message per field, e.g. { fields: { email: 'Enter a valid email address.' } }
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the highlighted fields.',
        details: { fields },
      },
    };
  } else if (err instanceof MulterError) {
    status = 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each photo must be 10 MB or smaller.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Too many photos. A listing can have at most 8.'
          : 'The upload could not be read. Please try again.';
    body = { error: { code: 'UPLOAD_ERROR', message } };
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
