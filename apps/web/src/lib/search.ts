import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SearchResponse, ShopResponse, SuggestResponse } from '@tzed/shared';
import { useEffect, useState } from 'react';
import { api } from './api';

/** Search parameters the page keeps in the URL and passes to the API. */
export const SEARCH_PARAMS = [
  'q',
  'category',
  'country',
  'availableIn',
  'condition',
  'minPrice',
  'maxPrice',
  'currency',
  'seller',
  'sort',
  'page',
  'pageSize',
] as const;

export function toApiQuery(params: URLSearchParams | Record<string, string | undefined>) {
  const out = new URLSearchParams();
  for (const key of SEARCH_PARAMS) {
    const v = params instanceof URLSearchParams ? params.get(key) : params[key];
    if (v) out.set(key, v);
  }
  return out.toString();
}

export function useSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api<SearchResponse>(`/search?${query}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useSuggestions(q: string) {
  const term = useDebounced(q.trim(), 200);
  return useQuery({
    queryKey: ['suggest', term],
    queryFn: () => api<SuggestResponse>(`/search/suggest?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useShop(slug: string | undefined) {
  return useQuery({
    queryKey: ['shop', slug],
    queryFn: () => api<ShopResponse>(`/shops/${slug}`),
    select: (d) => d.shop,
    enabled: Boolean(slug),
  });
}
