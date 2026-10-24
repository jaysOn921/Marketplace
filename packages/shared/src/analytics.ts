import { z } from 'zod';
import type { CountryCode, CurrencyCode } from './constants.js';
import type { ListingStatus } from './listings.js';
import type { OrderStatus } from './orders.js';

export const ANALYTICS_PERIODS = [7, 30, 90, 365] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine((d): d is AnalyticsPeriod => (ANALYTICS_PERIODS as readonly number[]).includes(d))
    .catch(30),
});

/** A figure for the chosen period and the same-length period before it. */
export interface Kpi {
  value: number;
  previous: number;
}

export interface DailyPoint {
  /** YYYY-MM-DD (UTC) */
  day: string;
  value: number;
}

export interface AdminAnalytics {
  days: AnalyticsPeriod;
  from: string;
  to: string;
  /** Sales are added up in shillings, converting kwacha at the current rate. */
  rate: number | null;
  kpis: {
    newUsers: Kpi;
    newListings: Kpi;
    ordersPlaced: Kpi;
    ordersCompleted: Kpi;
    /** Completed orders, in TZS. */
    sales: Kpi;
    views: Kpi;
    cartAdds: Kpi;
  };
  daily: { orders: DailyPoint[]; sales: DailyPoint[]; views: DailyPoint[]; newUsers: DailyPoint[] };
  countries: {
    code: CountryCode;
    newUsers: number;
    /** Orders placed by buyers in this country. */
    ordersAsBuyer: number;
    /** Completed sales by sellers in this country, in their currency. */
    sales: number;
    currency: CurrencyCode;
  }[];
  /** Orders where buyer and seller are in different countries. */
  crossBorderOrders: number;
  topCategories: { slug: string; name: string; units: number; orders: number }[];
  topSellers: {
    id: number;
    name: string;
    shopSlug: string | null;
    countryCode: CountryCode;
    orders: number;
    /** Completed sales in TZS. */
    sales: number;
  }[];
  /** Orders placed in the period, by their status now. */
  statuses: { status: OrderStatus; count: number }[];
}

export interface SellerListingStats {
  id: number;
  title: string;
  status: ListingStatus;
  views: number;
  cartAdds: number;
  orders: number;
  units: number;
  /** Completed sales, in the seller's currency. */
  sales: number;
}

export interface SellerAnalytics {
  days: AnalyticsPeriod;
  from: string;
  to: string;
  currency: CurrencyCode;
  kpis: {
    views: Kpi;
    cartAdds: Kpi;
    ordersPlaced: Kpi;
    unitsSold: Kpi;
    /** Completed orders, in the seller's currency. */
    sales: Kpi;
  };
  daily: { views: DailyPoint[]; orders: DailyPoint[] };
  listings: SellerListingStats[];
}
