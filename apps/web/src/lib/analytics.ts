import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminAnalytics, SellerAnalytics } from '@tzed/shared';
import { api } from './api';

export const useAdminAnalytics = (days: number) =>
  useQuery({
    queryKey: ['admin', 'analytics', days],
    queryFn: () => api<AdminAnalytics>(`/admin/analytics?days=${days}`),
    placeholderData: keepPreviousData,
  });

export const useSellerAnalytics = (days: number) =>
  useQuery({
    queryKey: ['analytics', 'seller', days],
    queryFn: () => api<SellerAnalytics>(`/me/analytics?days=${days}`),
    placeholderData: keepPreviousData,
  });
