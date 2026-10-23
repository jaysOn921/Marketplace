import type { Report } from '@prisma/client';
import type { Request } from 'express';
import {
  reportSchema,
  resolveReportSchema,
  shortName,
  type ReportAction,
  type ReportGroup,
  type ReportReason,
  type ReportTarget,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { destroyUserSessions } from '../auth/session-store.js';
import { notify } from '../notifications/notifications.service.js';

/** Checks the thing being reported exists and may be reported by this user. */
async function checkTarget(user: AuthUser, type: ReportTarget, id: number) {
  if (type === 'LISTING') {
    const l = await prisma.listing.findUnique({ where: { id } });
    if (!l || !['ACTIVE', 'SOLD'].includes(l.status)) throw AppError.notFound('Listing not found.');
    if (l.sellerId === user.id) throw AppError.badRequest("You can't report your own listing.");
  } else if (type === 'USER') {
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u || u.status === 'DELETED') throw AppError.notFound('User not found.');
    if (u.id === user.id) throw AppError.badRequest("You can't report yourself.");
  } else {
    const m = await prisma.message.findUnique({ where: { id }, include: { conversation: true } });
    const inConversation =
      m && (m.conversation.buyerId === user.id || m.conversation.sellerId === user.id);
    if (!m || !inConversation || m.removedAt) throw AppError.notFound('Message not found.');
    if (m.senderId === user.id) throw AppError.badRequest("You can't report your own message.");
  }
}

async function notifyAdmins(title: string, body: string) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) => notify(a.id, { type: 'report.new', title, body, link: '/admin/reports' })),
  );
}

export async function createReport(user: AuthUser, input: unknown) {
  const data = reportSchema.parse(input);
  await checkTarget(user, data.targetType, data.targetId);
  const existing = await prisma.report.findFirst({
    where: {
      reporterId: user.id,
      targetType: data.targetType,
      targetId: data.targetId,
      status: 'OPEN',
    },
  });
  if (existing)
    throw AppError.conflict("You've already reported this. Our team will look at it soon.");

  await prisma.report.create({ data: { reporterId: user.id, ...data } });
  await notifyAdmins(
    'New report',
    `A ${data.targetType.toLowerCase()} was reported (${data.reason.toLowerCase().replace('_', ' ')}).`,
  );
}

/** What a report is about, for the admin queue. */
async function describeTarget(type: ReportTarget, id: number): Promise<ReportGroup['target']> {
  if (type === 'LISTING') {
    const l = await prisma.listing.findUnique({ where: { id }, include: { seller: true } });
    return l
      ? {
          label: l.title,
          detail: l.description.slice(0, 200),
          link: `/listings/${l.id}`,
          ownerId: l.sellerId,
          ownerName: l.seller.name,
          status: l.status,
        }
      : {
          label: `Listing #${id} (deleted)`,
          detail: null,
          link: null,
          ownerId: null,
          ownerName: null,
          status: null,
        };
  }
  if (type === 'USER') {
    const u = await prisma.user.findUnique({ where: { id }, include: { sellerProfile: true } });
    return u
      ? {
          label: u.sellerProfile?.shopName ? `${u.name} (${u.sellerProfile.shopName})` : u.name,
          detail: u.email,
          link: u.sellerProfile ? `/shop/${u.sellerProfile.slug}` : null,
          ownerId: u.id,
          ownerName: u.name,
          status: u.status,
        }
      : {
          label: `User #${id}`,
          detail: null,
          link: null,
          ownerId: null,
          ownerName: null,
          status: null,
        };
  }
  const m = await prisma.message.findUnique({
    where: { id },
    include: { sender: true, conversation: { include: { listing: true } } },
  });
  return m
    ? {
        label: `Message about “${m.conversation.listing.title}”`,
        detail: m.body,
        link: `/listings/${m.conversation.listingId}`,
        ownerId: m.senderId,
        ownerName: m.sender.name,
        status: m.removedAt ? 'REMOVED' : 'VISIBLE',
      }
    : {
        label: `Message #${id}`,
        detail: null,
        link: null,
        ownerId: null,
        ownerName: null,
        status: null,
      };
}

/** Open reports grouped by what they're about: most-reported first, then oldest. */
export async function reportQueue(): Promise<ReportGroup[]> {
  const open = await prisma.report.findMany({
    where: { status: 'OPEN' },
    include: { reporter: true },
    orderBy: { createdAt: 'asc' },
  });
  const groups = new Map<string, typeof open>();
  for (const r of open) {
    const key = `${r.targetType}:${r.targetId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const result = await Promise.all(
    [...groups.values()].map(async (reports) => {
      const { targetType, targetId } = reports[0]!;
      const reasons: Partial<Record<ReportReason, number>> = {};
      for (const r of reports) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      return {
        targetType,
        targetId,
        target: await describeTarget(targetType, targetId),
        count: reports.length,
        reasons,
        firstReportedAt: reports[0]!.createdAt.toISOString(),
        lastReportedAt: reports.at(-1)!.createdAt.toISOString(),
        reports: reports.map((r) => ({
          id: r.id,
          reason: r.reason,
          details: r.details,
          reporterName: shortName(r.reporter.name),
          createdAt: r.createdAt.toISOString(),
        })),
        previouslyResolved: await prisma.report.count({
          where: { targetType, targetId, status: { not: 'OPEN' } },
        }),
      } satisfies ReportGroup;
    }),
  );
  return result.sort(
    (a, b) => b.count - a.count || a.firstReportedAt.localeCompare(b.firstReportedAt),
  );
}

export const openReportCount = async () =>
  (await prisma.report.groupBy({ by: ['targetType', 'targetId'], where: { status: 'OPEN' } }))
    .length;

/** Which actions make sense for each kind of report. */
const ALLOWED: Record<ReportTarget, ReportAction[]> = {
  LISTING: ['remove_listing', 'suspend_user'],
  USER: ['suspend_user'],
  MESSAGE: ['remove_message', 'suspend_user'],
};

/** Dismisses or acts on every open report about one thing, then tells everyone involved. */
export async function resolveReports(admin: AuthUser, input: unknown, req: Request) {
  const data = resolveReportSchema.parse(input);
  const actions = data.decision === 'action' ? data.actions.filter((a) => a !== 'none') : [];
  if (data.decision === 'action' && !actions.length)
    throw AppError.badRequest('Choose what to do, or dismiss the reports.');
  const notAllowed = actions.find((a) => !ALLOWED[data.targetType].includes(a));
  if (notAllowed) throw AppError.badRequest(`“${notAllowed}” doesn't apply to this report.`);

  const reports: Report[] = await prisma.report.findMany({
    where: { targetType: data.targetType, targetId: data.targetId, status: 'OPEN' },
  });
  if (!reports.length) throw AppError.conflict('These reports have already been handled.');
  const target = await describeTarget(data.targetType, data.targetId);

  // The person responsible: listing seller, message sender, or the reported user.
  const responsibleId = target.ownerId;
  if (actions.includes('suspend_user')) {
    const u = responsibleId ? await prisma.user.findUnique({ where: { id: responsibleId } }) : null;
    if (!u) throw AppError.badRequest('There is no account to suspend.');
    if (u.role === 'ADMIN') throw AppError.badRequest("Admins can't be suspended from reports.");
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.report.updateMany({
      where: { id: { in: reports.map((r) => r.id) }, status: 'OPEN' },
      data: {
        status: data.decision === 'dismiss' ? 'DISMISSED' : 'ACTIONED',
        resolvedById: admin.id,
        resolutionNote: data.note,
        resolvedAt: new Date(),
      },
    });
    if (count !== reports.length)
      throw AppError.conflict('These reports have just been handled by another admin.');

    if (actions.includes('remove_listing')) {
      await tx.listing.update({ where: { id: data.targetId }, data: { status: 'REMOVED' } });
      await recordAudit(
        {
          action: 'listing.remove',
          targetType: 'listing',
          targetId: data.targetId,
          before: { status: target.status },
          after: { status: 'REMOVED', reason: data.note },
          req,
        },
        tx,
      );
    }
    if (actions.includes('remove_message')) {
      await tx.message.update({ where: { id: data.targetId }, data: { removedAt: new Date() } });
      await recordAudit(
        {
          action: 'message.remove',
          targetType: 'message',
          targetId: data.targetId,
          after: { reason: data.note },
          req,
        },
        tx,
      );
    }
    if (actions.includes('suspend_user') && responsibleId) {
      await tx.user.update({ where: { id: responsibleId }, data: { status: 'SUSPENDED' } });
      await recordAudit(
        {
          action: 'user.suspend',
          targetType: 'user',
          targetId: responsibleId,
          before: { status: 'ACTIVE' },
          after: { status: 'SUSPENDED', reason: data.note },
          req,
        },
        tx,
      );
    }
    await recordAudit(
      {
        action: 'report.resolve',
        targetType: data.targetType.toLowerCase(),
        targetId: data.targetId,
        after: { decision: data.decision, actions, note: data.note, reports: reports.length },
        req,
      },
      tx,
    );
  });
  if (actions.includes('suspend_user') && responsibleId) await destroyUserSessions(responsibleId);

  // Tell the reporters the outcome (without details about the other person).
  const reporters = [...new Set(reports.map((r) => r.reporterId))];
  await Promise.all(
    reporters.map((id) =>
      notify(id, {
        type: 'report.resolved',
        title: 'Your report was reviewed',
        body:
          data.decision === 'dismiss'
            ? `Thanks for your report about ${target.label}. We reviewed it and didn't find a breach of our rules.`
            : `Thanks for your report about ${target.label}. We reviewed it and took action.`,
        email: true,
      }),
    ),
  );
  // Tell the person responsible what happened (unless suspended: they can't sign in anyway, so email).
  if (responsibleId && actions.length) {
    const what = actions.includes('remove_listing')
      ? `Your listing “${target.label}” was removed`
      : actions.includes('remove_message')
        ? 'One of your messages was removed'
        : 'Your account was suspended';
    await notify(responsibleId, {
      type: 'moderation.action',
      title: what,
      body: `${what} after a review by the TZed team. Reason: ${data.note}\nIf you think this is a mistake, contact support from the Help centre.`,
      link: '/help/contact',
      email: true,
    }).catch(() => undefined);
  }
}
