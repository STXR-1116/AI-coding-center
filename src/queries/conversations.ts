/**
 * React Query hooks for the conversation data layer (P1-3b).
 *
 * These hooks wrap the `src/api/conversations` functions and own cache
 * invalidation. The UI (P1-3c WorkspacePage) consumes them; this module
 * touches no UI. The streaming path (`useStreamChat`) lives in
 * `src/hooks` because it manages local transient state (the in-flight
 * assistant text) rather than the React Query cache — these hooks handle the
 * persisted conversation/message state.
 *
 * Mutations invalidate both the list and the affected detail entry so the
 * cache stays consistent after a write. `useSendMessage` additionally leaves
 * detail invalidation to the caller via the returned id, so a streaming caller
 * can refresh once after the stream completes rather than mid-stream.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createConversation,
  deleteConversation,
  fetchConversation,
  listConversations,
  sendMessage,
} from '../api/conversations'
import type { CreateConversationInput } from '../api/conversations'

/**
 * Query-key factory for conversations. Centralized so mutations can invalidate
 * the exact list/detail entries without re-deriving key shapes.
 */
export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  details: () => [...conversationKeys.all, 'detail'] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
}

/** List conversations — select unwraps the `{ data }` envelope for the UI. */
export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: () => listConversations(),
    select: (res) => res.data,
  })
}

export function useConversation(id: string | null | undefined) {
  return useQuery({
    // M3（审查修复）：id 为空时禁用查询且不产生空串 key（保持 key 工厂稳定唯一）
    queryKey: id ? conversationKeys.detail(id) : ['conversations', 'detail', '__disabled__'],
    queryFn: () => fetchConversation(id as string),
    enabled: !!id,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateConversationInput) => createConversation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) })
    },
  })
}

/**
 * Non-streaming message send. Returns the conversation id so the caller can
 * invalidate the detail cache (the persisted message list) on success. When
 * streaming via `useStreamChat`, prefer invalidating detail after the stream's
 * `done` frame instead of calling this mutation.
 */
export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; content: string }) =>
      sendMessage(vars.id, vars.content),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(vars.id) })
    },
  })
}
