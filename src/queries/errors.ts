/**
 * Shared query-layer error helpers.
 *
 * `handleApiError` lives here so both the tasks and requirements query modules
 * can reuse it without one depending on the other. The legacy re-export from
 * `./tasks` keeps existing import sites (`TasksPage`, etc.) working.
 *
 * P3-2: `parseApiError` exposes the structured `{ message, code?, retryable? }`
 * shape so callers that need the code (e.g. 409 conflict handling) don't have
 * to re-instance-check `ApiClientError`. `handleApiError` keeps its string
 * return for the existing toast sites, but now routes through `parseApiError`
 * and overlays friendly copy for the well-known error codes (401/403/409).
 */

import { useQueryClient } from '@tanstack/react-query'
import { ApiClientError } from '../api/client'

/** Backend error codes that mean "someone else changed this first" (HTTP 409). */
const CONFLICT_CODES = new Set(['VERSION_CONFLICT', 'STATE_CONFLICT'])

/** Structured error info surfaced by `parseApiError`. */
export interface ApiErrorInfo {
  message: string
  code?: string
  retryable?: boolean
}

/**
 * Normalize a thrown error into structured info. `ApiClientError` carries the
 * backend's code/retryable/message; anything else collapses to a generic
 * failure so the UI never shows a raw stack trace or `undefined`.
 */
export function parseApiError(error: unknown): ApiErrorInfo {
  if (error instanceof ApiClientError) {
    return { message: error.message, code: error.code, retryable: error.retryable }
  }
  return { message: '操作失败' }
}

/**
 * Friendly, user-facing copy for well-known error codes. Falls through to the
 * backend message for anything uncatalogued.
 */
function friendlyMessage(error: ApiClientError): string {
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已过期，请重新登录'
    case 'FORBIDDEN':
      return '没有执行此操作的权限'
    case 'VERSION_CONFLICT':
      // 仅乐观锁冲突给"被他人修改"文案；STATE_CONFLICT 语义是"资源状态不允许/已存在"，
      // 应透传后端 message（如任务创建重复"任务已存在"）——H1 修复（审查回归）。
      return '数据已被其他操作修改，请刷新后重试'
    default:
      return error.message
  }
}

/**
 * Normalize a thrown error into a user-facing message. `ApiClientError`
 * carries the backend's localized message; anything else is a generic failure
 * so the UI never shows a raw stack trace or `undefined`. Well-known codes
 * (401/403/409) get friendly copy via `parseApiError` + `friendlyMessage`.
 */
export function handleApiError(error: unknown): string {
  if (error instanceof ApiClientError) return friendlyMessage(error)
  return '操作失败'
}

/**
 * Refetch relevant queries when a mutation hits a 409 conflict.
 *
 * Use in a mutation's `onError`: on a `VERSION_CONFLICT`/`STATE_CONFLICT` the
 * server-side state has moved on, so we invalidate the affected query keys to
 * pull the latest data, then return `true` so the caller can show an info
 * toast. Non-409 errors return `false` and leave the caller on the standard
 * error-toast path. Pass `keys` to scope the invalidation (e.g. a list key
 * factory); omit it to invalidate everything.
 */
export function useConflictRefetch() {
  const queryClient = useQueryClient()
  return {
    refetchOnConflict(
      error: unknown,
      keys?: readonly unknown[],
    ): boolean {
      if (!(error instanceof ApiClientError)) return false
      if (!CONFLICT_CODES.has(error.code)) return false
      void queryClient.invalidateQueries(
        keys ? { queryKey: keys } : undefined,
      )
      return true
    },
  }
}
