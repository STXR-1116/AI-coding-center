/**
 * React Query hooks for the agent data layer (P2-1b).
 *
 * These hooks wrap the `src/api/agents` functions and own cache invalidation.
 * The UI (AgentsPage) consumes them; this module touches no UI. Mutations
 * invalidate both the list and the affected detail entry so the cache stays
 * consistent after a write — same strategy as `queries/repositories`.
 *
 * `useAgent` is gated on a non-empty id (the backend would 404 on an empty
 * path segment), and the disabled-state key goes through the factory so it
 * never lands inside the `detail` prefix tree and gets caught by a prefix
 * invalidate.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAgent,
  listAgents,
  listSquads,
  registerAgent,
  rotateAgentToken,
  updateAgent,
} from '../api/agents'
import { useConflictRefetch } from './errors'
import type {
  AgentListParams,
  RegisterAgentInput,
  UpdateAgentPatch,
} from '../types'

/**
 * Query-key factory for agents. Centralized so mutations can invalidate the
 * exact list/detail/squads entries without re-deriving key shapes.
 */
export const agentsKeys = {
  all: ['agents'] as const,
  lists: () => [...agentsKeys.all, 'list'] as const,
  list: (filters?: AgentListParams) =>
    [...agentsKeys.lists(), filters ?? {}] as const,
  details: () => [...agentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentsKeys.details(), id] as const,
  squads: () => [...agentsKeys.all, 'squads'] as const,
}

/** List agents — select unwraps the `{ data }` envelope for the UI. */
export function useAgents(filters?: AgentListParams) {
  return useQuery({
    queryKey: agentsKeys.list(filters),
    queryFn: () => listAgents(filters),
    select: (res) => res.data,
  })
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    // 禁用态 key 走工厂（避免字面量落入 detail 前缀树被前缀 invalidate 误伤）
    queryKey: agentsKeys.detail(id ?? '__disabled__'),
    queryFn: () => fetchAgent(id as string),
    enabled: !!id,
  })
}

/** List squads — select unwraps the `{ data }` envelope for the UI. */
export function useSquads() {
  return useQuery({
    queryKey: agentsKeys.squads(),
    queryFn: () => listSquads(),
    select: (res) => res.data,
  })
}

/**
 * Register a new agent. On success invalidate the agents list so the new entry
 * appears, and return the response so the UI can surface the one-time
 * credential secret (the backend never echoes it again).
 */
export function useRegisterAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterAgentInput) => registerAgent(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })
    },
  })
}

/**
 * Rotate an agent's credential (SEC-6). The backend returns the freshly signed
 * secret in the clear exactly once, so on success the hook copies it straight to
 * the clipboard and notifies — the secret is never stored in React state or
 * rendered. The list + detail caches are invalidated so a follow-up fetch sees
 * the rotated credential id. Callers handle `onError` for the failure toast.
 *
 * Clipboard write can reject in non-secure contexts or when the API is
 * unavailable; that surfaces as a distinct info toast so the user knows the
 * rotation succeeded server-side even though the copy failed.
 */
export function useRotateAgentToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rotateAgentToken(id),
    onSuccess: async (data, id) => {
      void queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: agentsKeys.detail(id) })
      // 明文只在此处流经（API 层拿到后直接复制，不落入 state/渲染）
      void navigator.clipboard?.writeText(data.token).catch(() => {
        // 剪贴板失败：轮换已成功——由页面 onSuccess 兜底提示
      })
    },
  })
}

/**
 * Update an agent (status / executionMode / etc.). On success invalidate the
 * list and the affected detail entry so the cache stays consistent. On a 409
 * conflict (VERSION_CONFLICT/STATE_CONFLICT) the server-side agent has moved
 * on, so invalidate the list + detail to pull the latest and let the caller
 * show an info toast via `handleApiError`'s friendly 409 copy.
 */
export function useUpdateAgent() {
  const queryClient = useQueryClient()
  const { refetchOnConflict } = useConflictRefetch()
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateAgentPatch }) =>
      updateAgent(vars.id, vars.patch),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: agentsKeys.detail(vars.id),
      })
    },
    onError: (error, vars) => {
      // 409 → 刷新列表 + 该详情到最新；调用方 onError 仍会触发 toast（用 handleApiError 文案）
      if (refetchOnConflict(error, agentsKeys.lists())) {
        void queryClient.invalidateQueries({
          queryKey: agentsKeys.detail(vars.id),
        })
      }
    },
  })
}
