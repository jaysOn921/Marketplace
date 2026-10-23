import type { CurrencyCode } from './constants.js';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  /** Digits after the decimal point: TZS is whole shillings, ZMW has ngwee. */
  minorUnits: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  TZS: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian shilling', minorUnits: 0 },
  ZMW: { code: 'ZMW', symbol: 'K', name: 'Zambian kwacha', minorUnits: 2 },
};

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}

/** Rounds to the currency's minor units (half away from zero). */
export function roundMoney(amount: number, currency: CurrencyCode): number {
  const factor = 10 ** CURRENCIES[currency].minorUnits;
  const rounded = Math.round((Math.abs(amount) + Number.EPSILON) * factor) / factor;
  return Math.sign(amount) * rounded;
}

/** Formats an amount for display, e.g. `TSh 25,000` or `K 1,250.00`. */
export function formatMoney(amount: number | string, currency: CurrencyCode): string {
  const { symbol, minorUnits } = CURRENCIES[currency];
  const value = roundMoney(Number(amount), currency);
  const digits = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  }).format(Math.abs(value));
  return `${value < 0 ? '-' : ''}${symbol} ${digits}`;
}

/** Formats a number for an input box without the symbol, e.g. `25,000` or `1,250.50`. */
export function formatAmount(amount: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: CURRENCIES[currency].minorUnits,
  }).format(roundMoney(amount, currency));
}

/**
 * Parses what a user typed ("25,000", "1 250.5", "K 300") into a number.
 * Returns null for empty or invalid input.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, '').replace(/^(TSh|TZS|ZMW|K)/i, '');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** A stored exchange rate: 1 `base` = `rate` `quote`. */
export interface ExchangeRateInfo {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  effectiveAt: string;
}

/** Unrounded conversion factor from one currency to another using a single stored rate. */
export function conversionFactor(
  from: CurrencyCode,
  to: CurrencyCode,
  rate: Pick<ExchangeRateInfo, 'base' | 'quote' | 'rate'>,
): number {
  if (from === to) return 1;
  if (from === rate.base && to === rate.quote) return rate.rate;
  if (from === rate.quote && to === rate.base) return 1 / rate.rate;
  throw new Error(`No exchange rate for ${from} → ${to}`);
}

/** Converts an amount and rounds it to the target currency's minor units. */
export function convertMoney(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: Pick<ExchangeRateInfo, 'base' | 'quote' | 'rate'>,
): number {
  return roundMoney(amount * conversionFactor(from, to, rate), to);
}
