/**
 * REST client for the module-toggle domain (P3-4b).
 *
 * Mirrors the backend platform-config endpoints implemented in P3-4a:
 *   GET  /config/modules         -> { data: ModuleDto[] }
 *   PUT  /config/modules/{key}   { enabled, reason?, version, confirm? } -> ModuleDto
 *
 * The list response keeps the `{ data }` envelope (`unwrap: false`) so the
 * caller reads the array; the PUT unwraps to the single updated `ModuleDto`.
 * Both are versioned (optimistic lock): the GET response and PUT body carry an
 * integer `version`; a PUT returns the bumped module on success, or conflicts
 * with `409 VERSION_CONFLICT` when the server's version moved ahead. A core
 * module (`risk='core'`) toggle MUST include a `confirm` DTO (the caller builds
 * it from the URL key + target state); the server rejects a missing/mismatched
 * confirm with `422 CORE_MODULE_CONFIRMATION_REQUIRED`.
 *
 * Auth rides the same-origin session cookie (NextAuth) — no Bearer token. The
 * shared client (`./client`) extracts the `data` field on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure.
 */

import { get, patch as patchRequest } from './client'
import type {
  ModuleDto,
  ModuleListResponse,
  ModuleSetting,
} from '../types'

/**
 * Bridge a REST `ModuleDto` (wire format, keyed by `key`) to the UI-domain
 * `ModuleSetting` model consumed by SettingsPage (keyed by `id`). The fields
 * are 1:1 apart from the identity rename; `risk`/`enabled`/`version` pass
 * through verbatim. The UI never reads `version` directly — it is held on the
 * source DTO so the toggle mutation can echo it back for optimistic locking.
 */
export function toModuleSetting(dto: ModuleDto): ModuleSetting {
  return {
    id: dto.key,
    label: dto.label,
    description: dto.description,
    enabled: dto.enabled,
    risk: dto.risk,
  }
}

/**
 * Fetch platform module toggles (`GET /api/v1/modules` — P3-4a 实际实现）。
 *
 * Returns the full `{ data }` envelope so the caller reads the array. The list
 * is small and not paginated, so no `page` field is expected.
 */
export function listModules(): Promise<ModuleListResponse> {
  // 列表响应 { data:[...] } 需完整 envelope → unwrap:false
  return get<ModuleListResponse>('/modules', { unwrap: false })
}

/**
 * Toggle a single module (`PATCH /api/v1/modules/{key}` — P3-4a 实际实现）。
 *
 * Body carries the target `enabled`. The server enforces managerial role and
 * rejects unknown keys with 400. Core-module confirm is a frontend UX concern
 * (SettingsPage pendingModule dialog) — the server does not take a confirm DTO.
 */
export function setModuleToggle(
  key: string,
  enabled: boolean,
): Promise<ModuleDto> {
  return patchRequest<ModuleDto>(
    `/modules/${encodeURIComponent(key)}`,
    { enabled },
  )
}
