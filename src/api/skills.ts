/**
 * REST client for the skill domain (P2-2b).
 *
 * Mirrors the backend endpoints implemented in P2-2a:
 *   GET    /skills                         -> { data: SkillDetailDto[], page }  (list, not paginated;
 *                                             list already carries full manifest + boundAgents)
 *   POST   /skills  { name, manifest }     -> SkillDto   (201; idempotent; version 1.0.0, active)
 *   GET    /skills/{id}                    -> SkillDetailDto
 *   PATCH  /skills/{id} { manifest }       -> SkillDto   (bumps patch version)
 *   POST   /skills/{id}/deprecate          -> SkillDto   (idempotent)
 *   POST   /skills/{id}/reactivate         -> SkillDto   (idempotent)
 *   POST   /skills/{id}/agents/{agentId}   -> { ok: true }   (idempotent)
 *   DELETE /skills/{id}/agents/{agentId}   -> { ok: true }   (idempotent)
 *
 * Auth rides the same-origin session cookie (NextAuth) — no Bearer token. The
 * shared client (`./client`) extracts the `data` field on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure. List
 * responses keep the full `{ data, page }` envelope (`unwrap: false`); the
 * others unwrap to the DTO directly. Create / deprecate / reactivate / bind /
 * unbind are idempotent (the client attaches an `Idempotency-Key`).
 *
 * The backend SkillDetailDto carries id/name/version/status/manifestSummary/
 * boundAgentCount/createdAt/updatedAt + manifest (full JSON string) +
 * boundAgents detail. The UI SkillRecord needs display-only fields the backend
 * doesn't echo as first-class columns (category/origin/author/executions/
 * successRate/permissions/files); those are best-effort derived from the
 * manifest JSON when present, else safe defaults — mirroring api/agents.ts.
 */

import { del, get, patch as patchRequest, post } from './client'
import type {
  BindResult,
  CreateSkillInput,
  SkillDetailDto,
  SkillDto,
  SkillListResponse,
  UpdateSkillManifestPatch,
} from '../types'

/** UI-domain skill model (the legacy SkillsPage display shape). */
export interface SkillRecord {
  id: string
  name: string
  description: string
  category: 'development' | 'quality' | 'security' | 'workflow'
  version: string
  status: 'active' | 'deprecated'
  origin: 'system' | 'custom'
  author: string
  updatedAt: string
  executions: number
  successRate: number
  permissions: string[]
  files: string[]
}

const VALID_STATUSES = ['active', 'deprecated'] as const
type SkillStatus = (typeof VALID_STATUSES)[number]

function asStatus(value: string): SkillStatus {
  return VALID_STATUSES.includes(value as SkillStatus)
    ? (value as SkillStatus)
    : 'active'
}

/**
 * Parse the manifest JSON string for display-only fields. The manifest is a
 * JSON string (description + script + optional category/permissions/files/
 * author). Fields absent from the manifest fall back to display defaults. A
 * malformed manifest is tolerated (returns an empty record) — the backend
 * validates JSON on write, but the UI must never crash on a read.
 */
function parseManifest(manifest: string | undefined): {
  description?: string
  category?: string
  author?: string
  permissions?: string[]
  files?: string[]
} {
  if (!manifest) return {}
  try {
    return JSON.parse(manifest) as Record<string, unknown> as {
      description?: string
      category?: string
      author?: string
      permissions?: string[]
      files?: string[]
    }
  } catch {
    return {}
  }
}

function asCategory(value: string | undefined): SkillRecord['category'] {
  const valid = ['development', 'quality', 'security', 'workflow'] as const
  return valid.includes(value as (typeof valid)[number])
    ? (value as SkillRecord['category'])
    : 'workflow'
}

/**
 * Bridge a REST `SkillDetailDto` (wire format) to the UI-domain `SkillRecord`
 * model. `description` prefers the manifest's `description`, else
 * `manifestSummary`. `category`/`author`/`permissions`/`files` are read from
 * the manifest when present (best-effort); `executions`/`successRate` aren't
 * echoed and default to 0. `boundAgentCount` is exposed via the separate
 * `toBoundAgentIds` helper (the UI keeps bindings as an id list).
 */
export function toSkill(dto: SkillDetailDto): SkillRecord {
  const manifest = parseManifest(dto.manifest)
  const status = asStatus(dto.status)
  return {
    id: dto.id,
    name: dto.name,
    description: manifest.description?.trim() || dto.manifestSummary || '尚未补充能力说明。',
    category: asCategory(manifest.category),
    version: dto.version,
    status,
    origin: 'custom',
    author: manifest.author?.trim() || '—',
    updatedAt: dto.updatedAt,
    executions: 0,
    successRate: 0,
    permissions: manifest.permissions ?? [],
    files: manifest.files ?? ['SKILL.md'],
  }
}

/** Extract the bound-agent id list from a detail DTO (UI keeps bindings as ids). */
export function toBoundAgentIds(dto: SkillDetailDto): string[] {
  return dto.boundAgents.map((agent) => agent.agentId)
}

export function listSkills(): Promise<SkillListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  // 后端 listSkills 一次性返回 SkillDetail（含 manifest 全文 + boundAgents）
  return get<SkillListResponse>('/skills', { unwrap: false })
}

export function fetchSkill(id: string): Promise<SkillDetailDto> {
  return get<SkillDetailDto>(`/skills/${encodeURIComponent(id)}`)
}

export function createSkill(input: CreateSkillInput): Promise<SkillDto> {
  // 创建幂等（重试不重复建技能）；version 初始 1.0.0，status active
  return post<SkillDto>('/skills', input, { idempotent: true })
}

export function updateSkillManifest(
  id: string,
  patch: UpdateSkillManifestPatch,
): Promise<SkillDto> {
  return patchRequest<SkillDto>(`/skills/${encodeURIComponent(id)}`, patch)
}

export function deprecateSkill(id: string): Promise<SkillDto> {
  // 废弃幂等（已废弃幂等返回）；无 body
  return post<SkillDto>(
    `/skills/${encodeURIComponent(id)}/deprecate`,
    undefined,
    { idempotent: true },
  )
}

export function reactivateSkill(id: string): Promise<SkillDto> {
  // 恢复幂等（已 active 幂等返回）；无 body
  return post<SkillDto>(
    `/skills/${encodeURIComponent(id)}/reactivate`,
    undefined,
    { idempotent: true },
  )
}

export function bindAgent(
  skillId: string,
  agentId: string,
): Promise<BindResult> {
  // 绑定幂等（upsert，已绑定幂等返回）
  return post<BindResult>(
    `/skills/${encodeURIComponent(skillId)}/agents/${encodeURIComponent(agentId)}`,
    undefined,
    { idempotent: true },
  )
}

export function unbindAgent(
  skillId: string,
  agentId: string,
): Promise<BindResult> {
  // 解绑幂等（deleteMany，不存在幂等返回）
  return del<BindResult>(
    `/skills/${encodeURIComponent(skillId)}/agents/${encodeURIComponent(agentId)}`,
    { idempotent: true },
  )
}
