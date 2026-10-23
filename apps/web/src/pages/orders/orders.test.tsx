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
  createdAt: '2026-10-01T00:00:00.000Z',
  publishedAt: '2026-10-02T00:00:00.000Z',
  description: 'Brand new in box.',
  categoryId: 3,
  category: { id: 3, name: 'Phones & tablets', slug: 'phones-tablets', parent: null },
  images: [],
  deliveryPickup: true,
  deliveryLocal: true,
  deliveryNotes: null,
  shipTo: ['TZ', 'ZM'],
  seller: {
    shopName: 'Amina Electronics',
    slug: 'amina-electronics',
    town: 'Mbeya',
    regionName: 'Mbeya',
    countryCode: 'TZ',
    memberSince: '2026-01-01T00:00:00.000Z',
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
    listingId: 7,
    unitPrice: 380000,
    fxRate: 1 / 105,
    deliveryNotes: 'Bus via Tunduma',
    buyerNote: null,
    cancelReason: null,
    buyer: { name: 'Natasha Phiri', countryCode: 'ZM', phone: null },
    seller: {
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
    expect(within(box).getByLabelText('Send to me in Zambia (cross-border)')).toBeInTheDocument();
    expect(within(box).queryByLabelText('Local delivery by the seller')).not.toBeInTheDocument();

    await userEvent.click(within(box).getByRole('button', { name: 'Place order' }));
    expect(within(box).getByText('Choose how you want to get the item.')).toBeInTheDocument();

    await userEvent.selectOptions(within(box).getByLabelText('Quantity'), '2');
    await userEvent.click(within(box).getByLabelText('Send to me in Zambia (cross-border)'));
    expect(within(box).getByText('TSh 760,000')).toBeInTheDocument();
    expect(await within(box).findByText('≈ K 7,238.10')).toBeInTheDocument();
    await userEvent.click(within(box).getByRole('button', { name: 'Place order' }));

    expect(await screen.findByRole('heading', { name: 'Order #41' })).toBeInTheDocument();
    expect(screen.getByText(/Your order has been sent to the seller/)).toBeInTheDocument();
    expect(sent).toMatchObject({ listingId: 7, quantity: 2, deliveryMethod: 'CROSS_BORDER' });
  });
});

describe('Order page', () => {
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
