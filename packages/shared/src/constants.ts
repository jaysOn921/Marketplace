export const APP_NAME = 'TZed';

export const API_PREFIX = '/api/v1';

export const COUNTRY_CODES = ['TZ', 'ZM'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export const CURRENCY_CODES = ['TZS', 'ZMW'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
