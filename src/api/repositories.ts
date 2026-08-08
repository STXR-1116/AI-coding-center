/**
 * REST client for the repository domain (P1-4b).
 *
 * Mirrors the backend read/write endpoints implemented in P1-4a / P2-3a:
 *   GET    /repositories                    -> RepositoryListResponse ({ data, page })
 *   POST   /repositories                    -> RegisterRepositoryResponse   (P2-3a register)
 *   GET    /repositories/{id}               -> RepositoryDto
 *   GET    /repositories/{id}/commits       -> CommitDto[]
 *   GET    /repositories/{id}/changes       -> WorktreeChangeDto[]
 *   POST   /repositories/{id}/changes/revert -> RevertResult
 *   POST   /repositories/{id}/test          -> RepositoryTestResult         (P2-3a probe)
 *
 * Auth rides the same-origin session cookie (NextAuth) — no Bearer token. The
 * shared client (`./client`) extracts the `data` field on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure. List
 * responses keep the full `{ data, page }` envelope (`unwrap: false`) so the
 * caller can read pagination; the others unwrap to the DTO directly.
 */

import { get, post } from './client'
import type {
  CommitDto,
  RegisterRepositoryInput,
  RegisterRepositoryResponse,
  RepositoryDto,
  RepositoryListResponse,
  RepositoryTestResult,
  RevertResult,
  WorktreeChangeDto,
} from '../types'

/**
 * Query filters accepted by `GET /repositories`. The backend MVP returns the
 * full visible list (no real pagination), but we accept the cursor params for
 * forward-compat and to keep React Query keys stable.
 */
export interface RepositoryListParams {
  limit?: number
  cursor?: string
}

function toQuery(params?: RepositoryListParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.cursor) search.set('cursor', params.cursor)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listRepositories(
  params?: RepositoryListParams,
): Promise<RepositoryListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<RepositoryListResponse>(`/repositories${toQuery(params)}`, {
    unwrap: false,
  })
}

export function fetchRepository(id: string): Promise<RepositoryDto> {
  return get<RepositoryDto>(`/repositories/${encodeURIComponent(id)}`)
}

export function listCommits(id: string, limit?: number): Promise<CommitDto[]> {
  const qs = limit !== undefined ? `?limit=${limit}` : ''
  return get<CommitDto[]>(`/repositories/${encodeURIComponent(id)}/commits${qs}`)
}

export function listChanges(id: string): Promise<WorktreeChangeDto[]> {
  return get<WorktreeChangeDto[]>(
    `/repositories/${encodeURIComponent(id)}/changes`,
  )
}

export function revertChange(id: string, path: string): Promise<RevertResult> {
  // 契约要求 { path }（P1-4a）；写操作幂等（revert 同一文件到 HEAD 多次等价）
  return post<RevertResult>(
    `/repositories/${encodeURIComponent(id)}/changes/revert`,
    { path },
    { idempotent: true },
  )
}

/**
 * Register a new repository (`POST /repositories`). The server assigns `id`,
 * `status`, and timestamps; `url`/`localPath` are both optional but at least
 * one is required (validated server-side). Register is idempotent (the client
 * attaches an `Idempotency-Key`) so a network retry won't create a duplicate.
 */
export function registerRepository(
  input: RegisterRepositoryInput,
): Promise<RegisterRepositoryResponse> {
  return post<RegisterRepositoryResponse>('/repositories', input, {
    idempotent: true,
  })
}

/**
 * Probe a repository's connectivity (`POST /repositories/{id}/test`). Returns
 * `{ ok, latencyMs, message }` — `ok` is the success flag, `latencyMs` the
 * round-trip time (0 on failure), and `message` a human-readable outcome.
 */
export function testRepository(id: string): Promise<RepositoryTestResult> {
  // 连接探测只读副作用（不落库）；幂等标注便于重试
  return post<RepositoryTestResult>(
    `/repositories/${encodeURIComponent(id)}/test`,
    {},
    { idempotent: true },
  )
}
