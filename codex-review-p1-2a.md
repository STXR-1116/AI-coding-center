# 代码审查报告 — P1-2a 前端任务数据层

**审查范围**：commit `83dac2b` — `src/api/client.ts`（unwrap 选项）、`src/api/tasks.ts`、`src/queries/tasks.ts`、`src/types.ts`（TaskDto 等）、`src/api/tasks.test.ts`
**审查模式**：codex-review-and-fix skill 手动模式（Codex 桌面端运行时不可用，独立审查，未改任何代码）
**对照基准**：`.pm-task-p1-2a.md` 任务规格 + `README.md`「后端契约总则/错误格式/幂等并发」章节（README 是本工程内对主工程 `/api/v1` 契约的权威记录）
**测试复核**：`vitest run src/api/tasks.test.ts` → 9/9 通过

---

## 总体评价

数据层结构清晰、分层正确（api 函数纯传输 / queries 拥有缓存失效 / 类型集中）、错误传播路径合理，`unwrap:false` 对列表 envelope 的处理也是对的。9 个单测覆盖了主要成功路径与 404/409/401 错误路径，质量在原型阶段已属上乘。

主要问题集中在**与后端契约的字段/请求体不一致**（execute/cancel 缺请求体、ExecuteTaskResponse 字段类型、列表缺 requirementId 过滤）—— 这些是「现在能过测试、联调真后端时会 400/422」的隐患。次要问题是 React Query 失效策略与 query key 的几个健壮性细节。

---

## 高（High）

### H1. `executeTask` 未发送 `{ confirm: true }` 请求体 — 违反后端契约
- **文件**：`src/api/tasks.ts:75-81`
- **契约**：`README.md:262` — `POST /tasks/{id}/execute` 请求体为 `{ confirm: true }`；返回 execution，或需审批时返回 approval 和 `awaiting_approval`。
- **现状**：`executeTask(id)` 调用 `post(..., undefined, { idempotent: true })`，请求体为 `undefined`，client 不会写 body。
- **后果**：真后端按契约校验 `confirm` 字段时返回 `400 VALIDATION_ERROR`（README:710），执行流程在前端直接挂掉。当前测试因 mock 不校验请求体而通过，掩盖了该问题。
- **修复建议**：
  ```ts
  export function executeTask(id: string, confirm = true): Promise<ExecuteTaskResponse> {
    return post<ExecuteTaskResponse>(
      `/tasks/${encodeURIComponent(id)}/execute`,
      { confirm },
      { idempotent: true },
    )
  }
  ```
  并在测试中补一条断言 `JSON.parse(lastInit.body).confirm === true`。

### H2. `cancelTask` 未发送 `{ reason }` 请求体 — 违反后端契约
- **文件**：`src/api/tasks.ts:83-89`
- **契约**：`README.md:264` — `POST /tasks/{id}/cancel` 请求体为 `{ reason }`；取消任务并通知运行时停止当前 execution。
- **现状**：`cancelTask(id)` 请求体为 `undefined`。任务规格 `.pm-task-p1-2a.md:38` 也只写了 `cancelTask(id) → TaskDto`，未提 reason，但 README 契约明确要求。
- **后果**：同 H1，真后端校验缺失 `reason` 时可能 400/422；审计链路也缺少取消原因。
- **修复建议**：
  ```ts
  export function cancelTask(id: string, reason?: string): Promise<TaskDto> {
    return post<TaskDto>(
      `/tasks/${encodeURIComponent(id)}/cancel`,
      reason !== undefined ? { reason } : undefined,
      { idempotent: true },
    )
  }
  ```
  （`reason` 设为可选以兼容「无原因取消」场景；若后端强制要求，则改为必填并同步 UI。）

### H3. `ExecuteTaskResponse` 将 `executionId`/`approvalId` 写死为 `null` — 类型与契约矛盾
- **文件**：`src/types.ts:198-202`
- **契约**：`README.md:287-289` 示例响应：
  ```json
  { "data": { "task": {...}, "executionId": "exec-1", "approvalId": "approval-1" } }
  ```
  且 `README.md:262` 说明「返回 execution，或需要审批时返回 approval」—— 即 `executionId` 在直接执行时为字符串、`approvalId` 在无需审批时为 null。
- **现状**：
  ```ts
  export interface ExecuteTaskResponse {
    task: TaskDto
    executionId: null   // ← 永远 null
    approvalId: null    // ← 永远 null
  }
  ```
- **后果**：`useExecuteTask` 的 `onSuccess: ({ task }) => ...` 只用了 `task`，暂不触发运行时错误；但任何消费 `executionId` 的下游代码（P1-2b 跳转执行详情、P1-7 实时事件订阅）都会拿到 `null` 而非真实 ID，编译期类型还骗过了 TS。任务规格 `.pm-task-p1-2a.md:37` 本身也写的是 `executionId: null` —— 规格与 README 契约冲突，应以 README 为准。
- **修复建议**：
  ```ts
  export interface ExecuteTaskResponse {
    task: TaskDto
    executionId: string | null
    approvalId: string | null
  }
  ```

---

## 中（Medium）

### M1. `TaskListParams` 缺少 `requirementId` 过滤参数
- **文件**：`src/types.ts:191-196`、`src/api/tasks.ts:43-52`（`toQuery`）
- **契约**：`.pm-task-p1-2a.md:3` 明确「`GET /api/v1/tasks`（... status/requirementId/q 过滤）」；`README.md:259` 进一步列出「支持 requirement/repository/agent/squad/status/priority 过滤」。
- **现状**：`TaskListParams` 只有 `status / q / limit / cursor`，`toQuery` 也只序列化这四项。需求详情页按需求筛选其下任务（analysis-report.md:75 提到「按 requirementId 真实过滤 tasks」是 P1-2b 的明确诉求）将无法走服务端过滤，只能前端内存过滤。
- **后果**：P1-2b 迁移 TasksPage / RequirementsPage 时，按需求聚合任务的能力被削掉，或被迫在前端拉全量再过滤（与 cursor 分页冲突）。
- **修复建议**：在 `TaskListParams` 增补 `requirementId?: string`，并在 `toQuery` 中 `if (params.requirementId) search.set('requirementId', params.requirementId)`。（若要完全对齐 README，可一并加 `repositoryId/agentId/squadId/priority`，但 requirementId 是任务规格点名要求的，优先级最高。）

### M2. `AssignTaskInput` 未校验 `agentId`/`squadId` 二选一
- **文件**：`src/api/tasks.ts:34-37`、`src/queries/tasks.ts:74-78`（`useAssignTask`）
- **契约**：`README.md:261` — `POST /tasks/{id}/assign` 为「`{ agentId }` 或 `{ squadId }` 二选一；并发占用冲突返回 409」。
- **现状**：`AssignTaskInput { agentId?: string; squadId?: string }` 两者皆可选，可同时为 `undefined`（空分配）或同时有值。`useAssignTask` 的 `mutationFn` 直接透传。
- **后果**：调用方传 `{}` 时发空 body，后端按契约应 400/422；同时传两个则语义不明。前端无任何拦截，错误要到网络往返后才暴露。
- **修复建议**：在 `assignTask` 入口加运行时守卫（或用判别联合类型在编译期约束）：
  ```ts
  export function assignTask(id: string, input: AssignTaskInput): Promise<TaskDto> {
    if (!input.agentId && !input.squadId) {
      throw new Error('assignTask 要求 agentId 与 squadId 二选一')
    }
    if (input.agentId && input.squadId) {
      throw new Error('assignTask 不允许同时指定 agentId 与 squadId')
    }
    return post<TaskDto>(`/tasks/${encodeURIComponent(id)}/assign`, input, { idempotent: true })
  }
  ```
  并补一条单测覆盖「两者皆空抛错」。

### M3. mutation 失效策略：`useCreateTask` 不失效详情、且所有 mutation 缺乏对 409 `VERSION_CONFLICT` 的重拉
- **文件**：`src/queries/tasks.ts:57-62`（create）、`64-101`（assign/execute/cancel）
- **契约**：`README.md:731` — 「客户端 mutation 携带资源 version。收到 409 后重新拉取资源和 `allowedActions`，不要盲目重放高风险操作。」
- **现状**：
  - `useCreateTask` 的 `onSuccess` 只 `invalidateQueries({ queryKey: tasksKeys.lists() })`，未失效任何 detail —— 新建任务的详情若被其他 query 预取会缓存为旧值（概率低，但 create 后通常立即跳详情页，靠 `enabled` 触发新查询，故影响有限，列为中）。
  - 四个 mutation 都没有 `retry`/`onError` 处理 409。`execute`/`cancel`/`assign` 在并发冲突（`STATE_CONFLICT`/`ALREADY_CLAIMED`/`VERSION_CONFLICT`）时，按契约应「重新拉取资源 + allowedActions 再决定」，当前直接把 `ApiClientError` 抛给 UI，UI 只能拿到 `handleApiError` 的 message。
- **后果**：高风险操作（执行/取消）在并发冲突下没有「重拉 → 重判 allowedActions」的兜底，用户只能手动刷新。
- **修复建议**：
  - `useCreateTask` 的 `onSuccess` 追加 `void queryClient.invalidateQueries({ queryKey: tasksKeys.details() })`（或更精确：用返回的 `task.id` 失效单条 + `setQueryData` 预填）。
  - 为 `useExecuteTask`/`useCancelTask`/`useAssignTask` 增加 `onError`：若 `e instanceof ApiClientError && e.status === 409`，失效对应 `detail(id)` 与 `lists()`，让 UI 下次渲染拿到最新 `allowedActions`。注意此处的「重拉而非重放」符合契约，不要在 onError 里自动重试 mutation。

### M4. 测试 mock 未覆盖错误体解析失败/网络层失败路径
- **文件**：`src/api/tasks.test.ts`（整体）
- **现状**：`jsonResponse` 总是返回合法 JSON；所有错误用例（404/409/401）都给了 `{ error: { code, message } }` 合法 envelope。未覆盖：
  - 非 JSON 错误体（如 502 网关返回 HTML）—— 验证 `ApiClientError.fromResponse` 的 `catch` 回退到 `INTERNAL_ERROR`（`client.ts:55-57`）。
  - `fetch` 本身 reject（网络断开/DNS 失败）—— 此时 `request` 不捕获，会抛原始 `TypeError`，`handleApiError` 会把它降级为「操作失败」，但没有任何测试锁定该行为。
  - 5xx 路径（`UPSTREAM_ERROR`/`CONNECTOR_OFFLINE`）与 `retryable` 字段透传。
- **后果**：`fromResponse` 的回退分支与 `handleApiError` 的兜底分支零覆盖，回归时易被无声破坏。
- **修复建议**：补 2-3 条用例：(a) `stubFetch(() => jsonResponse(502, '<html>'))` 断言抛 `ApiClientError` 且 `code === 'INTERNAL_ERROR'`；(b) `vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))` 断言 `listTasks()` rejects 为 `TypeError`（锁定「client 不吞网络错误」的契约）；(c) 一条 503 `retryable: true` 断言 `error.retryable === true`。

---

## 低（Low）

### L1. `useTask` 空字符串 query key 的稳定性
- **文件**：`src/queries/tasks.ts:60-65`
- **现状**：`queryKey: tasksKeys.detail(id ?? '')`，当 `id` 为 `null/undefined` 时 key 变成 `['tasks','detail','']`，且 `enabled: !!id` 阻止查询。功能上没问题，但「空串 key」会在 React Query devtools 里留下一个永远 disabled 的占位条目，且若未来某处误传 `''`（非 null/undefined）会绕过 `enabled` 发起一次 `fetchTask('')` → `/tasks/` 请求。
- **修复建议**：可选——把 key 也做与 `enabled` 一致的归一：`queryKey: tasksKeys.detail(id ?? '__none__')`，或直接 `enabled: !!id ? tasksKeys.detail(id) : ['tasks','detail','__none__']`。非阻塞。

### L2. `toQuery` 的 `limit` 未做上限校验
- **文件**：`src/api/tasks.ts:48`
- **契约**：`README.md:128` — 「默认 `limit=30`，最大 `100`」。
- **现状**：`if (params.limit !== undefined) search.set('limit', String(params.limit))`，传 `limit: 999` 会原样发出去，后端应 400，但前端无前置拦截/夹紧。
- **修复建议**：可选——`const limit = Math.min(Math.max(1, params.limit), 100)` 后再 set。非阻塞（后端是真相源），但能省一次往返。

### L3. `createTask`/`assignTask` 标记 `idempotent` 与契约「必须携带」清单不完全一致（可接受，记录备查）
- **文件**：`src/api/tasks.ts:64`（create）、`70`（assign）
- **契约**：`README.md:725` 列出的「必须携带 Idempotency-Key」清单为「任务执行/重试/取消、审批决议、runtime 回写、聊天、push、revert、凭证轮换」—— **未列 create 与 assign**。任务规格 `.pm-task-p1-2a.md:35` 则明确要求 `createTask` 用 idempotent。
- **现状**：create/assign/execute/cancel 四个都标了 `idempotent: true`。
- **评估**：对 create/assign 多带 Idempotency-Key 是**无害**的（后端按 `actor+method+path` 隔离键，相同键+payload 返回首次响应，README:726），且能防用户双击重复创建。属于「比契约更保守」，不算缺陷。仅记录：若后端对 create 的同键+不同 payload 返回 `409 IDEMPOTENCY_CONFLICT`，前端需感知（当前 `useCreateTask` 未特殊处理该 409，见 M3）。

### L4. `handleApiError` 对 `ApiClientError` 直接返回后端 message，未考虑空 message
- **文件**：`src/queries/tasks.ts:39-42`
- **现状**：`if (error instanceof ApiClientError) return error.message`。`ApiClientError` 构造时 `message: message || res.statusText || message`（`client.ts:62`）已兜底，理论上不会是空串。但若后端返回 `{ error: { code: 'X' } }`（无 message），`fromResponse` 会落到默认中文「发生未知错误...」（`client.ts:43`），OK。
- **评估**：当前安全。低优先记录——若未来 `ApiClientError` 构造逻辑变动，`handleApiError` 可能返回空串导致 UI 显示空白。可加一道 `return error.message || '操作失败'`。

---

## 汇总

| 级别 | 编号 | 位置 | 一句话 |
| --- | --- | --- | --- |
| 高 | H1 | `api/tasks.ts:75-81` | `executeTask` 缺 `{ confirm: true }` 请求体 |
| 高 | H2 | `api/tasks.ts:83-89` | `cancelTask` 缺 `{ reason }` 请求体 |
| 高 | H3 | `types.ts:198-202` | `ExecuteTaskResponse.executionId/approvalId` 写死 null，与契约矛盾 |
| 中 | M1 | `types.ts:191-196` / `api/tasks.ts:43-52` | `TaskListParams` 缺 `requirementId` 过滤 |
| 中 | M2 | `api/tasks.ts:34-37` | `AssignTaskInput` 未校验 agentId/squadId 二选一 |
| 中 | M3 | `queries/tasks.ts:57-101` | mutation 失效策略：create 不失效详情、409 不重拉资源 |
| 中 | M4 | `api/tasks.test.ts` | 测试未覆盖非 JSON 错误体 / 网络层失败 / 5xx+retryable |
| 低 | L1 | `queries/tasks.ts:60-65` | `useTask` 空串 query key 健壮性 |
| 低 | L2 | `api/tasks.ts:48` | `limit` 未做上限夹紧（契约最大 100） |
| 低 | L3 | `api/tasks.ts:64,70` | create/assign 多带幂等键（无害，记录备查） |
| 低 | L4 | `queries/tasks.ts:39-42` | `handleApiError` 空串兜底（当前安全） |

**建议处理顺序**：H1/H2/H3 必须在 P1-2b 联调真后端前修复（否则 execute/cancel 直接不可用）；M1/M2 随 P1-2b UI 迁移一起做；M3/M4 作为数据层加固可在 P1-2b 收尾时补；L 级别择机处理。

*本报告未修改任何代码。*
