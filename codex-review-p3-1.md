# 代码审查报告 — P3-1 无限分页（useInfiniteTasks + 加载更多）

- **范围**：`git diff 933e550..f57605d` 的代码部分
  - `src/queries/tasks.ts`（`useInfiniteTasks`）
  - `src/queries/requirements.ts`（`useInfiniteRequirements`）
  - `src/queries/dashboard.ts`（`useInfiniteAuditLogs`）
  - `src/pages/TasksPage.tsx`（加载更多按钮 + pages 合并）
  - `src/types.ts`（`AuditLogListParams.cursor`）
  - `src/App.test.tsx`（`useInfiniteTasks` mock）
- **模式**：codex-review-and-fix 手动模式（Codex 运行时不可用，独立审查，未改代码）
- **结论**：**0 高 / 2 中 / 4 低**。`useInfiniteTasks` + TasksPage 接线本身正确，可发布；主要问题是 `useInfiniteRequirements` 与 `useInfiniteAuditLogs` 为**无调用者的死代码**，以及测试只覆盖 mock 形状、未覆盖加载更多真实行为。

---

## 审查要点逐条核验

### 1. `useInfiniteTasks`（src/queries/tasks.ts:58-67）

| 要点 | 结论 | 依据 |
|---|---|---|
| `getNextPageParam`：`nextCursor null → undefined` | ✅ 正确 | `lastPage.page.hasMore ? lastPage.page.nextCursor ?? undefined : undefined`。`nextCursor` 类型为 `string \| null`（src/types.ts:285），`?? undefined` 把 `null` 归一为 `undefined`；`hasMore:false` 直接返回 `undefined` 终止。两条终止路径都对。 |
| query key：筛选参数变化 → 新 query | ✅ 正确 | `queryKey: tasksKeys.list(filters)`，`list` = `['tasks','list', filters ?? {}]`（src/queries/tasks.ts:33）。`status`/`q`/`limit` 任一变化 → 对象引用变 → key 变 → v5 起新 infinite query（旧 pages 丢弃，重取第 1 页）。TasksPage 注释（404-407 行）描述准确。 |
| `limit` | ✅ 正确 | `limit: 20` 作为 `TaskListParams` 一部分进入 key 与 `toQuery`（src/api/tasks.ts:118 `search.set('limit', ...)`）。每页 20 条合理。 |
| 写失效覆盖 | ✅ 正确 | 复用 `tasksKeys.list`，`useCreateTask`/`useAssignTask`/`useExecuteTask`/`useCancelTask` 均失效 `tasksKeys.lists()` 前缀（src/queries/tasks.ts:82,93,104,115），infinite cache 在写后会被 invalidate。 |
| `initialPageParam` | ✅ 正确 | `undefined as string \| undefined`——首页不带 cursor，`toQuery` 跳过 `cursor`（`if (params.cursor)`），首屏请求干净。 |

### 2. TasksPage（src/pages/TasksPage.tsx:404-420, 507-511）

| 要点 | 结论 | 依据 |
|---|---|---|
| pages 合并（flatMap + toTask） | ✅ 正确 | `tasksQuery.data?.pages.flatMap((page) => page.data) ?? []).map(toTask)`（418 行）。`page.data` 是 `TaskDto[]`，`toTask` 归一为 UI 域 `Task`。空/pending → `[]`。与原 `useTasks` 的 `data.data` 单页结构相比，多页合并语义正确。 |
| `useMemo` 依赖 | ✅ 正确 | 依赖 `[tasksQuery.data]`。`data` 引用仅在 pages 数组变化时变（新页加载、写后 refetch），不会每渲染重建。 |
| 加载更多按钮 | ✅ 正确 | `hasNextPage` 控制显隐、`isFetchingNextPage` 控制禁用+文案、`fetchNextPage` 触发（507-511 行）。`void` 忽略 promise 浮动。文案带「已显示 N 条」（`tasks.length`）给用户进度反馈，合理。 |
| 筛选变化时 infinite query 行为 | ✅ 正确 | `status`/`debouncedQuery` 变 → key 变 → v5 丢弃旧 pages 重取第 1 页。`hasNextPage` 随之重置。`selectedId` 有 effect 兜底（424-426 行，见下方 L2）。 |
| 位置 | ⚠️ 小 | 按钮渲染在 `task-groups` 内、`groups` 空态分支之后（504-511）。当无匹配任务（空态）时按钮**仍会渲染**（因为 `hasNextPage` 与 `groups.length` 无关）。见 L4。 |

### 3. `useInfiniteRequirements` / `useInfiniteAuditLogs` — 死代码

- **`useInfiniteRequirements`**（src/queries/requirements.ts:60-69）：全仓 grep 无调用者。RequirementsPage 仍用 `useRequirements`（src/pages/RequirementsPage.tsx:165），CreateTaskDialog 用 `useRequirements`（src/components/CreateTaskDialog.tsx:10）。**无页面接线。**
- **`useInfiniteAuditLogs`**（src/queries/dashboard.ts:104-112）：全仓 grep 无调用者。AnalyticsPage 用 `useAuditLogs({ pageSize: 50 })`（src/pages/AnalyticsPage.tsx:206），UsersPage 用 `useAuditLogs({ pageSize: 10 })`（src/pages/UsersPage.tsx:59）。**无页面接线。**
- 两者实现本身正确（envelope/key/cursor 全对，见 M2），但当前是「写好未接」的死代码。→ 见 **M1**。

### 4. 测试 mock 形状（src/App.test.tsx:117-130）

| 要点 | 结论 | 依据 |
|---|---|---|
| `pages` 数组形状 | ✅ 正确 | `data: { pages: [{ data: filtered, page: { nextCursor: null, hasMore: false } }] }` 与 `useInfiniteQuery` 的 `InfiniteData<...>` 形状一致，TasksPage 的 `pages.flatMap(p => p.data)` 能消费。 |
| `hasNextPage: false` | ✅ 自洽 | mock 的 page `hasMore:false` → 真实 `getNextPageParam` 也会返回 `undefined` → `hasNextPage:false`。一致。 |
| `fetchNextPage` / `isFetchingNextPage` / `isLoading` | ✅ 齐全 | 都给了占位值，TasksPage 解构不报错。 |
| 行为覆盖 | ⚠️ 缺 | 全文件无 `加载更多`/`fetchNextPage`/`hasNextPage` 断言——mock 只防崩，未验证加载更多交互。见 **L1**。 |

---

## 发现

### 中

#### M1 — `useInfiniteRequirements` 与 `useInfiniteAuditLogs` 为无调用者死代码
- **文件**：src/queries/requirements.ts:60-69；src/queries/dashboard.ts:104-112
- **现状**：两个 hook 已实现且实现正确，但全仓无任何页面 import/调用。RequirementsPage、AnalyticsPage、UsersPage 仍走单页 `useRequirements`/`useAuditLogs`。P3-1 提交信息只声称 TasksPage 接了 `useInfiniteTasks`，但 diff 同时引入了 requirements/dashboard 两个 infinite hook——属于「为未来接线预置」但当前无人消费。
- **风险**：
  - 死代码长期无人维护，envelope/字段漂移时不会被任何测试/类型使用点捕获（虽然类型层面仍受 `RequirementListResponse` 约束，但行为无人验证）。
  - 误导后续维护者以为「加载更多」已全量上线（实际只 Tasks 上线）。
  - `useInfiniteRequirements` 复用 `requirementsKeys.list(filters)`，而 `useRequirements` 也用同一 key——若未来某页同时挂两个 hook（单页 + infinite），会**共享同一缓存条目但结构不同**（一个 `InfiniteData`，一个普通 `data`），React Query 会按最后注册的 observer 形态缓存，造成结构错配崩溃。当前因无并发使用点未触发，但属隐患。
- **修复建议**（二选一，倾向 A）：
  - **A. 删除**：P3-1 只交付 Tasks 加载更多，requirements/audit 的 infinite hook 应等对应页面接线时再引入（YAGNI）。删掉两段 + dashboard.ts 的 `useInfiniteQuery` import 回退。
  - **B. 接线**：若 P3-1 本意是三处都上加载更多，则补 RequirementsPage / AnalyticsPage 的接线 + 对应 mock + 测试，并确保同一 key 不同时被单页/infinite hook 消费（建议 infinite 用独立 key，如 `requirementsKeys.listInfinite(filters)`）。

#### M2 — `useInfiniteRequirements`/`useInfiniteAuditLogs` 与单页 hook 共用 query key（潜在结构错配）
- **文件**：src/queries/requirements.ts:62；src/queries/dashboard.ts:106
- **现状**：`useInfiniteRequirements` 用 `requirementsKeys.list(filters)`，`useRequirements`（requirements.ts:48）也用同一 key；`useInfiniteAuditLogs` 与 `useAuditLogs` 共用 `dashboardKeys.audit(filters)`。`useInfiniteTasks` 同样与 `useTasks` 共用 `tasksKeys.list`——但 Tasks 此处**安全**，因为 TasksPage 已全量切到 infinite，无单页并发消费。
- **风险**：React Query 缓存按 key 存储结构化数据。`useQuery` 存 `{ data: envelope, ... }`，`useInfiniteQuery` 存 `{ pages: [...], pageParams: [...] }`。若同一 key 同时被两类 hook 观察（如某页保留 `useAuditLogs` 又接 `useInfiniteAuditLogs`），后注册的 observer 会把缓存解释成错误结构，`page.hasMore` 之类访问抛错或返回 undefined。当前 requirements/audit 因 infinite 无调用者未触发，但一旦按 M1-B 接线即中招。
- **修复建议**：infinite hook 用独立 key 前缀，避免与单页 hook 共享缓存槽：
  - `requirementsKeys.listInfinite(filters)` = `['requirements','list','infinite', filters ?? {}]`
  - `dashboardKeys.auditInfinite(filters)` = `['dashboard','audit','infinite', filters ?? {}]`
  - 写失效仍用 `lists()`/`audit` 前缀覆盖两者。Tasks 当前无需改（无并发），但为一致也可统一。

### 低

#### L1 — 加载更多无行为测试（仅 mock 形状）
- **文件**：src/App.test.tsx:117-130
- **现状**：`useInfiniteTasks` mock 返回单页 `hasNextPage:false`，全文件无对 `加载更多` 按钮、`fetchNextPage` 调用、多页合并的断言。mock 的作用仅是「让 TasksPage 解构不崩」，加载更多交互路径零覆盖。
- **风险**：若未来 `hasNextPage`/`fetchNextPage`/`pages.flatMap` 任一接线错（如把 `hasNextPage` 写成 `hasMore`、漏 `pages` 嵌套），现有测试不会失败。
- **修复建议**：补一个针对性测试——mock `useInfiniteTasks` 返回 `hasNextPage:true` + 两页数据，断言「加载更多」按钮可见、点击触发 `fetchNextPage`、合并后列表含两页任务。或至少把 mock 的 `fetchNextPage` 改为 `vi.fn()` 并在一个渲染测试里断言按钮存在（验证 `hasNextPage:true` 分支渲染）。

#### L2 — `selectedId` 在筛选/多页增长时可能指向已离开视图的任务（既有逻辑，非本次引入）
- **文件**：src/pages/TasksPage.tsx:422-426, 442
- **现状**：`selectedId` 初值 `tasks[0]?.id`（422 行），effect 仅在「当前无选中」时补首个（425 行 `current ?? tasks[0]?.id`）。`selected` = `tasks.find(id===selectedId) ?? filtered[0] ?? tasks[0]`（442 行）。
- **风险**：加载更多后 `tasks` 增长，若用户已选中某任务、随后该任务因 `scope` 切换被 `filtered` 排除，`selected` 回退到 `filtered[0]`——视觉上面板跳变但 `selectedId` 状态仍指向旧任务。这是 P3-1 之前就存在的行为，infinite 分页只是让 `tasks` 更长、`filtered` 与 `tasks` 偏离概率略增。**非本次回归**，仅记录。
- **修复建议**（可选）：`selected` 回退时同步 `setSelectedId(filtered[0]?.id)`，或在 `scope` 变化时重置选中。优先级低。

#### L3 — `useTasks` mock 与 `useInfiniteTasks` mock 重复过滤同一份 mock 数据
- **文件**：src/App.test.tsx:103-115（`useTasks`）、117-130（`useInfiniteTasks`）
- **现状**：P3-1 后 TasksPage 只用 `useInfiniteTasks`，`useTasks` 在生产代码中已无 TasksPage 调用者（仅 `src/queries/tasks.ts:38` 定义 + 测试 mock 残留）。两个 mock 用几乎相同的过滤逻辑各写一遍。
- **风险**：`useTasks` mock 已成测试死 mock（生产无消费点）；维护时两份过滤逻辑易漂移。
- **修复建议**：确认 `useTasks` 是否仍有其他消费点（grep 仅命中定义与注释）；若无，删掉 `useTasks` mock，或抽一个共享 `filterMockTasks(params)` 函数复用。低优先。

#### L4 — 空筛选态下「加载更多」按钮仍渲染
- **文件**：src/pages/TasksPage.tsx:504-511
- **现状**：按钮在 `task-groups` 内、空态分支（`groups.length ? ... : 空态`）之后无条件渲染（仅受 `hasNextPage` 控制）。当无匹配任务（`groups` 为空）且 `hasNextPage` 仍为 true（首页就无匹配但后端说还有更多页）时，会同时显示「没有匹配任务」空态 + 「加载更多」按钮。
- **风险**：视觉/交互怪异——空态下点加载更多通常无意义（当前筛选本就无结果）。实际触发概率低（首页空 + hasNextPage 同时成立需后端返回空数组但 hasMore:true），属边缘。
- **修复建议**：把按钮移入 `groups.length` 为真的分支内，或加 `groups.length > 0 &&` 守卫。低优先。

---

## 未发现问题（确认正确）

- **envelope 字段访问**：`page.hasMore` / `page.nextCursor` 与 `TaskListResponse`/`RequirementListResponse`/`AuditLogListResponse` 的 `page: { nextCursor: string|null, hasMore: boolean }`（src/types.ts:282-286, 109-113, 864-868）完全对齐，无字段名拼写/可选性错配。
- **cursor 转发**：三个 api 层 `toQuery` 均转发 `cursor`（tasks 显式 src/api/tasks.ts:119；requirements 显式 src/api/requirements.ts:39；audit 泛型 `Object.entries` src/api/dashboard.ts:31-37）。infinite hook 一旦接线，分页请求会正确带 cursor。
- **写后失效**：`tasksKeys.lists()` 前缀失效覆盖 infinite cache（M1 中已述），写后列表会刷新。
- **v5 语义**：`@tanstack/react-query ^5.84.1`。`useInfiniteQuery` 在 key 变化时丢弃旧 pages、重取第 1 页，`hasNextPage` 随重置——TasksPage 注释（404-407 行）的「筛选变化 → 新 query」描述与 v5 行为一致。`initialPageParam: undefined` 合法。
- **类型**：`AuditLogListParams.cursor?: string`（src/types.ts:858）新增字段，可选，不破坏既有调用；`fetchAuditLogs({ ...filters, cursor })` 类型通过。

---

## 建议处置优先级

1. **M1**（删死代码 or 接线）——决定 P3-1 的交付边界，应尽快定。
2. **M2**（独立 key）——若 M1 选「接线」则必须同修；若选「删除」则自动消失。
3. **L1**（加载更多行为测试）——补 1 个测试即闭环。
4. **L3 / L4 / L2**——清理/边缘，可并入下一轮。

> 报告生成于本地独立审查（Codex 运行时不可用）。未修改任何代码。
