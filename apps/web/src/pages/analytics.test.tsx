import type { AdminAnalytics, SellerAnalytics } from '@tzed/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../test/utils';

const counts = {
  notifications: 0,
  messages: 0,
  ordersToAct: 0,
  reviewQueue: 0,
  openReports: 0,
  cart: 0,
};
const days = (n: number, values: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({
    day: new Date(Date.UTC(2026, 9, 24 - n + 1 + i)).toISOString().slice(0, 10),
    value: values[i] ?? 0,
  }));

function admin(n = 7): AdminAnalytics {
  return {
    days: n as 7,
    from: '2026-10-18',
    to: '2026-10-24',
    rate: 131.04,
    kpis: {
      newUsers: { value: 12, previous: 8 },
      newListings: { value: 5, previous: 5 },
      ordersPlaced: { value: 9, previous: 0 },
      ordersCompleted: { value: 4, previous: 6 },
      sales: { value: 392500, previous: 300000 },
      views: { value: 300, previous: 200 },
      cartAdds: { value: 20, previous: 10 },
    },
    daily: {
      orders: days(n, [0, 1, 2, 0, 3, 1, 2]),
      sales: days(n, [0, 0, 25000, 0, 367500, 0, 0]),
      views: days(n),
      newUsers: days(n),
    },
    countries: [
      { code: 'ZM', newUsers: 7, ordersAsBuyer: 6, sales: 3500, currency: 'ZMW' },
      { code: 'TZ', newUsers: 5, ordersAsBuyer: 3, sales: 25000, currency: 'TZS' },
    ],
    crossBorderOrders: 4,
    topCategories: [{ slug: 'fashion', name: 'Fashion', units: 7, orders: 5 }],
    topSellers: [
      {
        id: 4,
        name: 'Mbeya Kitenge',
        shopSlug: 'mbeya-kitenge',
        countryCode: 'TZ',
        orders: 3,
        sales: 75000,
      },
    ],
    statuses: [
      { status: 'COMPLETED', count: 4 },
      { status: 'PLACED', count: 5 },
    ],
  };
}

describe('Admin analytics', () => {
  it('shows headline numbers against the previous period, and switches the period', async () => {
    const asked: string[] = [];
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /admin/analytics': (_b, _i, url) => {
          asked.push(url.searchParams.get('days')!);
          return { body: admin(Number(url.searchParams.get('days'))) };
        },
      },
      { user: { ...sampleUser, role: 'ADMIN' } },
    );
    renderApp('/admin/analytics?days=7');
    expect(await screen.findByText('TSh 392,500')).toBeInTheDocument();
    expect(screen.getByText(/Up 31%/)).toBeInTheDocument(); // sales vs 300,000
    expect(screen.getByText(/Up from none/)).toBeInTheDocument(); // orders vs 0
    expect(screen.getByText(/Down 33%/)).toBeInTheDocument(); // completed 4 vs 6
    expect(screen.getByText('3.0%')).toBeInTheDocument(); // 9 orders / 300 views
    expect(screen.getByText('4 of 9 orders crossed the border.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mbeya Kitenge' })).toHaveAttribute(
      'href',
      '/shop/mbeya-kitenge',
    );

    await userEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(asked).toContain('30'));
  });

  it('shows a chart as a table on request', async () => {
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /admin/analytics': () => ({ body: admin() }),
      },
      { user: { ...sampleUser, role: 'ADMIN' } },
    );
    renderApp('/admin/analytics?days=7');
    const chart = (await screen.findByText('Sales (TSh)')).closest('figure')!;
    expect(within(chart).getByRole('img', { name: 'Sales (TSh)' })).toBeInTheDocument();
    await userEvent.click(within(chart).getByRole('button', { name: 'Show as table' }));
    const table = within(chart).getByRole('table', { name: 'Sales (TSh)' });
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(within(table).getByText('TSh 367,500')).toBeInTheDocument();
  });
});

describe('Shop analytics', () => {
  it('shows a seller their figures and each listing', async () => {
    const data: SellerAnalytics = {
      days: 30,
      from: '2026-09-25',
      to: '2026-10-24',
      currency: 'ZMW',
      kpis: {
        views: { value: 120, previous: 100 },
        cartAdds: { value: 6, previous: 6 },
        ordersPlaced: { value: 3, previous: 1 },
        unitsSold: { value: 4, previous: 1 },
        sales: { value: 7000, previous: 3500 },
      },
      daily: { views: days(30), orders: days(30) },
      listings: [
        {
          id: 12,
          title: 'Sofa',
          status: 'ACTIVE',
          views: 90,
          cartAdds: 4,
          orders: 2,
          units: 2,
          sales: 7000,
        },
      ],
    };
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /me/analytics': () => ({ body: data }),
      },
      { user: sampleUser },
    );
    renderApp('/account/analytics');
    expect(await screen.findByRole('heading', { name: 'Shop analytics' })).toBeInTheDocument();
    expect((await screen.findAllByText('K 7,000.00')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Up 100%/)).toBeInTheDocument();
    expect(screen.getByText(/No change/)).toBeInTheDocument();
    const row = screen.getByRole('link', { name: 'Sofa' }).closest('tr')!;
    expect(within(row).getByText('90')).toBeInTheDocument();
  });
});
