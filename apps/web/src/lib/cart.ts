import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddToCartInput, CartResponse, CheckoutInput, CheckoutResponse } from '@tzed/shared';
import { api, del, patch, post } from './api';
import { useMe } from './auth';

const cartKey = ['cart'] as const;

export function useCart() {
  const { data: user } = useMe();
  return useQuery({
    queryKey: cartKey,
    queryFn: () => api<CartResponse>('/cart'),
    enabled: Boolean(user),
  });
}

/** Every cart change returns the new cart; store it and refresh the header count. */
function useCartMutation<I>(send: (input: I) => Promise<CartResponse>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (cart) => {
      qc.setQueryData(cartKey, cart);
      void qc.invalidateQueries({ queryKey: ['counts'] });
    },
  });
}

export const useAddToCart = () =>
  useCartMutation((input: AddToCartInput) => post<CartResponse>('/cart/items', input));

export const useUpdateCartItem = () =>
  useCartMutation(({ listingId, quantity }: { listingId: number; quantity: number }) =>
    patch<CartResponse>(`/cart/items/${listingId}`, { quantity }),
  );

export const useRemoveCartItem = () =>
  useCartMutation((listingId: number) => del<CartResponse>(`/cart/items/${listingId}`));

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) => post<CheckoutResponse>('/cart/checkout', input),
    onSuccess: () => {
      for (const key of ['cart', 'counts', 'orders', 'listing', 'search'])
        void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
