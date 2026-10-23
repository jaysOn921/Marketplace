import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { resetDb } from '../../test/db.js';

const app = createApp();

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('GET /api/v1/rates', () => {
  it('returns the current ZMW→TZS rate', async () => {
    const res = await request(app).get('/api/v1/rates');
    expect(res.status).toBe(200);
    expect(res.body.rates).toEqual([
      { base: 'ZMW', quote: 'TZS', rate: 105, effectiveAt: expect.any(String) },
    ]);
  });

  it('uses the newest rate and ignores future-dated ones', async () => {
    const pair = { baseCurrency: 'ZMW', quoteCurrency: 'TZS' };
    await prisma.exchangeRate.create({ data: { ...pair, rate: '98.75' } });
    await prisma.exchangeRate.create({
      data: { ...pair, rate: '200', effectiveAt: new Date(Date.now() + 86_400_000) },
    });

    const res = await request(app).get('/api/v1/rates');
    expect(res.body.rates).toHaveLength(1);
    expect(res.body.rates[0].rate).toBe(98.75);
  });

  it('returns an empty list when no rate has been set', async () => {
    await prisma.exchangeRate.deleteMany();
    const res = await request(app).get('/api/v1/rates');
    expect(res.status).toBe(200);
    expect(res.body.rates).toEqual([]);
  });
});

describe('GET /api/v1/countries', () => {
  it('lists Tanzania with 31 regions and Zambia with 10 provinces', async () => {
    const res = await request(app).get('/api/v1/countries');
    expect(res.status).toBe(200);
    const [tz, zm] = res.body.countries;
    expect(tz).toMatchObject({ code: 'TZ', currencyCode: 'TZS', phonePrefix: '+255' });
    expect(tz.regions).toHaveLength(31);
    expect(zm).toMatchObject({ code: 'ZM', currencyCode: 'ZMW', phonePrefix: '+260' });
    expect(zm.regions).toHaveLength(10);
  });
});

describe('seedReferenceData', () => {
  it('can run twice without duplicating anything', async () => {
    await seedReferenceData(prisma);
    expect(await prisma.country.count()).toBe(2);
    expect(await prisma.region.count()).toBe(41);
    expect(await prisma.exchangeRate.count()).toBe(1);
  });
});
