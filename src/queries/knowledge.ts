/**
 * React Query hooks for the knowledge-base data layer (P2-2b).
 *
 * These hooks wrap the `src/api/knowledge` functions and own cache invalidation.
 * The UI (KnowledgePage) consumes them; this module touches no UI. Mutations
 * invalidate both the list and the affected detail entry so the cache stays
 * consistent after a write — same strategy as `queries/agents`.
 *
 * `useKnowledgeBase` is gated on a non-empty id (the backend would 404 on an
 * empty path segment), and the disabled-state key goes through the factory so it
 * never lands inside the `detail` prefix tree and gets caught by a prefix
 * invalidate.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  bindAgent,
  disableKnowledgeBase,
  fetchKnowledgeBase,
  listKnowledgeBases,
  registerKnowledgeBase,
  unbindAgent,
  updateKnowledgeBase,
} from '../api/knowledge'
import type {
  RegisterKnowledgeBaseInput,
  UpdateKnowledgeBasePatch,
} from '../types'

/**
 * Query-key factory for knowledge bases. Centralized so mutations can
 * invalidate the exact list/detail entries without re-deriving key shapes.
 */
export const knowledgeKeys = {
  all: ['knowledge-bases'] as const,
  lists: () => [...knowledgeKeys.all, 'list'] as const,
  list: () => [...knowledgeKeys.lists(), {}] as const,
  details: () => [...knowledgeKeys.all, 'detail'] as const,
  detail: (id: string) => [...knowledgeKeys.details(), id] as const,
}

/** List knowledge bases — select unwraps the `{ data }` envelope for the UI. */
export function useKnowledgeBases() {
  return useQuery({
    queryKey: knowledgeKeys.list(),
    queryFn: () => listKnowledgeBases(),
    select: (res) => res.data,
  })
}

export function useKnowledgeBase(id: string | null | undefined) {
  return useQuery({
    // 禁用态 key 走工厂（避免字面量落入 detail 前缀树被前缀 invalidate 误伤）
    queryKey: knowledgeKeys.detail(id ?? '__disabled__'),
    queryFn: () => fetchKnowledgeBase(id as string),
    enabled: !!id,
  })
}

/**
 * Register a new knowledge base. On success invalidate the list so the new
 * entry appears. The response is the registered KB DTO (credentials never
 * echo back).
 */
export function useRegisterKnowledgeBase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterKnowledgeBaseInput) => registerKnowledgeBase(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists() })
    },
  })
}

/**
 * Update a knowledge base (name / mcpServerUrl / config). On success invalidate
 * the list and the affected detail entry so the cache stays consistent.
 */
export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateKnowledgeBasePatch }) =>
      updateKnowledgeBase(vars.id, vars.patch),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: knowledgeKeys.detail(vars.id),
      })
    },
  })
}

/** Disable a knowledge base (soft-delete). On success invalidate list + detail. */
export function useDisableKnowledgeBase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => disableKnowledgeBase(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: knowledgeKeys.detail(id),
      })
    },
  })
}

/** Bind an agent to a knowledge base. On success invalidate list + detail. */
export function useBindKnowledgeBase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { knowledgeBaseId: string; agentId: string }) =>
      bindAgent(vars.knowledgeBaseId, vars.agentId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: knowledgeKeys.detail(vars.knowledgeBaseId),
      })
    },
  })
}

/** Unbind an agent from a knowledge base. On success invalidate list + detail. */
export function useUnbindKnowledgeBase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { knowledgeBaseId: string; agentId: string }) =>
      unbindAgent(vars.knowledgeBaseId, vars.agentId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: knowledgeKeys.detail(vars.knowledgeBaseId),
      })
    },
  })
}
