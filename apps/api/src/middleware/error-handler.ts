import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@tzed/shared';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { requestLocale, translate } from '../lib/i18n.js';
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
  } else if (clientErrorStatus(err)) {
    // Express's own errors (a missing static file, a request body over the size limit…)
    // carry an HTTP status; keep it rather than reporting a server error.
    status = clientErrorStatus(err)!;
    body = {
      error:
        status === 404
          ? { code: 'NOT_FOUND', message: 'Not found.' }
          : status === 413
            ? { code: 'TOO_LARGE', message: 'The request is too large.' }
            : { code: 'BAD_REQUEST', message: 'The request could not be handled.' },
    };
  }

  // Messages are written in English; send them in the language the request asked for.
  const locale = requestLocale(req);
  body.error.message = translate(body.error.message, locale);
  const fields = (body.error.details as { fields?: Record<string, string> } | undefined)?.fields;
  if (fields && locale !== 'en') {
    for (const key of Object.keys(fields)) fields[key] = translate(fields[key]!, locale);
  }

  if (status >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  }

  res.status(status).json(body);
};

/** The 4xx status of an error raised by Express or its middleware, if it has one. */
function clientErrorStatus(err: unknown): number | undefined {
  const status =
    (err as { status?: unknown; statusCode?: unknown } | null)?.status ??
    (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}
