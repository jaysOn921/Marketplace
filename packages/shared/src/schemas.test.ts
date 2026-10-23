import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';
import { registerSchema, sellerProfileSchema } from './schemas.js';

describe('normalizePhone', () => {
  it('normalises Tanzanian numbers', () => {
    expect(normalizePhone('0712 345 678', 'TZ')).toBe('+255712345678');
    expect(normalizePhone('+255 712-345-678', 'TZ')).toBe('+255712345678');
    expect(normalizePhone('255712345678', 'TZ')).toBe('+255712345678');
    expect(normalizePhone('712345678', 'TZ')).toBe('+255712345678');
  });

  it('normalises Zambian numbers', () => {
    expect(normalizePhone('0977 123 456', 'ZM')).toBe('+260977123456');
    expect(normalizePhone('00260977123456', 'ZM')).toBe('+260977123456');
  });

  it('rejects numbers for the wrong country or length', () => {
    expect(normalizePhone('+260977123456', 'TZ')).toBeNull();
    expect(normalizePhone('07123', 'TZ')).toBeNull();
    expect(normalizePhone('abc', 'ZM')).toBeNull();
  });
});

describe('registerSchema', () => {
  const valid = {
    name: '  Amina  ',
    email: ' Amina@Example.COM ',
    password: 'longenough',
    countryCode: 'TZ',
    phone: '0712 345 678',
    consent: true,
  } as const;

  it('trims, lowercases and normalises the phone number', () => {
    expect(registerSchema.parse(valid)).toEqual({
      name: 'Amina',
      email: 'amina@example.com',
      password: 'longenough',
      countryCode: 'TZ',
      phone: '+255712345678',
      consent: true,
    });
  });

  it('allows no phone number', () => {
    expect(registerSchema.parse({ ...valid, phone: '' }).phone).toBeUndefined();
  });

  it('reports field errors', () => {
    const result = registerSchema.safeParse({
      ...valid,
      email: 'nope',
      password: 'short',
      phone: '0977123456x',
      consent: false,
    });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((i) => i.path.join('.'));
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'consent']));
  });

  it('reports a bad phone number together with other errors', () => {
    const result = registerSchema.safeParse({ ...valid, name: '', phone: '12' });
    const fields = result.error!.issues.map((i) => i.path.join('.'));
    expect(fields).toEqual(expect.arrayContaining(['name', 'phone']));
  });

  it('checks the phone against the chosen country', () => {
    const result = registerSchema.safeParse({
      ...valid,
      countryCode: 'ZM',
      phone: '+255712345678',
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['phone'],
      message: expect.stringContaining('Zambian'),
    });
  });
});

describe('sellerProfileSchema', () => {
  it('coerces region id and defaults contact preference', () => {
    expect(
      sellerProfileSchema.parse({ shopName: 'Shop', regionId: '3', town: 'Mbeya', bio: '' }),
    ).toEqual({
      shopName: 'Shop',
      regionId: 3,
      town: 'Mbeya',
      bio: null,
      contactPreference: 'MESSAGES',
    });
  });
});
