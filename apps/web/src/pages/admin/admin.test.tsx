import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../../test/utils';

const admin = { ...sampleUser, role: 'ADMIN' as const };
const counts = { notifications: 0, messages: 0, ordersToAct: 0, reviewQueue: 2, openReports: 1 };

describe('Admin area', () => {
  it('shows the dashboard with waiting work and an old-rate warning', async () => {
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /admin/stats': () => ({
          body: {
            users: { total: 40, byCountry: { TZ: 25, ZM: 15 }, newThisWeek: 6, suspended: 1 },
            listings: { ACTIVE: 30, SOLD: 4 },
            orders: { total: 12, thisWeek: 5, byStatus: {} },
            waiting: { reviewQueue: 2, openReports: 1, openTickets: 3 },
            rate: { rate: 105, effectiveAt: '2026-10-01T00:00:00.000Z', daysOld: 22 },
          },
        }),
      },
      { user: admin },
    );
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('The exchange rate was last updated 22 days ago.')).toBeInTheDocument();
    expect(screen.getByText('🇹🇿 25 · 🇿🇲 15')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: /Review listings\s*2/ })).toHaveAttribute(
      'href',
      '/admin/review',
    );
  });

  it('is not shown to normal users', async () => {
    mockApi({}, { user: sampleUser });
    renderApp('/admin/rates');
    expect(await screen.findByText('This page is for TZed admins.')).toBeInTheDocument();
  });

  it('asks to confirm a large rate change before saving', async () => {
    const sent: unknown[] = [];
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /admin/rates': () => ({
          body: {
            history: [
              {
                id: 1,
                rate: 105,
                note: null,
                setBy: null,
                effectiveAt: '2026-10-01T00:00:00.000Z',
              },
            ],
          },
        }),
        'POST /admin/rates': (body) => {
          sent.push(body);
          return (body as { confirmLargeChange?: boolean }).confirmLargeChange
            ? { status: 201, body: { ok: true } }
            : {
                status: 409,
                body: {
                  error: {
                    code: 'LARGE_RATE_CHANGE',
                    message:
                      "That's a change of more than 20% from 105. Please confirm it's correct.",
                  },
                },
              };
        },
      },
      { user: admin },
    );
    renderApp('/admin/rates');
    expect(await screen.findByText('K 1 = TSh 105')).toBeInTheDocument();
    await userEvent.type(
      screen.getAllByLabelText('How many shillings one kwacha buys').at(-1)!,
      '150',
    );
    expect(screen.getByText(/So TSh 1,000 = K 6\.67/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save rate' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, save it' }));
    expect(await screen.findByText(/Rate saved/)).toBeInTheDocument();
    expect(sent).toEqual([{ rate: 150 }, { rate: 150, confirmLargeChange: true }]);
  });

  it('suspends a user with a reason', async () => {
    let sent: unknown;
    const row = {
      id: 9,
      name: 'Peter Chanda',
      email: 'peter@example.com',
      countryCode: 'ZM',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      shopName: null,
      shopSlug: null,
      listings: 0,
      orders: 2,
      reportsAgainst: 3,
      createdAt: '2026-10-01T00:00:00.000Z',
      lastLoginAt: null,
    };
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /admin/users': () => ({ body: { rows: [row], total: 1, page: 1, pageCount: 1 } }),
        'POST /admin/users/9/suspend': (body) => {
          sent = body;
          return { body: { ok: true } };
        },
      },
      { user: admin },
    );
    renderApp('/admin/users');
    expect(await screen.findByText(/3 reports/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    const form = screen.getByRole('form', { name: 'Suspend' });
    await userEvent.type(
      within(form).getByPlaceholderText('Reason (shown to the person)'),
      'Repeated scam reports',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(sent).toEqual({ reason: 'Repeated scam reports' }));
  });

  it('replies to a support ticket', async () => {
    let sent: unknown;
    const ticket = {
      id: 5,
      subject: 'Delivery to Ndola',
      status: 'OPEN',
      name: 'Juma',
      email: 'juma@example.com',
      createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T10:00:00.000Z',
      messages: [
        {
          id: 1,
          body: 'Do sellers send to Ndola?',
          fromStaff: false,
          createdAt: '2026-10-23T10:00:00.000Z',
        },
      ],
    };
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /support/tickets/5': () => ({ body: { ticket } }),
        'POST /admin/tickets/5/reply': (body) => {
          sent = body;
          return { status: 201, body: { ok: true } };
        },
      },
      { user: admin },
    );
    renderApp('/admin/tickets/5');
    expect(await screen.findByText('Do sellers send to Ndola?')).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText('Reply as TZed support'),
      'Yes, many sellers in Mbeya do.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send and close' }));
    await waitFor(() =>
      expect(sent).toEqual({ body: 'Yes, many sellers in Mbeya do.', close: true }),
    );
  });
});
