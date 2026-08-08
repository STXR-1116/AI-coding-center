/**
 * React Query hooks for the platform config data layer (P2-3b).
 *
 * These hooks wrap the `src/api/config` functions and own cache invalidation.
 * The UI (SettingsPage) consumes them; this module touches no UI. The token-
 * budget config is versioned (optimistic lock), so the update mutation special-
 * cases a `409 VERSION_CONFLICT`: rather than just surfacing the error, it
 * refetches the latest server value into the cache so the form re-syncs, and
 * leaves a flag on the thrown error so the UI can show an info toast
 * ("配置已被他人修改，已刷新最新值") instead of a generic failure.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchTokenBudgetConfig,
  updateTokenBudgetConfig,
  fetchPlatformConfig,
  updatePlatformConfig,
} from '../api/config'
import { ApiClientError } from '../api/client'
import type { TokenBudgetConfig, PlatformConfig } from '../types'

/** Error code the backend returns when a versioned PUT hits a stale `version`. */
const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT'

/**
 * Query-key factory for platform config. Centralized so mutations can
 * invalidate the exact config entries without re-deriving key shapes.
 */
export const configKeys = {
  all: ['config'] as const,
  tokenBudget: () => [...configKeys.all, 'token-budget'] as const,
  platform: () => [...configKeys.all, 'platform'] as const,
}

/**
 * Load the global Token-budget config (`GET /config/token-budget`).
 *
 * `select` returns the config as-is; the UI reads `version` to drive the
 * optimistic-lock PUT. While loading the UI renders a skeleton, and a hard
 * error surfaces a retryable error state.
 */
export function useTokenBudgetConfig() {
  return useQuery({
    queryKey: configKeys.tokenBudget(),
    queryFn: () => fetchTokenBudgetConfig(),
  })
}

/**
 * Thrown by `useUpdateTokenBudgetConfig` / `useUpdatePlatformConfig` when the
 * server rejects a stale `version` with `409 VERSION_CONFLICT`. Carries the
 * freshly refetched config so the UI can sync its local form to the latest
 * server value and inform the user instead of showing a generic failure.
 */
export class VersionConflictError<T> extends Error {
  /** The latest config the server holds (refetched on conflict). */
  readonly latest: T
  constructor(latest: T) {
    super('配置已被他人修改，已刷新最新值。')
    this.name = 'VersionConflictError'
    this.latest = latest
  }
}

/**
 * Update the global Token-budget config (`PUT /config/token-budget`).
 *
 * On success the mutation returns the incremented config (the UI syncs its
 * `version` from it). On a `409 VERSION_CONFLICT` the mutation:
 *   1. refetches the latest server config into the cache, and
 *   2. throws a `VersionConflictError` carrying that latest config,
 * so the UI can reset its form + show an info toast. Any other error is
 * rethrown unchanged for the standard error-toast path.
 */
export function useUpdateTokenBudgetConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TokenBudgetConfig) => updateTokenBudgetConfig(input),
    onSuccess: (data) => {
      // 用服务端递增后的完整配置直接写入缓存，避免一次额外 GET
      queryClient.setQueryData(configKeys.tokenBudget(), data)
    },
    onError: async (error, _input) => {
      if (!(error instanceof ApiClientError)) return
      if (error.code !== VERSION_CONFLICT_CODE) return
      // 版本冲突：重拉最新值落缓存，再抛携带最新值的 VersionConflictError
      const latest = await fetchTokenBudgetConfig()
      queryClient.setQueryData(configKeys.tokenBudget(), latest)
      throw new VersionConflictError<TokenBudgetConfig>(latest)
    },
  })
}

// ── 平台参数配置（P3-9） ───────────────────────────────────────────────────────
//
// 与 token-budget 同构：version 乐观锁 PUT，409 时重拉落缓存并抛
// VersionConflictError<PlatformConfig>，UI 据此重置表单 + info toast。

/**
 * Load the platform parameters (`GET /config/platform`).
 *
 * The UI reads `version` from the returned config to drive the optimistic-lock
 * PUT. While loading the UI renders a skeleton, and a hard error surfaces a
 * retryable error state.
 */
export function usePlatformConfig() {
  return useQuery({
    queryKey: configKeys.platform(),
    queryFn: () => fetchPlatformConfig(),
  })
}

/**
 * Update the platform parameters (`PUT /config/platform`).
 *
 * On success the mutation returns the incremented config (the UI syncs its
 * `version` from it). On a `409 VERSION_CONFLICT` the mutation:
 *   1. refetches the latest server config into the cache, and
 *   2. throws a `VersionConflictError` carrying that latest config,
 * so the UI can reset its form + show an info toast. Any other error is
 * rethrown unchanged for the standard error-toast path.
 */
export function useUpdatePlatformConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PlatformConfig) => updatePlatformConfig(input),
    onSuccess: (data) => {
      // 用服务端递增后的完整配置直接写入缓存，避免一次额外 GET
      queryClient.setQueryData(configKeys.platform(), data)
    },
    onError: async (error, _input) => {
      if (!(error instanceof ApiClientError)) return
      if (error.code !== VERSION_CONFLICT_CODE) return
      // 版本冲突：重拉最新值落缓存，再抛携带最新值的 VersionConflictError
      const latest = await fetchPlatformConfig()
      queryClient.setQueryData(configKeys.platform(), latest)
      throw new VersionConflictError<PlatformConfig>(latest)
    },
  })
}
