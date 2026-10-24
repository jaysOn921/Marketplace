import type { ReplyTime, SellerTrust } from '@tzed/shared';
import { prisma } from '../../db.js';

const DAY = 24 * 60 * 60 * 1000;
/** Replies needed before showing a reply time. */
const MIN_SAMPLES = 3;
/** A buyer message left unanswered this long counts as a slow reply. */
const UNANSWERED_AFTER_MINUTES = 24 * 60;
const UNANSWERED_COUNTS_AS_MINUTES = 3 * 24 * 60;

export function replyTimeBucket(minutes: number): ReplyTime {
  if (minutes <= 60) return 'HOUR';
  if (minutes <= 6 * 60) return 'HOURS';
  if (minutes <= 24 * 60) return 'DAY';
  return 'DAYS';
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * How long the seller usually takes to answer buyers in TZed messages over the last 90 days.
 * Each run of buyer messages counts once, from its first message to the seller's next reply.
 * Messages unanswered for over a day count as a slow reply, so ignoring buyers doesn't help.
 */
export async function replyTime(sellerId: number): Promise<ReplyTime | null> {
  const since = new Date(Date.now() - 90 * DAY);
  const rows = await prisma.$queryRaw<{ minutes: bigint | null; age: bigint }[]>`
    WITH m AS (
      SELECT msg.id, msg.conversationId, msg.senderId, msg.createdAt,
             LAG(msg.senderId) OVER (PARTITION BY msg.conversationId ORDER BY msg.createdAt, msg.id) AS prevSender
      FROM messages msg JOIN conversations c ON c.id = msg.conversationId
      WHERE c.sellerId = ${sellerId} AND msg.createdAt >= ${since}
    )
    SELECT TIMESTAMPDIFF(MINUTE, b.createdAt, (
             SELECT MIN(s.createdAt) FROM messages s
             WHERE s.conversationId = b.conversationId AND s.senderId = ${sellerId}
               AND (s.createdAt > b.createdAt OR (s.createdAt = b.createdAt AND s.id > b.id))
           )) AS minutes,
           TIMESTAMPDIFF(MINUTE, b.createdAt, UTC_TIMESTAMP(3)) AS age
    FROM m b
    WHERE b.senderId <> ${sellerId} AND (b.prevSender IS NULL OR b.prevSender = ${sellerId})`;
  const samples = rows.flatMap((r) =>
    r.minutes !== null
      ? [Number(r.minutes)]
      : Number(r.age) > UNANSWERED_AFTER_MINUTES
        ? [UNANSWERED_COUNTS_AS_MINUTES]
        : [],
  );
  return samples.length >= MIN_SAMPLES ? replyTimeBucket(median(samples)) : null;
}

export async function sellerTrust(sellerId: number): Promise<SellerTrust> {
  const [profile, completedOrders, reply] = await Promise.all([
    prisma.sellerProfile.findUnique({ where: { userId: sellerId }, select: { verifiedAt: true } }),
    prisma.order.count({ where: { sellerId, status: 'COMPLETED' } }),
    replyTime(sellerId),
  ]);
  return { verified: Boolean(profile?.verifiedAt), completedOrders, replyTime: reply };
}
