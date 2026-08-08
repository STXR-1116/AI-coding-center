/**
 * REST client for the platform config domain (P2-3b / P3-9).
 *
 * Mirrors the versioned config endpoints implemented in P2-3a / P3-9:
 *   GET  /config/token-budget  -> TokenBudgetConfig
 *   PUT  /config/token-budget  { ...fields, version } -> TokenBudgetConfig
 *   GET  /config/platform      -> PlatformConfig
 *   PUT  /config/platform      { payload, version }   -> PlatformConfig
 *
 * Both GET and PUT carry an integer `version` for optimistic locking. A PUT
 * sends the version last seen; the server either returns the incremented full
 * config, or rejects with `409 VERSION_CONFLICT` when its version has moved
 * ahead (the caller — `queries/config.ts` — refetches and surfaces the
 * conflict). Auth rides the same-origin session cookie (NextAuth) — no Bearer
 * token. The shared client (`./client`) extracts the `data` field on success
 * and throws an `ApiClientError` carrying the backend error envelope on
 * failure. PUT 依赖 version 乐观锁做并发保护（客户端 Idempotency-Key 仅对 POST 生效——PUT 无幂等键）。
 */

import { get, put } from './client'
import type { TokenBudgetConfig, PlatformConfig } from '../types'

/** Fetch the current global Token-budget config (`GET /config/token-budget`). */
export function fetchTokenBudgetConfig(): Promise<TokenBudgetConfig> {
  return get<TokenBudgetConfig>('/config/token-budget')
}

/**
 * Update the global Token-budget config (`PUT /config/token-budget`).
 *
 * The input is the full config shape plus the `version` last read from GET —
 * the server uses it for optimistic locking. On success the server returns the
 * incremented full config; on a stale version it throws an `ApiClientError`
 * with `status: 409, code: 'VERSION_CONFLICT'`.
 */
export function updateTokenBudgetConfig(
  input: TokenBudgetConfig,
): Promise<TokenBudgetConfig> {
  // 版本化写：Idempotency-Key 防止网络重试重复落库；version 做乐观锁
  return put<TokenBudgetConfig>('/config/token-budget', input, {
    idempotent: true,
  })
}

/** Fetch the current platform parameters (`GET /config/platform`). */
export function fetchPlatformConfig(): Promise<PlatformConfig> {
  return get<PlatformConfig>('/config/platform')
}

/**
 * Update the platform parameters (`PUT /config/platform`).
 *
 * The body sent to the server is `{ payload, version }` — the backend stores
 * the whole `PlatformConfig` object (minus `version`) as one JSON blob and uses
 * `version` for optimistic locking. The input here is the full
 * `PlatformConfig` (including `version`); this wrapper strips `version` into
 * the `payload` envelope the route expects. On success the server returns the
 * incremented full config; on a stale version it throws an `ApiClientError`
 * with `status: 409, code: 'VERSION_CONFLICT'`.
 */
export function updatePlatformConfig(
  input: PlatformConfig,
): Promise<PlatformConfig> {
  // 版本化写：payload 为整块配置（去掉 version），version 做乐观锁
  const { version, ...payload } = input
  return put<PlatformConfig>('/config/platform', { payload, version }, {
    idempotent: true,
  })
}
