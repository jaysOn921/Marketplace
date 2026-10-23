import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  HelpArticleResponse,
  HelpArticlesResponse,
  ReportGroup,
  ReportInput,
  ResolveReportInput,
  TicketDetail,
  TicketInput,
  TicketSummary,
} from '@tzed/shared';
import { api, post } from './api';

export function useHelpArticles(q: string, topic: string | null) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (topic) params.set('topic', topic);
  return useQuery({
    queryKey: ['help', q, topic],
    queryFn: () => api<HelpArticlesResponse>(`/help/articles?${params}`),
    placeholderData: keepPreviousData,
  });
}

export function useHelpArticle(slug: string | undefined) {
  return useQuery({
    queryKey: ['help-article', slug],
    queryFn: () => api<HelpArticleResponse>(`/help/articles/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useCreateTicket() {
  return useMutation({
    mutationFn: (input: TicketInput) =>
      post<{ id: number; token: string | null }>('/support/tickets', input),
  });
}

export function useMyTickets() {
  return useQuery({
    queryKey: ['tickets'],
    queryFn: () => api<{ tickets: TicketSummary[] }>('/support/tickets'),
    select: (d) => d.tickets,
  });
}

const tokenQuery = (token: string | null) => (token ? `?token=${encodeURIComponent(token)}` : '');

export function useTicket(id: number, token: string | null) {
  return useQuery({
    queryKey: ['ticket', id, token],
    queryFn: () => api<{ ticket: TicketDetail }>(`/support/tickets/${id}${tokenQuery(token)}`),
    select: (d) => d.ticket,
    refetchInterval: 30_000,
  });
}

export function useTicketAction(id: number, token: string | null) {
  const qc = useQueryClient();
  const sync = (d: { ticket: TicketDetail }) => {
    qc.setQueryData(['ticket', id, token], d);
    void qc.invalidateQueries({ queryKey: ['tickets'] });
  };
  return {
    reply: useMutation({
      mutationFn: (body: string) =>
        post<{ ticket: TicketDetail }>(`/support/tickets/${id}/messages${tokenQuery(token)}`, {
          body,
        }),
      onSuccess: sync,
    }),
    close: useMutation({
      mutationFn: () =>
        post<{ ticket: TicketDetail }>(`/support/tickets/${id}/close${tokenQuery(token)}`),
      onSuccess: sync,
    }),
  };
}

export function useReport() {
  return useMutation({ mutationFn: (input: ReportInput) => post('/reports', input) });
}

export function useReportQueue() {
  return useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => api<{ groups: ReportGroup[] }>('/admin/reports'),
    select: (d) => d.groups,
  });
}

export function useResolveReports() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveReportInput) => post('/admin/reports/resolve', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-reports'] });
      void qc.invalidateQueries({ queryKey: ['counts'] });
    },
  });
}
