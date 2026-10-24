import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DisputeDto, OpenDisputeInput } from '@tzed/shared';
import { api, post } from './api';
import { orderKey } from './orders';

const disputeKey = (orderId: number) => ['dispute', orderId] as const;

export function useOrderDispute(orderId: number, enabled: boolean) {
  return useQuery({
    queryKey: disputeKey(orderId),
    queryFn: () => api<{ dispute: DisputeDto | null }>(`/orders/${orderId}/dispute`),
    select: (d) => d.dispute,
    enabled,
    // The other side or TZed may reply.
    refetchInterval: 30_000,
  });
}

function useDisputeCache(orderId: number) {
  const qc = useQueryClient();
  return (d: { dispute: DisputeDto | null }) => {
    qc.setQueryData(disputeKey(orderId), d);
    void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    void qc.invalidateQueries({ queryKey: ['admin'] });
    void qc.invalidateQueries({ queryKey: ['counts'] });
  };
}

export function useOpenDispute(orderId: number) {
  const sync = useDisputeCache(orderId);
  return useMutation({
    mutationFn: (input: OpenDisputeInput) =>
      post<{ dispute: DisputeDto }>(`/orders/${orderId}/dispute`, input),
    onSuccess: sync,
  });
}

export function useDisputeReply(orderId: number) {
  const sync = useDisputeCache(orderId);
  return useMutation({
    mutationFn: ({ disputeId, body }: { disputeId: number; body: string }) =>
      post<{ dispute: DisputeDto }>(`/disputes/${disputeId}/messages`, { body }),
    onSuccess: sync,
  });
}

export function useAdminDispute(id: number) {
  return useQuery({
    queryKey: ['admin', 'dispute', id],
    queryFn: () => api<{ dispute: DisputeDto }>(`/admin/disputes/${id}`),
    select: (d) => d.dispute,
  });
}

export function useResolveDispute(id: number, orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resolution: string) =>
      post<{ dispute: DisputeDto }>(`/admin/disputes/${id}/resolve`, { resolution }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['counts'] });
      if (orderId) void qc.invalidateQueries({ queryKey: ['dispute', orderId] });
    },
  });
}
