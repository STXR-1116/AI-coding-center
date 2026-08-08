/**
 * React Query hooks for the requirement data layer (P1-2d reads + P1-6b writes).
 *
 * These hooks wrap the `src/api/requirements` functions and own cache
 * invalidation. The UI (RequirementsPage, CreateTaskDialog) consumes them; this
 * module touches no UI. Mutations invalidate both the list and the affected
 * detail/specs entries so the cache stays consistent after a write.
 *
 * `useRequirement`/`useRequirementSpecs` are gated on a selected id — the
 * backend 404s on an unknown id, so we skip the request entirely when nothing
 * is selected rather than surface an error. The disabled-state query key goes
 * through the factory (not a bare literal) so it never lands in the detail
 * prefix tree and gets wrongly invalidated by a list mutation (mirrors the
 * P1-4b `useRepository` fix).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  analyzeRequirement,
  cancelRequirement,
  createRequirement,
  fetchRequirement,
  listRequirementSpecs,
  listRequirements,
} from '../api/requirements'
import type {
  CreateRequirementInput,
  RequirementListParams,
} from '../types'

/**
 * Query-key factory for requirements. Centralized so mutations can invalidate
 * the exact list/detail/specs entries without re-deriving key shapes.
 */
export const requirementsKeys = {
  all: ['requirements'] as const,
  lists: () => [...requirementsKeys.all, 'list'] as const,
  list: (filters?: RequirementListParams) =>
    [...requirementsKeys.lists(), filters ?? {}] as const,
  details: () => [...requirementsKeys.all, 'detail'] as const,
  detail: (id: string) => [...requirementsKeys.details(), id] as const,
  specs: (id: string) => [...requirementsKeys.detail(id), 'specs'] as const,
}

/** List requirements — select unwraps the `{ data }` envelope for the UI. */
export function useRequirements(filters?: RequirementListParams) {
  return useQuery({
    queryKey: requirementsKeys.list(filters),
    queryFn: () => listRequirements(filters),
    select: (res) => res.data,
  })
}

/**
 * Infinite (cursor-paginated) requirement list for "加载更多" (P3-1). Walks the
 * `{ data, page: { nextCursor, hasMore } }` envelope page by page; callers merge
 * `data.pages.flatMap((p) => p.data)`. The query key reuses
 * `requirementsKeys.list` so write mutations invalidate it too.
 */

export function useRequirement(id: string | null | undefined) {
  return useQuery({
    // 禁用态 key 走工厂（避免字面量落入 detail 前缀树被前缀 invalidate 误伤——同 P1-4b useRepository）
    queryKey: requirementsKeys.detail(id ?? '__disabled__'),
    queryFn: () => fetchRequirement(id as string),
    enabled: !!id,
  })
}

/** Spec snapshots for a requirement — newest-first; empty when never analyzed. */
export function useRequirementSpecs(id: string | null | undefined) {
  return useQuery({
    queryKey: requirementsKeys.specs(id ?? '__disabled__'),
    queryFn: () => listRequirementSpecs(id as string),
    enabled: !!id,
  })
}

/**
 * Create a requirement. On success invalidate every list (filters vary) so the
 * new row appears regardless of the active filter; returns the created DTO so
 * the caller can select it.
 */
export function useCreateRequirement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRequirementInput) => createRequirement(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: requirementsKeys.lists() })
    },
  })
}

/**
 * Analyze a requirement. On success invalidate the detail (status flips
 * draft → in_progress) and its specs (a new snapshot is produced). Invalidating
 * the lists too keeps the board status counts honest.
 */
export function useAnalyzeRequirement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => analyzeRequirement(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: requirementsKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: requirementsKeys.specs(id) })
      void queryClient.invalidateQueries({ queryKey: requirementsKeys.lists() })
    },
  })
}

/**
 * Cancel a requirement. On success invalidate the detail (status → cancelled)
 * and the lists so the board reflects the new state.
 */
export function useCancelRequirement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      cancelRequirement(vars.id, vars.reason),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: requirementsKeys.detail(vars.id) })
      void queryClient.invalidateQueries({ queryKey: requirementsKeys.lists() })
    },
  })
}
