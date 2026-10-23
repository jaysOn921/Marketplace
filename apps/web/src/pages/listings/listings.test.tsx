import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListingDetail, ReviewQueueItem } from '@tzed/shared';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../../test/utils';

const seller = {
  ...sampleUser,
  countryCode: 'TZ' as const,
  currency: 'TZS' as const,
  sellerProfile: {
    shopName: 'Amina Electronics',
    slug: 'amina-electronics',
    bio: null,
    regionId: 1,
    regionName: 'Mbeya',
    town: 'Mbeya',
    contactPreference: 'MESSAGES' as const,
  },
};

const listing: ListingDetail = {
  id: 7,
  title: 'Samsung Galaxy A15, 128GB',
  price: 380000,
  currency: 'TZS',
  condition: 'NEW',
  status: 'ACTIVE',
  quantity: 3,
  countryCode: 'TZ',
  regionName: 'Mbeya',
  regionId: 1,
  town: 'Mbeya',
  crossBorder: true,
  coverImage: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  publishedAt: '2026-10-02T00:00:00.000Z',
  description: 'Brand new in box with charger.',
  categoryId: 3,
  category: {
    id: 3,
    name: 'Phones & tablets',
    slug: 'phones-tablets',
    parent: { id: 1, name: 'Electronics', slug: 'electronics' },
  },
  images: [
    {
      id: 1,
      url: '/uploads/a-full.webp',
      thumbUrl: '/uploads/a-thumb.webp',
      width: 800,
      height: 600,
    },
  ],
  deliveryPickup: true,
  deliveryLocal: false,
  deliveryNotes: 'Bus via Tunduma, 3–5 days.',
  shipTo: ['TZ', 'ZM'],
  seller: {
    shopName: 'Amina Electronics',
    slug: 'amina-electronics',
    town: 'Mbeya',
    regionName: 'Mbeya',
    countryCode: 'TZ',
    memberSince: '2026-01-01T00:00:00.000Z',
    rating: null,
  },
  rejectionReason: null,
  submittedAt: null,
  updatedAt: '2026-10-02T00:00:00.000Z',
  isOwner: false,
};

const categories = {
  categories: [
    {
      id: 1,
      name: 'Electronics',
      slug: 'electronics',
      children: [{ id: 3, name: 'Phones & tablets', slug: 'phones-tablets', children: [] }],
    },
    { id: 9, name: 'Other', slug: 'other', children: [] },
  ],
};

describe('Listing page', () => {
  it('shows the price in both currencies with a Convert link, and the cross-border notice', async () => {
    mockApi({ 'GET /listings/7': () => ({ body: { listing } }) });
    renderApp('/listings/7');
    expect(
      await screen.findByRole('heading', { level: 1, name: listing.title }),
    ).toBeInTheDocument();
    expect(screen.getByText('TSh 380,000')).toBeInTheDocument();
    expect(await screen.findByText(/≈ K 3,619\.05/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Convert' })).toHaveAttribute(
      'href',
      '/converter?amount=380000&from=TZS',
    );
    expect(screen.getByText('Available to buyers in Tanzania and Zambia')).toBeInTheDocument();
    expect(screen.getByText(/TZed doesn't handle customs/)).toBeInTheDocument();
    expect(screen.getByText('Can be sent to Zambia')).toBeInTheDocument();
  });

  it('shows a friendly message when the listing is not available', async () => {
    mockApi({
      'GET /listings/8': () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      }),
    });
    renderApp('/listings/8');
    expect(
      await screen.findByRole('heading', { name: "This listing isn't available" }),
    ).toBeInTheDocument();
  });
});

describe('New listing', () => {
  it('asks for a seller profile first', async () => {
    mockApi({}, { user: sampleUser });
    renderApp('/listings/new');
    expect(
      await screen.findByText(/Set up your seller profile before listing items/),
    ).toBeInTheDocument();
  });

  it('validates, shows the converted price as you type, and creates a draft', async () => {
    let sent: Record<string, unknown> | undefined;
    mockApi(
      {
        'GET /categories': () => ({ body: categories }),
        'POST /listings': (body) => {
          sent = body as Record<string, unknown>;
          return {
            status: 201,
            body: { listing: { ...listing, status: 'DRAFT', images: [], isOwner: true } },
          };
        },
        'GET /listings/7': () => ({
          body: { listing: { ...listing, status: 'DRAFT', images: [], isOwner: true } },
        }),
      },
      { user: seller },
    );
    renderApp('/listings/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Save and add photos' }));
    expect(screen.getByText('Use at least 5 characters.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Title'), 'Samsung Galaxy A15, 128GB');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Phones & tablets' })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Category'),
      screen.getByRole('option', { name: 'Phones & tablets' }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Condition'), 'New');
    await userEvent.type(screen.getByLabelText('Price (TZS)'), '380,000');
    expect(await screen.findByText(/TSh 380,000 ≈ K 3,619\.05/)).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText('Description'),
      'Brand new in box with charger and receipt.',
    );
    await userEvent.click(screen.getByLabelText(/Also sell to buyers in Zambia/));
    await userEvent.click(screen.getByRole('button', { name: 'Save and add photos' }));

    expect(await screen.findByText(/Draft saved\. Now add at least one photo/)).toBeInTheDocument();
    expect(sent).toMatchObject({
      price: '380000',
      categoryId: '3',
      condition: 'NEW',
      regionId: '1',
      town: 'Mbeya',
      crossBorder: true,
    });
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  });
});

describe('Admin review queue', () => {
  const item: ReviewQueueItem = {
    ...listing,
    status: 'PENDING_REVIEW',
    submittedAt: '2026-10-22T08:00:00.000Z',
    sellerAccount: {
      id: 4,
      name: 'Amina M',
      email: 'amina@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    wasPublished: true,
    history: [
      {
        decision: 'SUBMITTED',
        reason: null,
        actorName: 'Amina M',
        createdAt: '2026-10-22T08:00:00.000Z',
      },
    ],
  };

  it('approves a listing', async () => {
    let queue = [item];
    const calls: string[] = [];
    mockApi(
      {
        'GET /admin/listings/review-queue': () => ({ body: { listings: queue } }),
        'GET /admin/listings/review-queue/count': () => ({ body: { count: queue.length } }),
        'POST /admin/listings/7/approve': () => {
          calls.push('approve');
          queue = [];
          return { body: { ok: true } };
        },
      },
      { user: { ...sampleUser, role: 'ADMIN' } },
    );
    renderApp('/admin/review');
    const card = (await screen.findByRole('heading', { name: listing.title })).closest('article')!;
    expect(within(card).getByText('Edited: was live before')).toBeInTheDocument();
    expect(within(card).getByText(/amina@example\.com/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/Nothing to review/)).toBeInTheDocument();
    expect(calls).toEqual(['approve']);
  });

  it('rejects with a quick reason', async () => {
    let sent: unknown;
    mockApi(
      {
        'GET /admin/listings/review-queue': () => ({ body: { listings: [item] } }),
        'GET /admin/listings/review-queue/count': () => ({ body: { count: 1 } }),
        'POST /admin/listings/7/reject': (body) => {
          sent = body;
          return { body: { ok: true } };
        },
      },
      { user: { ...sampleUser, role: 'ADMIN' } },
    );
    renderApp('/admin/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Reject…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Photos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject listing' }));
    await waitFor(() =>
      expect(sent).toEqual({
        reason: 'Please add clear photos of the actual item, not stock images.',
      }),
    );
  });

  it('is not available to normal users', async () => {
    mockApi({}, { user: sampleUser });
    renderApp('/admin/review');
    expect(await screen.findByText('This page is for TZed admins.')).toBeInTheDocument();
  });
});
