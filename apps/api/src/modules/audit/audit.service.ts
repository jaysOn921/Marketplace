import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { logger } from '../../logger.js';

export interface AuditEntry {
  action: string; // e.g. auth.login, listing.approve, user.suspend, fx.update
  actorId?: number | null;
  targetType?: string;
  targetId?: number;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  /** Request the action came from, for IP and user agent. */
  req?: Request;
}

/**
 * Appends an entry to the audit log. Every admin action and security event calls this.
 * Pass `db` to write inside a transaction alongside the change being audited.
 */
export async function recordAudit(
  entry: AuditEntry,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  const { req, ...rest } = entry;
  await db.auditLog.create({
    data: {
      ...rest,
      actorId: rest.actorId ?? req?.user?.id ?? null,
      ip: req?.ip?.slice(0, 45) ?? null,
      userAgent: req?.get('user-agent')?.slice(0, 255) ?? null,
    },
  });
}

/** For non-critical security events: never fail the request because of logging. */
export function recordAuditInBackground(entry: AuditEntry): void {
  recordAudit(entry).catch((err: unknown) =>
    logger.error({ err, action: entry.action }, 'Failed to write audit log'),
  );
}
