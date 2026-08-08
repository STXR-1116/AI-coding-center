/**
 * React Query hooks for the task data layer (P1-2a).
 *
 * These hooks wrap the `src/api/tasks` functions and own cache invalidation.
 * The UI (P1-2b) consumes them; this module touches no UI. Mutations
 * invalidate both the list and the affected detail entry so the cache stays
 * consistent after a write.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveTask,
  assignTask,
  cancelTask,
  createTask,
  executeTask,
  fetchTask,
  listTasks,
} from '../api/tasks'
import type { TaskListParams } from '../types'

// `handleApiError` was extracted into `./errors` so the requirements query
// module can reuse it without importing from `tasks`. Re-exported here to keep
// existing import sites (`TasksPage`, etc.) working — no behavior change.
export { handleApiError } from './errors'

/**
 * Query-key factory for tasks. Centralized so mutations can invalidate the
 * exact list/detail entries without re-deriving key shapes.
 */
export const tasksKeys = {
  all: ['tasks'] as const,
  lists: () => [...tasksKeys.all, 'list'] as const,
  list: (filters?: TaskListParams) => [...tasksKeys.lists(), filters ?? {}] as const,
  details: () => [...tasksKeys.all, 'detail'] as const,
  detail: (id: string) => [...tasksKeys.details(), id] as const,
}

export function useTasks(filters?: TaskListParams) {
  return useQuery({
    queryKey: tasksKeys.list(filters),
    queryFn: () => listTasks(filters),
  })
}

/**
 * Infinite (cursor-paginated) task list for "加载更多" consumption (P3-1).
 *
 * Unlike `useTasks` (a single-page read used by search/filter flows), this
 * hook walks the backend's `{ data, page: { nextCursor, hasMore } }` envelope
 * page by page. `getNextPageParam` returns the next cursor or `undefined` to
 * stop; React Query exposes `fetchNextPage` / `hasNextPage` /
 * `isFetchingNextPage` for the load-more button. Callers merge
 * `data.pages.flatMap((p) => p.data)` into one flat list.
 *
 * The query key reuses `tasksKeys.list` so list mutations invalidate the
 * infinite cache too (the `lists()` prefix covers both).
 */
export function useInfiniteTasks(filters?: TaskListParams) {
  return useInfiniteQuery({
    queryKey: tasksKeys.list(filters),
    queryFn: ({ pageParam }) =>
      listTasks({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.page.hasMore ? lastPage.page.nextCursor ?? undefined : undefined,
  })
}

export function useTask(id: string | null | undefined) {
  return useQuery({
    queryKey: tasksKeys.detail(id ?? ''),
    queryFn: () => fetchTask(id as string),
    enabled: !!id,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
    },
  })
}

export function useAssignTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; agentId?: string; squadId?: string }) =>
      assignTask(vars.id, { agentId: vars.agentId, squadId: vars.squadId }),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(task.id) })
    },
  })
}

export function useExecuteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => executeTask(id),
    onSuccess: ({ task }) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(task.id) })
    },
  })
}

export function useApproveTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveTask(id),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(task.id) })
    },
  })
}

export function useCancelTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelTask(id),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(task.id) })
    },
  })
}
