import type { CountryCode } from './constants.js';

const PREFIX: Record<CountryCode, string> = { TZ: '255', ZM: '260' };

/**
 * Normalises a Tanzanian or Zambian phone number to E.164 (+255712345678).
 * Accepts local (0712 345 678), national (712345678) and international forms.
 * Returns null if it isn't a valid 9-digit subscriber number for that country.
 */
export function normalizePhone(input: string, country: CountryCode): string | null {
  let digits = input.replace(/[\s().-]/g, '');
  const prefix = PREFIX[country];
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith(prefix)) digits = digits.slice(prefix.length);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  return /^[1-9]\d{8}$/.test(digits) ? `+${prefix}${digits}` : null;
}
