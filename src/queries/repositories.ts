/**
 * React Query hooks for the repository data layer (P1-4b).
 *
 * These hooks wrap the `src/api/repositories` functions and own cache
 * invalidation. The UI (RepositoriesPage) consumes them; this module touches
 * no UI. Mutations invalidate both the list and the affected detail entry so
 * the cache stays consistent after a write.
 *
 * `useCommits`/`useChanges` are gated on the selected repository having a
 * local path (`hasLocalPath`) — the backend rejects git log/changes with a
 * VALIDATION_ERROR when no local path is configured, so we skip the request
 * entirely rather than surface a 400.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchRepository,
  listChanges,
  listCommits,
  listRepositories,
  registerRepository,
  revertChange,
  testRepository,
} from '../api/repositories'
import type { RepositoryListParams } from '../api/repositories'
import type { RegisterRepositoryInput } from '../types'

/**
 * Query-key factory for repositories. Centralized so mutations can invalidate
 * the exact list/detail/commits/changes entries without re-deriving key shapes.
 */
export const repositoriesKeys = {
  all: ['repositories'] as const,
  lists: () => [...repositoriesKeys.all, 'list'] as const,
  list: (filters?: RepositoryListParams) =>
    [...repositoriesKeys.lists(), filters ?? {}] as const,
  details: () => [...repositoriesKeys.all, 'detail'] as const,
  detail: (id: string) => [...repositoriesKeys.details(), id] as const,
  commits: (id: string, limit?: number) =>
    [...repositoriesKeys.detail(id), 'commits', limit ?? 'default'] as const,
  changes: (id: string) => [...repositoriesKeys.detail(id), 'changes'] as const,
}

/** List repositories — select unwraps the `{ data }` envelope for the UI. */
export function useRepositories(filters?: RepositoryListParams) {
  return useQuery({
    queryKey: repositoriesKeys.list(filters),
    queryFn: () => listRepositories(filters),
    select: (res) => res.data,
  })
}

export function useRepository(id: string | null | undefined) {
  return useQuery({
    // M1（审查修复）：禁用态 key 走工厂（避免字面量落入 detail 前缀树被前缀 invalidate 误伤）
    queryKey: repositoriesKeys.detail(id ?? '__disabled__'),
    queryFn: () => fetchRepository(id as string),
    enabled: !!id,
  })
}

/**
 * Commits for a repository. Disabled when the repository has no local path
 * (the backend would 400) or when no id is selected.
 */
export function useCommits(
  id: string | null | undefined,
  enabled: boolean,
  limit?: number,
) {
  return useQuery({
    // M2（审查修复）：limit 进 query key——切 limit 不读旧缓存
    queryKey: repositoriesKeys.commits(id ?? '__disabled__', limit),
    queryFn: () => listCommits(id as string, limit),
    enabled: !!id && enabled,
  })
}

/**
 * Worktree changes for a repository. Disabled when the repository has no
 * local path (the backend would 400) or when no id is selected.
 */
export function useChanges(id: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: repositoriesKeys.changes(id ?? ''),
    queryFn: () => listChanges(id as string),
    enabled: !!id && enabled,
  })
}

export function useRevertChange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; path: string }) =>
      revertChange(vars.id, vars.path),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: repositoriesKeys.changes(vars.id),
      })
      void queryClient.invalidateQueries({
        queryKey: repositoriesKeys.detail(vars.id),
      })
    },
  })
}

/**
 * Register a new repository. On success invalidate the list so the new entry
 * appears, and return the response so the UI can surface the registered repo
 * (the server assigns id/status/timestamps).
 */
export function useRegisterRepository() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterRepositoryInput) => registerRepository(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: repositoriesKeys.lists() })
    },
  })
}

/**
 * Probe a repository's connectivity. Read-only (no cache to invalidate), so the
 * UI consumes the `{ ok, latencyMs, message }` result directly for a toast.
 */
export function useTestRepository() {
  return useMutation({
    mutationFn: (id: string) => testRepository(id),
  })
}
