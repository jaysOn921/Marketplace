import type { ListingCondition } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { resetDb } from '../../test/db.js';
import { createSeller } from '../../test/factories.js';
import { parseTextQuery } from './text-query.js';

const app = createApp();

interface Item {
  title: string;
  description?: string;
  category: string;
  price: string;
  condition?: ListingCondition;
  crossBorder?: boolean;
  status?: 'ACTIVE' | 'PENDING_REVIEW' | 'DRAFT' | 'SOLD';
  daysAgo?: number;
}

async function addListings(countryCode: 'TZ' | 'ZM', slug: string, items: Item[]) {
  const { user, region } = await createSeller(countryCode);
  await prisma.sellerProfile.update({ where: { userId: user.id }, data: { slug } });
  const other = await prisma.country.findFirstOrThrow({
    where: { code: countryCode === 'TZ' ? 'ZM' : 'TZ' },
  });
  for (const item of items) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: item.category } });
    await prisma.listing.create({
      data: {
        sellerId: user.id,
        categoryId: category.id,
        title: item.title,
        description:
          item.description ?? `${item.title}. In good working order, collection or delivery.`,
        price: item.price,
        currency: countryCode === 'TZ' ? 'TZS' : 'ZMW',
        condition: item.condition ?? 'GOOD',
        countryId: user.countryId,
        regionId: region.id,
        town: 'Town',
        deliveryCrossBorder: item.crossBorder ?? false,
        status: item.status ?? 'ACTIVE',
        publishedAt: new Date(Date.now() - (item.daysAgo ?? 0) * 86_400_000),
        shipTo: {
          create: [
            { countryId: user.countryId },
            ...(item.crossBorder ? [{ countryId: other.id }] : []),
          ],
        },
      },
    });
  }
}

const search = async (qs: string) => {
  const res = await request(app).get(`/api/v1/search?${qs}`);
  expect(res.status).toBe(200);
  return res.body;
};
const titles = (body: { results: { title: string }[] }) => body.results.map((r) => r.title);

// One shared data set (rate: 1 ZMW = 105 TZS) for all search tests.
beforeAll(async () => {
  await resetDb();
  await seedReferenceData(prisma);
  await addListings('TZ', 'dar-phones', [
    {
      title: 'Samsung Galaxy A15 phone',
      category: 'phones-tablets',
      price: '380000',
      condition: 'NEW',
      crossBorder: true,
      daysAgo: 1,
    },
    {
      title: 'Nokia 105 basic phone',
      category: 'phones-tablets',
      price: '55000',
      crossBorder: true,
      daysAgo: 3,
    },
    {
      title: 'Kitenge fabric six yards',
      category: 'fabrics-kitenge',
      price: '25000',
      crossBorder: true,
      daysAgo: 2,
    },
    { title: 'Wooden coffee table', category: 'furniture', price: '450000', daysAgo: 5 },
    {
      title: 'Samsung TV remote pending',
      category: 'tv-audio-video',
      price: '20000',
      status: 'PENDING_REVIEW',
    },
    {
      title: 'Samsung charger draft',
      category: 'electronics-accessories',
      price: '15000',
      status: 'DRAFT',
    },
  ]);
  await addListings('ZM', 'lusaka-home', [
    { title: 'Hisense 32 inch smart TV', category: 'tv-audio-video', price: '3200', daysAgo: 4 },
    {
      title: 'Grey three seater sofa',
      description: 'Comfortable sofa for the living room.',
      category: 'furniture',
      price: '5500',
      condition: 'LIKE_NEW',
      daysAgo: 6,
    },
    {
      title: 'HP ProBook laptop Core i5',
      category: 'computers-laptops',
      price: '6800',
      crossBorder: true,
      daysAgo: 7,
    },
    { title: 'Samsung Galaxy S9 sold', category: 'phones-tablets', price: '1500', status: 'SOLD' },
  ]);
});

describe('parseTextQuery', () => {
  it('splits long and short words, drops stopwords and operators', () => {
    expect(parseTextQuery(' The +Samsung* "TV" for -4K ')).toEqual({
      long: ['samsung'],
      short: ['tv', '4k'],
    });
    expect(parseTextQuery('the of')).toBeNull();
    expect(parseTextQuery(undefined)).toBeNull();
  });
});

describe('keyword search', () => {
  it('only returns live listings', async () => {
    const body = await search('q=samsung');
    expect(titles(body)).toEqual(['Samsung Galaxy A15 phone']);
    expect(body).toMatchObject({ total: 1, matchMode: 'all', sort: 'relevance' });
  });

  it('matches word beginnings and searches descriptions', async () => {
    expect(titles(await search('q=sams'))).toEqual(['Samsung Galaxy A15 phone']);
    expect(titles(await search('q=living+room'))).toEqual(['Grey three seater sofa']);
  });

  it('requires every word, and falls back to any word when nothing matches them all', async () => {
    expect(titles(await search('q=samsung+phone'))).toEqual(['Samsung Galaxy A15 phone']);
    const body = await search('q=samsung+laptop');
    expect(body.matchMode).toBe('any');
    expect(titles(body).sort()).toEqual(['HP ProBook laptop Core i5', 'Samsung Galaxy A15 phone']);
  });

  it('finds short words the full-text index ignores, and ignores stopwords', async () => {
    expect(titles(await search('q=tv'))).toEqual(['Hisense 32 inch smart TV']);
    expect(titles(await search('q=the+sofa'))).toEqual(['Grey three seater sofa']);
  });

  it('ranks title matches above description-only matches', async () => {
    await addListings('TZ', 'extra-shop', [
      {
        title: 'Phone case',
        description: 'Fits a Samsung Galaxy perfectly.',
        category: 'electronics-accessories',
        price: '10000',
      },
    ]);
    const body = await search('q=samsung+galaxy');
    expect(titles(body)[0]).toBe('Samsung Galaxy A15 phone');
    await prisma.listing.deleteMany({ where: { title: 'Phone case' } });
  });

  it('treats search operators and quotes as plain text', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .query({ q: `"); DROP TABLE listings; -- +* ~@` });
    expect(res.status).toBe(200);
    expect(await prisma.listing.count()).toBeGreaterThan(0);
  });

  it('returns nothing (not everything) for words that match no listing', async () => {
    const body = await search('q=zzzzqqq');
    expect(body.total).toBe(0);
  });
});

describe('filters', () => {
  it('filters by category, including subcategories of a parent', async () => {
    expect(titles(await search('category=phones-tablets&sort=newest'))).toEqual([
      'Samsung Galaxy A15 phone',
      'Nokia 105 basic phone',
    ]);
    const body = await search('category=electronics');
    expect(body.total).toBe(4);
    expect(body.category).toMatchObject({ slug: 'electronics', parent: null });
    expect(body.category.children.map((c: { slug: string }) => c.slug)).toContain('phones-tablets');
    expect((await search('category=no-such-category')).total).toBe(0);
  });

  it("filters by the seller's country and by where buyers can get it", async () => {
    expect((await search('country=ZM')).total).toBe(3);
    // A buyer in Zambia sees Zambian listings plus Tanzanian cross-border ones.
    const forZambia = titles(await search('availableIn=ZM'));
    expect(forZambia).toHaveLength(6);
    expect(forZambia).toContain('Kitenge fabric six yards');
    expect(forZambia).not.toContain('Wooden coffee table');
  });

  it('filters by condition', async () => {
    expect(titles(await search('condition=NEW,LIKE_NEW&sort=newest'))).toEqual([
      'Samsung Galaxy A15 phone',
      'Grey three seater sofa',
    ]);
  });

  it('applies a price range in one currency to listings in both', async () => {
    // K 3,000–7,000 ≈ TSh 315,000–735,000
    const body = await search('minPrice=3000&maxPrice=7000&currency=ZMW&sort=price_asc');
    expect(titles(body)).toEqual([
      'Hisense 32 inch smart TV', // K 3,200
      'Samsung Galaxy A15 phone', // TSh 380,000 ≈ K 3,619
      'Wooden coffee table', // TSh 450,000 ≈ K 4,286
      'Grey three seater sofa', // K 5,500
      'HP ProBook laptop Core i5', // K 6,800
    ]);
    expect(titles(await search('maxPrice=60000&currency=TZS'))).toEqual(
      expect.arrayContaining(['Nokia 105 basic phone', 'Kitenge fabric six yards']),
    );
  });

  it('filters to one shop', async () => {
    const body = await search('seller=lusaka-home');
    expect(body.total).toBe(3);
    expect((await search('seller=unknown-shop')).total).toBe(0);
  });

  it('ignores invalid filter values instead of failing', async () => {
    const body = await search('country=XX&condition=BROKEN&minPrice=abc&sort=cheapest&page=-3');
    expect(body.total).toBe(7);
    expect(body.page).toBe(1);
  });
});

describe('sorting and paging', () => {
  it('sorts by price across currencies', async () => {
    const asc = titles(await search('sort=price_asc'));
    expect(asc[0]).toBe('Kitenge fabric six yards'); // TSh 25,000
    expect(asc.at(-1)).toBe('HP ProBook laptop Core i5'); // K 6,800 ≈ TSh 714,000
    expect(titles(await search('sort=price_desc'))).toEqual([...asc].reverse());
  });

  it('defaults to newest without keywords', async () => {
    const body = await search('');
    expect(body.sort).toBe('newest');
    expect(titles(body)[0]).toBe('Samsung Galaxy A15 phone');
  });

  it('pages through results', async () => {
    const p1 = await search('pageSize=3&page=1');
    const p3 = await search('pageSize=3&page=3');
    expect(p1).toMatchObject({ total: 7, pageCount: 3 });
    expect(p1.results).toHaveLength(3);
    expect(p3.results).toHaveLength(1);
    expect(titles(p1)).not.toContain(titles(p3)[0]);
  });
});

describe('facets', () => {
  it('counts results per top-level category and per country', async () => {
    const body = await search('q=phone');
    expect(body.facets.categories).toEqual([
      { key: 'electronics', label: 'Electronics', count: 2 },
    ]);
    expect(body.facets.countries).toEqual(
      expect.arrayContaining([
        { key: 'TZ', label: 'Tanzania', count: 2 },
        { key: 'ZM', label: 'Zambia', count: 0 },
      ]),
    );
  });

  it('counts per subcategory inside a parent category', async () => {
    const body = await search('category=electronics');
    const keys = Object.fromEntries(
      body.facets.categories.map((f: { key: string; count: number }) => [f.key, f.count]),
    );
    expect(keys).toMatchObject({
      'phones-tablets': 2,
      'tv-audio-video': 1,
      'computers-laptops': 1,
    });
  });

  it('keeps country counts when filtering by country', async () => {
    const body = await search('country=TZ');
    const zm = body.facets.countries.find((f: { key: string }) => f.key === 'ZM');
    expect(zm.count).toBe(3);
  });
});

describe('suggestions and shops', () => {
  it('suggests live listing titles and categories as you type', async () => {
    const res = await request(app).get('/api/v1/search/suggest?q=sof');
    expect(res.body.listings.map((l: { title: string }) => l.title)).toEqual([
      'Grey three seater sofa',
    ]);
    const cats = await request(app).get('/api/v1/search/suggest?q=furn');
    expect(cats.body.categories).toEqual(
      expect.arrayContaining([
        { slug: 'furniture', name: 'Furniture' },
        { slug: 'home-furniture', name: 'Home & furniture' },
      ]),
    );
    expect((await request(app).get('/api/v1/search/suggest?q=a')).body).toEqual({
      listings: [],
      categories: [],
    });
  });

  it('returns a public shop profile', async () => {
    const res = await request(app).get('/api/v1/shops/lusaka-home');
    expect(res.body.shop).toMatchObject({
      slug: 'lusaka-home',
      countryCode: 'ZM',
      activeListings: 3,
    });
    expect((await request(app).get('/api/v1/shops/nope')).status).toBe(404);
  });
});
