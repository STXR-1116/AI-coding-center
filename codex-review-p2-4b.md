# 代码审查报告 · P2-4b（AnalyticsPage 真实化 + UsersPage 新增）

> **审查模式**：手动独立审查（codex-review-and-fix skill 手动模式——Codex 运行时不可用）
> **审查范围**：`git diff 10502de..dbb7cd5`
> **涉及文件**：`src/api/dashboard.ts`（新）、`src/api/users.ts`（新）、`src/queries/dashboard.ts`（新）、`src/queries/users.ts`（新）、`src/pages/AnalyticsPage.tsx`（迁移）、`src/pages/UsersPage.tsx`（新）、`src/App.tsx`（路由）、`src/components/AppShell.tsx`（nav）、`src/types.ts`（DTO）
> **基线验证**：`tsc --noEmit` ✅ 通过；`vitest run src/App.test.tsx` ✅ 11/11 绿
> **后端契约来源**：本仓为纯前端，后端 DTO 不在仓内；以 `src/types.ts` 文档化契约 + `.pm-task-p2-4b.md` 规约为基准（无法逐字段对拍后端源码，相关结论标注「依文档契约」）
> **原则**：只审查不改代码

---

## 摘要

| 等级 | 数量 |
|------|------|
| 高 | 1 |
| 中 | 4 |
| 低 | 5 |

最严重的问题是 **`useMetricsSummary` 在 hook 体内每次渲染都 `new Date()` 计算 `from`**，导致 query key 每渲染都变 → React Query 每渲染重拉（无限 refetch 风暴）。这与 P2-3b 已记录的「不稳定引用触发无限重渲染」教训同源，但这次是真 hook 逻辑而非 mock。其余为 mock 残留类型、测试覆盖盲区、字段语义复用等中低问题。

---

## 高（High）

### H1 · `useMetricsSummary` 每渲染重算 `from` → query key 漂移 → 无限 refetch
**文件**：`src/queries/dashboard.ts:76-88`

```ts
export function useMetricsSummary(range?: DashboardRange, params?: MetricsSummaryParams) {
  const mergedParams: MetricsSummaryParams = { ...params }
  if (range && !mergedParams.from) {
    const days = RANGE_DAYS[range]
    const from = new Date()                 // ← 每次渲染都执行，返回不同毫秒
    from.setDate(from.getDate() - days)
    mergedParams.from = from.toISOString()  // ← 每渲染产生不同的 ISO 串
  }
  return useQuery({
    queryKey: dashboardKeys.metrics(mergedParams),  // ← key 每渲染都不同
    queryFn: () => fetchMetricsSummary(mergedParams),
  })
}
```

**问题**：`new Date()` 在 hook 函数体（非 effect、非 memo）内执行，每次组件渲染都生成一个随当前时间变化的 `from` ISO 字符串。React Query 的 query key 虽做结构化深度比较，但 `from` 的字符串值本身随时间变化（毫秒级），因此 `dashboardKeys.metrics(mergedParams)` 在每次渲染都判定为「新 key」→ 触发新一轮 fetch → fetch 完成触发重渲染 → 再次 `new Date()` → 再次新 key → **refetch 风暴**。`AnalyticsPage` 调用 `useMetricsSummary(range)` 且 `range` 默认 `'30d'`，故 `from` 分支恒进入，问题必定复现。

这恰是 `.pm-task-p2-4b.md:27` 与 P2-3b 教训反复强调的「不稳定引用」类别——只是此处发生在真实 hook 而非 mock。

**修复建议**：把 `from` 的计算移出渲染路径，使其仅依赖 `range`：
- 方案 A（推荐，最小改动）：用 `useMemo` 计算 `mergedParams`，依赖数组只放 `[range, params]`。但 `new Date()` 仍在 memo 内，`range` 不变时 memo 命中、不会重算——key 稳定，问题解决（首次挂载按当时时间算一次，后续 `range` 不变即不重算，符合「窗口起点」语义）。
  ```ts
  const mergedParams = useMemo<MetricsSummaryParams>(() => {
    const p: MetricsSummaryParams = { ...params }
    if (range && !p.from) {
      const from = new Date()
      from.setDate(from.getDate() - RANGE_DAYS[range])
      p.from = from.toISOString()
    }
    return p
  }, [range, params])
  return useQuery({ queryKey: dashboardKeys.metrics(mergedParams), queryFn: () => fetchMetricsSummary(mergedParams) })
  ```
- 方案 B：把 `from` 降粒度到「天」（`from.toISOString().slice(0,10)` 或取当日 00:00），即使每渲染重算，同一天内字符串相同 → key 稳定。语义上「最近 30 天」按天对齐也更合理。
- 注意 `useMemo` 依赖 `params`：调用方目前传 `undefined`，稳定；若未来传入每次渲染新建的对象，需调用方也稳定化 `params`。

---

## 中（Medium）

### M1 · `App.test.tsx` 未 mock `./queries/dashboard` 与 `./queries/users` → /users、/analytics 路由测试盲区
**文件**：`src/App.test.tsx`（全文件，对比新增模块无对应 `vi.mock`）

**问题**：测试 mock 了 tasks/requirements/conversations/repositories/config/auth，但**未** mock `./queries/dashboard`（`useDashboardSummary`/`useMetricsSummary`/`useAuditLogs`）与 `./queries/users`（`useUsers`/`useUpdateUser`）。当前 11 个用例均不导航到 `/users` 或 `/analytics`，故套件「绿」是**侥幸**——这两个新路由零覆盖。

后果：
1. 任何后续用例若 `renderApp('/users')` 或 `renderApp('/analytics')`，会触发真实 `fetch`（vitest 无 fetch polyfill 或打到 vite proxy 失败）→ 用例报错或挂起，且错误信息晦涩。
2. `UsersPage` 还从 `../state/useApp` 取 `currentUser`、从 `../state/useToast` 取 `notify`——前者已被 `AppProvider` 覆盖，后者已被 `ToastProvider` 覆盖，但 query 层裸奔。
3. `.pm-task-p2-4b.md:27` 明确要求「App.test 若挂 → vi.mock queries/dashboard + queries/users（mock 值用模块级稳定引用）」——该前置要求未落实（因为没挂，所以没补）。这属于「应补而未补」的防护。

**修复建议**：补两个模块级稳定引用 mock（参照 P2-3b `useTokenBudgetConfig` 的写法，工厂返回模块级常量，避免内联新对象触发无限重渲染）：
```ts
const MOCK_USERS = { data: [
  { id: 'user-1', username: 'leader', email: 'l@x', displayName: 'Team Leader', role: 'LEADER', status: 'active', createdAt: '2026-08-01T00:00:00.000Z' },
  { id: 'user-2', username: 'emp', email: 'e@x', displayName: 'Employee', role: 'EMPLOYEE', status: 'active', createdAt: '2026-08-02T00:00:00.000Z' },
], page: { nextCursor: null, hasMore: false } }
vi.mock('./queries/users', () => ({
  usersKeys: { all: ['users'], lists: () => ['users','list'], list: () => ['users','list',{}] },
  useUsers: () => ({ data: MOCK_USERS.data, isLoading: false }),
  useUpdateUser: () => ({ mutate: vi.fn(), isPending: false }),
}))
const MOCK_SUMMARY = { /* DashboardSummaryDto 字段，含 metricsSummary: { successRate: 0.93, avgDurationMs: 2_400_000 } */ }
vi.mock('./queries/dashboard', () => ({
  dashboardKeys: { all: ['dashboard'], summary: () => ['dashboard','summary'], metrics: () => ['dashboard','metrics',{}], audit: () => ['dashboard','audit',{}] },
  useDashboardSummary: () => ({ data: MOCK_SUMMARY, isLoading: false }),
  useMetricsSummary: () => ({ data: { summary: { totalTokenUsed: 1000, successRate: 0.93, avgDurationMs: 2_400_000, successCount: 9, failCount: 1 }, perAgent: [] }, isLoading: false }),
  useAuditLogs: () => ({ data: { data: [], page: { nextCursor: null, hasMore: false, total: 0 } }, isLoading: false }),
}))
```
并补至少一个 `/users` 渲染冒烟用例（断言「用户管理」标题 + 至少一行用户）。

### M2 · `AnalyticsPage` 审计 `result` 字段全靠启发式推断，丢失 `warning` 态
**文件**：`src/pages/AnalyticsPage.tsx:189`（diff 行 407 附近）

```ts
result: /fail/i.test(log.action) ? 'failed' : 'success',
```

**问题**：`AuditLogDto` 依文档契约无 `result` 字段，UI 用「action 名是否含 fail」推断结果，二元化成 `failed`/`success`。但 `AuditEvent.result` 类型是 `'success' | 'warning' | 'failed'`，原 mock 有 `warning`（如 `heartbeat`/`budget_warn`/`reclaim`）。推断后 `warning` 态彻底丢失——这些动作既不含 `fail` 也不该算 `success`，全被标成「成功」，误导观测。且 action 命名是自由字符串，`/fail/i` 误判风险高（如动作 `failover`、`prefill` 都会误标 failed）。

**修复建议**：
- 短期：若后端 `AuditLogDto.detail` 是 JSON 字符串（types.ts:834 注释如此），且其中含 result/status，优先 parse detail 取真实结果。
- 中期：与后端确认能否在 `AuditLogDto` 增加 `result`/`level` 字段（success/warning/failed），前端不再启发式。
- 兜底：至少把推断从「二元」放宽——已知 warning 类动作（`heartbeat`/`budget_warn`/`reclaim`/`stale`）映射 `warning`，其余再走 fail 启发式；或当 action 不含 fail 时默认 `warning` 而非 `success`（更保守、不谎报成功）。

### M3 · `AuditActor` 类型仍含 `'service'`，但数据源永不可能产出 service
**文件**：`src/pages/AnalyticsPage.tsx:37`

```ts
type AuditActor = 'all' | 'user' | 'agent' | 'service'
```

**问题**：后端 `AuditLogDto.actorType` 依文档契约仅 `"user" | "agent"`（types.ts:836、853）。桥接代码 `(log.actorType === 'agent' ? 'agent' : 'user')`（行 188）把非 agent 全折叠成 user——`service` 永不可能出现。但 `AuditActor` 仍保留 `'service'` 成员，且筛选下拉已删 `service` 选项（diff 行 570）。这是 mock 残留：类型联合里留了一个 UI 已不暴露、数据也不提供的死分支，`Exclude<AuditActor,'all'>`（行 43）让 `AuditEvent.actorType` 理论可赋 `'service'`，但运行时永不产生，徒增迷惑。

**修复建议**：删 `'service'`，`type AuditActor = 'all' | 'user' | 'agent'`。若未来后端扩展 service 主体，再连同下拉选项一起加回。

### M4 · `DashboardSummaryDto` 多个字段声明但 UI 从不消费（死契约字段）
**文件**：`src/types.ts:786-801`（DTO） vs `src/pages/AnalyticsPage.tsx`（消费）

**问题**：`DashboardSummaryDto` 声明了 `myRequirementsCount` / `myTasksCount` / `totalRequirements` / `totalTasks` / `recentTasks`，但 `AnalyticsPage` 只用到 `metricsSummary` / `tasksByStatus` / `agentsCount` / `agentsByStatus` / `totalTokenUsed` / `successRate`——前五个字段**前端零消费**。`recentTasks`（含 id/title/status/createdAt）本可作为「最近任务」列表展示，却完全没用。

后果：类型声明暗示前端依赖这些字段，实际不依赖——若后端改了这些字段名，前端测试不挂、类型检查也不挂（因为不读），形成**隐性契约漂移**盲区。

**修复建议**：二选一——
- 若产品要「最近任务」区：在 AnalyticsPage 落地 `recentTasks` 列表（参照原 mock 审计旁的「最近活动」位）。
- 若暂不做：在 types.ts 注释标注「前端 MVP 未消费，预留」，或在 `AnalyticsPage` 显式注释「故意不展示 recentTasks」。避免「声明了即以为在用」的错觉。

---

## 低（Low）

### L1 · `AnalyticsPage` 用 `log.entityType` 复用为 `AuditEvent.projectId`，语义错位
**文件**：`src/pages/AnalyticsPage.tsx:190`（`projectId: log.entityType`）与 `:379`（详情区 `<dt>类型</dt><dd>{selectedAudit.projectId}</dd>`）

**问题**：迁移前 `AuditEvent.projectId` 真的是项目 id，详情区标签是「项目」并 `projects.find(...)` 解析项目名。迁移后字段塞的是 `entityType`（如 `task`/`requirement`/`repository`），详情区标签虽改成「类型」、也删了 `projects.find`，但**字段名仍叫 `projectId`**——变量名与内容不符，后续读代码者会被误导以为这是项目维度。

**修复建议**：把 `AuditEvent.projectId` 重命名为 `entityType`（或 `kind`），详情区同步。纯命名清理，无行为变化。

### L2 · `UsersPage` 审计区 `actorType` 仅二元渲染，但 `AuditLogDto` 的 `actorType` 是自由 string
**文件**：`src/pages/UsersPage.tsx:124`（`log.actorType === 'user' ? <UsersRound/> : <UserCog/>`）

**问题**：与 M3 同源——后端 actorType 契约是 `"user" | "agent"`，但 `UserDto`/`AuditLogDto` 里这些字段类型都是 `string`（非字面量联合），UI 用三元判断。若后端未来返回 `service`，会被归入 `UserCog` 图标分支而不报错。当前契约下无害，属健壮性提示。

**修复建议**：可选——把 `AuditLogDto.actorType` 收窄为 `'user' | 'agent'` 字面量联合（依后端契约），让 TS 兜住未来扩展。低优先。

### L3 · `UsersPage` 角色/状态改后未 invalidate 审计区，审计列表不即时刷新
**文件**：`src/queries/users.ts:45-48`（`useUpdateUser` 只 invalidate `usersKeys.lists()`）

**问题**：`useUpdateUser.onSuccess` 仅 invalidate users 列表，未 invalidate `dashboardKeys.audit()`。UsersPage 下方审计区（`useAuditLogs({pageSize:10})`）不会在角色/状态变更后即时反映新审计行，需等缓存自然过期或手动刷新。功能可用，仅即时性不足。

**修复建议**：在 `useUpdateUser.onSuccess` 追加 `void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })`（或更窄的 `dashboardKeys.audit()`）。注意 `queries/users.ts` 需 import `dashboardKeys`，跨域 import 可接受（只读 key 工厂）。

### L4 · `toQuery` 在 `api/dashboard.ts` 重新实现，与 `api/agents.ts` 等 4 处重复
**文件**：`src/api/dashboard.ts:35-43`（`toQuery<T extends object>`）

**问题**：`toQuery` 已在 `api/agents.ts:115`、`api/tasks.ts`、`api/requirements.ts`、`api/repositories.ts` 各有一份。dashboard 版改用泛型 `<T extends object>` + `Object.entries` 遍历，比其它手写逐字段版本更通用，但仍是第 5 份拷贝。5 处实现细节略有差异（手写版只 set 非空字段，泛型版同效果），维护时易漂移。

**修复建议**：低优先。可将泛型版 `toQuery` 提取到 `api/client.ts` 或 `api/query.ts` 统一导出，各 api 模块复用。本次不重构可接受，但建议在后续清理任务统一。

### L5 · `/users` nav 项无 `moduleId`，对 EMPLOYEE 也常驻可见（依规约可接受，记录备查）
**文件**：`src/components/AppShell.tsx:37`

```ts
{ to: '/users', label: '用户管理', icon: Users },  // 无 moduleId
```

**问题**：nav 过滤逻辑（AppShell.tsx:53）`!item.moduleId || enabledModules.has(item.moduleId)` —— 无 `moduleId` 的项**对所有角色常驻可见**，包括 EMPLOYEE。而 `/users` 后端仅 LEADER+ 可访问（types.ts:750 注释、api/users.ts:5）。EMPLOYEE 点进 `/users` 会被后端 403，前端落到 `usersQuery.error` 态显示「用户列表加载失败」（UsersPage.tsx:96 有 error 分支），不会崩，但体验是「看到入口→点进去→报错」。

**结论**：`.pm-task-p2-4b.md:20` 明确允许「moduleSettings 无 account → 不加 gate 或直接用 RequireAuth」，故**这是规约内有意取舍，非缺陷**。记录备查：若后续 `moduleSettings` 增加 `accounts` 模块开关，应给该项补 `moduleId: 'accounts'` 并在路由加 `<ModuleGate moduleId="accounts">`，与 `/analytics`(dashboard) 一致。

---

## 逐审查要点核对

| 审查要点 | 结论 |
|---------|------|
| **1. dashboard/users api：unwrap 一致性** | ✅ 一致。list（users/audit）用 `unwrap:false` 保留 `{data,page}` envelope；detail/summary/metrics 默认 unwrap 取 `data`。与 agents/repositories 模式一致。 |
| **1. toQuery 泛型** | ⚠️ L4——泛型版实现正确（drop undefined/''，key 稳定），但为第 5 份重复。 |
| **1. 错误处理** | ✅ 依赖 `ApiClientError`，UI 各处 `error as ApiClientError` 兜 message。注意 `fetchDashboardSummary`/`fetchUser`/`updateUser` 无 try/catch——但设计上由 React Query 接住 error 进 `query.error`，UI 已处理，符合分层。 |
| **2. AnalyticsPage mock 残留** | ✅ `agents`/`tasks`/`projects`/`useApp`/`trendSeries`/`auditEvents`/`durationByTask` mock 全部移除。⚠️ 残留：`AuditActor` 含 `'service'`（M3）、`projectId` 字段名（L1）。 |
| **2. 图表数据源真实化** | ⚠️ 趋势图改用 `perAgent`（一柱一 Agent）而非时间序列——语义从「趋势」变「Agent 分布」，header 文案已改「按 Agent 聚合」适配。但 `duration` 维度后端无 per-agent 时长，用全局平均 `avgDurationMin` 填充（行 384-387）——所有 Agent 柱 duration 相同，柱状图该维度无区分度，属已知妥协（注释已说明）。 |
| **2. range 切换** | ❌ H1——range 切换本身 UI 正常，但 `useMetricsSummary` 因 `new Date()` 导致 key 漂移，range 不变也会无限 refetch。 |
| **3. UsersPage 列表/角色/状态 mutation** | ✅ `useUpdateUser` mutate + onSuccess invalidate lists + toast。角色/状态各走独立 PATCH（三选一），符合后端契约。 |
| **3. 自改保护** | ✅ `isSelf = currentUser.id === user.id`（UsersPage.tsx:89），role 下拉与状态按钮均 `disabled={isSelf}` + title「不能修改自己」。`currentUser` 取自 `useApp().user`（AppContext.tsx:82 非 null 兜底）。后端再 403 兜底。双重防护到位。 |
| **3. 审计区** | ✅ `useAuditLogs({pageSize:10})` 渲染最近 10 条；⚠️ L3 改用户后不即时刷新。 |
| **4. 路由/nav 注册** | ✅ `/users` 路由注册（App.tsx:107）+ nav 项（AppShell.tsx:37）+ 懒加载（App.tsx:19）。⚠️ L5 无 moduleId（规约内可接受）。 |
| **4. moduleId** | `/analytics` 用 `moduleId="dashboard"` + ModuleGate；`/users` 无 gate（规约允许）。`Users` 图标已在 AppShell.tsx:20 import，无遗漏。 |
| **5. 类型完整性** | ⚠️ 无法对拍后端源码（不在仓）。依文档契约：DTO 字段命名 camelCase、successRate 0-1、avgDurationMs 毫秒、actorType `"user"\|"agent"`、PATCH 三选一——均自洽。⚠️ M4 五个声明字段前端未消费。 |
| **6. 测试 mock** | ❌ M1——App.test 未 mock queries/dashboard + queries/users；当前因不导航到 /users、/analytics 而「侥幸绿」，两路由零覆盖。 |

---

## 结论

P2-4b 整体迁移方向正确：mock 清理干净、unwrap 模式与既有 api 层一致、自改保护双保险、路由/nav/懒加载齐全、类型与 tsc 通过、既有测试不回归。**但有一个必须修的高危问题 H1（`useMetricsSummary` 无限 refetch）**，会在 /analytics 页面真实环境下造成持续网络请求与 UI 抖动，发布前必修。M1（测试盲区）虽不阻塞当前绿，但 `.pm-task-p2-4b.md` 已明示要求补 mock，属应尽义务。M2/M3/M4 为数据真实性与类型卫生问题，建议同批修复。L1-L5 为清理项，可后续。

> 本报告仅审查，未修改任何代码。
