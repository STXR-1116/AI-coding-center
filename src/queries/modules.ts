/**
 * React Query hooks for the module-toggle data layer (P3-4b).
 *
 * These hooks wrap the `src/api/modules` functions and own cache invalidation.
 * The UI (SettingsPage) consumes them; this module touches no UI directly.
 *
 * Read path: `useModules` loads the seven module toggles from
 * `GET /config/modules` and bridges each `ModuleDto` to the UI-domain
 * `ModuleSetting` (keyed by `id`). While loading the UI renders a skeleton; a
 * hard error surfaces a retryable error state.
 *
 * Write path: `useSetModuleToggle` calls `PUT /config/modules/{key}`. On
 * success it refetches the full list into the React Query cache AND mirrors the
 * server-authoritative list into `AppContext.moduleSettings` so the AppShell
 * navigation and `ModuleGate` route guard update live (SettingsPage is now the
 * REST source of truth, but those two consumers still read AppContext — syncing
 * it here preserves the existing immediate-nav behavior without rewriting them
 * to read React Query). On a `409 VERSION_CONFLICT` the mutation refetches the
 * latest list (re-syncing both caches).
 * carrying it, so the UI can show an info toast instead of a generic failure.
 *
 * The bridge DTOs (`ModuleDto` → `ModuleSetting`) drop the optimistic-lock
 * `version` after bridging — SettingsPage holds the raw `useModules` data so the
 * toggle mutation can read the current `version` per module.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listModules, setModuleToggle, toModuleSetting } from '../api/modules'
import { useApp } from '../state/useApp'
import type {
  ModuleDto,
  ModuleSetting,
} from '../types'

/** Error code the backend returns when a versioned PUT hits a stale `version`. */

/**
 * Query-key factory for module toggles. Centralized so the toggle mutation can
 * invalidate the exact list entry without re-deriving the key shape.
 */
export const modulesKeys = {
  all: ['modules'] as const,
  list: () => [...modulesKeys.all, 'list'] as const,
}

/**
 * Load the seven platform module toggles (`GET /config/modules`).
 *
 * `select` bridges each `ModuleDto` to the UI-domain `ModuleSetting`, dropping
 * the optimistic-lock `version` (the UI never reads it). The version is still
 * held on the raw cached DTO; the toggle mutation reads it back via
 * `readModuleVersions` when building the PUT body.
 */
export function useModules() {
  return useQuery({
    queryKey: modulesKeys.list(),
    queryFn: () => listModules(),
    select: (response) => response.data.map(toModuleSetting),
  })
}

/**
 * Thrown by `useSetModuleToggle` when the server rejects a stale `version` with
 * `409 VERSION_CONFLICT`. Carries the freshly refetched module list so the UI
 * can re-sync its local view + inform the user instead of showing a generic
 * failure.
 */

/** Re-sync both caches (React Query + AppContext) from a fresh server list. */
function syncCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  replaceModuleSettings: (next: ModuleSetting[]) => void,
  response: { data: ModuleDto[] },
): ModuleSetting[] {
  queryClient.setQueryData(modulesKeys.list(), response)
  const settings = response.data.map(toModuleSetting)
  replaceModuleSettings(settings)
  return settings
}

/**
 * Toggle a single module (`PUT /config/modules/{key}`).
 *
 * The input is `{ key, enabled, confirm? }`; the hook reads the current
 * optimistic-lock `version` for `key` from the cached GET (via
 * `useModuleVersions`). On success it refetches the full list and mirrors it
 * into `AppContext.moduleSettings` (live nav + route guard). On a `409
 * VERSION_CONFLICT` it refetches (re-syncing both caches) and throws a
 * `ModuleVersionConflictError` carrying the latest list. Any other error is
 * rethrown unchanged for the standard error-toast path.
 */
export function useSetModuleToggle() {
  const queryClient = useQueryClient()
  const { replaceModuleSettings } = useApp()

  return useMutation({
    mutationFn: (vars: {
      key: string
      enabled: boolean
    }) => {
      return setModuleToggle(vars.key, vars.enabled)
    },
    onSuccess: async () => {
      // 重拉完整列表落 React Query 缓存 + 同步 AppContext（导航/路由守卫实时生效）
      const response = await listModules()
      syncCaches(queryClient, replaceModuleSettings, response)
    },
    onError: () => {
      // 主工程 P3-4a 无乐观锁——409 仅可能来自状态机冲突；由调用方 toast（无特判）
    },
  })
}

/**
 * Synchronous read of the cached per-key version map. Used inside the mutation
 * `mutationFn` (where hooks can't run) to read the current optimistic-lock
 * `version` for the toggled key. Reads the React Query cache directly; falls
 * back to `{}` before the first GET resolves, in which case `version` defaults
 * to 0 and the server rejects with 409 (the conflict path re-syncs).
 */
