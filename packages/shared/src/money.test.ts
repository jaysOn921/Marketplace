import { describe, expect, it } from 'vitest';
import {
  convertMoney,
  conversionFactor,
  formatAmount,
  formatMoney,
  parseAmount,
  roundMoney,
} from './money.js';

const rate = { base: 'ZMW', quote: 'TZS', rate: 105.5 } as const;

describe('formatMoney', () => {
  it('shows shillings as whole numbers and kwacha with ngwee', () => {
    expect(formatMoney(25000, 'TZS')).toBe('TSh 25,000');
    expect(formatMoney(1250, 'ZMW')).toBe('K 1,250.00');
    expect(formatMoney('1250.5', 'ZMW')).toBe('K 1,250.50');
    expect(formatMoney(2499.6, 'TZS')).toBe('TSh 2,500');
  });

  it('handles negatives', () => {
    expect(formatMoney(-12.345, 'ZMW')).toBe('-K 12.35');
  });
});

describe('roundMoney', () => {
  it('rounds to the currency minor units', () => {
    expect(roundMoney(1.005, 'ZMW')).toBe(1.01);
    expect(roundMoney(100.5, 'TZS')).toBe(101);
  });
});

describe('parseAmount', () => {
  it('accepts commas, spaces and currency prefixes', () => {
    expect(parseAmount('25,000')).toBe(25000);
    expect(parseAmount('1 250.5')).toBe(1250.5);
    expect(parseAmount('K 300')).toBe(300);
    expect(parseAmount('TSh 10,000')).toBe(10000);
  });

  it('rejects empty or invalid input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
  });
});

describe('conversion', () => {
  it('converts kwacha to shillings with the stored rate', () => {
    expect(convertMoney(100, 'ZMW', 'TZS', rate)).toBe(10550);
  });

  it('converts shillings to kwacha with the inverse of the same rate', () => {
    expect(convertMoney(10550, 'TZS', 'ZMW', rate)).toBe(100);
    expect(convertMoney(1000, 'TZS', 'ZMW', rate)).toBe(9.48);
  });

  it('keeps both directions consistent', () => {
    const there = conversionFactor('ZMW', 'TZS', rate);
    const back = conversionFactor('TZS', 'ZMW', rate);
    expect(there * back).toBeCloseTo(1, 12);
  });

  it('returns the same amount for the same currency', () => {
    expect(convertMoney(123.456, 'ZMW', 'ZMW', rate)).toBe(123.46);
  });

  it('formats converted amounts for input boxes', () => {
    expect(formatAmount(10550, 'TZS')).toBe('10,550');
    expect(formatAmount(9.4787, 'ZMW')).toBe('9.48');
    expect(formatAmount(9.5, 'ZMW')).toBe('9.5');
  });
});
