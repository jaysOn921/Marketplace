import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, CURRENCY_CODES } from './constants.js';

describe('constants', () => {
  it('covers Tanzania and Zambia', () => {
    expect(COUNTRY_CODES).toEqual(['TZ', 'ZM']);
    expect(CURRENCY_CODES).toEqual(['TZS', 'ZMW']);
  });
});
