/**
 * React Query hooks for the user-management data layer (P2-4b).
 *
 * These hooks wrap the `src/api/users` functions and own cache invalidation.
 * The UI (UsersPage) consumes them; this module touches no UI. Mutations
 * invalidate the users list so the cache stays consistent after a write — same
 * strategy as `queries/agents`.
 *
 * Self-edit protection is enforced both client-side (UsersPage disables the
 * controls on the operator's own row) and server-side (the backend 403s
 * role/status changes on the operator's own row).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listUsers, updateUser } from '../api/users'
import { useConflictRefetch } from './errors'
import type { UpdateUserPatch } from '../types'

/**
 * Query-key factory for users. Centralized so mutations can invalidate the
 * exact list entries without re-deriving key shapes.
 */
export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: () => [...usersKeys.lists(), {}] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (id: string) => [...usersKeys.details(), id] as const,
}

/** List users — select unwraps the `{ data }` envelope for the UI. */
export function useUsers() {
  return useQuery({
    queryKey: usersKeys.list(),
    queryFn: () => listUsers(),
    select: (res) => res.data,
  })
}

/**
 * Update a user (role / status / displayName — one at a time). On success
 * invalidate the list so the row reflects the new value. On a 409 conflict
 * (VERSION_CONFLICT/STATE_CONFLICT) the server-side row has moved on, so
 * invalidate the list to pull the latest and let the caller show an info toast
 * via `handleApiError`'s friendly 409 copy.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient()
  const { refetchOnConflict } = useConflictRefetch()
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateUserPatch }) =>
      updateUser(vars.id, vars.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
    onError: (error) => {
      // 409 → 刷新列表到最新；调用方 onError 仍会触发 toast（用 handleApiError 文案）
      refetchOnConflict(error, usersKeys.lists())
    },
  })
}
