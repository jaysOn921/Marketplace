import { Prisma } from '@prisma/client';
import {
  convertMoney,
  type CurrencyCode,
  type ExchangeRateInfo,
  type SearchFacet,
  type SearchQuery,
  type SearchResponse,
  type SearchSort,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { getCurrentRates } from '../geo/geo.service.js';
import { sellerRatings } from '../reviews/reviews.service.js';
import { listingSummaryInclude, toListingSummary } from '../listings/listing-dto.js';
import { booleanExpression, parseTextQuery, type TextQuery } from './text-query.js';

type MatchMode = 'all' | 'any';
const ALL_CURRENCIES: CurrencyCode[] = ['TZS', 'ZMW'];

/** The ZMW→TZS rate, used to compare and sort prices across currencies. */
async function currentRate(): Promise<ExchangeRateInfo | null> {
  const rates = await getCurrentRates();
  return rates.find((r) => r.base === 'ZMW' && r.quote === 'TZS') ?? null;
}

function textCondition(text: TextQuery, mode: MatchMode): Prisma.Sql {
  const likes = text.short.map(
    (w) => Prisma.sql`(l.title LIKE ${`%${w}%`} OR l.description LIKE ${`%${w}%`})`,
  );
  const match = text.long.length
    ? [
        Prisma.sql`MATCH(l.title, l.description) AGAINST (${booleanExpression(text.long, mode)} IN BOOLEAN MODE)`,
      ]
    : [];
  return Prisma.sql`(${Prisma.join([...match, ...likes], mode === 'all' ? ' AND ' : ' OR ')})`;
}

/** Relevance: full-text score, plus a boost for each word found in the title. */
function relevance(text: TextQuery, mode: MatchMode): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (text.long.length) {
    parts.push(
      Prisma.sql`MATCH(l.title, l.description) AGAINST (${booleanExpression(text.long, mode)} IN BOOLEAN MODE)`,
    );
  }
  for (const w of [...text.long, ...text.short])
    parts.push(Prisma.sql`(l.title LIKE ${`%${w}%`}) * 2`);
  return Prisma.join(parts, ' + ');
}

/** Price range given in one currency, applied to listings in both (converted with the current rate). */
function priceCondition(query: SearchQuery, rate: ExchangeRateInfo | null): Prisma.Sql | null {
  const { minPrice, maxPrice } = query;
  if (minPrice === undefined && maxPrice === undefined) return null;
  const from = query.currency ?? 'TZS';
  const branches = ALL_CURRENCIES.filter((c) => c === from || rate).map((c) => {
    const conv = (v: number) => (c === from ? v : convertMoney(v, from, c, rate!));
    const parts = [Prisma.sql`l.currency = ${c}`];
    if (minPrice !== undefined) parts.push(Prisma.sql`l.price >= ${conv(minPrice)}`);
    if (maxPrice !== undefined) parts.push(Prisma.sql`l.price <= ${conv(maxPrice)}`);
    return Prisma.sql`(${Prisma.join(parts, ' AND ')})`;
  });
  return Prisma.sql`(${Prisma.join(branches, ' OR ')})`;
}

/** Price in shillings, so listings in both currencies sort together. */
function normalisedPrice(rate: ExchangeRateInfo | null) {
  return rate
    ? Prisma.sql`CASE WHEN l.currency = 'ZMW' THEN l.price * ${rate.rate} ELSE l.price END`
    : Prisma.sql`l.price`;
}

interface Filters {
  text: Prisma.Sql | null;
  category: Prisma.Sql | null;
  country: Prisma.Sql | null;
  rest: Prisma.Sql[];
}

const whereOf = (f: Filters, omit?: 'category' | 'country') =>
  Prisma.join(
    [
      Prisma.sql`l.status = 'ACTIVE'`,
      ...(f.text ? [f.text] : []),
      ...(f.category && omit !== 'category' ? [f.category] : []),
      ...(f.country && omit !== 'country' ? [f.country] : []),
      ...f.rest,
    ],
    ' AND ',
  );

async function countWhere(where: Prisma.Sql) {
  const [row] = await prisma.$queryRaw<
    { n: bigint }[]
  >`SELECT COUNT(*) AS n FROM listings l WHERE ${where}`;
  return Number(row?.n ?? 0);
}

export async function searchListings(query: SearchQuery): Promise<SearchResponse> {
  const rate = await currentRate();
  const text = parseTextQuery(query.q);

  // Category: a parent category includes all of its subcategories.
  const category = query.category
    ? await prisma.category.findFirst({
        where: { slug: query.category, isActive: true },
        include: {
          parent: true,
          children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      })
    : null;
  const countries = await prisma.country.findMany();
  const countryId = (code?: string) => countries.find((c) => c.code === code)?.id ?? -1;
  const seller = query.seller
    ? await prisma.sellerProfile.findUnique({ where: { slug: query.seller } })
    : null;

  const rest: Prisma.Sql[] = [];
  if (query.availableIn) {
    rest.push(
      Prisma.sql`EXISTS (SELECT 1 FROM listing_ship_to s WHERE s.listingId = l.id AND s.countryId = ${countryId(query.availableIn)})`,
    );
  }
  if (query.condition.length)
    rest.push(Prisma.sql`l.condition IN (${Prisma.join(query.condition)})`);
  const price = priceCondition(query, rate);
  if (price) rest.push(price);
  if (query.seller) rest.push(Prisma.sql`l.sellerId = ${seller?.userId ?? -1}`);
  if (query.category && !category) rest.push(Prisma.sql`1 = 0`); // unknown category: no results

  const filters: Filters = {
    text: null,
    category: category
      ? Prisma.sql`l.categoryId IN (${Prisma.join([category.id, ...category.children.map((c) => c.id)])})`
      : null,
    country: query.country ? Prisma.sql`l.countryId = ${countryId(query.country)}` : null,
    rest,
  };

  // Try "every word" first; if nothing matches, fall back to "any word".
  let matchMode: MatchMode | null = null;
  let total: number;
  if (text) {
    matchMode = 'all';
    filters.text = textCondition(text, 'all');
    total = await countWhere(whereOf(filters));
    if (total === 0 && text.long.length + text.short.length > 1) {
      matchMode = 'any';
      filters.text = textCondition(text, 'any');
      total = await countWhere(whereOf(filters));
    }
  } else {
    total = await countWhere(whereOf(filters));
  }

  const sort: SearchSort =
    query.sort && (query.sort !== 'relevance' || text) ? query.sort : text ? 'relevance' : 'newest';
  const orderBy = {
    relevance:
      text && matchMode
        ? Prisma.sql`(${relevance(text, matchMode)}) DESC, l.publishedAt DESC`
        : Prisma.sql`l.publishedAt DESC`,
    newest: Prisma.sql`l.publishedAt DESC, l.id DESC`,
    price_asc: Prisma.sql`${normalisedPrice(rate)} ASC, l.id DESC`,
    price_desc: Prisma.sql`${normalisedPrice(rate)} DESC, l.id DESC`,
  }[sort];

  const offset = (query.page - 1) * query.pageSize;
  const idRows = total
    ? await prisma.$queryRaw<{ id: number }[]>`
        SELECT l.id FROM listings l WHERE ${whereOf(filters)}
        ORDER BY ${orderBy} LIMIT ${query.pageSize} OFFSET ${offset}`
    : [];
  const ids = idRows.map((r) => r.id);
  const rows = ids.length
    ? await prisma.listing.findMany({ where: { id: { in: ids } }, include: listingSummaryInclude })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ratings = await sellerRatings(rows.map((r) => r.sellerId));

  return {
    results: ids.flatMap((id) => {
      const row = byId.get(id);
      return row
        ? [{ ...toListingSummary(row), sellerRating: ratings.get(row.sellerId) ?? null }]
        : [];
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    sort,
    matchMode,
    category: category
      ? {
          slug: category.slug,
          name: category.name,
          parent: category.parent
            ? { slug: category.parent.slug, name: category.parent.name }
            : null,
          children: category.children.map((c) => ({ slug: c.slug, name: c.name })),
        }
      : null,
    facets: {
      categories: await categoryFacets(filters, category),
      countries: await countryFacets(filters, countries),
    },
  };
}

/**
 * Result counts per category. Inside a category with subcategories, counts per subcategory;
 * otherwise counts per top-level category (ignoring the category filter).
 */
async function categoryFacets(
  filters: Filters,
  category: { id: number; children: { id: number }[] } | null,
): Promise<SearchFacet[]> {
  const inside = category && category.children.length > 0;
  const rows = inside
    ? await prisma.$queryRaw<{ id: number; n: bigint }[]>`
        SELECT l.categoryId AS id, COUNT(*) AS n FROM listings l
        WHERE ${whereOf(filters)} GROUP BY l.categoryId`
    : await prisma.$queryRaw<{ id: number; n: bigint }[]>`
        SELECT COALESCE(c.parentId, c.id) AS id, COUNT(*) AS n FROM listings l
        JOIN categories c ON c.id = l.categoryId
        WHERE ${whereOf(filters, 'category')} GROUP BY COALESCE(c.parentId, c.id)`;
  const cats = await prisma.category.findMany({
    // Raw COUNT/COALESCE results can come back as BigInt.
    where: { id: { in: rows.map((r) => Number(r.id)) } },
    orderBy: { sortOrder: 'asc' },
  });
  const counts = new Map(rows.map((r) => [Number(r.id), Number(r.n)]));
  return cats.map((c) => ({ key: c.slug, label: c.name, count: counts.get(c.id) ?? 0 }));
}

async function countryFacets(
  filters: Filters,
  countries: { id: number; code: string; name: string }[],
) {
  const rows = await prisma.$queryRaw<{ id: number; n: bigint }[]>`
    SELECT l.countryId AS id, COUNT(*) AS n FROM listings l
    WHERE ${whereOf(filters, 'country')} GROUP BY l.countryId`;
  const counts = new Map(rows.map((r) => [Number(r.id), Number(r.n)]));
  return countries.map((c) => ({ key: c.code, label: c.name, count: counts.get(c.id) ?? 0 }));
}

/** Search-as-you-type suggestions: matching live listing titles and categories. */
export async function suggest(q: string | undefined) {
  const text = parseTextQuery(q);
  if (!text || (q ?? '').trim().length < 2) return { listings: [], categories: [] };

  const titleParts = [
    ...(text.long.length
      ? [
          Prisma.sql`MATCH(l.title, l.description) AGAINST (${booleanExpression(text.long, 'all')} IN BOOLEAN MODE)`,
        ]
      : []),
    ...text.short.map((w) => Prisma.sql`l.title LIKE ${`%${w}%`}`),
  ];
  const listings = await prisma.$queryRaw<{ id: number; title: string }[]>`
    SELECT l.id, l.title FROM listings l
    WHERE l.status = 'ACTIVE' AND ${Prisma.join(titleParts, ' AND ')}
    ORDER BY (${relevance(text, 'all')}) DESC, l.publishedAt DESC LIMIT 6`;

  const words = [...text.long, ...text.short];
  const categories = await prisma.category.findMany({
    where: { isActive: true, OR: words.map((w) => ({ name: { contains: w } })) },
    select: { slug: true, name: true },
    orderBy: { sortOrder: 'asc' },
    take: 4,
  });
  return { listings, categories };
}
