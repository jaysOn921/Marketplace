// Seeds reference data (always) and demo data (development only).
// Run: npm run db:seed --workspace @tzed/api
import { PrismaClient, type Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { CATEGORIES, COUNTRIES, FAQ_ARTICLES, SEED_RATE } from './seed-data.js';

const prisma = new PrismaClient();
const isProduction = process.env.NODE_ENV === 'production';

export async function seedReferenceData(db: PrismaClient | Prisma.TransactionClient = prisma) {
  for (const { regions, ...country } of COUNTRIES) {
    const c = await db.country.upsert({
      where: { code: country.code },
      update: country,
      create: country,
    });
    for (const name of regions) {
      await db.region.upsert({
        where: { countryId_name: { countryId: c.id, name } },
        update: {},
        create: { countryId: c.id, name },
      });
    }
  }

  const hasRate = await db.exchangeRate.findFirst({
    where: { baseCurrency: SEED_RATE.base, quoteCurrency: SEED_RATE.quote },
  });
  if (!hasRate) {
    await db.exchangeRate.create({
      data: {
        baseCurrency: SEED_RATE.base,
        quoteCurrency: SEED_RATE.quote,
        rate: SEED_RATE.rate,
        note: 'Starting rate from seed. Update it in the admin panel before launch.',
      },
    });
  }

  for (const [i, { children, ...cat }] of CATEGORIES.entries()) {
    const parent = await db.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: i },
      create: { ...cat, sortOrder: i },
    });
    for (const [j, child] of (children ?? []).entries()) {
      await db.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id, sortOrder: j },
        create: { ...child, parentId: parent.id, sortOrder: j },
      });
    }
  }

  for (const [i, article] of FAQ_ARTICLES.entries()) {
    await db.faqArticle.upsert({
      where: { slug: article.slug },
      update: {},
      create: { ...article, sortOrder: i },
    });
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@tzed.local';
  const password = process.env.SEED_ADMIN_PASSWORD || (isProduction ? '' : 'admin-dev-password');
  if (!password) {
    console.warn('SEED_ADMIN_PASSWORD not set: skipping admin user.');
    return;
  }
  const tz = await prisma.country.findUniqueOrThrow({ where: { code: 'TZ' } });
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'TZed Admin',
      passwordHash: await argon2.hash(password),
      role: 'ADMIN',
      countryId: tz.id,
      emailVerifiedAt: new Date(),
      consentAt: new Date(),
    },
  });
  console.log(`Admin user: ${email}`);
}

type DemoListing = {
  title: string;
  description: string;
  price: string;
  category: string;
  condition: Prisma.ListingCreateInput['condition'];
  quantity?: number;
  crossBorder?: boolean;
  deliveryNotes?: string;
  status?: 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED';
  rejectionReason?: string;
};

const DEMO_SELLERS: {
  email: string;
  name: string;
  country: 'TZ' | 'ZM';
  region: string;
  town: string;
  shopName: string;
  slug: string;
  listings: DemoListing[];
}[] = [
  {
    email: 'amina@demo.tzed.local',
    name: 'Amina Mwakyusa',
    country: 'TZ',
    region: 'Dar es Salaam',
    town: 'Kariakoo',
    shopName: 'Amina Electronics',
    slug: 'amina-electronics',
    listings: [
      {
        title: 'Samsung Galaxy A15, 128GB, black',
        description: 'Brand new in sealed box with charger. 1 year shop warranty. Dual SIM.',
        price: '380000',
        category: 'phones-tablets',
        condition: 'NEW',
        quantity: 5,
        crossBorder: true,
        deliveryNotes: 'Can send to Zambia by bus via Tunduma. Delivery usually 3–5 days.',
      },
      {
        title: 'Bluetooth speaker, waterproof',
        description: 'Loud portable speaker, 12 hours battery, USB-C charging.',
        price: '65000',
        category: 'electronics-accessories',
        condition: 'NEW',
        quantity: 10,
        crossBorder: true,
        deliveryNotes: 'Ships to Zambia with phone orders or by courier.',
      },
      {
        title: 'Used laptop charger, 65W',
        description: 'Works with most HP laptops. Tested.',
        price: '30000',
        category: 'electronics-accessories',
        condition: 'GOOD',
        status: 'PENDING_REVIEW',
      },
    ],
  },
  {
    email: 'joseph@demo.tzed.local',
    name: 'Joseph Mbwambo',
    country: 'TZ',
    region: 'Mbeya',
    town: 'Mbeya',
    shopName: 'Mbeya Kitenge & Crafts',
    slug: 'mbeya-kitenge-crafts',
    listings: [
      {
        title: 'Kitenge fabric, 6 yards, assorted prints',
        description: 'High quality cotton kitenge. Choose your print by message.',
        price: '25000',
        category: 'fabrics-kitenge',
        condition: 'NEW',
        quantity: 40,
        crossBorder: true,
        deliveryNotes: 'Close to Tunduma border. Weekly shipments to Nakonde and Lusaka.',
      },
      {
        title: 'Handmade wooden coffee table',
        description: 'Solid mninga wood, 120 x 60 cm. Pickup in Mbeya.',
        price: '450000',
        category: 'furniture',
        condition: 'NEW',
      },
      {
        title: 'Replica designer handbag',
        description: 'Looks like the original brand.',
        price: '40000',
        category: 'womens-clothing',
        condition: 'NEW',
        status: 'REJECTED',
        rejectionReason: 'Counterfeit goods are not allowed (see prohibited items).',
      },
    ],
  },
  {
    email: 'mwila@demo.tzed.local',
    name: 'Mwila Banda',
    country: 'ZM',
    region: 'Lusaka',
    town: 'Lusaka',
    shopName: 'Mwila Home Store',
    slug: 'mwila-home-store',
    listings: [
      {
        title: 'Hisense 32" smart TV',
        description: 'Used for 1 year, works perfectly. Remote included.',
        price: '3200',
        category: 'tv-audio-video',
        condition: 'GOOD',
      },
      {
        title: '3-seater fabric sofa, grey',
        description: 'Comfortable and clean. Collection in Kabulonga or local delivery.',
        price: '5500',
        category: 'furniture',
        condition: 'LIKE_NEW',
      },
      {
        title: 'HP ProBook laptop, Core i5, 8GB RAM',
        description: '256GB SSD, Windows 11, battery lasts 4 hours. Charger included.',
        price: '6800',
        category: 'computers-laptops',
        condition: 'GOOD',
        crossBorder: true,
        deliveryNotes: 'Can courier to Tanzania. Buyer pays courier and any duties.',
      },
    ],
  },
  {
    email: 'chanda@demo.tzed.local',
    name: 'Chanda Mulenga',
    country: 'ZM',
    region: 'Copperbelt',
    town: 'Kitwe',
    shopName: 'Copperbelt Farm Supplies',
    slug: 'copperbelt-farm-supplies',
    listings: [
      {
        title: 'Manual maize sheller',
        description: 'Heavy-duty steel. Shells a 50kg bag in about 20 minutes.',
        price: '4500',
        category: 'agriculture-tools',
        condition: 'NEW',
        quantity: 3,
      },
      {
        title: "Children's school shoes, sizes 28–35",
        description: 'Black leather school shoes. Tell us the size in a message.',
        price: '350',
        category: 'shoes',
        condition: 'NEW',
        quantity: 25,
      },
    ],
  },
];

const DEMO_BUYERS = [
  { email: 'buyer.zm@demo.tzed.local', name: 'Natasha Phiri', country: 'ZM' },
  { email: 'buyer.tz@demo.tzed.local', name: 'Baraka Said', country: 'TZ' },
] as const;

async function seedDemoData() {
  const passwordHash = await argon2.hash('demo-password');
  const countries = await prisma.country.findMany({ include: { regions: true } });
  const byCode = Object.fromEntries(countries.map((c) => [c.code, c]));
  const categories = Object.fromEntries(
    (await prisma.category.findMany()).map((c) => [c.slug, c.id]),
  );
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  for (const b of DEMO_BUYERS) {
    await prisma.user.upsert({
      where: { email: b.email },
      update: {},
      create: {
        email: b.email,
        name: b.name,
        passwordHash,
        countryId: byCode[b.country]!.id,
        emailVerifiedAt: new Date(),
        consentAt: new Date(),
      },
    });
  }

  for (const s of DEMO_SELLERS) {
    const country = byCode[s.country]!;
    const region = country.regions.find((r) => r.name === s.region)!;
    const other = countries.find((c) => c.id !== country.id)!;

    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        name: s.name,
        passwordHash,
        countryId: country.id,
        emailVerifiedAt: new Date(),
        consentAt: new Date(),
        sellerProfile: {
          create: { shopName: s.shopName, slug: s.slug, regionId: region.id, town: s.town },
        },
      },
    });

    if (await prisma.listing.count({ where: { sellerId: user.id } })) continue;

    for (const l of s.listings) {
      const status = l.status ?? 'ACTIVE';
      const submittedAt = new Date();
      await prisma.listing.create({
        data: {
          sellerId: user.id,
          categoryId: categories[l.category]!,
          title: l.title,
          description: l.description,
          price: l.price,
          currency: country.currencyCode,
          condition: l.condition,
          quantity: l.quantity ?? 1,
          countryId: country.id,
          regionId: region.id,
          town: s.town,
          deliveryPickup: true,
          deliveryLocal: true,
          deliveryCrossBorder: l.crossBorder ?? false,
          deliveryNotes: l.deliveryNotes,
          status,
          rejectionReason: l.rejectionReason,
          submittedAt,
          publishedAt: status === 'ACTIVE' ? new Date() : null,
          shipTo: {
            create: [
              { countryId: country.id },
              ...(l.crossBorder ? [{ countryId: other.id }] : []),
            ],
          },
          reviewEvents: {
            create: [
              { actorId: user.id, decision: 'SUBMITTED' },
              ...(status === 'PENDING_REVIEW'
                ? []
                : [
                    {
                      actorId: admin?.id ?? null,
                      decision: status === 'ACTIVE' ? ('APPROVED' as const) : ('REJECTED' as const),
                      reason: l.rejectionReason,
                    },
                  ]),
            ],
          },
        },
      });
    }
  }
  console.log('Demo data: sellers, buyers and listings (password: demo-password)');
}

async function main() {
  await seedReferenceData();
  console.log('Reference data: countries, regions, exchange rate, categories, help articles');
  await seedAdmin();
  if (!isProduction || process.env.SEED_DEMO === 'true') {
    await seedDemoData();
  }
}

// Only run when executed directly (tests import seedReferenceData).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
