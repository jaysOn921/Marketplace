import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { CountriesResponse, RatesResponse, SessionUser } from '@tzed/shared';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { clearCsrfToken } from '../lib/api';

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

type Handler = (body: unknown, init: RequestInit, url: URL) => { status?: number; body?: unknown };

export const sampleUser: SessionUser = {
  id: 1,
  email: 'natasha@example.com',
  name: 'Natasha Phiri',
  phone: null,
  countryCode: 'ZM',
  currency: 'ZMW',
  role: 'USER',
  emailVerified: true,
  marketingEmails: false,
  sharePhoneOnOrders: false,
  twoStepEnabled: false,
  twoStepRequired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  sellerProfile: null,
};

const countries: CountriesResponse = {
  countries: [
    {
      code: 'TZ',
      name: 'Tanzania',
      currencyCode: 'TZS',
      phonePrefix: '+255',
      regions: [{ id: 1, name: 'Mbeya' }],
    },
    {
      code: 'ZM',
      name: 'Zambia',
      currencyCode: 'ZMW',
      phonePrefix: '+260',
      regions: [{ id: 2, name: 'Lusaka' }],
    },
  ],
};

/**
 * Stubs fetch with a tiny fake API. Routes are "METHOD /path" (after /api/v1).
 * Defaults cover CSRF, the signed-in user (none), rates and countries.
 */
export function mockApi(
  routes: Record<string, Handler> = {},
  { user = null as SessionUser | null, rate = 105 as number | null } = {},
) {
  clearCsrfToken();
  const rates: RatesResponse = {
    rates:
      rate === null
        ? []
        : [{ base: 'ZMW', quote: 'TZS', rate, effectiveAt: '2026-10-20T08:00:00.000Z' }],
  };
  const all: Record<string, Handler> = {
    'GET /auth/csrf': () => ({ body: { csrfToken: 'test-csrf' } }),
    'GET /auth/me': () => ({ body: { user } }),
    'GET /rates': () => ({ body: rates }),
    'GET /countries': () => ({ body: countries }),
    ...routes,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input)
      .replace(/^.*\/api\/v1/, '')
      .split('?')[0];
    const key = `${(init.method ?? 'GET').toUpperCase()} ${path}`;
    const handler = all[key];
    if (!handler)
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: key } }), {
        status: 404,
      });
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const result = handler(body, init, new URL(String(input), 'http://localhost'));
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Stubs fetch so GET /api/v1/rates returns the given rate (or none). */
export function mockRates(rate: number | null = 105) {
  return mockApi({}, { rate });
}
