import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RatesResponse } from '@tzed/shared';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';

export function renderApp(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Stubs fetch so GET /api/v1/rates returns the given rate (or none). */
export function mockRates(rate: number | null = 105) {
  const body: RatesResponse = {
    rates:
      rate === null
        ? []
        : [{ base: 'ZMW', quote: 'TZS', rate, effectiveAt: '2026-10-20T08:00:00.000Z' }],
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/api/v1/rates')) {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
