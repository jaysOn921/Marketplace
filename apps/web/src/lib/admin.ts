import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminCategoryRow,
  AdminDisputeRow,
  AdminFaqRow,
  AdminListingRow,
  AdminReviewRow,
  AdminStats,
  AdminTicketRow,
  AdminUserRow,
  AuditLogRow,
  Paged,
} from '@tzed/shared';
import { api, post, put } from './api';

/** GET an admin list with query parameters (empty values are dropped). */
function useAdminList<T>(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: ['admin', path, qs],
    queryFn: () => api<T>(`/admin/${path}${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export const useAdminStats = () =>
  useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api<AdminStats>('/admin/stats'),
    refetchInterval: 60_000,
  });
export const useAdminUsers = (p: Record<string, string | undefined>) =>
  useAdminList<Paged<AdminUserRow>>('users', p);
export const useAdminListings = (p: Record<string, string | undefined>) =>
  useAdminList<Paged<AdminListingRow>>('listings', p);
export const useAdminReviews = (p: Record<string, string | undefined>) =>
  useAdminList<Paged<AdminReviewRow>>('reviews', p);
export const useAdminDisputes = (p: Record<string, string | undefined>) =>
  useAdminList<Paged<AdminDisputeRow>>('disputes', p);
export const useAdminTickets = (p: Record<string, string | undefined>) =>
  useAdminList<Paged<AdminTicketRow>>('tickets', p);
export const useAuditLog = (p: Record<string, string | undefined>) =>
  useAdminList<Paged<AuditLogRow> & { actions: string[] }>('audit', p);
export const useRateHistory = () =>
  useQuery({
    queryKey: ['admin', 'rates'],
    queryFn: () =>
      api<{
        history: {
          id: number;
          rate: number;
          note: string | null;
          setBy: string | null;
          effectiveAt: string;
        }[];
      }>('/admin/rates'),
  });
export const useAdminCategories = () =>
  useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api<{ categories: AdminCategoryRow[] }>('/admin/categories'),
  });
export const useAdminFaq = () =>
  useQuery({
    queryKey: ['admin', 'faq'],
    queryFn: () => api<{ articles: AdminFaqRow[] }>('/admin/help/articles'),
  });

/** Any admin write; refreshes admin data, badges and public caches that may have changed. */
export function useAdminAction<I>(send: (input: I) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () => {
      for (const key of [
        'admin',
        'counts',
        'rates',
        'categories',
        'help',
        'help-article',
        'search',
        'listing',
        'reviews',
        'shop',
        'order',
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export const adminPost = (path: string, body?: unknown) => post(`/admin/${path}`, body);
export const adminPut = (path: string, body: unknown) => put(`/admin/${path}`, body);
