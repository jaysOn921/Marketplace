import { AppError } from './errors.js';

/** Parses a numeric route parameter; anything else is treated as "not found". */
export function idParam(value: string | string[] | undefined): number {
  const id = Number(Array.isArray(value) ? undefined : value);
  if (!Number.isSafeInteger(id) || id <= 0) throw AppError.notFound();
  return id;
}
