import type { CartResponse } from '@tzed/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../test/utils';

const counts = { notifications: 0, messages: 0, ordersToAct: 0, reviewQueue: 0, openReports: 0 };

function cart(overrides: Partial<CartResponse> = {}): CartResponse {
  return {
    buyerCurrency: 'ZMW',
    total: 4376.19,
    count: 4,
    groups: [
      {
        seller: {
          id: 4,
          name: 'Amina M',
          shopName: 'Mbeya Kitenge',
          shopSlug: 'mbeya-kitenge',
          countryCode: 'TZ',
          town: 'Mbeya',
        },
        currency: 'TZS',
        subtotal: 92000,
        buyerSubtotal: 876.19,
        deliveryMethods: ['PICKUP', 'CROSS_BORDER'],
        items: [
          {
            listingId: 7,
            title: 'Kitenge fabric',
            coverImage: null,
            unitPrice: 25000,
            quantity: 2,
            available: 10,
            lineTotal: 50000,
            problem: null,
          },
          {
            listingId: 8,
            title: 'Solar radio',
            coverImage: null,
            unitPrice: 42000,
            quantity: 1,
            available: 2,
            lineTotal: 42000,
            problem: null,
          },
        ],
      },
      {
        seller: {
          id: 9,
          name: 'Mwila B',
          shopName: 'Mwila Home',
          shopSlug: 'mwila-home',
          countryCode: 'ZM',
          town: 'Lusaka',
        },
        currency: 'ZMW',
        subtotal: 3500,
        buyerSubtotal: 3500,
        deliveryMethods: ['LOCAL'],
        items: [
          {
            listingId: 12,
            title: 'Sofa',
            coverImage: null,
            unitPrice: 3500,
            quantity: 1,
            available: 1,
            lineTotal: 3500,
            problem: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Cart', () => {
  it('shows each seller with a subtotal in both currencies, and places one order per seller', async () => {
    let sent: unknown;
    mockApi(
      {
        'GET /me/counts': () => ({ body: { ...counts, cart: 4 } }),
        'GET /cart': () => ({ body: cart() }),
        'POST /cart/checkout': (body) => {
          sent = body;
          return { status: 201, body: { orderIds: [51, 52] } };
        },
        'GET /orders': () => ({ body: { orders: [], needsAction: 0 } }),
      },
      { user: sampleUser },
    );
    renderApp('/cart');
    const tz = await screen.findByRole('region', { name: /Mbeya Kitenge/ });
    expect(within(tz).getByText('TSh 92,000')).toBeInTheDocument();
    expect(within(tz).getByText('≈ K 876.19')).toBeInTheDocument();
    expect(screen.getByLabelText('Cart, 4 items')).toBeInTheDocument();

    // The Zambian seller offers one option, which is picked; the other needs a choice.
    const button = screen.getByRole('button', { name: 'Place 2 orders' });
    await userEvent.click(button);
    expect(within(tz).getByText('Choose how you want to get these items.')).toBeInTheDocument();
    expect(sent).toBeUndefined();

    await userEvent.click(within(tz).getByLabelText('Send to me in Zambia (cross-border)'));
    await userEvent.type(within(tz).getByLabelText('Note to the seller (optional)'), 'By bus');
    await userEvent.click(button);
    await waitFor(() =>
      expect(sent).toEqual({
        orders: [
          { sellerId: 4, deliveryMethod: 'CROSS_BORDER', buyerNote: 'By bus' },
          { sellerId: 9, deliveryMethod: 'LOCAL', buyerNote: '' },
        ],
      }),
    );
    expect(
      await screen.findByText(/Your 2 orders have been sent to the sellers/),
    ).toBeInTheDocument();
  });

  it('can leave a seller out, and blocks a seller with an item that sold out', async () => {
    const soldOut = cart();
    soldOut.groups[1]!.items[0]!.problem = 'UNAVAILABLE';
    mockApi(
      {
        'GET /me/counts': () => ({ body: { ...counts, cart: 4 } }),
        'GET /cart': () => ({ body: soldOut }),
      },
      { user: sampleUser },
    );
    renderApp('/cart');
    const zm = await screen.findByRole('region', { name: /Mwila Home/ });
    expect(within(zm).getByText('No longer available.')).toBeInTheDocument();
    expect(within(zm).getByLabelText('Order now')).toBeDisabled();
    const tz = screen.getByRole('region', { name: /Mbeya Kitenge/ });
    expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled();
    await userEvent.click(within(tz).getByLabelText('Order now'));
    expect(screen.getByRole('button', { name: 'Place 0 orders' })).toBeDisabled();
  });

  it('changes a quantity and removes an item', async () => {
    const calls: string[] = [];
    mockApi(
      {
        'GET /me/counts': () => ({ body: { ...counts, cart: 4 } }),
        'GET /cart': () => ({ body: cart() }),
        'PATCH /cart/items/7': (body) => {
          calls.push(`patch ${JSON.stringify(body)}`);
          return { body: cart() };
        },
        'DELETE /cart/items/8': () => {
          calls.push('delete 8');
          return { body: cart() };
        },
      },
      { user: sampleUser },
    );
    renderApp('/cart');
    const tz = await screen.findByRole('region', { name: /Mbeya Kitenge/ });
    const [kitengeQty] = within(tz).getAllByLabelText('Quantity');
    await userEvent.selectOptions(kitengeQty!, '3');
    await userEvent.click(within(tz).getByRole('button', { name: 'Remove Solar radio' }));
    await waitFor(() => expect(calls).toEqual(['patch {"quantity":3}', 'delete 8']));
  });

  it('says when the cart is empty', async () => {
    mockApi(
      {
        'GET /me/counts': () => ({ body: { ...counts, cart: 0 } }),
        'GET /cart': () => ({ body: cart({ groups: [], total: 0, count: 0 }) }),
      },
      { user: sampleUser },
    );
    renderApp('/cart');
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  });
});
