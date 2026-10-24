import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../test/utils';

const order = {
  id: 41,
  status: 'COMPLETED',
  paymentStatus: 'PAID_OFFLINE',
  role: 'buyer',
  title: 'Kitenge fabric',
  quantity: 1,
  currency: 'TZS',
  total: 25000,
  buyerCurrency: 'ZMW',
  buyerTotal: 238.1,
  deliveryMethod: 'CROSS_BORDER',
  coverImage: null,
  otherParty: 'Mbeya Kitenge',
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-22T10:00:00.000Z',
  itemCount: 1,
  dispute: null,
  canDispute: true,
  deliveryDays: null,
  listingId: 7,
  unitPrice: 25000,
  items: [
    {
      listingId: 7,
      title: 'Kitenge fabric',
      unitPrice: 25000,
      quantity: 1,
      lineTotal: 25000,
      coverImage: null,
    },
  ],
  fxRate: 1 / 105,
  deliveryNotes: null,
  buyerNote: null,
  cancelReason: null,
  buyer: { id: 5, name: 'Natasha Phiri', countryCode: 'ZM', phone: null },
  seller: {
    id: 4,
    name: 'Joseph M',
    countryCode: 'TZ',
    phone: null,
    shopName: 'Mbeya Kitenge',
    shopSlug: 'mbeya-kitenge',
  },
  sellerTown: 'Mbeya',
  events: [],
  actions: [],
  acceptedAt: null,
  buyerPaidAt: null,
  receivedAt: null,
  completedAt: '2026-10-22T10:00:00.000Z',
  cancelledAt: null,
  conversationId: null,
};

describe('Leaving a review', () => {
  it('asks for a star rating, then shows the review', async () => {
    let current: Record<string, unknown> = { ...order, review: null, canReview: true };
    let sent: unknown;
    mockApi(
      {
        'GET /orders/41': () => ({ body: { order: current } }),
        'POST /orders/41/review': (body) => {
          sent = body;
          current = {
            ...current,
            canReview: false,
            review: { rating: 4, comment: 'Lovely fabric', createdAt: '2026-10-23T10:00:00.000Z' },
          };
          return { status: 201, body: { ok: true } };
        },
      },
      { user: sampleUser },
    );
    renderApp('/orders/41');
    expect(
      await screen.findByRole('heading', { name: 'How was your experience with Mbeya Kitenge?' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(screen.getByText('Choose a rating from 1 to 5 stars.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(screen.getByText('Very good')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Comment (optional)'), 'Lovely fabric');
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(await screen.findByRole('heading', { name: 'Your review' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
    expect(sent).toEqual({ rating: 4, comment: 'Lovely fabric' });
  });
});

describe('Shop reviews', () => {
  it('shows the average, breakdown and reviews', async () => {
    mockApi({
      'GET /shops/mbeya-kitenge': () => ({
        body: {
          shop: {
            shopName: 'Mbeya Kitenge',
            slug: 'mbeya-kitenge',
            bio: null,
            town: 'Mbeya',
            regionName: 'Mbeya',
            countryCode: 'TZ',
            memberSince: '2026-01-01T00:00:00.000Z',
            activeListings: 0,
            trust: { verified: false, completedOrders: 0, replyTime: null },
            rating: { average: 4.5, count: 2 },
          },
        },
      }),
      'GET /search': () => ({
        body: {
          results: [],
          total: 0,
          page: 1,
          pageSize: 24,
          pageCount: 1,
          sort: 'newest',
          matchMode: null,
          category: null,
          facets: { categories: [], countries: [] },
        },
      }),
      'GET /shops/mbeya-kitenge/reviews': () => ({
        body: {
          rating: { average: 4.5, count: 2 },
          breakdown: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
          page: 1,
          pageCount: 1,
          reviews: [
            {
              id: 2,
              rating: 5,
              comment: 'Fast delivery to Lusaka',
              reviewerName: 'Natasha P.',
              reviewerCountry: 'ZM',
              listingTitle: 'Kitenge fabric',
              createdAt: '2026-10-22T00:00:00.000Z',
            },
            {
              id: 1,
              rating: 4,
              comment: null,
              reviewerName: 'Baraka S.',
              reviewerCountry: 'TZ',
              listingTitle: 'Kitenge fabric',
              createdAt: '2026-10-21T00:00:00.000Z',
            },
          ],
        },
      }),
    });
    renderApp('/shop/mbeya-kitenge');
    expect(await screen.findByRole('heading', { name: 'Reviews' })).toBeInTheDocument();
    expect(screen.getByText('Fast delivery to Lusaka')).toBeInTheDocument();
    expect(screen.getByText(/Natasha P\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('(2 reviews)').length).toBeGreaterThan(0));
  });
});
