/**
 * REST client for the user-management domain (P2-4b).
 *
 * Mirrors the backend endpoints implemented in P2-4a:
 *   GET   /users              -> { data, page }                    (LEADER+)
 *   GET   /users/{id}         -> UserDto                           (LEADER+)
 *   PATCH /users/{id}         { role? | status? | displayName? } -> UserDto
 *
 * Auth rides the same-origin session cookie (NextAuth) — no Bearer token. The
 * shared client (`./client`) extracts the `data` field on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure. The list
 * response keeps the full `{ data, page }` envelope (`unwrap: false`) so the
 * caller can read pagination; detail/PATCH unwrap to the DTO directly.
 *
 * Self-edit protection: the backend 403s role/status changes on the operator's
 * own row ("cannot change your own role/status"). The UI disables those
 * controls on the current user's row as a first line of defense.
 *
 * The PATCH body is "one of" role / status / displayName — the backend rejects
 * >1 field with 400 VALIDATION_ERROR, so callers must send exactly one.
 */

import { get, patch as patchRequest } from './client'
import type {
  UpdateUserPatch,
  UserDto,
  UserListResponse,
} from '../types'

/** `GET /users` — 用户列表（MVP 不分页：nextCursor:null / hasMore:false）。 */
export function listUsers(): Promise<UserListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<UserListResponse>('/users', { unwrap: false })
}

/** `GET /users/{id}` — 用户详情（脱敏 DTO；password/凭证永不出现）。 */
export function fetchUser(id: string): Promise<UserDto> {
  return get<UserDto>(`/users/${encodeURIComponent(id)}`)
}

/**
 * `PATCH /users/{id}` — 更新用户（role / status / displayName 三选一）。
 * role/status 改自己会被后端 403 拦截；前端再守一道。
 */
export function updateUser(id: string, patch: UpdateUserPatch): Promise<UserDto> {
  return patchRequest<UserDto>(`/users/${encodeURIComponent(id)}`, patch)
}
