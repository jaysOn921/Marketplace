import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CategoryNode,
  ListingCreateInput,
  ListingResponse,
  ListingStatus,
  ListingUpdateInput,
  MyListingsResponse,
  ReviewQueueItem,
} from '@tzed/shared';
import { api, del, patch, post, put } from './api';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: CategoryNode[] }>('/categories'),
    staleTime: Infinity,
    select: (d) => d.categories,
  });
}

export const listingKey = (id: number) => ['listing', id] as const;

export function useListing(id: number) {
  return useQuery({
    queryKey: listingKey(id),
    queryFn: () => api<ListingResponse>(`/listings/${id}`),
    select: (d) => d.listing,
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useMyListings(status?: ListingStatus) {
  return useQuery({
    queryKey: ['my-listings', status ?? 'all'],
    queryFn: () => api<MyListingsResponse>(`/listings/mine${status ? `?status=${status}` : ''}`),
  });
}

/** Keeps the listing cache and "my listings" in sync after any change. */
function useListingCache() {
  const qc = useQueryClient();
  return (data: ListingResponse | null, id?: number) => {
    if (data) qc.setQueryData(listingKey(data.listing.id), { listing: data.listing });
    if (!data && id) qc.removeQueries({ queryKey: listingKey(id) });
    void qc.invalidateQueries({ queryKey: ['my-listings'] });
  };
}

export function useCreateListing() {
  const sync = useListingCache();
  return useMutation({
    mutationFn: (input: ListingCreateInput) => post<ListingResponse>('/listings', input),
    onSuccess: (data) => sync(data),
  });
}

export function useUpdateListing(id: number) {
  const sync = useListingCache();
  return useMutation({
    mutationFn: (input: ListingUpdateInput) => patch<ListingResponse>(`/listings/${id}`, input),
    onSuccess: (data) => sync(data),
  });
}

/** submit | mark-sold | mark-available */
export function useListingAction(id: number) {
  const sync = useListingCache();
  return useMutation({
    mutationFn: (action: 'submit' | 'mark-sold' | 'mark-available') =>
      post<ListingResponse>(`/listings/${id}/${action}`),
    onSuccess: (data) => sync(data),
  });
}

export function useDeleteListing(id: number) {
  const sync = useListingCache();
  return useMutation({
    mutationFn: () => del<null>(`/listings/${id}`),
    onSuccess: () => sync(null, id),
  });
}

export function useListingPhotos(id: number) {
  const sync = useListingCache();
  const onSuccess = (data: ListingResponse) => sync(data);
  return {
    upload: useMutation({
      mutationFn: (files: File[]) => {
        const form = new FormData();
        files.forEach((f) => form.append('images', f));
        return api<ListingResponse>(`/listings/${id}/images`, { method: 'POST', body: form });
      },
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (imageId: number) => del<ListingResponse>(`/listings/${id}/images/${imageId}`),
      onSuccess,
    }),
    reorder: useMutation({
      mutationFn: (imageIds: number[]) =>
        put<ListingResponse>(`/listings/${id}/images/order`, { imageIds }),
      onSuccess,
    }),
  };
}

export function useReviewQueue() {
  return useQuery({
    queryKey: ['review-queue'],
    queryFn: () => api<{ listings: ReviewQueueItem[] }>('/admin/listings/review-queue'),
    select: (d) => d.listings,
  });
}

export function useReviewCount(enabled: boolean) {
  return useQuery({
    queryKey: ['review-queue', 'count'],
    queryFn: () => api<{ count: number }>('/admin/listings/review-queue/count'),
    select: (d) => d.count,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useModerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      reason,
    }: {
      id: number;
      decision: 'approve' | 'reject';
      reason?: string;
    }) => post(`/admin/listings/${id}/${decision}`, decision === 'reject' ? { reason } : undefined),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ['review-queue'] });
      qc.removeQueries({ queryKey: listingKey(id) });
    },
  });
}
