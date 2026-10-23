import type { CountryCode, CurrencyCode } from './constants.js';
import type { ExchangeRateInfo } from './money.js';

/** Shape of every error response returned by the API. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  app: string;
  version: string;
  time: string;
  db: 'ok' | 'error';
}

export interface RatesResponse {
  rates: ExchangeRateInfo[];
}

export interface RegionDto {
  id: number;
  name: string;
}

export interface CountryDto {
  code: CountryCode;
  name: string;
  currencyCode: CurrencyCode;
  phonePrefix: string;
  regions: RegionDto[];
}

export interface CountriesResponse {
  countries: CountryDto[];
}

export interface SellerProfileDto {
  shopName: string;
  slug: string;
  bio: string | null;
  regionId: number | null;
  regionName: string | null;
  town: string | null;
  contactPreference: 'MESSAGES' | 'PHONE' | 'BOTH';
}

/** The signed-in user, as returned by GET /auth/me. */
export interface SessionUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  countryCode: CountryCode;
  currency: CurrencyCode;
  role: 'USER' | 'ADMIN';
  emailVerified: boolean;
  createdAt: string;
  sellerProfile: SellerProfileDto | null;
}

export interface MeResponse {
  user: SessionUser | null;
}

export interface CsrfResponse {
  csrfToken: string;
}
