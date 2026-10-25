import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../prisma/seed.js';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { testClient } from '../test/client.js';
import { resetDb } from '../test/db.js';
import { createListing, createSeller, createUser, TEST_PASSWORD } from '../test/factories.js';
import { localeFrom, translate } from './i18n.js';
import { SW } from './i18n-sw.js';

describe('translate', () => {
  it('translates exact text and templates, including the parts that change', () => {
    expect(translate('Order not found.', 'sw')).toBe('Oda haikupatikana.');
    expect(translate('Order not found.', 'en')).toBe('Order not found.');
    expect(translate('Only 3 available.', 'sw')).toBe('Zinapatikana 3 tu.');
    expect(translate('The order for “Radio” was cancelled. Reason: Sold out', 'sw')).toBe(
      'Oda ya “Radio” imeghairiwa. Sababu: Sold out',
    );
    expect(translate('The order for “Radio” was cancelled.', 'sw')).toBe(
      'Oda ya “Radio” imeghairiwa.',
    );
    expect(translate('The buyer reported: item damaged.', 'sw')).toBe(
      'Mnunuzi ameripoti: bidhaa imeharibika.',
    );
    expect(translate('Text with no translation', 'sw')).toBe('Text with no translation');
  });

  it('uses the same placeholders on both sides of the catalog', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [en, sw] of Object.entries(SW)) expect(names(sw), en).toEqual(names(en));
  });

  it('reads the language from the header', () => {
    expect(localeFrom('sw')).toBe('sw');
    expect(localeFrom('sw-TZ,en;q=0.8')).toBe('sw');
    expect(localeFrom('en-GB')).toBe('en');
    expect(localeFrom(undefined)).toBe('en');
  });
});

describe('server messages in Swahili', () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
    await seedReferenceData(prisma);
  });

  it('answers errors in the language asked for', async () => {
    const client = await testClient(app);
    const sw = await client.post(
      '/auth/login',
      { email: 'nobody@example.com', password: 'x' },
      { 'Accept-Language': 'sw' },
    );
    expect(sw.body.error.message).toBe('Barua pepe au nenosiri si sahihi.');
    const fields = await client.post('/auth/register', {}, { 'Accept-Language': 'sw' });
    expect(fields.body.error.message).toBe('Tafadhali angalia sehemu zilizowekwa alama.');
    const en = await client.post('/auth/login', { email: 'nobody@example.com', password: 'x' });
    expect(en.body.error.message).toBe('Email or password is incorrect.');
  });

  it('remembers each person’s language and sends their notifications in it', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller, { title: 'Kitenge fabric' });
    const buyer = await createUser({ countryCode: 'TZ', name: 'Baraka Said' });
    const sellerClient = await testClient(app);
    await sellerClient.post('/auth/login', { email: seller.email, password: TEST_PASSWORD });
    await sellerClient.get('/me', { 'Accept-Language': 'sw' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).locale).toBe('sw');

    const buyerClient = await testClient(app);
    await buyerClient.post('/auth/login', { email: buyer.email, password: TEST_PASSWORD });
    await buyerClient.post('/orders', {
      listingId: listing.id,
      quantity: 1,
      deliveryMethod: 'PICKUP',
    });
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: seller.id, type: 'order.placed' },
    });
    expect(note.title).toBe('Oda mpya');
    expect(note.body).toMatch(
      /^Baraka Said ameagiza 1 × “Kitenge fabric” \(.+\)\. Ikubali au uikatae\.$/,
    );
  });
});
