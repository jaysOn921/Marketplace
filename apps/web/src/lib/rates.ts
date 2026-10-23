import { useQuery } from '@tanstack/react-query';
import type { ExchangeRateInfo, RatesResponse } from '@tzed/shared';
import { api } from './api';

/** The current ZMW ⇄ TZS rate (one stored rate; the reverse is derived from it). */
export function useZmwTzsRate() {
  return useQuery({
    queryKey: ['rates'],
    queryFn: () => api<RatesResponse>('/rates'),
    staleTime: 5 * 60_000,
    select: (data): ExchangeRateInfo | null =>
      data.rates.find(
        (r) => (r.base === 'ZMW' && r.quote === 'TZS') || (r.base === 'TZS' && r.quote === 'ZMW'),
      ) ?? null,
  });
}
