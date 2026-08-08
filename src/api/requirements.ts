/**
 * Requirement data-layer API functions (P1-2d reads + P1-6b writes).
 *
 * All endpoints live under `/requirements` and reuse the shared client
 * (`get`/`post`), which unwraps the backend `{ data }` envelope and throws
 * `ApiClientError` on non-2xx. The list response keeps its `{ data, page }`
 * envelope (`unwrap: false`) so callers receive the pagination cursor. The
 * client auto-generates `Idempotency-Key` for POSTs marked `idempotent`, so the
 * write functions only opt in — they never handle the header themselves.
 *
 * Backend contract (P1-5a reads / P1-6a writes):
 *   GET    /requirements            { status?, limit?, cursor? } -> { data, page }
 *   GET    /requirements/{id}                                    -> RequirementDto
 *   POST   /requirements            { title, summary?, description?, priority? } -> RequirementDto (201)
 *   POST   /requirements/{id}/analyze                          -> { requirement, tasksCreated }
 *   GET    /requirements/{id}/specs                            -> RequirementSpecDto[]
 *   POST   /requirements/{id}/cancel   { reason? }             -> { ok, status }
 */

import { get, post } from './client'
import type {
  AnalysisResultDto,
  CancelRequirementResult,
  CreateRequirementInput,
  RequirementDto,
  RequirementListParams,
  RequirementListResponse,
  RequirementSpecDto,
} from '../types'

/**
 * Build the query string for `GET /requirements`. Empty/undefined params are
 * dropped so the URL stays clean and React Query keys stay stable.
 */
function toQuery(params?: RequirementListParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.cursor) search.set('cursor', params.cursor)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listRequirements(params?: RequirementListParams): Promise<RequirementListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<RequirementListResponse>(`/requirements${toQuery(params)}`, { unwrap: false })
}

export function fetchRequirement(id: string): Promise<RequirementDto> {
  return get<RequirementDto>(`/requirements/${encodeURIComponent(id)}`)
}

/**
 * Create a requirement (P1-6a). `summary` is the `description` alias — the
 * backend prefers `description`, falling back to `summary` when absent. We send
 * both so the page can map its `description` form field to `summary` (matching
 * the CreateTaskDialog spec convention) while staying contract-complete.
 */
export function createRequirement(
  input: CreateRequirementInput,
): Promise<RequirementDto> {
  return post<RequirementDto>('/requirements', input, { idempotent: true })
}

/**
 * Run AI analysis / task decomposition on a requirement (P1-6a). The body is
 * optional and ignored by the backend (analysis derives purely from the
 * requirement); idempotency rides the auto Idempotency-Key. Returns the
 * post-analysis requirement plus the number of tasks created.
 */
export function analyzeRequirement(id: string): Promise<AnalysisResultDto> {
  return post<AnalysisResultDto>(
    `/requirements/${encodeURIComponent(id)}/analyze`,
    undefined,
    { idempotent: true },
  )
}

/**
 * List spec snapshots for a requirement (P1-6a). Returned newest-first
 * (highest version first); empty array when the requirement has never been
 * analyzed.
 */
export function listRequirementSpecs(
  id: string,
): Promise<RequirementSpecDto[]> {
  return get<RequirementSpecDto[]>(
    `/requirements/${encodeURIComponent(id)}/specs`,
  )
}

/**
 * Cancel a requirement (P1-6a). `reason` is contract-present but ignored by the
 * backend MVP; we omit the body when absent to keep the request clean. Cancel is
 * a state-transition op returning an operation result, not a resource snapshot.
 */
export function cancelRequirement(
  id: string,
  reason?: string,
): Promise<CancelRequirementResult> {
  return post<CancelRequirementResult>(
    `/requirements/${encodeURIComponent(id)}/cancel`,
    reason ? { reason } : undefined,
    { idempotent: true },
  )
}
