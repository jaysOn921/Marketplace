import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CountriesResponse,
  LoginInput,
  MeResponse,
  RegisterInput,
  SessionUser,
} from '@tzed/shared';
import { api, clearCsrfToken, post } from './api';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => api<MeResponse>('/auth/me'),
    staleTime: 60_000,
    select: (d) => d.user,
  });
}

/** Mutations that return the updated user can put it straight into the cache. */
export function useSetMe() {
  const qc = useQueryClient();
  return (user: SessionUser | null) => qc.setQueryData<MeResponse>(meKey, { user });
}

export function useLogin() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (input: LoginInput) => post<MeResponse>('/auth/login', input),
    onSuccess: (data) => setMe(data.user),
  });
}

export function useRegister() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (input: RegisterInput) => post<MeResponse>('/auth/register', input),
    onSuccess: (data) => setMe(data.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<null>('/auth/logout'),
    onSettled: () => {
      clearCsrfToken();
      qc.setQueryData<MeResponse>(meKey, { user: null });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'rates' });
    },
  });
}

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: () => api<CountriesResponse>('/countries'),
    staleTime: Infinity,
    select: (d) => d.countries,
  });
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}
