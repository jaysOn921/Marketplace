import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OrderAction,
  OrderResponse,
  OrdersResponse,
  OrderStatus,
  PlaceOrderInput,
} from '@tzed/shared';
import { api, post } from './api';

export const orderKey = (id: number) => ['order', id] as const;

export function useOrders(role: 'buying' | 'selling', status?: OrderStatus) {
  return useQuery({
    queryKey: ['orders', role, status ?? 'all'],
    queryFn: () => api<OrdersResponse>(`/orders?role=${role}${status ? `&status=${status}` : ''}`),
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: orderKey(id),
    queryFn: () => api<OrderResponse>(`/orders/${id}`),
    select: (d) => d.order,
    enabled: Number.isFinite(id) && id > 0,
    // Keep the page fresh while the other side acts.
    refetchInterval: 30_000,
  });
}

function useOrderCache() {
  const qc = useQueryClient();
  return (data: OrderResponse) => {
    qc.setQueryData(orderKey(data.order.id), data);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['listing', data.order.listingId] });
    void qc.invalidateQueries({ queryKey: ['search'] });
  };
}

export function usePlaceOrder() {
  const sync = useOrderCache();
  return useMutation({
    mutationFn: (input: PlaceOrderInput) => post<OrderResponse>('/orders', input),
    onSuccess: sync,
  });
}

export function useOrderAction(id: number) {
  const sync = useOrderCache();
  return useMutation({
    mutationFn: ({ action, reason }: { action: OrderAction; reason?: string }) =>
      post<OrderResponse>(`/orders/${id}/${action}`, reason ? { reason } : {}),
    onSuccess: sync,
  });
}
