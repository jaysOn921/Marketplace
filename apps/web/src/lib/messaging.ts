import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConversationResponse,
  ConversationsResponse,
  CountsResponse,
  NotificationsResponse,
  StartConversationInput,
} from '@tzed/shared';
import { api, post } from './api';
import { useMe } from './auth';

/** Header badge counts, polled while signed in. */
export function useCounts() {
  const { data: user } = useMe();
  return useQuery({
    queryKey: ['counts'],
    queryFn: () => api<CountsResponse>('/me/counts'),
    enabled: Boolean(user),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<ConversationsResponse>('/conversations'),
    refetchInterval: 15_000,
  });
}

export function useConversation(id: number | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const data = await api<ConversationResponse>(`/conversations/${id}`);
      // Opening a conversation marks it read: refresh the badges and the inbox list.
      void qc.invalidateQueries({ queryKey: ['counts'] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      return data;
    },
    enabled: Boolean(id),
    refetchInterval: 5_000,
  });
}

function useMessagingCache() {
  const qc = useQueryClient();
  return (data: ConversationResponse) => {
    qc.setQueryData(['conversation', data.conversation.id], data);
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };
}

export function useSendMessage(id: number) {
  const sync = useMessagingCache();
  return useMutation({
    mutationFn: (body: string) =>
      post<ConversationResponse>(`/conversations/${id}/messages`, { body }),
    onSuccess: sync,
  });
}

export function useStartConversation() {
  const sync = useMessagingCache();
  return useMutation({
    mutationFn: (input: StartConversationInput) =>
      post<ConversationResponse>('/conversations', input),
    onSuccess: sync,
  });
}

export function useNotifications(limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['notifications', limit],
    queryFn: () => api<NotificationsResponse>(`/notifications?limit=${limit}`),
    enabled,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['counts'] });
  };
  return {
    one: useMutation({
      mutationFn: (id: number) => post(`/notifications/${id}/read`),
      onSuccess: refresh,
    }),
    all: useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: refresh }),
  };
}
