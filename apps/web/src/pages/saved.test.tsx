import type { ListingSummary } from '@tzed/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { clearViewed } from '../lib/recent';
import { mockApi, renderApp, sampleUser } from '../test/utils';

const summary: ListingSummary = {
  id: 7,
  title: 'Kitenge fabric',
  price: 25000,
  currency: 'TZS',
  condition: 'NEW',
  status: 'ACTIVE',
  quantity: 3,
  countryCode: 'TZ',
  regionName: 'Mbeya',
  town: 'Mbeya',
  crossBorder: true,
  coverImage: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  publishedAt: '2026-10-02T00:00:00.000Z',
  sellerVerified: false,
};
const detail = {
  ...summary,
  description: 'Six yards, bright prints.',
  categoryId: 3,
  category: { id: 3, name: 'Fabrics & kitenge', slug: 'fabrics-kitenge', parent: null },
  regionId: 1,
  images: [],
  deliveryPickup: true,
  deliveryLocal: false,
  deliveryNotes: null,
  localDays: null,
  crossBorderDays: null,
  shipTo: ['TZ', 'ZM'],
  seller: {
    shopName: 'Mbeya Kitenge',
    slug: 'mbeya-kitenge',
    town: 'Mbeya',
    regionName: 'Mbeya',
    countryCode: 'TZ',
    memberSince: '2026-01-01T00:00:00.000Z',
    rating: null,
    trust: null,
  },
  rejectionReason: null,
  submittedAt: null,
  updatedAt: '2026-10-02T00:00:00.000Z',
  isOwner: false,
};

afterEach(() => {
  clearViewed();
  localStorage.clear();
});

describe('Saved items', () => {
  it('saves a listing from its page, and shows it under Saved items', async () => {
    const calls: string[] = [];
    let saved = false;
    mockApi(
      {
        'GET /listings/7': () => ({ body: { listing: detail } }),
        'GET /me/saved': () => ({
          body: saved ? { listings: [summary], ids: [7] } : { listings: [], ids: [] },
        }),
        'PUT /me/saved/7': () => {
          calls.push('save');
          saved = true;
          return { status: 204 };
        },
      },
      { user: sampleUser },
    );
    renderApp('/listings/7');
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(save);
    expect(await screen.findByRole('button', { name: 'Saved' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(calls).toEqual(['save']);
  });

  it('lists saved items, with a heart that removes them', async () => {
    mockApi(
      {
        'GET /me/saved': () => ({ body: { listings: [summary], ids: [7] } }),
      },
      { user: sampleUser },
    );
    renderApp('/saved');
    expect(await screen.findByRole('heading', { name: 'Saved items' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Kitenge fabric/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Kitenge fabric from saved items' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends guests to sign in when they tap the heart', async () => {
    mockApi({ 'GET /listings/7': () => ({ body: { listing: detail } }) });
    renderApp('/listings/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('Recently viewed', () => {
  it('remembers listings opened on this device and shows them on the home page', async () => {
    const asked: string[] = [];
    mockApi({
      'GET /listings/7': () => ({ body: { listing: detail } }),
      'GET /listings/by-ids': (_b, _i, url) => {
        asked.push(url.searchParams.get('ids')!);
        return { body: { listings: [summary] } };
      },
    });
    renderApp('/listings/7');
    await screen.findByRole('heading', { level: 1, name: 'Kitenge fabric' });
    // Not shown on the listing itself.
    expect(screen.queryByRole('heading', { name: 'Recently viewed' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'TZed home' }));
    expect(await screen.findByRole('heading', { name: 'Recently viewed' })).toBeInTheDocument();
    expect(asked).toContain('7');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Recently viewed' })).not.toBeInTheDocument(),
    );
  });
});
