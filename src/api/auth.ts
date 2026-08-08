/**
 * Auth API + role normalization.
 *
 * Backend endpoints (session-cookie auth, same-origin via vite proxy):
 *   POST /auth/login   { username, password } -> { data: { user, capabilities } }
 *   GET  /auth/me                         -> { data: { user, role, capabilities, visibleModules, defaultProject } }
 *   POST /auth/logout                     -> 204
 *
 * The backend returns `role` as an uppercase enum (EMPLOYEE/LEADER/PM); the
 * frontend stores it lowercased (employee/leader/pm) to match the `Role` type.
 */

import type { Role } from '../types'
import { ApiClientError, get, post } from './client'

/** Raw user shape returned by /auth/login and /auth/me. */
export interface ApiUser {
  id: string
  username: string
  name: string
  role: string
  title?: string
}

export interface LoginResponse {
  user: ApiUser
  capabilities: string[]
}

export interface MeResponse {
  user: ApiUser
  role: string
  capabilities: string[]
  visibleModules: string[]
  defaultProject: string | null
}

const ROLE_MAP: Record<string, Role> = {
  EMPLOYEE: 'employee',
  LEADER: 'leader',
  PM: 'pm',
}

/**
 * Normalize a backend role (uppercase enum or already-lowercase) into the
 * frontend `Role` union. Unknown values default to the least-privileged role
 * ('employee') so a malformed payload can never grant elevated access.
 */
export function normalizeRole(role: string | undefined | null): Role {
  if (!role) return 'employee'
  const mapped = ROLE_MAP[role.toUpperCase()]
  return mapped ?? 'employee'
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', { username, password }, { idempotent: true })
}

/**
 * Fetch the current session user. Returns `null` when there is no session
 * (backend responds 401) so callers can treat "not logged in" as data rather
 * than an exception. Any other failure still throws `ApiClientError`.
 */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await get<MeResponse>('/auth/me')
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null
    throw error
  }
}

export function logout(): Promise<void> {
  return post<void>('/auth/logout')
}
