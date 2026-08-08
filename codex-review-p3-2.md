# 代码审查报告 — P3-2 错误处理统一（parseApiError + 401/403/409 特判 + conflict refetch 接线）

- **范围**：`git diff f57605d..a585374` 的 P3-2 代码部分
  - `src/queries/errors.ts`（`parseApiError` + `friendlyMessage` + `useConflictRefetch`）
  - `src/queries/users.ts`（`useUpdateUser` 409 → invalidate）
  - `src/queries/agents.ts`（`useUpdateAgent` 409 → invalidate list+detail）
  - `src/pages/UsersPage.tsx`（错误 toast 改 `handleApiError` + 409 info 特判）
  - `src/queries/errors.test.ts`（6 用例）
  - 附带：`dashboard.ts` / `requirements.ts` 删 P3-1 死代码、`TasksPage.tsx` L4 空态守卫（P3-1 review fix，非 P3-2 核心，仅顺带核验）
- **模式**：codex-review-and-fix 手动模式（Codex 运行时不可用，独立审查，未改代码）
- **结论**：**1 高 / 3 中 / 3 低**。`parseApiError` 结构化透传正确、`useConflictRefetch` invalidate 语义正确、UsersPage 接线正确；主要问题是 **`STATE_CONFLICT` 被一刀切归为"版本冲突"文案，误伤 task 创建（"任务已存在"）场景的 toast**——这是 P3-2 引入的真实回归。其次是 **agents 侧接线不一致**（hook 改了、调用方 toast 没改）。

---

## 审查要点逐条核验

### 1. `parseApiError` 结构化（code/retryable 透传）正确性 — ✅ 正确

| 要点 | 结论 | 依据 |
|---|---|---|
| `ApiClientError` → 透传 message/code/retryable | ✅ 正确 | `errors.ts:33-38`。`ApiClientError` 字段为 `readonly status/code/requestId?/retryable`（`client.ts:20-33`），`parseApiError` 返回 `{ message: error.message, code: error.code, retryable: error.retryable }`，三字段全对。`code` 是 `string`（非可选），`ApiErrorInfo.code?` 收窄为可选——类型兼容。 |
| 非 `ApiClientError` → 兜底 | ✅ 正确 | 返回 `{ message: '操作失败' }`，不带 code/retryable。`undefined`/`null`/普通 `Error`/网络错误统一兜底，UI 不会暴露 `undefined` 或堆栈。 |
| `retryable` 透传保真 | ✅ 正确 | `ApiClientError` 构造器 `this.retryable = Boolean(retryable)`（`client.ts:32`），`parseApiError` 原样读出。`fromResponse` 里 `retryable = Boolean(body.error.retryable)`，链路保真。 |

### 2. `handleApiError` 特判文案（401/403/409 判定——code 匹配而非 status）— ⚠️ 见 H1

| 要点 | 结论 | 依据 |
|---|---|---|
| 用 code 而非 status 判定 | ✅ 正确做法 | `friendlyMessage`（`errors.ts:44-56`）`switch (error.code)` + `CONFLICT_CODES.has(error.code)`，全部按 code 判定。这比按 HTTP status 健壮——`fromResponse` 在 body 非 JSON 时会 fallback 到 `code: 'INTERNAL_ERROR'` 但保留真实 `status`（如 502），按 status 判定会误判，按 code 不会。设计正确。 |
| 401 → "登录已过期，请重新登录" | ✅ 正确 | `code: 'UNAUTHENTICATED'` 映射。后端 401 用此 code（`errors.test.ts:19` 验证）。 |
| 403 → "没有执行此操作的权限" | ✅ 正确 | `code: 'FORBIDDEN'` 映射。 |
| 409 → "数据已被其他操作修改，请刷新后重试" | ⚠️ **误伤** | `CONFLICT_CODES = { VERSION_CONFLICT, STATE_CONFLICT }`（`errors.ts:19`）一刀切。但 `STATE_CONFLICT` 在 **task 创建**（POST /tasks）场景语义是"任务已存在"（`tasks.test.ts:122-135` 后端返回 `code: 'STATE_CONFLICT', message: '任务已存在'`），并非"版本冲突/被他人修改"。`CreateTaskDialog.tsx:49` 用 `handleApiError`，导致创建重复任务时 toast 显示"数据已被其他操作修改，请刷新后重试"——语义错误，用户无法理解"刷新后重试"对创建重复任务无意义。→ 见 **H1**。 |
| 其他 code → 透传后端 message | ✅ 正确 | `default: return error.message`。`errors.test.ts:33` 验证 `VALIDATION_ERROR` 透传"标题不能为空"。 |

### 3. users/agents 409 → invalidate 接线（onError 位置、invalidate keys、返回语义）— ⚠️ 见 M1/M2

| 要点 | users | agents |
|---|---|---|
| `onError` 位置 | ✅ `users.ts:56-59`，与 `onSuccess` 并列，v5 mutation 回调签名正确 | ✅ `agents.ts:105-112` |
| invalidate keys | ✅ `usersKeys.lists()` = `['users','list']` 前缀，覆盖 `useUsers` 的 `list()` 缓存 | ✅ `agentsKeys.lists()` + `agentsKeys.detail(vars.id)`，与 `onSuccess` 失效范围对齐（`agents.ts:99-104`） |
| 返回语义 | ⚠️ `refetchOnConflict` 返回值被忽略（`users.ts:58` 未接返回值）| ✅ 用 `if (refetchOnConflict(...))` 守卫 detail invalidate（`agents.ts:107`）|
| 调用方 toast 一致性 | ✅ UsersPage `patchUser` 接了 409 → info toast（`UsersPage.tsx:88-95`）| ❌ AgentsPage `patchAgent` **未接**——仍 `error.message` + 纯 error toast（`AgentsPage.tsx:132-135`）|

→ users 侧接线完整闭环；agents 侧 **hook 改了但调用方没改**，见 **M1**。

### 4. UsersPage 错误 toast（用 parseApiError？还是 handleApiError）— ✅ 选型正确，但有小冗余

| 要点 | 结论 | 依据 |
|---|---|---|
| 用 `handleApiError` 而非 `parseApiError` | ✅ 正确 | toast 需要字符串文案，`handleApiError` 返回 string 且带特判文案；`parseApiError` 返回结构化对象，适合需要 code 的调用方。UsersPage 只需要展示文案 → `handleApiError` 选型正确。 |
| 409 → info toast / 其他 → error toast | ✅ 正确 | `UsersPage.tsx:89-94`：`conflict` 判定后 `tone: conflict ? 'info' : 'error'`、`title: conflict ? '数据已刷新' : '更新失败'`。info tone 符合"数据已刷新，请基于最新值重试"的语义。 |
| conflict 判定重复 | ⚠️ 小冗余 | `UsersPage.tsx:89-90` 重新 instance-check + code 比对判定 `conflict`，而 `useUpdateUser.onError` 内部的 `refetchOnConflict` 已经做过同样的判定（`errors.ts:86-87`）。两处独立判定 `CONFLICT_CODES`，逻辑重复。见 **L1**。 |
| `ApiClientError` import 仍保留 | ✅ 合理 | `UsersPage.tsx:14` 仍 import `ApiClientError`——因为 `conflict` 判定（行 89）和列表加载失败态（行 133）都需要 instance-check，未变成死 import。 |

### 5. 测试质量（6 用例）— ⚠️ 见 M3/L2/L3

| 用例 | 结论 |
|---|---|
| `parseApiError` ApiClientError 结构化 | ✅ 覆盖 message/code/retryable 三字段（`errors.test.ts:7-8`）|
| `parseApiError` 非 ApiClientError 兜底 | ✅ 同时测 `Error` 和 `undefined`（行 12-13）|
| 401 文案 | ✅ `toContain('登录已过期')`（行 20）|
| 403 文案 | ✅ `toContain('没有执行此操作的权限')`（行 25）|
| 409 文案 | ⚠️ 只测 `VERSION_CONFLICT`（行 30），**未测 `STATE_CONFLICT`**——而 `STATE_CONFLICT` 正是 H1 误伤的 code。见 **M3**。|
| 其他 code 透传 | ✅ `VALIDATION_ERROR` → `toBe('标题不能为空')`（行 34）|

测试 6/6 全过（本地 `vitest run` 验证）。但缺 `STATE_CONFLICT` 用例、缺 `useConflictRefetch` 行为测试、缺 409 非 conflict code（如 `VALIDATION_ERROR` 带 status 409 的边界）——见 M3/L2。

---

## 发现

### 高

#### H1 — `STATE_CONFLICT` 被一刀切归为"版本冲突"文案，误伤 task 创建 toast（真实回归）
- **文件**：`src/queries/errors.ts:19, 51-53`；影响 `src/components/CreateTaskDialog.tsx:49`、`src/pages/TasksPage.tsx:301, 314`
- **现状**：`CONFLICT_CODES = new Set(['VERSION_CONFLICT', 'STATE_CONFLICT'])`，`friendlyMessage` 把这两个 code 统一映射成"数据已被其他操作修改，请刷新后重试"。但同一 `STATE_CONFLICT` code 在不同端点语义不同：
  - **task 创建**（POST /tasks）：后端返回 `code: 'STATE_CONFLICT', message: '任务已存在'`（`tasks.test.ts:122-135` 实证）——语义是"资源已存在"，不是"版本冲突"。
  - **user/agent 更新**（PATCH）：语义是"服务端版本/状态已变"——"被他人修改"文案合理。
  - **task execute/cancel**（POST /tasks/{id}/execute|cancel）：若重复操作可能返回 `STATE_CONFLICT`（如任务已执行/已取消）——"被他人修改"文案也不准确。
- **回归路径**：`CreateTaskDialog.tsx:49` 用 `handleApiError(error)`。P3-2 前，`handleApiError` 对 `ApiClientError` 直接返回 `error.message`，创建重复任务时 toast = "任务已存在"（准确）。P3-2 后，`friendlyMessage` 拦截 `STATE_CONFLICT` → toast = "数据已被其他操作修改，请刷新后重试"（错误：用户刷新后重试创建仍会冲突，文案无意义且误导）。这是 P3-2 对既有创建流程的**行为回归**，未被任何测试捕获（`errors.test.ts` 未测 `STATE_CONFLICT`，`CreateTaskDialog` 无 toast 断言）。
- **风险**：用户创建重复任务时看到"数据已被其他操作修改，请刷新后重试"，无法理解、无法通过刷新解决，且丢失了后端原本准确的"任务已存在"信息。
- **修复建议**（二选一，倾向 A）：
  - **A. 收窄 conflict 文案触发面**：`friendlyMessage` 只对 `VERSION_CONFLICT` 给"被他人修改"文案，`STATE_CONFLICT` 透传后端 message（后端已提供准确文案"任务已存在"）。即 `CONFLICT_CODES` 在 `friendlyMessage` 里只用 `VERSION_CONFLICT`；`useConflictRefetch` 的 invalidate 触发面可保留两者（invalidate 对"已存在"也无害——列表本就是最新）。这样 toast 准确、refetch 仍生效。
  - **B. 按端点/操作区分语义**：给 `handleApiError` 增加可选的"操作上下文"参数，调用方声明是 update 还是 create，仅在 update 语境下对 `STATE_CONFLICT` 用冲突文案。改动面大，不推荐。
- **判定**：高。既有创建流程文案回归，用户可见，且测试盲区。

### 中

#### M1 — agents 侧 409 接线不一致：hook 接了 refetch，调用方 toast 没改
- **文件**：`src/queries/agents.ts:93-113`（hook 已改）；`src/pages/AgentsPage.tsx:128-138`（调用方未改）
- **现状**：`useUpdateAgent` 的 `onError` 已接 `refetchOnConflict`（409 时 invalidate list + detail，`agents.ts:105-112`），但调用方 `AgentsPage.patchAgent` 仍是旧逻辑：`onError: (error) => notify(error instanceof ApiClientError ? error.message : '操作失败，请稍后重试。', { tone: 'error', title: '更新失败' })`（`AgentsPage.tsx:132-135`）。对比 UsersPage 已改成 `handleApiError` + 409 info toast（`UsersPage.tsx:88-95`）。
- **风险**：
  - **行为割裂**：agents 409 时缓存被静默刷新到最新，但 toast 仍显示"更新失败"+ 原始后端 message（如"版本冲突"），tone 是 error。用户看到"更新失败"但列表其实已刷新——与 UsersPage 的"数据已刷新"info 提示不一致，同一类操作两种体验。
  - **未用 `handleApiError`**：agents 的 401/403 也不会得到特判文案（仍透传后端 message），与 P3-2"统一错误文案"目标不符。
  - 若 `useUpdateAgent` 的 `onError` 与 `patchAgent` 传入的 `onError` 同时触发（v5 语义：mutation-level `onError` 先跑，再跑 mutate-level `onError`），则 409 时先 invalidate 再弹 error toast——缓存正确但提示误导。
- **修复建议**：把 `AgentsPage.patchAgent` 的 `onError` 改成与 UsersPage 一致——用 `handleApiError(error)` 文案、`conflict` 判定后 `tone: 'info'` + `title: '数据已刷新'`。可抽一个共享 helper（见 L1）避免两处重复判定。

#### M2 — `useConflictRefetch` 与既有 `config.ts` 409 范式重复，存在两套平行机制
- **文件**：`src/queries/errors.ts:79-94`（新 `useConflictRefetch`）；`src/queries/config.ts:70-87`（既有 `useUpdateTokenBudgetConfig` 409 处理）
- **现状**：`config.ts` 已有一套成熟的 409 处理范式：`onError` 内判定 `error.code !== VERSION_CONFLICT_CODE` → refetch 最新值落缓存 → 抛 `VersionConflictError` 携带最新值 → UI 重置表单 + info toast。P3-2 新增的 `useConflictRefetch` 是另一套平行机制：invalidate keys + 返回 bool 由调用方决定 toast。两者设计哲学不同（config 是"refetch + 抛专用错误给 UI"，P3-2 是"invalidate + 返回 bool"），且 `CONFLICT_CODES` 常量在 `errors.ts` 重复定义了一份（`config.ts:19` 已有 `VERSION_CONFLICT_CODE`）。
- **风险**：
  - 两套 409 机制并存，后续维护者需判断"新加的 mutation 该用哪套"，认知负担。
  - `VERSION_CONFLICT` 字符串字面量在 `errors.ts:19` 和 `config.ts:19` 各定义一次，漂移风险（若后端改 code，需改两处）。
  - `useConflictRefetch` 用 `invalidateQueries`（标记 stale + 后台 refetch），config 用 `setQueryData`（直接写入最新值）——前者有 refetch 延迟，后者即时。对 user/agent 列表 invalidate 够用，但语义不统一。
- **修复建议**：统一 409 处理范式。短期可接受两套并存（config 是单值配置、users/agents 是列表，场景不同），但应：(1) 把 `VERSION_CONFLICT`/`STATE_CONFLICT` 字面量抽到单一常量源（如 `errors.ts` 导出 `CONFLICT_CODES`，`config.ts` 复用）；(2) 在 `errors.ts` 顶部注释说明两套机制的适用场景（列表 invalidate vs 单值 refetch+throw），避免后人困惑。中优先。

#### M3 — 测试未覆盖 `STATE_CONFLICT`（H1 的盲区根因）
- **文件**：`src/queries/errors.test.ts:27-31`
- **现状**：409 文案用例只用 `VERSION_CONFLICT`（行 29），未测 `STATE_CONFLICT`。`CONFLICT_CODES` 含两个 code，但只验证了一个的文案路径。H1 的回归正是因为 `STATE_CONFLICT` 在 `friendlyMessage` 里走同一分支但语义不同，而测试没覆盖。
- **风险**：`STATE_CONFLICT` 的文案分支无回归保护；H1 这类"code 语义混淆"问题测试无法捕获。
- **修复建议**：补一个 `STATE_CONFLICT` 用例。但**注意**：补测前需先定 H1 的修复方向——若 H1 选 A（`STATE_CONFLICT` 透传后端 message），则新用例应断言 `handleApiError(STATE_CONFLICT err).toBe('任务已存在')`（透传），而非 `toContain('刷新')`。即先修 H1 再补对应测试，避免把错误行为锁进测试。

### 低

#### L1 — UsersPage 的 `conflict` 判定与 `useConflictRefetch` 内部判定重复
- **文件**：`src/pages/UsersPage.tsx:89-90`；`src/queries/errors.ts:86-87`
- **现状**：`patchUser` 的 `onError` 重新做了一遍 `error instanceof ApiClientError && (code === 'VERSION_CONFLICT' || code === 'STATE_CONFLICT')` 判定，只为决定 toast 的 tone/title。而 `useUpdateUser.onError`（`users.ts:56-59`）调用的 `refetchOnConflict` 内部已做完全相同的判定（且 `refetchOnConflict` 的返回值在 users 侧被丢弃）。
- **风险**：`CONFLICT_CODES` 的判定逻辑散落两处（errors.ts 的 Set + UsersPage 的手写字面量比对），后端改 code 时需同步两处；UsersPage 手写的 `error.code === 'VERSION_CONFLICT' || error.code === 'STATE_CONFLICT'` 若漏改一个 code 会导致 toast tone 与实际 refetch 行为错配。
- **修复建议**：让 `useUpdateUser` 把 `refetchOnConflict` 的返回值透出，或导出一个纯函数 `isConflictError(error): boolean`（不依赖 hook），UsersPage 调用它决定 tone，消除手写字面量。例如 `errors.ts` 导出 `export function isConflictError(error: unknown): boolean { return error instanceof ApiClientError && CONFLICT_CODES.has(error.code) }`，`refetchOnConflict` 内部复用，UsersPage 也复用。低优先但消重价值明确。

#### L2 — `useConflictRefetch` 无行为测试
- **文件**：`src/queries/errors.test.ts`（缺失）
- **现状**：6 个用例全测纯函数（`parseApiError`/`handleApiError`），`useConflictRefetch` 的 `refetchOnConflict`（含 `invalidateQueries` 调用、返回 bool 语义、非 409 短路）零覆盖。
- **风险**：若 `refetchOnConflict` 的 keys 传参、invalidate 调用、返回值语义任一接错（如 users 侧丢弃返回值、agents 侧用返回值守卫），测试不会失败。H1/M1 这类接线问题部分根因即在此。
- **修复建议**：补一个 `useConflictRefetch` 测试——用 `QueryClientProvider` + spy `queryClient.invalidateQueries`，断言：(1) 409 conflict → 调用 invalidate 且返回 true；(2) 非 conflict error → 不调用 invalidate 且返回 false；(3) 传 keys → invalidate 收到指定 key。需配合 `renderHook`。低-中优先。

#### L3 — `refetchOnConflict` 的 `keys` 参数类型 `readonly unknown[]` 与 key factory 返回类型不严格对齐
- **文件**：`src/queries/errors.ts:84`（`keys?: readonly unknown[]`）
- **现状**：参数声明 `keys?: readonly unknown[]`，调用方传 `usersKeys.lists()`（返回 `readonly ['users','list']`）/ `agentsKeys.lists()`（`readonly ['agents','list']`）。`readonly [...]-tuple` 可赋值给 `readonly unknown[]`，类型通过，但 `invalidateQueries({ queryKey: keys })` 接收的是 `unknown[]`——React Query 的 `queryKey` 类型是 `readonly unknown[]`，匹配。类型层面无错。
- **风险**：极低。`unknown[]` 元素类型宽松，理论上可传任意结构，但实际调用方都传 key factory 产物，无 misuse。仅记录：若未来想收紧，可用泛型 `<K extends readonly unknown[]>`，但无实际收益。
- **修复建议**：不改。记录为可接受的设计宽松。

---

## 未发现问题（确认正确）

- **`parseApiError` 透传保真**：message/code/retryable 三字段从 `ApiClientError` 原样读出，`Boolean(retryable)` 在构造器已归一（`client.ts:32`），链路无损。
- **`useConflictRefetch` invalidate 语义**：409 时 `invalidateQueries({ queryKey: keys })` 用 `lists()` 前缀失效，覆盖 list + detail（agents 侧额外显式 invalidate detail）。`void` 忽略 promise 浮动，与 `onSuccess` 风格一致。非 409 短路返回 false，不误失效。
- **v5 回调顺序**：mutation-level `onError`（hook 内）先于 mutate-level `onError`（调用方传入）执行——agents 侧先 invalidate 后弹 toast，顺序正确；users 侧同理。
- **`handleApiError` 选型**：toast 需 string，用 `handleApiError` 而非 `parseApiError`，正确。
- **删 P3-1 死代码**：`dashboard.ts` 删 `useInfiniteAuditLogs`、`requirements.ts` 删 `useInfiniteRequirements`、回退 `useInfiniteQuery` import——清理了 P3-1 review 报告 M1/M2 指出的死代码 + 共享 key 隐患，干净。`TasksPage.tsx:504` 加 `tasks.length > 0` 守卫修了 P3-1 L4 空态按钮。这些是 P3-1 review fix，非 P3-2 核心，已确认无副作用。
- **测试基线**：`vitest run src/queries/errors.test.ts` 6/6 通过。

---

## 建议处置优先级

1. **H1**（`STATE_CONFLICT` 文案误伤创建场景）——真实回归，先定修复方向（倾向 A：收窄到 `VERSION_CONFLICT`），再补 M3 测试。**发布前应修。**
2. **M1**（agents 调用方 toast 未对齐）——与 UsersPage 体验割裂，补 `AgentsPage.patchAgent` 的 `handleApiError` + info toast。
3. **M3**（补 `STATE_CONFLICT` 测试）——紧跟 H1，锁住正确行为。
4. **L1**（抽 `isConflictError` 消重）——随 M1 一起做，两处调用方共用判定。
5. **M2**（统一 409 范式 + 常量源）——架构梳理，可并入下一轮。
6. **L2**（`useConflictRefetch` 行为测试）——补测闭环。
7. **L3**（类型宽松）——不改。

---

> 报告生成于本地独立审查（Codex 运行时不可用）。未修改任何代码。基线：`vitest run src/queries/errors.test.ts` 6/6 通过。
