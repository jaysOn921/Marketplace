import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListingDetail, OrderDetail } from '@tzed/shared';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../../test/utils';

const listing: ListingDetail = {
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
  sellerVerified: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  publishedAt: '2026-10-02T00:00:00.000Z',
  description: 'Brand new in box.',
  categoryId: 3,
  category: { id: 3, name: 'Phones & tablets', slug: 'phones-tablets', parent: null },
  images: [],
  deliveryPickup: true,
  deliveryLocal: true,
  deliveryNotes: null,
  localDays: null,
  crossBorderDays: '4-7',
  shipTo: ['TZ', 'ZM'],
  seller: {
    shopName: 'Amina Electronics',
    slug: 'amina-electronics',
    town: 'Mbeya',
    regionName: 'Mbeya',
    countryCode: 'TZ',
    memberSince: '2026-01-01T00:00:00.000Z',
    rating: null,
    trust: { verified: true, completedOrders: 12, replyTime: 'HOURS' },
  },
  rejectionReason: null,
  submittedAt: null,
  updatedAt: '2026-10-02T00:00:00.000Z',
  isOwner: false,
};

const zambian = sampleUser; // ZM, verified

function orderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 41,
    status: 'PLACED',
    paymentStatus: 'UNPAID',
    role: 'buyer',
    title: listing.title,
    quantity: 2,
    currency: 'TZS',
    total: 760000,
    buyerCurrency: 'ZMW',
    buyerTotal: 7238.1,
    deliveryMethod: 'CROSS_BORDER',
    coverImage: null,
    otherParty: 'Amina Electronics',
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T10:00:00.000Z',
    itemCount: 1,
    dispute: null,
    canDispute: true,
    deliveryDays: { min: 4, max: 7 },
    listingId: 7,
    unitPrice: 380000,
    items: [
      {
        listingId: 7,
        title: listing.title,
        unitPrice: 380000,
        quantity: 2,
        lineTotal: 760000,
        coverImage: null,
      },
    ],
    fxRate: 1 / 105,
    deliveryNotes: 'Bus via Tunduma',
    buyerNote: null,
    cancelReason: null,
    buyer: { id: 5, name: 'Natasha Phiri', countryCode: 'ZM', phone: null },
    seller: {
      id: 4,
      name: 'Amina M',
      countryCode: 'TZ',
      phone: null,
      shopName: 'Amina Electronics',
      shopSlug: 'amina-electronics',
    },
    sellerTown: 'Mbeya',
    events: [{ type: 'placed', note: null, actor: 'buyer', createdAt: '2026-10-23T10:00:00.000Z' }],
    actions: ['cancel'],
    acceptedAt: null,
    conversationId: null,
    review: null,
    canReview: false,
    buyerPaidAt: null,
    receivedAt: null,
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

describe('Buy box', () => {
  it('asks guests to sign in', async () => {
    mockApi({ 'GET /listings/7': () => ({ body: { listing } }) });
    renderApp('/listings/7');
    expect(await screen.findByRole('link', { name: 'Sign in to order' })).toHaveAttribute(
      'href',
      '/login?next=%2Flistings%2F7',
    );
  });

  it('explains when the seller does not send to the buyer’s country', async () => {
    mockApi(
      {
        'GET /listings/7': () => ({
          body: { listing: { ...listing, crossBorder: false, shipTo: ['TZ'] } },
        }),
      },
      { user: zambian },
    );
    renderApp('/listings/7');
    expect(
      await screen.findByText("This seller doesn't send this item to Zambia."),
    ).toBeInTheDocument();
  });

  it('offers only the delivery options for the buyer, shows the total in both currencies and places the order', async () => {
    let sent: unknown;
    mockApi(
      {
        'GET /listings/7': () => ({ body: { listing } }),
        'POST /orders': (body) => {
          sent = body;
          return { status: 201, body: { order: orderDetail() } };
        },
        'GET /orders/41': () => ({ body: { order: orderDetail() } }),
      },
      { user: zambian },
    );
    renderApp('/listings/7');
    const box = await screen.findByRole('region', { name: 'Order this item' });
    // A Zambian buyer of a Tanzanian item: collect or cross-border, not local delivery.
    expect(within(box).getByLabelText('Collect from the seller in Mbeya')).toBeInTheDocument();
    expect(within(box).getByLabelText(/Send to me in Zambia \(cross-border\)/)).toBeInTheDocument();
    expect(within(box).getByText('Usually takes 4–7 days')).toBeInTheDocument();
    expect(within(box).queryByLabelText('Local delivery by the seller')).not.toBeInTheDocument();

    await userEvent.click(within(box).getByRole('button', { name: 'Place order' }));
    expect(within(box).getByText('Choose how you want to get the item.')).toBeInTheDocument();

    await userEvent.selectOptions(within(box).getByLabelText('Quantity'), '2');
    await userEvent.click(within(box).getByLabelText(/Send to me in Zambia \(cross-border\)/));
    expect(within(box).getByText('TSh 760,000')).toBeInTheDocument();
    expect(await within(box).findByText('≈ K 7,238.10')).toBeInTheDocument();
    // Cross-border: the buyer must acknowledge that import duty may apply.
    await userEvent.click(within(box).getByRole('button', { name: 'Place order' }));
    expect(
      within(box).getByText('Please confirm you understand import duty may apply.'),
    ).toBeInTheDocument();
    expect(sent).toBeUndefined();
    await userEvent.click(within(box).getByLabelText(/I understand that import duty/));
    await userEvent.click(within(box).getByRole('button', { name: 'Place order' }));

    expect(await screen.findByRole('heading', { name: 'Order #41' })).toBeInTheDocument();
    expect(screen.getByText(/Your order has been sent to the seller/)).toBeInTheDocument();
    expect(sent).toMatchObject({
      listingId: 7,
      quantity: 2,
      deliveryMethod: 'CROSS_BORDER',
      acceptCustoms: true,
    });
  });
});

describe('Add to cart', () => {
  it('adds the chosen quantity without asking for delivery, and links to the cart', async () => {
    let sent: unknown;
    mockApi(
      {
        'GET /listings/7': () => ({ body: { listing } }),
        'POST /cart/items': (body) => {
          sent = body;
          return {
            status: 201,
            body: { groups: [], buyerCurrency: 'ZMW', total: 0, count: 2 },
          };
        },
      },
      { user: zambian },
    );
    renderApp('/listings/7');
    const box = await screen.findByRole('region', { name: 'Order this item' });
    await userEvent.selectOptions(within(box).getByLabelText('Quantity'), '2');
    await userEvent.click(within(box).getByRole('button', { name: 'Add to cart' }));
    expect(await within(box).findByText(/Added 2 to your cart/)).toBeInTheDocument();
    expect(within(box).getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart');
    expect(sent).toEqual({ listingId: 7, quantity: 2 });
  });
});

describe('Order page', () => {
  it('shows when the items should arrive once the seller accepts', async () => {
    mockApi(
      {
        'GET /orders/41': () => ({
          body: {
            order: orderDetail({
              status: 'ACCEPTED',
              acceptedAt: '2026-10-23T10:00:00.000Z',
              actions: [],
            }),
          },
        }),
      },
      { user: zambian },
    );
    renderApp('/orders/41');
    // Accepted 23 Oct, usually 4–7 days.
    expect(await screen.findByText('Expected between Oct 27 and Oct 30')).toBeInTheDocument();
  });

  it('shows the saved prices, rate and next step for the buyer', async () => {
    mockApi({ 'GET /orders/41': () => ({ body: { order: orderDetail() } }) }, { user: zambian });
    renderApp('/orders/41');
    expect(await screen.findByRole('heading', { name: 'Order #41' })).toBeInTheDocument();
    expect(
      screen.getByText('Waiting for the seller to accept. Don’t pay yet.'.replace('’', "'")),
    ).toBeInTheDocument();
    expect(screen.getByText('≈ K 7,238.10')).toBeInTheDocument();
    expect(screen.getByText(/Converted at K 1 = TSh 105 on/)).toBeInTheDocument();
    expect(
      screen.getByText('Contact details are shared once the seller accepts the order.'),
    ).toBeInTheDocument();
  });

  it('lets the seller accept, then shows the buyer’s phone', async () => {
    let current = orderDetail({ role: 'seller', actions: ['accept', 'decline', 'cancel'] });
    mockApi(
      {
        'GET /orders/41': () => ({ body: { order: current } }),
        'POST /orders/41/accept': () => {
          current = {
            ...current,
            status: 'ACCEPTED',
            actions: ['ready', 'cancel', 'mark-paid'],
            buyer: { ...current.buyer, phone: '+260977123456' },
            events: [
              ...current.events,
              {
                type: 'accepted',
                note: null,
                actor: 'seller',
                createdAt: '2026-10-23T11:00:00.000Z',
              },
            ],
          };
          return { body: { order: current } };
        },
      },
      { user: { ...zambian, countryCode: 'TZ', currency: 'TZS' } },
    );
    renderApp('/orders/41');
    await userEvent.click(await screen.findByRole('button', { name: 'Accept order' }));
    expect(await screen.findByRole('link', { name: '+260977123456' })).toHaveAttribute(
      'href',
      'tel:+260977123456',
    );
    expect(screen.getByText('Accepted by the seller')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready / sent' })).toBeInTheDocument();
  });

  it('asks the seller for a reason when declining', async () => {
    let sent: unknown;
    mockApi(
      {
        'GET /orders/41': () => ({
          body: {
            order: orderDetail({ role: 'seller', actions: ['accept', 'decline', 'cancel'] }),
          },
        }),
        'POST /orders/41/decline': (body) => {
          sent = body;
          return {
            body: {
              order: orderDetail({
                role: 'seller',
                status: 'DECLINED',
                actions: [],
                cancelReason: 'Sold elsewhere',
              }),
            },
          };
        },
      },
      { user: zambian },
    );
    renderApp('/orders/41');
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await userEvent.type(screen.getByLabelText(/Why are you declining/), 'Sold elsewhere');
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(sent).toEqual({ reason: 'Sold elsewhere' }));
    expect(await screen.findByText('Sold elsewhere')).toBeInTheDocument();
  });
});

describe('Orders list', () => {
  it('shows buying and selling tabs with a badge for orders to act on', async () => {
    const summary = orderDetail();
    mockApi(
      {
        'GET /orders': (_b, _i, url) =>
          url.searchParams.get('role') === 'selling'
            ? {
                body: {
                  orders: [{ ...summary, id: 50, role: 'seller', otherParty: 'Baraka Said' }],
                  needsAction: 1,
                },
              }
            : { body: { orders: [summary], needsAction: 1 } },
      },
      { user: zambian },
    );
    renderApp('/orders');
    expect(await screen.findByRole('link', { name: /Samsung Galaxy A15/ })).toHaveAttribute(
      'href',
      '/orders/41',
    );
    expect(screen.getByText('From Amina Electronics', { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Selling/ }));
    expect(await screen.findByText(/To Baraka Said/)).toBeInTheDocument();
  });
});

describe('Buyer confirmations', () => {
  it('lets the buyer report payment and confirm receipt, but not complete the order', async () => {
    const calls: string[] = [];
    let current = orderDetail({ status: 'READY', actions: ['received', 'report-paid'] });
    mockApi(
      {
        'GET /orders/41': () => ({ body: { order: current } }),
        'POST /orders/41/report-paid': () => {
          calls.push('report-paid');
          current = { ...current, buyerPaidAt: '2026-10-23T12:00:00.000Z', actions: ['received'] };
          return { body: { order: current } };
        },
        'POST /orders/41/received': () => {
          calls.push('received');
          current = { ...current, receivedAt: '2026-10-23T13:00:00.000Z', actions: [] };
          return { body: { order: current } };
        },
      },
      { user: zambian },
    );
    renderApp('/orders/41');
    expect(await screen.findByRole('button', { name: "I've received it" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: "I've paid" }));
    expect(await screen.findByText(/You told the seller you paid/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "I've received it" }));
    expect(await screen.findByText(/The seller will now complete the order/)).toBeInTheDocument();
    expect(calls).toEqual(['report-paid', 'received']);
  });
});

describe('Problem with an order', () => {
  const buyer = { id: 1, name: 'Natasha Phiri', countryCode: 'ZM' as const, phone: null };
  const dispute = {
    id: 3,
    orderId: 41,
    status: 'OPEN' as const,
    reason: 'NOT_RECEIVED' as const,
    openedBy: 'buyer' as const,
    resolution: null,
    resolvedAt: null,
    createdAt: '2026-10-24T10:00:00.000Z',
    messages: [
      {
        id: 1,
        author: 'buyer' as const,
        authorName: 'Natasha',
        body: 'I paid on Monday but nothing has been sent.',
        createdAt: '2026-10-24T10:00:00.000Z',
      },
    ],
  };

  it('lets the buyer describe a problem, then shows the shared conversation', async () => {
    let sent: unknown;
    let opened = false;
    mockApi(
      {
        'GET /orders/41': () => ({
          body: {
            order: orderDetail({
              buyer,
              status: 'ACCEPTED',
              dispute: opened ? { id: 3, status: 'OPEN', reason: 'NOT_RECEIVED' } : null,
              canDispute: !opened,
            }),
          },
        }),
        'POST /orders/41/dispute': (body) => {
          sent = body;
          opened = true;
          return { status: 201, body: { dispute } };
        },
        'GET /orders/41/dispute': () => ({ body: { dispute } }),
      },
      { user: zambian },
    );
    renderApp('/orders/41');
    const section = await screen.findByRole('region', { name: 'Problem with this order?' });
    await userEvent.click(within(section).getByRole('button', { name: 'Report a problem' }));
    await userEvent.click(within(section).getByRole('button', { name: 'Send to TZed' }));
    expect(within(section).getByText('Choose what the problem is.')).toBeInTheDocument();

    await userEvent.click(within(section).getByLabelText('Item not received'));
    await userEvent.type(
      within(section).getByLabelText('What happened?'),
      'I paid on Monday but nothing has been sent.',
    );
    await userEvent.click(within(section).getByRole('button', { name: 'Send to TZed' }));
    await waitFor(() =>
      expect(sent).toEqual({
        reason: 'NOT_RECEIVED',
        details: 'I paid on Monday but nothing has been sent.',
      }),
    );
    const thread = await screen.findByRole('region', { name: 'Problem with this order' });
    expect(
      within(thread).getByText('I paid on Monday but nothing has been sent.'),
    ).toBeInTheDocument();
    expect(within(thread).getByLabelText('Add a message')).toBeInTheDocument();
  });

  it('shows TZed’s decision once resolved, and allows reporting another problem', async () => {
    const resolved = {
      ...dispute,
      status: 'RESOLVED' as const,
      resolution: 'The seller refunded K 200 by mobile money.',
      resolvedAt: '2026-10-25T10:00:00.000Z',
    };
    mockApi(
      {
        'GET /orders/41': () => ({
          body: {
            order: orderDetail({
              buyer,
              dispute: { id: 3, status: 'RESOLVED', reason: 'NOT_RECEIVED' },
              canDispute: true,
            }),
          },
        }),
        'GET /orders/41/dispute': () => ({ body: { dispute: resolved } }),
      },
      { user: zambian },
    );
    renderApp('/orders/41');
    expect(
      await screen.findByText('The seller refunded K 200 by mobile money.'),
    ).toBeInTheDocument();
    expect(screen.getByText('TZed’s decision')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a message')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report another problem' })).toBeInTheDocument();
  });
});
