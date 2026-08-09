export type Role = 'employee' | 'leader' | 'pm'
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'awaiting_approval'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
export type RequirementStatus = 'draft' | 'analyzing' | 'in_progress' | 'done' | 'cancelled'
export type AgentStatus = 'idle' | 'busy' | 'offline' | 'stale'
export type ExecutionMode = 'manual' | 'auto' | 'full'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type TaskEventType =
  | 'created'
  | 'assigned'
  | 'approval'
  | 'started'
  | 'checkpoint'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface TaskEvent {
  id: string
  type: TaskEventType
  title: string
  description: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  username?: string
  role: Role
  title: string
}

export interface Task {
  id: string
  title: string
  summary: string
  status: TaskStatus
  priority: Priority
  requirementId: string
  projectId: string
  projectName: string
  assignee: string
  assigneeKind: 'digital' | 'coder' | 'qa'
  dueAt: string
  progress: number
  tokenBudget: number
  tokenUsed: number
  contextUsage: number
  executionMode: ExecutionMode
  tags: string[]
  /** 真实执行结果（P3-5 runner 回传 output）——无则 '' */
  result: string
  updatedAt: string
  events: TaskEvent[]
  /**
   * 后端按 角色+状态 算好的资源级动作集（edit|execute|cancel|approve|...）。
   * 写按钮由它驱动（P1-2c）；mock/旧数据无该字段时兜底空数组。
   */
  allowedActions?: string[]
}

export interface Requirement {
  id: string
  title: string
  description: string
  status: RequirementStatus
  priority: Priority
  owner: string
  projectId: string
  projectName: string
  taskCount: number
  doneCount: number
  specVersion: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// REST Requirement DTO (P1-2d) — mirrors the main backend's requirement
// response shape (GET /api/v1/requirements, implemented in P1-5a).
// The legacy `Requirement` interface above is the UI-domain model backed by
// mock data; `RequirementDto` is the wire format returned by the API.
// ---------------------------------------------------------------------------

/**
 * Wire shape of a requirement returned by the REST API. Fields are
 * string/null-typed to match the backend verbatim.
 */
export interface RequirementDto {
  id: string
  title: string
  description: string
  /** draft|analyzing|in_progress|done|cancelled */
  status: string
  priority: string | null
  submitterId: string | null
  /** user|agent */
  submitterType: string | null
  createdAt: string
  updatedAt: string
}

/** Paginated list response envelope from `GET /requirements`. */
export interface RequirementListResponse {
  data: RequirementDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/** Query filters accepted by `GET /requirements`. */
export interface RequirementListParams {
  status?: string
  limit?: number
  cursor?: string
}

/**
 * Wire shape of a requirement spec snapshot returned by `GET /requirements/{id}/specs`
 * (P1-6a). `content` is the decomposition-result snapshot as a JSON string — the
 * backend transmits it verbatim and the frontend parses it; `version` is the
 * integer version number incremented on each analyze run.
 */
export interface RequirementSpecDto {
  id: string
  requirementId: string
  version: number
  content: string
  createdAt: string
}

/**
 * Wire shape of the result returned by `POST /requirements/{id}/analyze` (P1-6a).
 * `requirement` is the post-analysis requirement DTO (status now in_progress);
 * `tasksCreated` is how many tasks the decomposition produced.
 */
export interface AnalysisResultDto {
  requirement: RequirementDto
  tasksCreated: number
}

/**
 * Wire shape of the result returned by `POST /requirements/{id}/cancel` (P1-6a).
 * Cancel is a state-transition op — the backend returns an operation result, not
 * a resource snapshot.
 */
export interface CancelRequirementResult {
  ok: boolean
  status: string
}

/** Request body for `POST /requirements`. `summary` is the `description` alias. */
export interface CreateRequirementInput {
  title: string
  summary?: string
  description?: string
  priority?: string
  acceptanceCriteria?: string
}

export interface Agent {
  id: string
  name: string
  kind: 'digital' | 'coder' | 'qa' | 'assistant'
  status: AgentStatus
  runtime: 'local' | 'cloud'
  model: string
  currentTask?: string
  successRate: number
  tokenUsed: number
  tokenBudget: number
  lastHeartbeat: string
  skills: string[]
  /**
   * 执行模式（后端回显、UI 兜底）。后端 MVP AgentDto.executionMode 可为
   * string|null，toAgent 经 asExecutionMode 归一化为 ExecutionMode。标注为
   * 可选：历史 mock 数据（src/data/mock.ts）未携带此字段，刷新前的本地态
   * 可能缺省，inspector 读回时以 'manual' 兜底。
   */
  executionMode?: ExecutionMode
}

export interface Project {
  id: string
  name: string
  description: string
  vcs: 'git' | 'svn'
  branch: string
  status: 'clean' | 'modified' | 'syncing'
  language: string
  updatedAt: string
}

export interface MessageEntity {
  type: 'requirement' | 'task'
  id: string
  title: string
  status: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  createdAt: string
  entities?: MessageEntity[]
}

export interface Conversation {
  id: string
  title: string
  projectId: string
  messages: ChatMessage[]
}

export interface RepositoryFile {
  name: string
  path: string
  type: 'file' | 'folder'
  language?: string
  children?: RepositoryFile[]
}

export interface ChangeItem {
  id: string
  taskId: string
  filePath: string
  additions: number
  deletions: number
  status: 'pending' | 'accepted' | 'rejected'
  diff: string[]
}

export interface ModuleSetting {
  id: string
  label: string
  description: string
  enabled: boolean
  risk: 'normal' | 'core'
}

// ---------------------------------------------------------------------------
// REST Task DTO (P1-2a) — mirrors the main backend's task response shape.
// The legacy `Task` interface above is the UI-domain model backed by mock data;
// `TaskDto` is the wire format returned by /api/v1/tasks. P1-2b will bridge
// between the two when the TasksPage migrates off AppContext state.
// ---------------------------------------------------------------------------

/**
 * Wire shape of a task returned by the REST API. Fields are intentionally
 * string/null-typed to match the backend verbatim; the UI layer normalizes.
 */
export interface TaskDto {
  id: string
  title: string
  summary: string
  /** pending|assigned|awaiting_approval|running|succeeded|failed|cancelled */
  status: string
  priority: string | null
  requirementId: string | null
  assignee: string | null
  assigneeKind: string | null
  progress: number
  tokenBudget: number
  tokenUsed: number
  contextUsage: number | null
  executionMode: string | null
  tags: string[]
  /** 真实执行结果（P3-5 runner 回传 output）——无则 null */
  result: string | null
  updatedAt: string
  version: number
  /** edit|execute|cancel|approve|rejectChanges|assign */
  allowedActions: string[]
}

/** Paginated list response envelope from `GET /tasks`. */
export interface TaskListResponse {
  data: TaskDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/** Query filters accepted by `GET /tasks`. */
export interface TaskListParams {
  status?: string
  q?: string
  requirementId?: string
  limit?: number
  cursor?: string
}

/** Response of `POST /tasks/{id}/execute`. */
export interface ExecuteTaskResponse {
  task: TaskDto
  executionId: null
  approvalId: null
}

// ---------------------------------------------------------------------------
// Conversation / chat DTOs (P1-3b) — mirror the main backend's conversation
// REST endpoints and the `/api/chat/stream` NDJSON frame contract. These are
// wire shapes only; the UI layer (P1-3c WorkspacePage) consumes them as-is.
// ---------------------------------------------------------------------------

export interface ConversationDto {
  id: string
  title: string
  repositoryId: string | null
  createdAt: string
  updatedAt: string
}

export interface MessageDto {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface ConversationDetailDto extends ConversationDto {
  messages: MessageDto[]
}

/** Response envelope of `GET /conversations` — `{ data, page }` like /tasks. */
export interface ConversationListResponse {
  data: ConversationDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/** Response of `POST /conversations/{id}/messages` (non-streaming fallback). */
export interface SendMessageResponse {
  userMessage: MessageDto
  assistantMessage: MessageDto
}

/**
 * A single frame on the `/api/chat/stream` NDJSON wire. `type` selects the
 * payload; only the field relevant to a given `type` is populated.
 */
/** NDJSON 流帧（判别联合，与后端 /api/chat/stream 协议一致）。 */
export type ChatStreamFrame =
  | { type: 'user'; id?: string; content: string }
  | { type: 'status'; status: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; id?: string; text: string }
  | { type: 'error'; message: string; code?: string }

// ---------------------------------------------------------------------------
// REST Repository DTOs (P1-4b) — mirror the main backend's repository read
// endpoints (GET /api/v1/repositories, implemented in P1-4a). The legacy
// `Project` interface above is the UI-domain model backed by mock data;
// `RepositoryDto`/`CommitDto`/`WorktreeChangeDto` are the wire formats
// returned by /api/v1/repositories*. P1-4b bridges between the two when
// RepositoriesPage migrates off AppContext state.
//
// Field truth: src/lib/api/repository-dto.ts (backend). localPath is exposed
// only as `hasLocalPath` (the server never returns the absolute path);
// credentials never appear. Dates are ISO strings.
// ---------------------------------------------------------------------------

/**
 * Wire shape of a repository returned by the REST API. `status` is the
 * backend repo lifecycle state (active|disabled), distinct from the legacy
 * `Project['status']` sync-state (clean|modified|syncing) — the UI normalizes.
 */
export interface RepositoryDto {
  id: string
  name: string
  /** git|svn */
  vcsType: string
  url: string
  defaultBranch: string
  ownerUserId: string | null
  ownerName: string | null
  /** active|disabled */
  status: string
  /** Whether a local path is configured (gates commits/changes/file-tree). */
  hasLocalPath: boolean
  createdAt: string
  updatedAt: string
}

/** Paginated list response envelope from `GET /repositories`. */
export interface RepositoryListResponse {
  data: RepositoryDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/**
 * Input for `POST /repositories` (register). Mirrors the backend contract: the
 * server assigns `id`/`status`/timestamps. `url` and `localPath` are both
 * optional but at least one is required (validated server-side); `defaultBranch`
 * defaults server-side when omitted.
 */
export interface RegisterRepositoryInput {
  name: string
  /** git|svn */
  vcsType: string
  url?: string
  localPath?: string
  defaultBranch?: string
  /** Owner display name (optional; server falls back to the session user). */
  ownerName?: string
}

/** Response of `POST /repositories` — the registered repository DTO. */
export interface RegisterRepositoryResponse {
  repository: RepositoryDto
}

/** Result of `POST /repositories/{id}/test` — connectivity probe. */
export interface RepositoryTestResult {
  ok: boolean
  /** Round-trip latency in milliseconds (0 when the probe failed before measuring). */
  latencyMs: number
  /** Human-readable outcome (success summary or failure reason). */
  message: string
}

/** A single commit from `GET /repositories/{id}/commits` (git log entry). */
export interface CommitDto {
  hash: string
  shortHash: string
  author: string
  /** git %ai as-is (ISO 8601) */
  date: string
  message: string
}

/** A single uncommitted worktree change from `GET /repositories/{id}/changes`. */
export interface WorktreeChangeDto {
  path: string
  /** added|modified|deleted */
  changeType: string
  addedLines: number
  deletedLines: number
  diff: string
  binary: boolean
}

/** Response of `POST /repositories/{id}/changes/revert`. */
export interface RevertResult {
  ok: boolean
  message?: string
}

// ---------------------------------------------------------------------------
// REST Agent/Squad DTO (P2-1b) — mirrors the main backend's agent/squad
// response shape (GET /api/v1/agents, /squads, implemented in P2-1a).
// The legacy `Agent` interface above is the UI-domain model backed by mock
// data; `AgentDto` is the wire format returned by the API. AgentsPage bridges
// between the two (the UI keeps its richer display fields with safe defaults
// for backend-MVP-absent ones, same pattern as `toTask` in api/tasks.ts).
// ---------------------------------------------------------------------------

/**
 * Wire shape of an agent returned by the REST API. Fields are string/null-typed
 * to match the backend verbatim; the UI normalizes. `kind`/`status`/
 * `executionMode` are sent as lowercase enums (digital|coder|qa|assistant,
 * idle|busy|offline|stale, manual|auto|full).
 */
export interface AgentDto {
  id: string
  name: string
  /** human-readable role label (e.g. 'Coder', 'QA') */
  role: string | null
  /** digital|coder|qa|assistant */
  kind: string
  /** idle|busy|offline|stale */
  status: string
  /** manual|auto|full */
  executionMode: string | null
  /** Period token budget cap (0 = unlimited). */
  tokenBudget: number
  /** ISO 8601 timestamp the current budget period resets at. */
  periodResetAt: string | null
  createdAt: string
  updatedAt: string
}

/** Paginated list response envelope from `GET /agents`. */
export interface AgentListResponse {
  data: AgentDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/** Query filters accepted by `GET /agents` (kind/status/runtimeMode/q). */
export interface AgentListParams {
  kind?: string
  status?: string
  runtimeMode?: string
  q?: string
  limit?: number
  cursor?: string
}

/**
 * Input for `POST /agents` (register). Mirrors the backend contract: the
 * server assigns `id` and signs a one-time credential (returned separately).
 */
export interface RegisterAgentInput {
  name: string
  /** digital|coder|qa|assistant */
  kind: string
  /** local|cloud */
  runtimeMode?: string
  model?: string
  config?: Record<string, unknown>
  executionMode?: string
  /** Period token budget cap. */
  tokenBudget?: number
}

/** Response of `POST /agents` — the registered agent plus a one-time credential. */
export interface RegisterAgentResponse {
  agent: AgentDto
  credential: {
    id: string
    /** Plain secret — only ever appears in this response; never echoed again. */
    secret: string
    createdAt: string
  }
}

/**
 * Response of `POST /agents/{id}/rotate-token` (SEC-6). The freshly signed
 * credential secret is returned in the clear exactly once; the UI copies it to
 * the clipboard and never persists or re-renders it.
 */
export interface RotateAgentTokenResponse {
  agent: AgentDto
  /**
   * Plain secret — only ever returned once by the rotate endpoint; never echoed again.
   * Caller must copy it immediately and never persist it to state/rendering.
   */
  token: string
}

/** Patch accepted by `PATCH /agents/{id}`. All fields optional. */
export interface UpdateAgentPatch {
  name?: string
  kind?: string
  status?: string
  executionMode?: string
  tokenBudget?: number
}

/**
 * Wire shape of a squad returned by `GET /squads`. `members` is the agent-id
 * list (the backend MVP stores the lead separately as `leadAgentId`).
 */
export interface SquadDto {
  id: string
  name: string
  leadAgentId: string
  members: string[]
  /** ISO 8601 */
  createdAt: string
  updatedAt: string
}

/** List response envelope from `GET /squads`. */
export interface SquadListResponse {
  data: SquadDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

// ---------------------------------------------------------------------------
// REST KnowledgeBase DTO (P2-2b) — mirrors the main backend's knowledge-base
// response shape (GET /api/v1/knowledge-bases, implemented in P2-2a). The
// KnowledgePage UI keeps its richer display model; `KnowledgeBaseDto` is the
// wire format returned by the API, bridged in `api/knowledge.ts` (same pattern
// as `AgentDto`/`toAgent`). Credentials never appear in any DTO.
// ---------------------------------------------------------------------------

/** Bound-agent detail REST DTO (camelCase). Returned on the detail endpoint. */
export interface BoundAgentDto {
  agentId: string
  agentName: string
}

/**
 * Wire shape of a knowledge base list item returned by the REST API. `status`
 * is "active" | "disabled" (soft-delete semantics). `config` is a runtime
 * config JSON string (passthrough; the UI parses as needed).
 */
export interface KnowledgeBaseDto {
  id: string
  name: string
  /** MCP server URL. */
  mcpServerUrl: string
  /** Runtime config JSON string (passthrough). */
  config: string
  /** KnowledgeStatus: "active" | "disabled". */
  status: string
  /** Number of agents bound to this KB (display-only). */
  boundAgentCount: number
  /** ISO 8601. */
  createdAt: string
  /** ISO 8601. */
  updatedAt: string
}

/** Detail DTO (list item + bound-agent detail). Still no credentials. */
export interface KnowledgeBaseDetailDto extends KnowledgeBaseDto {
  boundAgents: BoundAgentDto[]
}

/** List response envelope from `GET /knowledge-bases` (KB list is not paginated; `page` is a placeholder). */
export interface KnowledgeBaseListResponse {
  data: KnowledgeBaseDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/**
 * Input for `POST /knowledge-bases` (register). Mirrors the backend contract:
 * `name`/`mcpServerUrl` required; `credentials`/`config` are optional JSON
 * strings (the backend normalizes empty to `{}`). Credentials never echo back.
 */
export interface RegisterKnowledgeBaseInput {
  name: string
  mcpServerUrl: string
  /** Credentials JSON string (encrypted server-side, never echoed). */
  credentials?: string
  /** Runtime config JSON string. */
  config?: string
}

/** Patch accepted by `PATCH /knowledge-bases/{id}`. All fields optional. */
export interface UpdateKnowledgeBasePatch {
  name?: string
  mcpServerUrl?: string
  config?: string
}

/** Response of bind/unbind endpoints — `{ data: { ok: true } }` unwrapped. */
export interface BindResult {
  ok: boolean
}

// ---------------------------------------------------------------------------
// REST Skill DTO (P2-2b) — mirrors the main backend's skill response shape
// (GET /api/v1/skills, implemented in P2-2a). `SkillDto` is the list-item wire
// format; `SkillDetailDto` adds the full manifest + bound-agent detail. The
// SkillsPage UI keeps its richer display model, bridged in `api/skills.ts`.
// ---------------------------------------------------------------------------

/** Bound-agent detail REST DTO for skills (camelCase). */
export interface SkillBoundAgentDto {
  agentId: string
  agentName: string
}

/**
 * Wire shape of a skill list item returned by the REST API. `status` is
 * "active" | "deprecated". `version` is fixed (x.y.z). `manifestSummary` is a
 * display-only description excerpt.
 */
export interface SkillDto {
  id: string
  name: string
  /** Fixed version (x.y.z). */
  version: string
  /** SkillStatus: "active" | "deprecated". */
  status: string
  /** Manifest summary (description or truncated text), display-only. */
  manifestSummary: string
  /** Number of agents bound to this skill (display-only). */
  boundAgentCount: number
  /** ISO 8601. */
  createdAt: string
  /** ISO 8601. */
  updatedAt: string
}

/** Detail DTO (list item + full manifest + bound-agent detail). */
export interface SkillDetailDto extends SkillDto {
  /** Full manifest text (JSON string with description + script etc.). */
  manifest: string
  boundAgents: SkillBoundAgentDto[]
}

/** List response envelope from `GET /skills` (skill list is not paginated; `page` is a placeholder). */
export interface SkillListResponse {
  data: SkillDetailDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/**
 * Input for `POST /skills` (create). Mirrors the backend contract: `name`/
 * `manifest` required; `manifest` is a JSON string (description + script). The
 * server assigns `id` and sets version "1.0.0", status active.
 */
export interface CreateSkillInput {
  name: string
  /** Manifest JSON string (description + script etc.). */
  manifest: string
}

/** Patch accepted by `PATCH /skills/{id}` — manifest only (bumps patch version server-side). */
export interface UpdateSkillManifestPatch {
  manifest: string
}

// ---------------------------------------------------------------------------
// Platform config DTOs (P2-3b) — mirrors the backend config endpoints
// (GET/PUT /config/token-budget). These are versioned (optimistic lock):
// the GET response and PUT request both carry an integer `version`; a PUT
// succeeds by returning the incremented full config, or conflicts with
// `409 VERSION_CONFLICT` when the server's version moved ahead.
// ---------------------------------------------------------------------------

/**
 * Wire shape of `GET /config/token-budget`. Combines the runtime budget caps
 * the UI edits (monthlyTokenBudget / singleTaskTokenLimit /
 * budgetWarningThreshold) with the task-estimate model the server uses to
 * pre-deduct budget (`base` / `per100Chars` / `min` / `max`). `version` is the
 * optimistic-lock token — pass it back unchanged on PUT.
 */
export interface TokenBudgetConfig {
  /** Base estimate applied to every task (the 4-param model's floor). */
  base: number
  /** Additional Tokens per 100 chars of task context. */
  per100Chars: number
  /** Minimum Tokens a task is ever budgeted. */
  min: number
  /** Maximum Tokens a task is ever budgeted. */
  max: number
  /** Optimistic-lock version; echoed on PUT, bumped on success. */
  version: number
}

/**
 * Platform-wide parameters (P3-9) — the SettingsPage "platform params" tabs
 * (runtime / security / notifications), stored as one versioned JSON blob.
 *
 * Mirrors `GET/PUT /config/platform` (backend stores the whole object under a
 * single `"platform"` key; no per-field validation — `version` is the only
 * concurrency guard). `version` is the optimistic-lock token: read from GET,
 * echoed on PUT, bumped on success.
 */
export interface PlatformConfig {
  defaultExecutionMode: ExecutionMode
  monthlyTokenBudget: number
  singleTaskTokenLimit: number
  budgetWarningThreshold: number
  staleAfterMinutes: number
  reclaimAfterMinutes: number
  cloudFallback: boolean
  sandboxScripts: boolean
  credentialRotationDays: number
  auditRetentionDays: number
  backupEnabled: boolean
  backupHour: string
  notifyTaskFailure: boolean
  notifyBudgetWarning: boolean
  notifyAgentStale: boolean
  dailyDigest: boolean
  email: string
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
  /** Optimistic-lock version; echoed on PUT, bumped on success. */
  version: number
}

// ---------------------------------------------------------------------------
// Module toggle DTOs (P3-4b) — mirrors the backend platform-config endpoints
// implemented in P3-4a:
//   GET  /config/modules         -> { data: ModuleDto[] }
//   PUT  /config/modules/{key}   { enabled, reason?, version, confirm? } -> ModuleDto
//
// Like the other config endpoints this is versioned (optimistic lock): the GET
// response and PUT body both carry an integer `version`; a PUT succeeds by
// returning the updated module (version bumped), or conflicts with
// `409 VERSION_CONFLICT` when the server's version moved ahead. A core module
// (risk='core') toggle MUST include a `confirm` DTO whose `moduleKey` and
// `targetEnabled` match the URL + target state — otherwise the server rejects
// with `422 CORE_MODULE_CONFIRMATION_REQUIRED`. Module `key`s are the seven
// platform modules: task_dispatch / agents / repositories / knowledge / skills
// / accounts / dashboard.
// ---------------------------------------------------------------------------

/**
 * Wire shape of a single module returned by `GET /config/modules` (and by a
 * successful `PUT /config/modules/{key}`). The UI-domain `ModuleSetting`
 * (above) uses `id`/`label`/`description`/`enabled`/`risk`; the DTO uses the
 * backend's `key` for identity. `api/modules.ts` bridges the two.
 */
export interface ModuleDto {
  /** Stable module key (task_dispatch / agents / repositories / knowledge / skills / accounts / dashboard). */
  key: string
  /** Display label (任务分发 / Agent 配置 / …). */
  label: string
  /** Short description of the module's responsibility. */
  description: string
  /** Current enabled state. */
  enabled: boolean
  /** Risk class — 'core' toggles require a confirm DTO; 'normal' do not. */
  risk: 'core' | 'normal'
  /** Optimistic-lock version; echoed on PUT, bumped on success. */
  version: number
}

/** Confirmation DTO required when toggling a `risk='core'` module. */
export interface ModuleToggleConfirm {
  /** Must be true. */
  acknowledged: boolean
  /** Must match the URL `{key}`. */
  moduleKey: string
  /** Must match the requested `enabled` value. */
  targetEnabled: boolean
}

/**
 * Body of `PUT /config/modules/{key}`. `enabled` is the target state; `version`
 * is the optimistic-lock token last read from GET. `confirm` is required for
 * core modules (server rejects with 422 otherwise) and optional for normal.
 * `reason` is optional audit context.
 */
export interface ModuleToggleDto {
  enabled: boolean
  reason?: string
  /** Optimistic-lock version last read from GET. */
  version: number
  /** Required when the target module's risk is 'core'. */
  confirm?: ModuleToggleConfirm
}

/** Response envelope of `GET /config/modules` — `{ data: ModuleDto[] }`. */
export interface ModuleListResponse {
  data: ModuleDto[]
}

// ---------------------------------------------------------------------------
// Dashboard / Metrics / Audit / User DTOs (P2-4b) — mirrors the backend
// endpoints implemented in P2-4a:
//   GET  /dashboard/summary            -> DashboardSummaryDto
//   GET  /metrics/summary              -> MetricsSummaryDto            (LEADER+)
//   GET  /audit-logs                   -> { data, page }               (LEADER+)
//   GET  /users                        -> { data, page }               (LEADER+)
//   PATCH /users/{id}  { role?|status?|displayName? } -> UserDto       (LEADER+)
//
// Field shapes are byte-for-byte the camelCase wire format the backend DTO
// mappers emit (Date → ISO string). `successRate` is 0–1; `avgDurationMs`
// is milliseconds. The PATCH body is "one of" role / status / displayName
// (the backend rejects >1 field with 400 VALIDATION_ERROR).
// ---------------------------------------------------------------------------

/** 任务状态分布项（dashboard/summary.tasksByStatus[]）。 */
export interface TaskStatusCountDto {
  status: string
  count: number
}

/** Agent 状态分布项（dashboard/summary.agentsByStatus[]）。 */
export interface AgentStatusCountDto {
  status: string
  count: number
}

/** 最近任务项（dashboard/summary.recentTasks[]，ISO 时间）。 */
export interface RecentTaskDto {
  id: string
  title: string
  status: string
  createdAt: string
}

/** 度量摘要（嵌于 DashboardSummaryDto.metricsSummary；EMPLOYEE 为 null）。 */
export interface DashboardMetricsSummaryDto {
  /** 0–1。 */
  successRate: number
  avgDurationMs: number
}

/** `GET /dashboard/summary` 响应 DTO（camelCase，Date → ISO）。 */
export interface DashboardSummaryDto {
  myRequirementsCount: number
  myTasksCount: number
  totalRequirements: number
  totalTasks: number
  tasksByStatus: TaskStatusCountDto[]
  agentsCount: number
  agentsByStatus: AgentStatusCountDto[]
  totalTokenUsed: number
  /** 0–1。 */
  successRate: number
  recentTasks: RecentTaskDto[]
  /** 仅 LEADER+ 有值；EMPLOYEE 无 metric:read 能力 → null。 */
  metricsSummary: DashboardMetricsSummaryDto | null
}

/** per-agent 度量拆分项（metrics/summary.perAgent[]）。 */
export interface AgentMetricBreakdownDto {
  agentId: string | null
  agentName: string | null
  tokenUsed: number
  successCount: number
  failCount: number
}

/** `GET /metrics/summary` 响应 DTO（summary 标量 + perAgent 拆分，Recharts 直接消费）。 */
export interface MetricsSummaryDto {
  summary: {
    totalTokenUsed: number
    /** 0–1。 */
    successRate: number
    avgDurationMs: number
    successCount: number
    failCount: number
  }
  perAgent: AgentMetricBreakdownDto[]
}

/** `GET /metrics/summary` 查询参数（均可选）。 */
export interface MetricsSummaryParams {
  agentId?: string
  /** ISO 8601。 */
  from?: string
  /** ISO 8601。 */
  to?: string
}

/** `GET /audit-logs` 响应行 DTO。detail 为 JSON 字符串（前端按需 parse）。 */
export interface AuditLogDto {
  id: string
  /** "user" | "agent"。 */
  actorType: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  detail: string
  createdAt: string
}

/** `GET /audit-logs` 查询参数（均可选）。 */
export interface AuditLogListParams {
  action?: string
  entityType?: string
  /** "user" | "agent"。 */
  actorType?: string
  /** ISO 8601。 */
  dateFrom?: string
  /** ISO 8601。 */
  dateTo?: string
  /** 游标分页——上一页返回的 `page.nextCursor`，用于加载下一页。 */
  cursor?: string
  page?: number
  pageSize?: number
}

/** `GET /audit-logs` 列表 envelope（游标分页 + total）。 */
export interface AuditLogListResponse {
  data: AuditLogDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
    total: number
  }
}

/** `GET /users` / `PATCH /users/{id}` 行 DTO。password/凭证永不出现。 */
export interface UserDto {
  id: string
  username: string
  email: string
  displayName: string
  /** UserRole 枚举值：EMPLOYEE / LEADER / PM / ADMIN。 */
  role: string
  /** UserStatus 枚举值：active / disabled。 */
  status: string
  createdAt: string
}

/** `GET /users` 列表 envelope（MVP 不分页：nextCursor:null / hasMore:false）。 */
export interface UserListResponse {
  data: UserDto[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
}

/**
 * `PATCH /users/{id}` 请求体——三选一（后端拒绝 >1 字段）。
 * role/status 改自己会被后端 403 拦截；前端再守一道（禁用控件）。
 */
export interface UpdateUserPatch {
  role?: string
  status?: string
  displayName?: string
}
