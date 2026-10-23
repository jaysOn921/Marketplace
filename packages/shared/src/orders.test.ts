import { describe, expect, it } from 'vitest';
import { availableOrderActions } from './orders.js';

describe('availableOrderActions', () => {
  it('lets the seller accept or decline a new order, and the buyer cancel', () => {
    const order = { status: 'PLACED', paymentStatus: 'UNPAID' } as const;
    expect(availableOrderActions(order, 'seller')).toEqual(['accept', 'decline', 'cancel']);
    expect(availableOrderActions(order, 'buyer')).toEqual(['cancel']);
  });

  it('lets the buyer confirm receipt and report payment, and only the seller complete', () => {
    const order = { status: 'READY', paymentStatus: 'UNPAID' } as const;
    expect(availableOrderActions(order, 'buyer')).toEqual(['received', 'report-paid']);
    expect(availableOrderActions(order, 'seller')).toEqual(['complete', 'mark-paid']);
  });

  it('hides buyer confirmations once given, and blocks cancelling after receipt', () => {
    const order = {
      status: 'ACCEPTED',
      paymentStatus: 'UNPAID',
      buyerPaidAt: 'x',
      receivedAt: 'y',
    } as const;
    expect(availableOrderActions(order, 'buyer')).toEqual([]);
    expect(availableOrderActions(order, 'seller')).toEqual(['ready', 'complete', 'mark-paid']);
  });

  it('offers nothing on finished orders except recording a late payment', () => {
    expect(
      availableOrderActions({ status: 'CANCELLED', paymentStatus: 'UNPAID' }, 'seller'),
    ).toEqual([]);
    expect(
      availableOrderActions({ status: 'COMPLETED', paymentStatus: 'UNPAID' }, 'seller'),
    ).toEqual(['mark-paid']);
    expect(
      availableOrderActions({ status: 'COMPLETED', paymentStatus: 'PAID_OFFLINE' }, 'buyer'),
    ).toEqual([]);
  });
});
