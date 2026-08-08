/**
 * REST client for the knowledge-base domain (P2-2b).
 *
 * Mirrors the backend endpoints implemented in P2-2a:
 *   GET    /knowledge-bases                   -> { data, page }   (list, not paginated)
 *   POST   /knowledge-bases  { name, mcpServerUrl, credentials?, config? }
 *                                        -> KnowledgeBaseDto   (201; idempotent)
 *   GET    /knowledge-bases/{id}             -> KnowledgeBaseDetailDto
 *   PATCH  /knowledge-bases/{id} { name?, mcpServerUrl?, config? }
 *                                        -> KnowledgeBaseDto
 *   POST   /knowledge-bases/{id}/disable     -> KnowledgeBaseDto   (idempotent)
 *   POST   /knowledge-bases/{id}/agents/{agentId}   -> { ok: true }   (idempotent)
 *   DELETE /knowledge-bases/{id}/agents/{agentId}   -> { ok: true }   (idempotent)
 *
 * Auth rides the same-origin session cookie (NextAuth) — no Bearer token. The
 * shared client (`./client`) extracts the `data` field on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure. List
 * responses keep the full `{ data, page }` envelope (`unwrap: false`); the
 * others unwrap to the DTO directly. Register / disable / bind / unbind are
 * idempotent (the client attaches an `Idempotency-Key`).
 *
 * The backend MVP KnowledgeBaseDto carries id/name/mcpServerUrl/config/status/
 * boundAgentCount/createdAt/updatedAt (+ boundAgents detail on GET /{id}). The
 * UI KnowledgeBase domain needs display-only fields the backend doesn't echo
 * (description/endpoint-alias/health/latency/calls24h/topK/threshold/
 * retrievalMode/authType/lastCheck/enabled); those get safe defaults here,
 * mirroring api/agents.ts. As the backend grows these fields, the defaults drop
 * out. `boundAgents` (agent-id list) is derived from the detail DTO when
 * present, else falls back to an empty array (list items only carry a count).
 */

import { del, get, patch as patchRequest, post } from './client'
import type {
  BindResult,
  KnowledgeBaseDetailDto,
  KnowledgeBaseDto,
  KnowledgeBaseListResponse,
  RegisterKnowledgeBaseInput,
  UpdateKnowledgeBasePatch,
} from '../types'

/** UI-domain knowledge-base model (the legacy KnowledgePage display shape). */
export interface KnowledgeBase {
  id: string
  name: string
  /** Display description — backend MVP doesn't echo one; falls back to URL. */
  description: string
  /** MCP server URL (mirrors dto.mcpServerUrl for the legacy `endpoint` field). */
  endpoint: string
  /** Coarse health derived from status (active→healthy, disabled→offline). */
  status: 'healthy' | 'degraded' | 'offline' | 'checking'
  /** enabled mirrors status==='active' (backend uses active/disabled). */
  enabled: boolean
  authType: 'bearer' | 'api_key' | 'none'
  lastCheck: string
  latency: number
  calls24h: number
  topK: number
  threshold: number
  retrievalMode: 'hybrid' | 'semantic' | 'keyword'
  boundAgents: string[]
}

const VALID_STATUSES = ['active', 'disabled'] as const
type KnowledgeStatus = (typeof VALID_STATUSES)[number]

function asStatus(value: string): KnowledgeStatus {
  return VALID_STATUSES.includes(value as KnowledgeStatus)
    ? (value as KnowledgeStatus)
    : 'active'
}

/**
 * Bridge a REST `KnowledgeBaseDto` (wire format) to the UI-domain
 * `KnowledgeBase` model. The backend MVP doesn't echo health/latency/calls24h/
 * topK/threshold/retrievalMode/authType/lastCheck/description, so they fall
 * back to display defaults. `enabled` mirrors `status === 'active'`.
 * `boundAgents` is empty for list items (they only carry a count); the detail
 * bridge fills it from `boundAgents`.
 */
export function toKnowledgeBase(dto: KnowledgeBaseDto): KnowledgeBase {
  const status = asStatus(dto.status)
  return {
    id: dto.id,
    name: dto.name,
    // 后端 MVP 不回显 description；用 URL 兜底，避免空文案
    description: dto.mcpServerUrl,
    endpoint: dto.mcpServerUrl,
    // active→healthy，disabled→offline（后端无降级/检查中语义）
    status: status === 'active' ? 'healthy' : 'offline',
    enabled: status === 'active',
    authType: 'none',
    lastCheck: '—',
    latency: 0,
    calls24h: 0,
    topK: 6,
    threshold: 0.72,
    retrievalMode: 'hybrid',
    boundAgents: [],
  }
}

/**
 * Bridge a REST `KnowledgeBaseDetailDto` to the UI model — same as the list
 * bridge but `boundAgents` is populated from the detail's bound-agent list.
 */
export function toKnowledgeBaseDetail(dto: KnowledgeBaseDetailDto): KnowledgeBase {
  return {
    ...toKnowledgeBase(dto),
    boundAgents: dto.boundAgents.map((agent) => agent.agentId),
  }
}

export function listKnowledgeBases(): Promise<KnowledgeBaseListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<KnowledgeBaseListResponse>('/knowledge-bases', { unwrap: false })
}

export function fetchKnowledgeBase(id: string): Promise<KnowledgeBaseDetailDto> {
  return get<KnowledgeBaseDetailDto>(`/knowledge-bases/${encodeURIComponent(id)}`)
}

export function registerKnowledgeBase(
  input: RegisterKnowledgeBaseInput,
): Promise<KnowledgeBaseDto> {
  // 注册幂等（重试不重复登记）；credentials 永不回显
  return post<KnowledgeBaseDto>('/knowledge-bases', input, { idempotent: true })
}

export function updateKnowledgeBase(
  id: string,
  patch: UpdateKnowledgeBasePatch,
): Promise<KnowledgeBaseDto> {
  return patchRequest<KnowledgeBaseDto>(
    `/knowledge-bases/${encodeURIComponent(id)}`,
    patch,
  )
}

export function disableKnowledgeBase(id: string): Promise<KnowledgeBaseDto> {
  // 停用幂等（已停用幂等返回）；无 body
  return post<KnowledgeBaseDto>(
    `/knowledge-bases/${encodeURIComponent(id)}/disable`,
    undefined,
    { idempotent: true },
  )
}

export function bindAgent(
  knowledgeBaseId: string,
  agentId: string,
): Promise<BindResult> {
  // 绑定幂等（upsert，已绑定幂等返回）
  return post<BindResult>(
    `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/agents/${encodeURIComponent(agentId)}`,
    undefined,
    { idempotent: true },
  )
}

export function unbindAgent(
  knowledgeBaseId: string,
  agentId: string,
): Promise<BindResult> {
  // 解绑幂等（deleteMany，不存在幂等返回）
  return del<BindResult>(
    `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/agents/${encodeURIComponent(agentId)}`,
    { idempotent: true },
  )
}
