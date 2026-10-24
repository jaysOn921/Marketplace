import { createHash } from 'node:crypto';
import { prisma } from '../../db.js';
import { logger } from '../../logger.js';

/**
 * Adds to today's (UTC) counters for a listing. One statement, so concurrent requests
 * can't lose counts. Only numbers are stored: nothing about who viewed or added.
 */
export async function bumpListingStat(listingId: number, field: 'views' | 'cartAdds', by = 1) {
  const views = field === 'views' ? by : 0;
  const cartAdds = field === 'cartAdds' ? by : 0;
  await prisma.$executeRaw`
    INSERT INTO listing_daily_stats (listingId, day, views, cartAdds)
    VALUES (${listingId}, UTC_DATE(), ${views}, ${cartAdds}) AS new
    ON DUPLICATE KEY UPDATE
      views = listing_daily_stats.views + new.views,
      cartAdds = listing_daily_stats.cartAdds + new.cartAdds`;
}

/** Like bumpListingStat, but a failure is only logged: counting must never break the page. */
export async function recordListingStat(listingId: number, field: 'views' | 'cartAdds') {
  try {
    await bumpListingStat(listingId, field);
  } catch (err) {
    logger.warn({ err, listingId, field }, 'Could not record listing stat');
  }
}

// ─── Views ───────────────────────────────────────────────────────────────────

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|headless/i;
const MAX_SEEN = 100_000;
let seenDay = '';
let seen = new Set<string>();

/**
 * Counts a listing view once per visitor (IP + browser) per listing per day. Only a hash
 * is kept, in memory, and it's cleared daily. Sellers viewing their own listing, admins
 * and bots aren't counted.
 */
export async function recordListingView(
  listing: { id: number; sellerId: number },
  viewer: { id: number; role: string } | undefined,
  ip: string | undefined,
  userAgent: string | undefined,
) {
  if (viewer && (viewer.id === listing.sellerId || viewer.role === 'ADMIN')) return;
  if (userAgent && BOT.test(userAgent)) return;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== seenDay || seen.size > MAX_SEEN) {
    seenDay = today;
    seen = new Set();
  }
  const key = createHash('sha256')
    .update(`${viewer?.id ?? ip}|${userAgent}|${listing.id}`)
    .digest('base64url')
    .slice(0, 22);
  if (seen.has(key)) return;
  seen.add(key);
  await recordListingStat(listing.id, 'views');
}

/** For tests: forget which visitors were already counted. */
export function resetSeenViews() {
  seen = new Set();
}
