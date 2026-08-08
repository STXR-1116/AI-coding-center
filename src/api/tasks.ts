/**
 * Task data-layer API functions (P1-2a).
 *
 * All endpoints live under `/tasks` and reuse the shared client (`get`/`post`),
 * which unwraps the backend `{ data }` envelope and throws `ApiClientError` on
 * non-2xx. The client auto-generates `Idempotency-Key` for POSTs marked
 * `idempotent`, so `createTask`/`assignTask`/`executeTask`/`approveTask`/
 * `cancelTask` only need to opt in — they never handle the header themselves.
 *
 * Backend contract (P1-1a/b/c):
 *   GET    /tasks            { status?, q?, limit?, cursor? } -> { data, page }
 *   GET    /tasks/{id}                                       -> TaskDto
 *   POST   /tasks            { requirementId, title, spec?, tokenBudget? } -> TaskDto
 *   POST   /tasks/{id}/assign   { agentId?, squadId? }        -> TaskDto
 *   POST   /tasks/{id}/execute                               -> { task, executionId, approvalId }
 *   POST   /tasks/{id}/approve                               -> TaskDto
 *   POST   /tasks/{id}/cancel                                -> TaskDto
 */

import { get, post } from './client'
import type {
  ExecuteTaskResponse,
  ExecutionMode,
  Priority,
  Task,
  TaskDto,
  TaskListParams,
  TaskListResponse,
  TaskStatus,
} from '../types'

/**
 * Bridge a REST `TaskDto` (wire format) to the UI-domain `Task` model consumed
 * by the TasksPage views (P1-2b). The DTO is string/null-typed to mirror the
 * backend verbatim; the UI expects the typed enums and a few display-only
 * fields the backend MVP does not return yet (`projectName`, `dueAt`, `events`).
 * Those get safe defaults so the existing board/list/timeline/inspector views
 * render without per-component changes — the write path (P1-2c) will later
 * drive these fields from mutations instead of mock state.
 */
const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const VALID_MODES: ExecutionMode[] = ['manual', 'auto', 'full']
const VALID_STATUSES: TaskStatus[] = [
  'pending',
  'assigned',
  'awaiting_approval',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]

function asPriority(value: string | null): Priority {
  return VALID_PRIORITIES.includes(value as Priority) ? (value as Priority) : 'medium'
}

function asExecutionMode(value: string | null): ExecutionMode {
  return VALID_MODES.includes(value as ExecutionMode) ? (value as ExecutionMode) : 'manual'
}

function asStatus(value: string): TaskStatus {
  return VALID_STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : 'pending'
}

export function toTask(dto: TaskDto): Task {
  // Rich display fields (projectName, dueAt, events, typed enums) are not part
  // of the backend MVP DTO. When a caller hands us an already-rich object (e.g.
  // the test harness bridging AppContext mock state), preserve those fields so
  // the views keep working; otherwise fall back to safe defaults.
  const rich = dto as TaskDto & Partial<Task>
  return {
    id: dto.id,
    title: dto.title,
    summary: dto.summary,
    status: asStatus(dto.status),
    priority: asPriority(dto.priority),
    requirementId: dto.requirementId ?? rich.requirementId ?? '',
    projectId: rich.projectId ?? '',
    projectName: rich.projectName ?? '',
    assignee: dto.assignee ?? '待分配',
    assigneeKind: (dto.assigneeKind === 'digital' || dto.assigneeKind === 'coder' || dto.assigneeKind === 'qa')
      ? dto.assigneeKind
      : (rich.assigneeKind ?? 'coder'),
    dueAt: rich.dueAt ?? '未设置',
    progress: dto.progress,
    tokenBudget: dto.tokenBudget,
    tokenUsed: dto.tokenUsed,
    contextUsage: dto.contextUsage ?? rich.contextUsage ?? 0,
    executionMode: asExecutionMode(dto.executionMode),
    tags: dto.tags,
    result: dto.result ?? '',
    updatedAt: dto.updatedAt,
    events: rich.events ?? [],
    allowedActions: dto.allowedActions ?? [],
  }
}

export interface CreateTaskInput {
  requirementId: string
  title: string
  spec?: string
  tokenBudget?: number
}

export interface AssignTaskInput {
  agentId?: string
  squadId?: string
}

/**
 * Build the query string for `GET /tasks`. Empty/undefined params are dropped
 * so the URL stays clean and React Query keys stay stable.
 */
function toQuery(params?: TaskListParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.requirementId) search.set('requirementId', params.requirementId)
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.cursor) search.set('cursor', params.cursor)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listTasks(params?: TaskListParams): Promise<TaskListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<TaskListResponse>(`/tasks${toQuery(params)}`, { unwrap: false })
}

export function fetchTask(id: string): Promise<TaskDto> {
  return get<TaskDto>(`/tasks/${encodeURIComponent(id)}`)
}

export function createTask(input: CreateTaskInput): Promise<TaskDto> {
  return post<TaskDto>('/tasks', input, { idempotent: true })
}

export function assignTask(id: string, input: AssignTaskInput): Promise<TaskDto> {
  return post<TaskDto>(
    `/tasks/${encodeURIComponent(id)}/assign`,
    input,
    { idempotent: true },
  )
}

export function executeTask(id: string): Promise<ExecuteTaskResponse> {
  // 契约要求 { confirm: true }（审查 H1）；后端 MVP 忽略 body，但保留以对齐契约
  return post<ExecuteTaskResponse>(
    `/tasks/${encodeURIComponent(id)}/execute`,
    { confirm: true },
    { idempotent: true },
  )
}

export function approveTask(id: string): Promise<TaskDto> {
  // 批准待审批任务：POST /tasks/{id}/approve → 更新后的 TaskDto（状态 awaiting_approval → running）。
  // 仅用于 canApprove 分支；execute 仅用于 assigned 启动。
  return post<TaskDto>(
    `/tasks/${encodeURIComponent(id)}/approve`,
    { idempotent: true },
  )
}

export function cancelTask(id: string, reason?: string): Promise<TaskDto> {
  // 契约要求 { reason }（审查 H2）；后端 MVP 忽略 reason，但保留以对齐契约
  return post<TaskDto>(
    `/tasks/${encodeURIComponent(id)}/cancel`,
    reason ? { reason } : undefined,
    { idempotent: true },
  )
}
