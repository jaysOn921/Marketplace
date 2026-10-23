import { describe, expect, it } from 'vitest';
import { availableOrderActions } from './orders.js';

describe('availableOrderActions', () => {
  it('lets the seller accept or decline a new order, and the buyer cancel', () => {
    const order = { status: 'PLACED', paymentStatus: 'UNPAID' } as const;
    expect(availableOrderActions(order, 'seller')).toEqual(['accept', 'decline', 'cancel']);
    expect(availableOrderActions(order, 'buyer')).toEqual(['cancel']);
  });

  it('lets either side complete a ready order and only the seller record payment', () => {
    const order = { status: 'READY', paymentStatus: 'UNPAID' } as const;
    expect(availableOrderActions(order, 'seller')).toEqual(['complete', 'mark-paid']);
    expect(availableOrderActions(order, 'buyer')).toEqual(['complete']);
    expect(availableOrderActions({ ...order, paymentStatus: 'PAID_OFFLINE' }, 'seller')).toEqual([
      'complete',
    ]);
  });

  it('offers nothing on finished orders except recording a late payment', () => {
    expect(
      availableOrderActions({ status: 'CANCELLED', paymentStatus: 'UNPAID' }, 'seller'),
    ).toEqual([]);
    expect(
      availableOrderActions({ status: 'COMPLETED', paymentStatus: 'UNPAID' }, 'seller'),
    ).toEqual(['mark-paid']);
  });
});
