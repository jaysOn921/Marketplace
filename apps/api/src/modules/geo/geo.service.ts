import type { CountryDto, ExchangeRateInfo } from '@tzed/shared';
import { isCurrencyCode } from '@tzed/shared';
import { prisma } from '../../db.js';

/** The latest rate for every currency pair that has one. */
export async function getCurrentRates(): Promise<ExchangeRateInfo[]> {
  const pairs = await prisma.exchangeRate.groupBy({
    by: ['baseCurrency', 'quoteCurrency'],
    where: { effectiveAt: { lte: new Date() } },
  });

  const latest = await Promise.all(
    pairs.map((p) =>
      prisma.exchangeRate.findFirst({
        where: {
          baseCurrency: p.baseCurrency,
          quoteCurrency: p.quoteCurrency,
          effectiveAt: { lte: new Date() },
        },
        orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
      }),
    ),
  );

  return latest.flatMap((r) =>
    r && isCurrencyCode(r.baseCurrency) && isCurrencyCode(r.quoteCurrency)
      ? [
          {
            base: r.baseCurrency,
            quote: r.quoteCurrency,
            rate: r.rate.toNumber(),
            effectiveAt: r.effectiveAt.toISOString(),
          },
        ]
      : [],
  );
}

export async function getCountries(): Promise<CountryDto[]> {
  const countries = await prisma.country.findMany({
    orderBy: { name: 'asc' },
    include: { regions: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
  });
  return countries.map((c) => ({
    code: c.code as CountryDto['code'],
    name: c.name,
    currencyCode: c.currencyCode as CountryDto['currencyCode'],
    phonePrefix: c.phonePrefix,
    regions: c.regions,
  }));
}
