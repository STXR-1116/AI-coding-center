/**
 * REST client for the agent domain (P2-1b).
 *
 * Mirrors the backend endpoints implemented in P2-1a:
 *   GET    /agents            { kind?, status?, runtimeMode?, q?, limit?, cursor? } -> { data, page }
 *   POST   /agents            { name, kind, runtimeMode?, model?, config?, executionMode?, tokenBudget? }
 *                             -> { agent, credential }   (credential secret is one-time)
 *   GET    /agents/{id}                                              -> AgentDto
 *   PATCH  /agents/{id}      { name?, kind?, status?, executionMode?, tokenBudget? } -> AgentDto
 *   GET    /squads                                                    -> { data, page }
 *
 * Auth rides the same-origin session cookie (NextAuth) — no Bearer token. The
 * shared client (`./client`) extracts the `data` field on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure. List
 * responses keep the full `{ data, page }` envelope (`unwrap: false`) so the
 * caller can read pagination; the others unwrap to the DTO directly. Register
 * is idempotent (the client attaches an `Idempotency-Key`).
 */

import { get, patch as patchRequest, post } from './client'
import type {
  Agent,
  AgentDto,
  AgentListParams,
  AgentListResponse,
  AgentStatus,
  ExecutionMode,
  RegisterAgentInput,
  RegisterAgentResponse,
  RotateAgentTokenResponse,
  SquadDto,
  SquadListResponse,
  UpdateAgentPatch,
} from '../types'

// ---------------------------------------------------------------------------
// DTO → UI bridge (P2-1b). The backend MVP AgentDto carries id/name/role/kind/
// status/executionMode/tokenBudget/periodResetAt/createdAt/updatedAt. The UI
// Agent domain needs a few display-only fields the backend doesn't echo yet
// (runtime/model/currentTask/...); those get safe defaults here, mirroring
// api/tasks.ts. As the backend grows these fields, the defaults drop out.
// ---------------------------------------------------------------------------

const VALID_KINDS: Agent['kind'][] = ['digital', 'coder', 'qa', 'assistant']
const VALID_STATUSES: AgentStatus[] = ['idle', 'busy', 'offline', 'stale']
const VALID_MODES: ExecutionMode[] = ['manual', 'auto', 'full']

function asKind(value: string): Agent['kind'] {
  return VALID_KINDS.includes(value as Agent['kind']) ? (value as Agent['kind']) : 'coder'
}

function asStatus(value: string): AgentStatus {
  return VALID_STATUSES.includes(value as AgentStatus) ? (value as AgentStatus) : 'idle'
}

function asExecutionMode(value: string | null | undefined): ExecutionMode {
  return VALID_MODES.includes(value as ExecutionMode) ? (value as ExecutionMode) : 'manual'
}

/**
 * Bridge a REST `AgentDto` (wire format) to the UI-domain `Agent` model.
 *
 * The backend MVP doesn't echo `runtime`/`model`, so they fall back to display
 * defaults (runtime='cloud', model=dto.role). `executionMode` is normalized via
 * `asExecutionMode` (null → 'manual'). `periodResetAt` is intentionally NOT
 * carried over — no UI consumer reads it (the 周期 Token panel uses
 * tokenUsed/tokenBudget); keeping it would be a dead field.
 */
export function toAgent(dto: AgentDto): Agent {
  return {
    id: dto.id,
    name: dto.name,
    kind: asKind(dto.kind),
    status: asStatus(dto.status),
    // 后端 MVP 不回显 runtime/model；按 kind 兜底显示
    runtime: 'cloud',
    model: dto.role ?? '',
    currentTask: undefined,
    successRate: 0,
    tokenUsed: 0,
    tokenBudget: dto.tokenBudget ?? 0,
    lastHeartbeat: '—',
    skills: [],
    executionMode: asExecutionMode(dto.executionMode),
  }
}

export interface Squad {
  id: string
  name: string
  focus: string
  leadAgentId: string
  members: string[]
  activeTaskCount: number
}

/**
 * Bridge a REST `SquadDto` to the UI-domain `Squad` model. `focus`/
 * `activeTaskCount` aren't echoed by the backend MVP and get safe defaults.
 */
export function toSquad(dto: SquadDto): Squad {
  return {
    id: dto.id,
    name: dto.name,
    focus: '',
    leadAgentId: dto.leadAgentId,
    members: dto.members,
    activeTaskCount: 0,
  }
}

/**
 * Build the query string for `GET /agents`. Empty/undefined params are dropped
 * so the URL stays clean and React Query keys stay stable.
 */
function toQuery(params?: AgentListParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.kind) search.set('kind', params.kind)
  if (params.status) search.set('status', params.status)
  if (params.runtimeMode) search.set('runtimeMode', params.runtimeMode)
  if (params.q) search.set('q', params.q)
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.cursor) search.set('cursor', params.cursor)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listAgents(
  params?: AgentListParams,
): Promise<AgentListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<AgentListResponse>(`/agents${toQuery(params)}`, { unwrap: false })
}

export function fetchAgent(id: string): Promise<AgentDto> {
  return get<AgentDto>(`/agents/${encodeURIComponent(id)}`)
}

export function registerAgent(
  input: RegisterAgentInput,
): Promise<RegisterAgentResponse> {
  // 注册幂等（重试不重复签发凭证）；后端一次性返回 credential.secret
  return post<RegisterAgentResponse>('/agents', input, { idempotent: true })
}

/**
 * `POST /agents/{id}/rotate-token` (SEC-6) — issue a fresh credential for the
 * agent, invalidating the previous secret. The new secret is returned in the
 * clear exactly once; the caller must copy it immediately and never persist it.
 */
export function rotateAgentToken(
  id: string,
): Promise<RotateAgentTokenResponse> {
  return post<RotateAgentTokenResponse>(
    `/agents/${encodeURIComponent(id)}/rotate-token`,
  )
}

export function updateAgent(
  id: string,
  patch: UpdateAgentPatch,
): Promise<AgentDto> {
  return patchRequest<AgentDto>(`/agents/${encodeURIComponent(id)}`, patch)
}

export function listSquads(): Promise<SquadListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<SquadListResponse>('/squads', { unwrap: false })
}
