import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReportGroup } from '@tzed/shared';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../../test/utils';

const articles = [
  {
    slug: 'currency-converter',
    title: 'Using the currency converter',
    topic: 'getting-started',
    excerpt: 'Open the converter…',
  },
  {
    slug: 'prohibited-items',
    title: 'Items you cannot sell on TZed',
    topic: 'selling',
    excerpt: 'The following are not allowed…',
  },
];

describe('Help centre', () => {
  it('searches articles and sends the query to the API', async () => {
    const queries: string[] = [];
    mockApi({
      'GET /help/articles': (_b, _i, url) => {
        queries.push(url.searchParams.get('q') ?? '');
        const q = url.searchParams.get('q');
        return {
          body: {
            articles: q ? [articles[0]] : articles,
            topics: [
              { topic: 'getting-started', count: 1 },
              { topic: 'selling', count: 1 },
            ],
            matchMode: q ? 'all' : null,
          },
        };
      },
    });
    renderApp('/help');
    expect(await screen.findByRole('link', { name: /Items you cannot sell/ })).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search help articles' }),
      'conver{Enter}',
    );
    expect(
      await screen.findByRole('heading', { name: 'Articles for “conver”' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Items you cannot sell/ })).not.toBeInTheDocument(),
    );
    expect(queries).toContain('conver');
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
      'href',
      '/help/contact',
    );
  });

  it('shows an article', async () => {
    mockApi({
      'GET /help/articles/currency-converter': () => ({
        body: {
          article: {
            ...articles[0],
            body: 'First paragraph.\n\nSecond paragraph.',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
          related: [],
        },
      }),
    });
    renderApp('/help/currency-converter');
    expect(
      await screen.findByRole('heading', { name: 'Using the currency converter' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
  });
});

describe('Contact support', () => {
  it('asks guests for their name and email, then shows the ticket link', async () => {
    let sent: unknown;
    mockApi({
      'POST /support/tickets': (body) => {
        sent = body;
        return { status: 201, body: { id: 12, token: 'secret-token' } };
      },
    });
    renderApp('/help/contact');
    await userEvent.click(await screen.findByRole('button', { name: 'Send message' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Full name'), 'Juma');
    await userEvent.type(screen.getByLabelText('Email'), 'juma@example.com');
    await userEvent.type(screen.getByLabelText('Subject'), 'Seller not replying');
    await userEvent.type(
      screen.getByLabelText('Message'),
      'I ordered three days ago and have not heard back.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Your ticket number is #12/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View your ticket' })).toHaveAttribute(
      'href',
      '/support/tickets/12?token=secret-token',
    );
    expect(sent).toMatchObject({
      name: 'Juma',
      email: 'juma@example.com',
      subject: 'Seller not replying',
    });
  });

  it('opens a guest ticket with the private link and replies', async () => {
    let urls: string[] = [];
    const ticket = {
      id: 12,
      subject: 'Seller not replying',
      status: 'OPEN',
      name: 'Juma',
      email: 'juma@example.com',
      createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T10:00:00.000Z',
      messages: [
        { id: 1, body: 'I ordered…', fromStaff: false, createdAt: '2026-10-23T10:00:00.000Z' },
      ],
    };
    mockApi({
      'GET /support/tickets/12': (_b, _i, url) => {
        urls = [...urls, url.search];
        return { body: { ticket } };
      },
      'POST /support/tickets/12/messages': (_b, _i, url) => {
        urls = [...urls, url.search];
        return {
          status: 201,
          body: {
            ticket: {
              ...ticket,
              messages: [
                ...ticket.messages,
                {
                  id: 2,
                  body: 'Order #41',
                  fromStaff: false,
                  createdAt: '2026-10-23T11:00:00.000Z',
                },
              ],
            },
          },
        };
      },
    });
    renderApp('/support/tickets/12?token=secret-token');
    expect(
      await screen.findByRole('heading', { name: '#12 · Seller not replying' }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Reply'), 'Order #41');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Order #41')).toBeInTheDocument();
    expect(urls.every((u) => u === '?token=secret-token')).toBe(true);
  });
});

describe('Reports', () => {
  it('reports a listing with a reason', async () => {
    let sent: unknown;
    const listing = {
      id: 7,
      title: 'Replica handbag',
      price: 40000,
      currency: 'TZS',
      condition: 'NEW',
      status: 'ACTIVE',
      quantity: 1,
      countryCode: 'TZ',
      regionName: 'Mbeya',
      regionId: 1,
      town: 'Mbeya',
      crossBorder: false,
      coverImage: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      publishedAt: '2026-10-01T00:00:00.000Z',
      description: 'Looks like the original.',
      categoryId: 3,
      category: { id: 3, name: 'Bags', slug: 'bags', parent: null },
      images: [],
      deliveryPickup: true,
      deliveryLocal: false,
      deliveryNotes: null,
      shipTo: ['TZ'],
      seller: {
        shopName: 'Shop',
        slug: 'shop',
        town: 'Mbeya',
        regionName: 'Mbeya',
        countryCode: 'TZ',
        memberSince: '2026-01-01T00:00:00.000Z',
        rating: null,
      },
      rejectionReason: null,
      submittedAt: null,
      updatedAt: '2026-10-01T00:00:00.000Z',
      isOwner: false,
    };
    mockApi(
      {
        'GET /listings/7': () => ({ body: { listing } }),
        'POST /reports': (body) => {
          sent = body;
          return { status: 201, body: { ok: true } };
        },
      },
      { user: sampleUser },
    );
    renderApp('/listings/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Report this listing' }));
    const form = screen.getByRole('form', { name: 'Report this listing' });
    await userEvent.click(within(form).getByRole('button', { name: 'Send report' }));
    expect(within(form).getByText('Choose a reason.')).toBeInTheDocument();
    await userEvent.click(within(form).getByLabelText('Prohibited item'));
    await userEvent.click(within(form).getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Thanks. Our team will review it.')).toBeInTheDocument();
    expect(sent).toMatchObject({ targetType: 'LISTING', targetId: 7, reason: 'PROHIBITED_ITEM' });
  });

  it('lets admins act on grouped reports', async () => {
    const group: ReportGroup = {
      targetType: 'LISTING',
      targetId: 7,
      target: {
        label: 'Replica handbag',
        detail: 'Looks like the original.',
        link: '/listings/7',
        ownerId: 3,
        ownerName: 'Joseph M',
        status: 'ACTIVE',
      },
      count: 2,
      reasons: { PROHIBITED_ITEM: 2 },
      firstReportedAt: '2026-10-22T00:00:00.000Z',
      lastReportedAt: '2026-10-23T00:00:00.000Z',
      reports: [
        {
          id: 1,
          reason: 'PROHIBITED_ITEM',
          details: 'Counterfeit',
          reporterName: 'Natasha P.',
          createdAt: '2026-10-22T00:00:00.000Z',
        },
        {
          id: 2,
          reason: 'PROHIBITED_ITEM',
          details: null,
          reporterName: 'Baraka S.',
          createdAt: '2026-10-23T00:00:00.000Z',
        },
      ],
      previouslyResolved: 0,
    };
    let groups = [group];
    let sent: unknown;
    mockApi(
      {
        'GET /admin/reports': () => ({ body: { groups } }),
        'POST /admin/reports/resolve': (body) => {
          sent = body;
          groups = [];
          return { body: { ok: true } };
        },
      },
      { user: { ...sampleUser, role: 'ADMIN' } },
    );
    renderApp('/admin/reports');
    const card = await screen.findByRole('article', { name: 'Replica handbag' });
    expect(within(card).getByText('2 reports')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Take action' })).toBeDisabled();
    await userEvent.click(within(card).getByLabelText('Remove the listing'));
    await userEvent.type(within(card).getByLabelText(/Note/), 'Counterfeit goods are not allowed.');
    await userEvent.click(within(card).getByRole('button', { name: 'Take action' }));
    expect(await screen.findByText(/No open reports/)).toBeInTheDocument();
    expect(sent).toEqual({
      targetType: 'LISTING',
      targetId: 7,
      decision: 'action',
      actions: ['remove_listing'],
      note: 'Counterfeit goods are not allowed.',
    });
  });
});
