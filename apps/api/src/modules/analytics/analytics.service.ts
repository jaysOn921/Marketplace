import { Prisma } from '@prisma/client';
import {
  analyticsQuerySchema,
  roundMoney,
  type AdminAnalytics,
  type AnalyticsPeriod,
  type CountryCode,
  type CurrencyCode,
  type DailyPoint,
  type Kpi,
  type OrderStatus,
  type SellerAnalytics,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import type { AuthUser } from '../../middleware/auth.js';
import { getCurrentRates } from '../geo/geo.service.js';

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The chosen period (ending today, UTC) and the same-length period before it. */
function periodOf(query: Record<string, unknown>) {
  const { days } = analyticsQuerySchema.parse(query) as { days: AnalyticsPeriod };
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const end = new Date(today.getTime() + DAY); // exclusive
  const start = new Date(end.getTime() - days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  return { days, start, end, prevStart };
}

/** One point per day of the period, zero where nothing happened. */
function fillDays(start: Date, days: number, rows: { day: Date | string; value: unknown }[]) {
  const byDay = new Map(
    rows.map((r) => [
      typeof r.day === 'string' ? r.day.slice(0, 10) : isoDay(r.day),
      Number(r.value),
    ]),
  );
  return Array.from({ length: days }, (_, i): DailyPoint => {
    const day = isoDay(new Date(start.getTime() + i * DAY));
    return { day, value: byDay.get(day) ?? 0 };
  });
}

const kpi = (value: number, previous: number): Kpi => ({ value, previous });
const num = (v: unknown) => Number(v ?? 0);
/** Orders that went ahead (not declined or cancelled). */
const LIVE_ORDER = Prisma.sql`o.status NOT IN ('DECLINED', 'CANCELLED')`;

async function zmwToTzs() {
  const rate = (await getCurrentRates()).find((r) => r.base === 'ZMW' && r.quote === 'TZS');
  return rate?.rate ?? null;
}

/** Completed sales between two dates, in TZS (ZMW converted at `rate`). */
function salesInTzs(rate: number | null) {
  return rate
    ? Prisma.sql`SUM(CASE WHEN o.currency = 'ZMW' THEN o.total * ${rate} ELSE o.total END)`
    : Prisma.sql`SUM(CASE WHEN o.currency = 'TZS' THEN o.total ELSE 0 END)`;
}

async function statSums(from: Date, to: Date, listingIds?: number[]) {
  if (listingIds && !listingIds.length) return { views: 0, cartAdds: 0 };
  const r = await prisma.listingDailyStat.aggregate({
    where: { day: { gte: from, lt: to }, ...(listingIds ? { listingId: { in: listingIds } } : {}) },
    _sum: { views: true, cartAdds: true },
  });
  return { views: r._sum.views ?? 0, cartAdds: r._sum.cartAdds ?? 0 };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminAnalytics(query: Record<string, unknown>): Promise<AdminAnalytics> {
  const { days, start, end, prevStart } = periodOf(query);
  const rate = await zmwToTzs();
  const between = (field: string, from: Date, to: Date) => ({ [field]: { gte: from, lt: to } });

  const counts = async (from: Date, to: Date) => {
    const [users, listings, placed, completed, [sales], stats] = await Promise.all([
      prisma.user.count({ where: { role: 'USER', ...between('createdAt', from, to) } }),
      prisma.listing.count({ where: between('publishedAt', from, to) }),
      prisma.order.count({ where: between('createdAt', from, to) }),
      prisma.order.count({ where: { status: 'COMPLETED', ...between('completedAt', from, to) } }),
      prisma.$queryRaw<{ v: unknown }[]>`
        SELECT ${salesInTzs(rate)} AS v FROM orders o
        WHERE o.status = 'COMPLETED' AND o.completedAt >= ${from} AND o.completedAt < ${to}`,
      statSums(from, to),
    ]);
    return {
      users,
      listings,
      placed,
      completed,
      sales: roundMoney(num(sales?.v), 'TZS'),
      ...stats,
    };
  };

  const [now, before] = await Promise.all([counts(start, end), counts(prevStart, start)]);

  const [ordersDaily, salesDaily, viewsDaily, usersDaily] = await Promise.all([
    prisma.$queryRaw<{ day: Date; value: bigint }[]>`
      SELECT DATE(o.createdAt) AS day, COUNT(*) AS value FROM orders o
      WHERE o.createdAt >= ${start} AND o.createdAt < ${end} GROUP BY DATE(o.createdAt)`,
    prisma.$queryRaw<{ day: Date; value: unknown }[]>`
      SELECT DATE(o.completedAt) AS day, ${salesInTzs(rate)} AS value FROM orders o
      WHERE o.status = 'COMPLETED' AND o.completedAt >= ${start} AND o.completedAt < ${end}
      GROUP BY DATE(o.completedAt)`,
    prisma.$queryRaw<{ day: Date; value: bigint }[]>`
      SELECT s.day AS day, SUM(s.views) AS value FROM listing_daily_stats s
      WHERE s.day >= ${start} AND s.day < ${end} GROUP BY s.day`,
    prisma.$queryRaw<{ day: Date; value: bigint }[]>`
      SELECT DATE(u.createdAt) AS day, COUNT(*) AS value FROM users u
      WHERE u.role = 'USER' AND u.createdAt >= ${start} AND u.createdAt < ${end}
      GROUP BY DATE(u.createdAt)`,
  ]);

  const countries = await prisma.country.findMany({ orderBy: { code: 'desc' } });
  const [usersByCountry, buyersByCountry, salesByCountry, [crossBorder]] = await Promise.all([
    prisma.$queryRaw<{ id: number; n: bigint }[]>`
      SELECT u.countryId AS id, COUNT(*) AS n FROM users u
      WHERE u.role = 'USER' AND u.createdAt >= ${start} AND u.createdAt < ${end}
      GROUP BY u.countryId`,
    prisma.$queryRaw<{ id: number; n: bigint }[]>`
      SELECT b.countryId AS id, COUNT(*) AS n FROM orders o JOIN users b ON b.id = o.buyerId
      WHERE o.createdAt >= ${start} AND o.createdAt < ${end} GROUP BY b.countryId`,
    prisma.$queryRaw<{ id: number; n: unknown }[]>`
      SELECT s.countryId AS id, SUM(o.total) AS n FROM orders o JOIN users s ON s.id = o.sellerId
      WHERE o.status = 'COMPLETED' AND o.completedAt >= ${start} AND o.completedAt < ${end}
      GROUP BY s.countryId`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM orders o
      JOIN users b ON b.id = o.buyerId JOIN users s ON s.id = o.sellerId
      WHERE o.createdAt >= ${start} AND o.createdAt < ${end} AND b.countryId <> s.countryId`,
  ]);
  const byId = (rows: { id: number; n: unknown }[]) =>
    new Map(rows.map((r) => [Number(r.id), num(r.n)]));
  const [u, b, sl] = [byId(usersByCountry), byId(buyersByCountry), byId(salesByCountry)];

  const [topCategories, topSellers, statuses] = await Promise.all([
    prisma.$queryRaw<{ slug: string; name: string; units: unknown; orders: bigint }[]>`
      SELECT top.slug, top.name, SUM(i.quantity) AS units, COUNT(DISTINCT o.id) AS orders
      FROM order_items i
      JOIN orders o ON o.id = i.orderId
      JOIN listings l ON l.id = i.listingId
      JOIN categories c ON c.id = l.categoryId
      JOIN categories top ON top.id = COALESCE(c.parentId, c.id)
      WHERE o.createdAt >= ${start} AND o.createdAt < ${end} AND ${LIVE_ORDER}
      GROUP BY top.id, top.slug, top.name ORDER BY units DESC, top.name LIMIT 5`,
    prisma.$queryRaw<
      {
        id: number;
        name: string;
        slug: string | null;
        code: string;
        orders: bigint;
        sales: unknown;
      }[]
    >`
      SELECT u.id, COALESCE(p.shopName, u.name) AS name, p.slug, c.code,
             COUNT(*) AS orders, ${salesInTzs(rate)} AS sales
      FROM orders o
      JOIN users u ON u.id = o.sellerId
      JOIN countries c ON c.id = u.countryId
      LEFT JOIN seller_profiles p ON p.userId = u.id
      WHERE o.status = 'COMPLETED' AND o.completedAt >= ${start} AND o.completedAt < ${end}
      GROUP BY u.id, u.name, p.shopName, p.slug, c.code ORDER BY sales DESC LIMIT 5`,
    prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: start, lt: end } },
      _count: true,
    }),
  ]);

  return {
    days,
    from: isoDay(start),
    to: isoDay(new Date(end.getTime() - DAY)),
    rate,
    kpis: {
      newUsers: kpi(now.users, before.users),
      newListings: kpi(now.listings, before.listings),
      ordersPlaced: kpi(now.placed, before.placed),
      ordersCompleted: kpi(now.completed, before.completed),
      sales: kpi(now.sales, before.sales),
      views: kpi(now.views, before.views),
      cartAdds: kpi(now.cartAdds, before.cartAdds),
    },
    daily: {
      orders: fillDays(start, days, ordersDaily),
      sales: fillDays(start, days, salesDaily).map((p) => ({
        ...p,
        value: roundMoney(p.value, 'TZS'),
      })),
      views: fillDays(start, days, viewsDaily),
      newUsers: fillDays(start, days, usersDaily),
    },
    countries: countries.map((c) => ({
      code: c.code as CountryCode,
      newUsers: u.get(c.id) ?? 0,
      ordersAsBuyer: b.get(c.id) ?? 0,
      sales: roundMoney(sl.get(c.id) ?? 0, c.currencyCode as CurrencyCode),
      currency: c.currencyCode as CurrencyCode,
    })),
    crossBorderOrders: num(crossBorder?.n),
    topCategories: topCategories.map((r) => ({
      slug: r.slug,
      name: r.name,
      units: num(r.units),
      orders: num(r.orders),
    })),
    topSellers: topSellers.map((r) => ({
      id: Number(r.id),
      name: r.name,
      shopSlug: r.slug,
      countryCode: r.code as CountryCode,
      orders: num(r.orders),
      sales: roundMoney(num(r.sales), 'TZS'),
    })),
    statuses: statuses
      .map((s) => ({ status: s.status as OrderStatus, count: s._count }))
      .sort((a, z) => z.count - a.count),
  };
}

// ─── Seller ──────────────────────────────────────────────────────────────────

export async function sellerAnalytics(
  user: AuthUser,
  query: Record<string, unknown>,
): Promise<SellerAnalytics> {
  const { days, start, end, prevStart } = periodOf(query);
  const currency = user.country.currencyCode as CurrencyCode;
  const listings = await prisma.listing.findMany({
    where: { sellerId: user.id },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
  const ids = listings.map((l) => l.id);

  const totals = async (from: Date, to: Date) => {
    const [stats, placed, [units], sales] = await Promise.all([
      statSums(from, to, ids),
      prisma.order.count({ where: { sellerId: user.id, createdAt: { gte: from, lt: to } } }),
      prisma.$queryRaw<{ n: unknown }[]>`
        SELECT SUM(i.quantity) AS n FROM order_items i JOIN orders o ON o.id = i.orderId
        WHERE o.sellerId = ${user.id} AND o.createdAt >= ${from} AND o.createdAt < ${to}
          AND ${LIVE_ORDER}`,
      prisma.order.aggregate({
        where: { sellerId: user.id, status: 'COMPLETED', completedAt: { gte: from, lt: to } },
        _sum: { total: true },
      }),
    ]);
    return {
      ...stats,
      placed,
      units: num(units?.n),
      sales: roundMoney(sales._sum.total?.toNumber() ?? 0, currency),
    };
  };
  const [now, before] = await Promise.all([totals(start, end), totals(prevStart, start)]);

  const [viewsDaily, ordersDaily, statRows, orderRows, salesRows] = await Promise.all([
    ids.length
      ? prisma.$queryRaw<{ day: Date; value: bigint }[]>`
          SELECT s.day AS day, SUM(s.views) AS value FROM listing_daily_stats s
          WHERE s.listingId IN (${Prisma.join(ids)}) AND s.day >= ${start} AND s.day < ${end}
          GROUP BY s.day`
      : [],
    prisma.$queryRaw<{ day: Date; value: bigint }[]>`
      SELECT DATE(o.createdAt) AS day, COUNT(*) AS value FROM orders o
      WHERE o.sellerId = ${user.id} AND o.createdAt >= ${start} AND o.createdAt < ${end}
      GROUP BY DATE(o.createdAt)`,
    ids.length
      ? prisma.listingDailyStat.groupBy({
          by: ['listingId'],
          where: { listingId: { in: ids }, day: { gte: start, lt: end } },
          _sum: { views: true, cartAdds: true },
        })
      : [],
    prisma.$queryRaw<{ id: number; orders: bigint; units: unknown }[]>`
      SELECT i.listingId AS id, COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS units
      FROM order_items i JOIN orders o ON o.id = i.orderId
      WHERE o.sellerId = ${user.id} AND o.createdAt >= ${start} AND o.createdAt < ${end}
        AND ${LIVE_ORDER}
      GROUP BY i.listingId`,
    prisma.$queryRaw<{ id: number; sales: unknown }[]>`
      SELECT i.listingId AS id, SUM(i.lineTotal) AS sales
      FROM order_items i JOIN orders o ON o.id = i.orderId
      WHERE o.sellerId = ${user.id} AND o.status = 'COMPLETED'
        AND o.completedAt >= ${start} AND o.completedAt < ${end}
      GROUP BY i.listingId`,
  ]);
  const stats = new Map(statRows.map((r) => [r.listingId, r._sum]));
  const orders = new Map(orderRows.map((r) => [Number(r.id), r]));
  const sales = new Map(salesRows.map((r) => [Number(r.id), num(r.sales)]));

  return {
    days,
    from: isoDay(start),
    to: isoDay(new Date(end.getTime() - DAY)),
    currency,
    kpis: {
      views: kpi(now.views, before.views),
      cartAdds: kpi(now.cartAdds, before.cartAdds),
      ordersPlaced: kpi(now.placed, before.placed),
      unitsSold: kpi(now.units, before.units),
      sales: kpi(now.sales, before.sales),
    },
    daily: {
      views: fillDays(start, days, viewsDaily),
      orders: fillDays(start, days, ordersDaily),
    },
    listings: listings
      .map((l) => ({
        id: l.id,
        title: l.title,
        status: l.status,
        views: stats.get(l.id)?.views ?? 0,
        cartAdds: stats.get(l.id)?.cartAdds ?? 0,
        orders: num(orders.get(l.id)?.orders),
        units: num(orders.get(l.id)?.units),
        sales: roundMoney(sales.get(l.id) ?? 0, currency),
      }))
      .sort((a, z) => z.sales - a.sales || z.orders - a.orders || z.views - a.views),
  };
}
