import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListingSummary } from '@tzed/shared';
import { api, del, put } from './api';
import { useMe } from './auth';

interface SavedResponse {
  listings: ListingSummary[];
  ids: number[];
}
const savedKey = ['saved'] as const;

export function useSaved() {
  const { data: user } = useMe();
  return useQuery({
    queryKey: savedKey,
    queryFn: () => api<SavedResponse>('/me/saved'),
    enabled: Boolean(user),
  });
}

/** Saves or unsaves a listing, updating the heart straight away. */
export function useToggleSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, save }: { listingId: number; save: boolean }) =>
      save ? put(`/me/saved/${listingId}`, {}) : del(`/me/saved/${listingId}`),
    onMutate: async ({ listingId, save }) => {
      await qc.cancelQueries({ queryKey: savedKey });
      const before = qc.getQueryData<SavedResponse>(savedKey);
      if (before)
        qc.setQueryData<SavedResponse>(savedKey, {
          listings: save ? before.listings : before.listings.filter((l) => l.id !== listingId),
          ids: save ? [listingId, ...before.ids] : before.ids.filter((id) => id !== listingId),
        });
      return { before };
    },
    onError: (_e, _v, ctx) => ctx?.before && qc.setQueryData(savedKey, ctx.before),
    onSettled: () => qc.invalidateQueries({ queryKey: savedKey }),
  });
}
