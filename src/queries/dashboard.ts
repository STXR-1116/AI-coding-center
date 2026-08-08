/**
 * React Query hooks for the dashboard / metrics / audit data layer (P2-4b).
 *
 * These hooks wrap the `src/api/dashboard` functions. The UI (AnalyticsPage,
 * UsersPage audit section) consumes them; this module touches no UI. Read-only
 * domain — no mutations, so no cache invalidation here (the metrics/audit reads
 * are point-in-time snapshots; the realtime SSE bridge does not invalidate
 * these keys).
 *
 * The 7d/30d/90d range selector is mapped here to a `from` ISO date before
 * hitting `GET /metrics/summary` (the backend accepts `agentId`/`from`/`to`,
 * not a `range` token). `to` is omitted (= now).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAuditLogs,
  fetchDashboardSummary,
  fetchMetricsSummary,
} from '../api/dashboard'
import type { AuditLogListParams, MetricsSummaryParams } from '../types'

/** Analytics range keys used across the UI (mapped to `from` offsets below). */
export type DashboardRange = '7d' | '30d' | '90d'

/** Days each range key spans — used to compute the `from` ISO date for metrics. */
const RANGE_DAYS: Record<DashboardRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

/**
 * Query-key factory for dashboard/metrics/audit. Centralized so callers can
 * invalidate / match exact entries without re-deriving key shapes.
 */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
  metrics: (params?: MetricsSummaryParams) =>
    [...dashboardKeys.all, 'metrics', params ?? {}] as const,
  audit: (filters?: AuditLogListParams) =>
    [...dashboardKeys.all, 'audit', filters ?? {}] as const,
}

/** Dashboard summary — tasks/agents/requirements stats + metrics summary. */
export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: () => fetchDashboardSummary(),
  })
}

/**
 * Metrics summary (time-series for Recharts). `range` is mapped to a `from` ISO
 * date (now − N days); pass an explicit `params` override for agent/date scoping.
 * EMPLOYEE users will get a 403 — the UI gates this on a managerial role.
 *
 * `mergedParams` is memoized on `[range, params]` so the `from` ISO string is
 * computed once per `range` change, NOT every render — otherwise `new Date()`
 * drifts the query key on each render and React Query refetches indefinitely.
 * Callers passing a `params` override must keep it referentially stable across
 * renders (pass `undefined` or a `useMemo`'d object).
 */
export function useMetricsSummary(range?: DashboardRange, params?: MetricsSummaryParams) {
  const mergedParams = useMemo<MetricsSummaryParams>(() => {
    const merged: MetricsSummaryParams = { ...params }
    if (range && !merged.from) {
      const from = new Date()
      from.setDate(from.getDate() - RANGE_DAYS[range])
      merged.from = from.toISOString()
    }
    return merged
  }, [range, params])
  return useQuery({
    queryKey: dashboardKeys.metrics(mergedParams),
    queryFn: () => fetchMetricsSummary(mergedParams),
  })
}

/**
 * Audit logs (paginated, with filters). The selector unwraps the `{ data, page }`
 * envelope is returned whole so the UI can render total/hasMore. Pass
 * `{ pageSize: 10 }` for the UsersPage "recent 10" section.
 */
export function useAuditLogs(filters?: AuditLogListParams) {
  return useQuery({
    queryKey: dashboardKeys.audit(filters),
    queryFn: () => fetchAuditLogs(filters),
  })
}

/**
 * Infinite (cursor-paginated) audit log list for the AnalyticsPage "加载更多"
 * button (P3-1). Walks the `{ data, page: { nextCursor, hasMore } }` envelope
 * page by page; callers merge `data.pages.flatMap((p) => p.data)`.
 *
 * `useAuditLogs` (above) is retained for the UsersPage "recent 10" section,
 * which only needs the first page — converting it to infinite would break that
 * single-page read. 审计数据量小——本地展开足够（P3-1 决策：不做 infinite，避免单页/无限缓存错配）。
 */
