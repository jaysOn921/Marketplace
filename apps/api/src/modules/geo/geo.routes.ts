import { Router } from 'express';
import type { CountriesResponse, RatesResponse } from '@tzed/shared';
import { getCountries, getCurrentRates } from './geo.service.js';

export const geoRouter = Router();

// Public: used by the currency converter and price displays.
geoRouter.get('/rates', async (_req, res) => {
  const body: RatesResponse = { rates: await getCurrentRates() };
  res.set('Cache-Control', 'public, max-age=60').json(body);
});

geoRouter.get('/countries', async (_req, res) => {
  const body: CountriesResponse = { countries: await getCountries() };
  res.set('Cache-Control', 'public, max-age=300').json(body);
});
