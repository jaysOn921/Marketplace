import type { z } from 'zod';
import { ApiRequestError } from './api';

export type FieldErrors = Record<string, string>;

/** Validates with a shared schema; returns the parsed data or field errors (first per field). */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { data: z.output<S>; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

/** Field errors and a top-level message from a failed API call. */
export function apiErrors(err: unknown): { fields: FieldErrors; message: string | null } {
  if (err instanceof ApiRequestError) {
    const fields = err.fields;
    return { fields, message: Object.keys(fields).length ? null : err.message };
  }
  return { fields: {}, message: err ? 'Something went wrong. Please try again.' : null };
}
