import { describe, expect, it } from 'vitest';
import { reviewSchema, shortName } from './reviews.js';

describe('reviews', () => {
  it('shortens names for privacy', () => {
    expect(shortName('Natasha Phiri')).toBe('Natasha P.');
    expect(shortName('  Baraka  Said  Juma ')).toBe('Baraka J.');
    expect(shortName('Amina')).toBe('Amina');
  });

  it('needs 1 to 5 whole stars', () => {
    expect(reviewSchema.parse({ rating: '5', comment: ' Great! ' })).toEqual({
      rating: 5,
      comment: 'Great!',
    });
    expect(reviewSchema.parse({ rating: 3 }).comment).toBeNull();
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
  });
});
