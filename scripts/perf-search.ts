// Fills the tzed_perf database with generated sellers and listings, then times typical
// searches (each run several times) and writes a summary to tests/artifacts/perf-search.txt.
// Run it through scripts/perf-search.sh, which creates the database and sets DATABASE_URL.
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

if (!process.env.DATABASE_URL?.endsWith('/tzed_perf')) {
  throw new Error('Run this through scripts/perf-search.sh (it only works on tzed_perf).');
}

const { prisma } = await import('../apps/api/src/db.js');
const { seedReferenceData } = await import('../apps/api/prisma/seed.js');
const { searchListings, suggest } =
  await import('../apps/api/src/modules/search/search.service.js');
const { searchQuerySchema } = await import('@tzed/shared');

const target = Number(process.argv[2] ?? 20_000);
const RUNS = 15;

const ITEMS = [
  'Samsung Galaxy phone',
  'Tecno Spark phone',
  'iPhone 12',
  'Nokia feature phone',
  'HP laptop',
  'Dell laptop',
  'Smart TV 43 inch',
  'Bluetooth speaker',
  'Solar panel 200W',
  'Fridge',
  'Gas cooker',
  'Office chair',
  '3-seater sofa',
  'Double bed frame',
  'Kitenge fabric',
  'Chitenge wrapper',
  'Leather shoes',
  'School uniform',
  'Maize sheller',
  'Water pump',
  'Bicycle',
  'Car tyres',
  'Wheelbarrow',
  'Baby stroller',
  'Rice cooker',
];
const ADJECTIVES = [
  'new',
  'used',
  'boxed',
  'cheap',
  'quality',
  'original',
  'heavy duty',
  'small',
  'large',
  'blue',
  'black',
  'red',
];
const TOWNS = [
  'Dar es Salaam',
  'Mbeya',
  'Arusha',
  'Mwanza',
  'Lusaka',
  'Ndola',
  'Kitwe',
  'Livingstone',
];
const pick = <T>(a: readonly T[], i: number) => a[i % a.length]!;

// ── Data ─────────────────────────────────────────────────────────────────────
await seedReferenceData(prisma);
const existing = await prisma.listing.count();
if (existing < target) {
  console.log(`Generating ${target - existing} listings (have ${existing})…`);
  const countries = await prisma.country.findMany({ include: { regions: true } });
  const leaves = await prisma.category.findMany({ where: { parentId: { not: null } } });
  const sellerCount = 400;
  let sellers = await prisma.user.findMany({
    where: { sellerProfile: { isNot: null } },
    include: { country: true },
  });
  if (sellers.length < sellerCount) {
    for (let i = sellers.length; i < sellerCount; i++) {
      const country = countries[i % 2]!;
      const region = pick(country.regions, i);
      await prisma.user.create({
        data: {
          email: `perf-seller-${i}@perf.tzed.local`,
          name: `Perf Seller ${i}`,
          passwordHash: 'not-used',
          countryId: country.id,
          emailVerifiedAt: new Date(),
          consentAt: new Date(),
          sellerProfile: {
            create: {
              shopName: `Perf Shop ${i}`,
              slug: `perf-shop-${i}`,
              regionId: region.id,
              town: pick(TOWNS, i),
            },
          },
        },
      });
    }
    sellers = await prisma.user.findMany({
      where: { sellerProfile: { isNot: null } },
      include: { country: true },
    });
  }

  const regionsByCountry = new Map(countries.map((c) => [c.id, c.regions]));
  const otherCountry = new Map(
    countries.map((c) => [c.id, countries.find((o) => o.id !== c.id)!.id]),
  );
  const BATCH = 1000;
  for (let start = existing; start < target; start += BATCH) {
    const rows = [];
    for (let i = start; i < Math.min(start + BATCH, target); i++) {
      const seller = pick(sellers, i * 7);
      const tz = seller.country.currencyCode === 'TZS';
      const item = pick(ITEMS, i);
      rows.push({
        sellerId: seller.id,
        categoryId: pick(leaves, i * 3).id,
        title: `${pick(ADJECTIVES, i * 5)} ${item} ${i}`.slice(0, 100),
        description: `${item} in good condition. ${pick(ADJECTIVES, i)} and ready to go. Delivery from ${pick(TOWNS, i)}. Ask for more photos.`,
        price: String(tz ? 5000 + ((i * 7919) % 3_000_000) : 50 + ((i * 7919) % 25_000)),
        currency: seller.country.currencyCode,
        condition: pick(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const, i),
        quantity: 1 + (i % 5),
        countryId: seller.countryId,
        regionId: pick(regionsByCountry.get(seller.countryId)!, i).id,
        town: pick(TOWNS, i),
        deliveryPickup: true,
        deliveryLocal: i % 2 === 0,
        deliveryCrossBorder: i % 3 === 0,
        status: i % 10 === 0 ? ('DRAFT' as const) : ('ACTIVE' as const),
        publishedAt: i % 10 === 0 ? null : new Date(Date.now() - i * 60_000),
      });
    }
    await prisma.listing.createMany({ data: rows });
    // Who can buy each new listing: the seller's country, plus the other one if cross-border.
    const created = await prisma.listing.findMany({
      where: { shipTo: { none: {} } },
      select: { id: true, countryId: true, deliveryCrossBorder: true },
    });
    await prisma.listingShipTo.createMany({
      data: created.flatMap((l) => [
        { listingId: l.id, countryId: l.countryId },
        ...(l.deliveryCrossBorder
          ? [{ listingId: l.id, countryId: otherCountry.get(l.countryId)! }]
          : []),
      ]),
    });
    process.stdout.write('.');
  }
  console.log();
}
const total = await prisma.listing.count();
const live = await prisma.listing.count({ where: { status: 'ACTIVE' } });

// ── Timing ───────────────────────────────────────────────────────────────────
const cases: [string, () => Promise<unknown>][] = [
  ['browse, newest first', () => searchListings(searchQuerySchema.parse({ sort: 'newest' }))],
  ['keyword "phone"', () => searchListings(searchQuerySchema.parse({ q: 'phone' }))],
  [
    'two keywords "solar panel"',
    () => searchListings(searchQuerySchema.parse({ q: 'solar panel' })),
  ],
  ['short word "tv"', () => searchListings(searchQuerySchema.parse({ q: 'tv' }))],
  ['no matches', () => searchListings(searchQuerySchema.parse({ q: 'zzqxv' }))],
  [
    'keyword + available in Zambia + price in K',
    () =>
      searchListings(
        searchQuerySchema.parse({
          q: 'laptop',
          availableIn: 'ZM',
          minPrice: '500',
          maxPrice: '8000',
          currency: 'ZMW',
        }),
      ),
  ],
  [
    'category + condition, price high to low',
    () =>
      searchListings(
        searchQuerySchema.parse({
          category: 'phones-tablets',
          condition: 'NEW,LIKE_NEW',
          sort: 'price_desc',
        }),
      ),
  ],
  ['deep page (page 40)', () => searchListings(searchQuerySchema.parse({ q: 'used', page: '40' }))],
  ['suggestions "sam"', () => suggest('sam')],
];

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
const lines = [
  `Search performance — ${new Date().toISOString()}`,
  `${total} listings (${live} live), ${RUNS} runs per query, after one warm-up run`,
  '',
  `${'query'.padEnd(46)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'max ms'.padStart(8)}  results`,
];
for (const [name, fn] of cases) {
  const first = (await fn()) as { total?: number; listings?: unknown[] };
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const results = first.total ?? first.listings?.length ?? '';
  lines.push(
    `${name.padEnd(46)} ${pct(times, 0.5).toFixed(1).padStart(8)} ${pct(times, 0.95).toFixed(1).padStart(8)} ${times.at(-1)!.toFixed(1).padStart(8)}  ${results}`,
  );
}
const report = lines.join('\n') + '\n';
console.log(report);
writeFileSync(new URL('../tests/artifacts/perf-search.txt', import.meta.url), report);
await prisma.$disconnect();
