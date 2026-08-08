/**
 * REST client for the dashboard / metrics / audit domain (P2-4b).
 *
 * Mirrors the backend endpoints implemented in P2-4a:
 *   GET /dashboard/summary                                  -> DashboardSummaryDto
 *   GET /metrics/summary   { agentId?, from?, to? }         -> MetricsSummaryDto        (LEADER+)
 *   GET /audit-logs        { action?, entityType?, actorType?, dateFrom?, dateTo?, page?, pageSize? }
 *                                                           -> { data, page }            (LEADER+)
 *
 * Auth rides the same-origin session cookie (NextAuth) — no Bearer token. The
 * shared client (`./client`) extracts the `data` field on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure. The summary
 * endpoints unwrap to the DTO directly; the audit list keeps the full
 * `{ data, page }` envelope (`unwrap: false`) so the caller can read pagination.
 *
 * Note: the backend `/metrics/summary` accepts `agentId`/`from`/`to` (ISO dates),
 * not a `range` token. The UI's 7d/30d/90d selector is mapped to a `from` ISO
 * date by the query layer before calling `fetchMetricsSummary`.
 */

import { get } from './client'
import type {
  AuditLogListParams,
  AuditLogListResponse,
  DashboardSummaryDto,
  MetricsSummaryDto,
  MetricsSummaryParams,
} from '../types'

/**
 * Build the query string for `GET /metrics/summary` / `GET /audit-logs`. Empty/
 * undefined params are dropped so the URL stays clean and React Query keys stay
 * stable. Mirrors `toQuery` in api/agents.ts.
 */
function toQuery<T extends object>(params?: T): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/** `GET /dashboard/summary` — 仪表盘汇总（任务/Agent/需求统计 + 度量摘要）。 */
export function fetchDashboardSummary(): Promise<DashboardSummaryDto> {
  return get<DashboardSummaryDto>('/dashboard/summary')
}

/**
 * `GET /metrics/summary` — 度量汇总（时间序列，Recharts 直接消费）。
 * 仅 LEADER+ 有 metric:read 能力；EMPLOYEE 会收到 403。
 */
export function fetchMetricsSummary(
  params?: MetricsSummaryParams,
): Promise<MetricsSummaryDto> {
  return get<MetricsSummaryDto>(`/metrics/summary${toQuery(params)}`)
}

/**
 * `GET /audit-logs` — 审计日志列表（游标分页 + total）。仅 LEADER+ 可访问。
 * 列表响应 `{ data, page }` 需完整 envelope → unwrap:false。
 */
export function fetchAuditLogs(
  params?: AuditLogListParams,
): Promise<AuditLogListResponse> {
  return get<AuditLogListResponse>(`/audit-logs${toQuery(params)}`, {
    unwrap: false,
  })
}
