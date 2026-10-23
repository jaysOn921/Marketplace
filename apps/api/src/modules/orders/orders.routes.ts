import { Router } from 'express';
import {
  ORDER_ACTIONS,
  ORDER_STATUSES,
  type OrderAction,
  type OrderResponse,
  type OrdersResponse,
  type OrderStatus,
} from '@tzed/shared';
import { AppError } from '../../lib/errors.js';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../db.js';
import { toOrderDetail, toOrderSummary } from './order-dto.js';
import * as orders from './orders.service.js';

export const ordersRouter = Router();

/** The buyer–seller conversation about the ordered listing, for a "Message" link. */
async function conversationIdFor(order: { buyerId: number; items: { listingId: number }[] }) {
  const listingId = order.items[0]?.listingId;
  if (!listingId) return null;
  const c = await prisma.conversation.findUnique({
    where: { listingId_buyerId: { listingId, buyerId: order.buyerId } },
    select: { id: true },
  });
  return c?.id ?? null;
}
ordersRouter.use(requireAuth);

ordersRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const role = req.query.role === 'selling' ? 'selling' : 'buying';
  const status = ORDER_STATUSES.includes(req.query.status as OrderStatus)
    ? (req.query.status as OrderStatus)
    : undefined;
  const { orders: rows, needsAction } = await orders.listOrders(user, role, status);
  const body: OrdersResponse = { orders: rows.map((o) => toOrderSummary(o, user.id)), needsAction };
  res.set('Cache-Control', 'no-store').json(body);
});

ordersRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const order = await orders.placeOrder(user, req.body);
  res.status(201).json({
    order: toOrderDetail(order, user.id, await conversationIdFor(order)),
  } satisfies OrderResponse);
});

ordersRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const order = await orders.getOrderFor(user, idParam(req.params.id));
  res.set('Cache-Control', 'no-store').json({
    order: toOrderDetail(order, user.id, await conversationIdFor(order)),
  } satisfies OrderResponse);
});

ordersRouter.post('/:id/:action', async (req, res) => {
  const user = currentUser(req);
  const action = req.params.action as OrderAction;
  if (!ORDER_ACTIONS.includes(action)) throw AppError.notFound();
  const order = await orders.changeOrder(user, idParam(req.params.id), action, req.body);
  res.json({
    order: toOrderDetail(order, user.id, await conversationIdFor(order)),
  } satisfies OrderResponse);
});
