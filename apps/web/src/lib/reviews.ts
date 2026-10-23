import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewInput, ReviewsResponse } from '@tzed/shared';
import { api, post } from './api';
import { orderKey } from './orders';

export function useShopReviews(slug: string | undefined, page: number) {
  return useQuery({
    queryKey: ['reviews', slug, page],
    queryFn: () => api<ReviewsResponse>(`/shops/${slug}/reviews?page=${page}`),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  });
}

export function useSubmitReview(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => post(`/orders/${orderId}/review`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
