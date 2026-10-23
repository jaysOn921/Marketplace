import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConversationResponse, ConversationSummary } from '@tzed/shared';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../../test/utils';

const counts = { notifications: 2, messages: 3, ordersToAct: 0, reviewQueue: 0 };

const summary: ConversationSummary = {
  id: 9,
  listing: { id: 7, title: 'Samsung Galaxy A15', price: 380000, currency: 'TZS', coverImage: null },
  role: 'buyer',
  otherParty: 'Amina Electronics',
  lastMessage: { body: 'Yes, still available!', mine: false, createdAt: new Date().toISOString() },
  unread: 1,
  lastMessageAt: new Date().toISOString(),
};

function thread(messages: ConversationResponse['messages']): ConversationResponse {
  return {
    conversation: { ...summary, unread: 0, canReply: true, orderId: 41 },
    messages,
    hasMore: false,
  };
}

describe('Header badges and notifications', () => {
  it('shows unread counts, and opens notifications that link to the right page', async () => {
    let read: number[] = [];
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /notifications': () => ({
          body: {
            unread: 2,
            notifications: [
              {
                id: 2,
                type: 'order.placed',
                title: 'New order',
                body: 'Natasha ordered 1 × Samsung',
                link: '/orders/41',
                read: false,
                createdAt: new Date().toISOString(),
              },
              {
                id: 1,
                type: 'listing.approved',
                title: 'Your listing is live',
                body: null,
                link: '/listings/7',
                read: true,
                createdAt: '2026-10-01T00:00:00.000Z',
              },
            ],
          },
        }),
        'POST /notifications/2/read': () => {
          read = [...read, 2];
          return { status: 204 };
        },
        'GET /orders/41': () => ({
          status: 404,
          body: { error: { code: 'NOT_FOUND', message: 'x' } },
        }),
      },
      { user: sampleUser },
    );
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Messages, 3 unread' })).toHaveAttribute(
      'href',
      '/messages',
    );
    const bell = screen.getByRole('button', { name: 'Notifications, 2 unread' });
    await userEvent.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText('Your listing is live')).toBeInTheDocument();
    await userEvent.click(within(panel).getByText('New order'));
    await waitFor(() => expect(read).toEqual([2]));
    expect(await screen.findByText("This order doesn't exist or isn't yours.")).toBeInTheDocument();
  });

  it('shows no badges to guests', async () => {
    mockApi();
    renderApp('/');
    await screen.findByRole('link', { name: 'Sign in' });
    expect(screen.queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument();
  });
});

describe('Messages page', () => {
  it('lists conversations and sends a reply with Enter', async () => {
    let messages: ConversationResponse['messages'] = [
      { id: 1, body: 'Is it still available?', mine: true, createdAt: new Date().toISOString() },
      { id: 2, body: 'Yes, still available!', mine: false, createdAt: new Date().toISOString() },
    ];
    let sent: unknown;
    mockApi(
      {
        'GET /me/counts': () => ({ body: counts }),
        'GET /conversations': () => ({ body: { conversations: [summary], unread: 1 } }),
        'GET /conversations/9': () => ({ body: thread(messages) }),
        'POST /conversations/9/messages': (body) => {
          sent = body;
          messages = [
            ...messages,
            {
              id: 3,
              body: 'Great, I will order now.',
              mine: true,
              createdAt: new Date().toISOString(),
            },
          ];
          return { status: 201, body: thread(messages) };
        },
      },
      { user: sampleUser },
    );
    renderApp('/messages/9');
    const inbox = await screen.findByRole('complementary', { name: 'Conversations' });
    expect(await within(inbox).findByText('Amina Electronics')).toBeInTheDocument();
    expect(within(inbox).getByLabelText('1 unread')).toBeInTheDocument();

    expect(await screen.findByText('Is it still available?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute('href', '/orders/41');
    await userEvent.type(
      screen.getByLabelText('Write a message'),
      'Great, I will order now.{Enter}',
    );
    expect(await screen.findByText('Great, I will order now.')).toBeInTheDocument();
    expect(sent).toEqual({ body: 'Great, I will order now.' });
    expect(screen.getByLabelText('Write a message')).toHaveValue('');
  });
});

describe('Ask the seller', () => {
  it('starts a conversation from a listing', async () => {
    let sent: unknown;
    const listing = {
      id: 7,
      title: 'Samsung Galaxy A15',
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
      publishedAt: '2026-10-01T00:00:00.000Z',
      description: 'New.',
      categoryId: 3,
      category: { id: 3, name: 'Phones', slug: 'phones-tablets', parent: null },
      images: [],
      deliveryPickup: true,
      deliveryLocal: true,
      deliveryNotes: null,
      shipTo: ['TZ', 'ZM'],
      seller: {
        shopName: 'Amina Electronics',
        slug: 'amina',
        town: 'Mbeya',
        regionName: 'Mbeya',
        countryCode: 'TZ',
        memberSince: '2026-01-01T00:00:00.000Z',
      },
      rejectionReason: null,
      submittedAt: null,
      updatedAt: '2026-10-01T00:00:00.000Z',
      isOwner: false,
    };
    mockApi(
      {
        'GET /listings/7': () => ({ body: { listing } }),
        'POST /conversations': (body) => {
          sent = body;
          return {
            status: 201,
            body: thread([
              {
                id: 1,
                body: 'Can you send to Lusaka?',
                mine: true,
                createdAt: new Date().toISOString(),
              },
            ]),
          };
        },
        'GET /conversations': () => ({ body: { conversations: [summary], unread: 0 } }),
        'GET /conversations/9': () => ({
          body: thread([
            {
              id: 1,
              body: 'Can you send to Lusaka?',
              mine: true,
              createdAt: new Date().toISOString(),
            },
          ]),
        }),
      },
      { user: sampleUser },
    );
    renderApp('/listings/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Ask the seller a question' }));
    await userEvent.type(
      screen.getByLabelText('Message Amina Electronics'),
      'Can you send to Lusaka?',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: 'Messages' })).toBeInTheDocument();
    expect(sent).toEqual({ listingId: 7, body: 'Can you send to Lusaka?' });
  });
});
