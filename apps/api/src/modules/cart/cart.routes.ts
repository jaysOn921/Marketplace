import { Router } from 'express';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import * as cart from './cart.service.js';

/** The signed-in buyer's cart, under /api/v1/cart. */
export const cartRouter = Router();
cartRouter.use(requireAuth);
cartRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

cartRouter.get('/', async (req, res) => res.json(await cart.getCart(currentUser(req))));
cartRouter.post('/items', async (req, res) => {
  res.status(201).json(await cart.addToCart(currentUser(req), req.body));
});
cartRouter.patch('/items/:listingId', async (req, res) => {
  res.json(await cart.updateCartItem(currentUser(req), idParam(req.params.listingId), req.body));
});
cartRouter.delete('/items/:listingId', async (req, res) => {
  res.json(await cart.removeCartItem(currentUser(req), idParam(req.params.listingId)));
});
cartRouter.post('/checkout', async (req, res) => {
  res.status(201).json(await cart.checkout(currentUser(req), req.body));
});
