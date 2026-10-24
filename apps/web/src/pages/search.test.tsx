import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListingSummary, SearchResponse } from '@tzed/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDisplayCurrency } from '../lib/display-currency';
import { mockApi, renderApp } from '../test/utils';

const phone: ListingSummary = {
  id: 1,
  title: 'Samsung Galaxy A15 phone',
  price: 380000,
  currency: 'TZS',
  condition: 'NEW',
  status: 'ACTIVE',
  quantity: 2,
  countryCode: 'TZ',
  regionName: 'Dar es Salaam',
  town: 'Kariakoo',
  crossBorder: true,
  coverImage: null,
  sellerVerified: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  publishedAt: '2026-10-01T00:00:00.000Z',
};
const tv: ListingSummary = {
  ...phone,
  id: 2,
  title: 'Hisense smart TV',
  price: 3200,
  currency: 'ZMW',
  countryCode: 'ZM',
  regionName: 'Lusaka',
  town: 'Lusaka',
  crossBorder: false,
};

function response(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    results: [phone, tv],
    total: 2,
    page: 1,
    pageSize: 24,
    pageCount: 1,
    sort: 'newest',
    matchMode: null,
    category: null,
    facets: {
      categories: [{ key: 'electronics', label: 'Electronics', count: 2 }],
      countries: [
        { key: 'TZ', label: 'Tanzania', count: 1 },
        { key: 'ZM', label: 'Zambia', count: 1 },
      ],
    },
    ...overrides,
  };
}

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

/** Records every /search request's query string. */
function mockSearch(make: (params: URLSearchParams) => SearchResponse = () => response()) {
  const calls: URLSearchParams[] = [];
  mockApi({
    'GET /categories': () => ({ body: categories }),
    'GET /search': (_b, _i, url) => {
      calls.push(url.searchParams);
      const body = make(url.searchParams);
      if (url.searchParams.get('category') === 'phones-tablets') {
        body.category = {
          slug: 'phones-tablets',
          name: 'Phones & tablets',
          parent: { slug: 'electronics', name: 'Electronics' },
          children: [],
        };
      }
      return { body };
    },
    'GET /search/suggest': (_b, _i, url) => ({
      body:
        url.searchParams.get('q') === 'sam'
          ? {
              listings: [{ id: 1, title: 'Samsung Galaxy A15 phone' }],
              categories: [{ slug: 'phones-tablets', name: 'Phones & tablets' }],
            }
          : { listings: [], categories: [] },
    }),
  });
  return calls;
}

beforeEach(() => {
  localStorage.clear();
});

describe('Search page', () => {
  it('shows results with prices in both currencies and a result count', async () => {
    mockSearch();
    renderApp('/search?q=phone');
    expect(await screen.findByRole('heading', { name: 'Results for “phone”' })).toBeInTheDocument();
    expect(await screen.findByText('2 listings')).toBeInTheDocument();
    const card = screen.getByRole('link', { name: /Samsung Galaxy A15 phone/ });
    expect(within(card).getByText('TSh 380,000')).toBeInTheDocument();
    expect(await within(card).findByText('≈ K 3,619.05')).toBeInTheDocument();
    expect(within(card).getByText('Ships to 🇿🇲')).toBeInTheDocument();
  });

  it('sends filters to the API and shows them as removable chips', async () => {
    const calls = mockSearch();
    renderApp('/search?q=phone');
    await screen.findByText('2 listings');

    await userEvent.click(screen.getByLabelText(/Buyers in Zambia/));
    await waitFor(() => expect(calls.at(-1)?.get('availableIn')).toBe('ZM'));
    await userEvent.click(screen.getByLabelText('New'));
    await waitFor(() => expect(calls.at(-1)?.get('condition')).toBe('NEW'));
    expect(calls.at(-1)?.get('q')).toBe('phone');

    const chip = screen.getByRole('button', { name: 'Remove filter: Buyers in Zambia' });
    await userEvent.click(chip);
    await waitFor(() => expect(calls.at(-1)?.get('availableIn')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    // Back to the plain "phone" search (served from cache), keeping the keywords.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Results for “phone”' })).toBeInTheDocument();
    expect(screen.getByLabelText('New')).not.toBeChecked();
  });

  it('filters by a price range in kwacha', async () => {
    const calls = mockSearch();
    renderApp('/search');
    await screen.findByText('2 listings');
    await userEvent.click(screen.getByRole('button', { name: 'K (ZMW)' }));
    await userEvent.type(screen.getByLabelText('Minimum price in ZMW'), '3,000');
    await userEvent.type(screen.getByLabelText('Maximum price in ZMW'), '7000');
    await userEvent.click(screen.getByRole('button', { name: 'Apply price' }));
    await waitFor(() =>
      expect(calls.at(-1)?.toString()).toContain('minPrice=3000&maxPrice=7000&currency=ZMW'),
    );
    expect(
      screen.getByRole('button', { name: 'Remove filter: K 3,000.00 – K 7,000.00' }),
    ).toBeInTheDocument();
  });

  it('changes the sort order and pages through results', async () => {
    const calls = mockSearch((p) =>
      response({ page: Number(p.get('page') ?? 1), pageCount: 3, total: 60 }),
    );
    renderApp('/search');
    await screen.findByText('60 listings');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'Price: low to high');
    await waitFor(() => expect(calls.at(-1)?.get('sort')).toBe('price_asc'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(calls.at(-1)?.get('page')).toBe('2'));
    expect(calls.at(-1)?.get('sort')).toBe('price_asc');
  });

  it('explains when results only match some words, and when nothing matches', async () => {
    mockSearch((p) =>
      p.get('q') === 'nothing'
        ? response({ results: [], total: 0 })
        : response({ matchMode: 'any' }),
    );
    renderApp('/search?q=samsung+laptop');
    expect(
      await screen.findByText(/No listings matched all of “samsung laptop”/),
    ).toBeInTheDocument();

    const [box] = screen.getAllByRole('combobox', { name: 'Search listings' });
    await userEvent.clear(box!);
    await userEvent.type(box!, 'nothing{enter}');
    expect(await screen.findByText('No listings found for “nothing”')).toBeInTheDocument();
    expect(screen.getByText(/Check the spelling/)).toBeInTheDocument();
  });

  it('hides the approximate price when the viewer chose the listing currency', async () => {
    mockSearch();
    setDisplayCurrency('TZS');
    renderApp('/search');
    const phoneCard = await screen.findByRole('link', { name: /Samsung Galaxy A15 phone/ });
    const tvCard = screen.getByRole('link', { name: /Hisense smart TV/ });
    expect(await within(tvCard).findByText('≈ TSh 336,000')).toBeInTheDocument();
    expect(within(phoneCard).queryByText(/≈/)).not.toBeInTheDocument();
  });
});

describe('Search suggestions', () => {
  it('suggests listings and categories as you type, with keyboard support', async () => {
    mockSearch();
    renderApp('/');
    const [box] = screen.getAllByRole('combobox', { name: 'Search listings' });
    await userEvent.type(box!, 'sam');
    const list = await screen.findByRole('listbox');
    expect(within(list).getByRole('option', { name: /Search for “sam”/ })).toBeInTheDocument();
    expect(within(list).getByRole('option', { name: /Phones & tablets/ })).toBeInTheDocument();
    expect(
      within(list).getByRole('option', { name: /Samsung Galaxy A15 phone/ }),
    ).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Results for “sam”' }).catch(() => null),
    ).toBeNull();
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});

describe('Shop page', () => {
  it('shows the shop and its listings', async () => {
    const calls: URLSearchParams[] = [];
    mockApi({
      'GET /shops/lusaka-home': () => ({
        body: {
          shop: {
            shopName: 'Lusaka Home',
            slug: 'lusaka-home',
            bio: 'Furniture and TVs',
            town: 'Lusaka',
            regionName: 'Lusaka',
            countryCode: 'ZM',
            memberSince: '2026-01-01T00:00:00.000Z',
            activeListings: 1,
            trust: { verified: true, completedOrders: 7, replyTime: 'HOUR' },
          },
        },
      }),
      'GET /search': (_b, _i, url) => {
        calls.push(url.searchParams);
        return { body: response({ results: [tv], total: 1 }) };
      },
    });
    renderApp('/shop/lusaka-home');
    expect(await screen.findByRole('heading', { name: 'Lusaka Home' })).toBeInTheDocument();
    expect(screen.getByText('Furniture and TVs')).toBeInTheDocument();
    expect(screen.getByText('Verified seller')).toBeInTheDocument();
    expect(screen.getByText('7 completed sales')).toBeInTheDocument();
    expect(screen.getByText('Usually replies within an hour')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Hisense smart TV/ })).toBeInTheDocument();
    expect(calls[0]?.get('seller')).toBe('lusaka-home');
  });
});
