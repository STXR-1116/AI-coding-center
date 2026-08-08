# 代码审查报告 — P3-4b 模块开关接 REST（PATCH /modules + useModules + SettingsPage 接线 + App.test mock）

- **范围**：`git diff a585374..7eaf207` 的 P3-4b 代码部分
  - `src/api/modules.ts`（`listModules` GET `/modules` + `setModuleToggle` PATCH `/modules/{key}` + `toModuleSetting` 桥接）
  - `src/queries/modules.ts`（`modulesKeys` + `useModules` + `useSetModuleToggle` + `syncCaches` + `ModuleVersionConflictError`）
  - `src/pages/SettingsPage.tsx`（`moduleSettings` 数据源改 `useModules` + `requestModuleToggle`/`confirmModuleToggle` mutation 接线）
  - `src/App.test.tsx`（`vi.mock('./queries/modules')` + 稳定引用 + 断言语义改 PATCH 触发）
  - `src/types.ts`（`ModuleDto`/`ModuleToggleDto`/`ModuleToggleConfirm`/`ModuleListResponse`）
  - `src/state/AppContext.tsx` + `app-context.ts`（`replaceModuleSettings` 镜像 API）
  - 附带：`errors.ts` H1 修复（`VERSION_CONFLICT` 收窄）+ `errors.test.ts` 补 `STATE_CONFLICT` 用例 + `AgentsPage.tsx` M1 修复（P3-2 review 遗留，非 P3-4b 核心，仅顺带核验）
- **模式**：codex-review-and-fix 手动模式（Codex 运行时不可用，独立审查，未改代码）
- **结论**：**1 高 / 3 中 / 3 低**。核心问题不在"接 REST"本身——数据源迁移、mutation 接线、pendingModule 二次确认、App.test mock 稳定引用与断言语义均**正确**；真正的系统性问题是 **types.ts 与三处文件头注释描述了一套"版本化 PUT + 乐观锁 + confirm + 409 VERSION_CONFLICT"契约，但实际代码发的是 plain PATCH `{ enabled }`（与 P3-4a 实际实现一致），整套版本/confirm/冲突机制是死代码 + 误导文档**。其次是 SettingsPage mutation **无 loading/error/onSuccess 接线**（乐观 toast + 无失败态），以及 App.test 注释声称"AppContext 镜像由真实 onSuccess 完成"但测试里 `useSetModuleToggle` 被整体 mock、`onSuccess` 永不执行。

> 基线：`npx vitest run src/App.test.tsx` 12/12 通过。

---

## 审查要点逐条核验

### 1. api 契约对齐（PATCH `/modules/{key}` + `{enabled}`）— ✅ 代码正确，⚠️ 文档/类型严重失配（见 H1）

| 要点 | 结论 | 依据 |
|---|---|---|
| 实际请求方法 + 路径 | ✅ 正确 | `modules.ts:64-72`：`patchRequest<ModuleDto>('/modules/${encodeURIComponent(key)}', { enabled })`。`patch` → `request({method:'PATCH'})`（`client.ts:127`）。路径用 `encodeURIComponent` 防 key 注入。与 P3-4a（GET `/v1/modules` + PATCH `/v1/modules/{key}`）一致——见 `.pm-task-p3-4b.md:3,8`。 |
| 请求体 `{ enabled }` | ✅ 正确 | 仅传 `enabled`，无 `version`/`confirm`/`reason`。与任务说明"主工程无乐观锁"一致。 |
| GET `/modules` 列表 unwrap | ✅ 正确 | `modules.ts:54`：`get<ModuleListResponse>('/modules', { unwrap: false })`。列表响应 `{ data:[...] }` 需完整 envelope → `unwrap:false` 让调用方读 `response.data`（`client.ts:118`）。`useModules` 的 `select` 取 `response.data.map(toModuleSetting)`（`queries/modules.ts:60`）——链路对齐。 |
| `toModuleSetting` 桥接 | ✅ 正确 | `modules.ts:36-44`：`ModuleDto`（key）→ `ModuleSetting`（id）身份重命名，`label/description/enabled/risk` 1:1 透传，**丢弃 `version`**（UI 不读）。字段映射完整。 |
| **types.ts 描述的契约 vs 实际代码** | ❌ **严重失配** | `types.ts:744-810` 的注释块与 `ModuleDto`/`ModuleToggleDto`/`ModuleToggleConfirm` 描述的是 **`PUT /config/modules/{key}` + `{ enabled, reason?, version, confirm? }` + 乐观锁 + `409 VERSION_CONFLICT` + `422 CORE_MODULE_CONFIRMATION_REQUIRED`**。但实际代码是 **`PATCH /modules/{key}` + `{ enabled }` 无版本无 confirm**。三处文件头注释（`api/modules.ts:1-20`、`queries/modules.ts:1-25`、`types.ts:744-759`）同样描述这套不存在的 PUT 契约。→ 见 **H1**。 |
| `api/modules.ts` 头注释自相矛盾 | ⚠️ | 头注释（行 4-15）说"versioned PUT + confirm + 409 VERSION_CONFLICT"，但下方 `setModuleToggle` 的 JSDoc（行 57-63）又说"PATCH /api/v1/modules/{key}，server does not take a confirm DTO"——**同一文件内两套矛盾契约**。后者与代码一致，前者是遗留误导。 |

### 2. queries：`useModules` select 桥接 + `useSetModuleToggle` 简化 — ⚠️ 见 H1/M1

| 要点 | 结论 | 依据 |
|---|---|---|
| `useModules` select 桥接 `ModuleDto→ModuleSetting` | ✅ 正确 | `queries/modules.ts:56-62`。`queryKey: modulesKeys.list()`、`queryFn: listModules()`、`select: response.data.map(toModuleSetting)`。select 在缓存层做映射，不重复请求。 |
| `useSetModuleToggle` mutationFn 简化（无 version/confirm） | ✅ 正确 | `queries/modules.ts:107-113`：`mutationFn: ({key, enabled}) => setModuleToggle(key, enabled)`。输入仅 `{key, enabled}`，无 version/confirm——与 plain PATCH 契约一致。 |
| `onSuccess` 重拉 + 镜像 AppContext | ✅ 正确（syncCaches 在） | `queries/modules.ts:114-118`：`await listModules()` → `syncCaches(queryClient, replaceModuleSettings, response)`。`syncCaches`（行 80-90）`setQueryData` 落 RQ 缓存 + `replaceModuleSettings(settings)` 镜像 AppContext。**syncCaches 确实还在**（审查要点 5 验证通过）——ModuleGate/AppShell 读 AppContext，镜像后导航实时联动。 |
| `onError` 409 → `ModuleVersionConflictError` | ❌ **死代码** | `queries/modules.ts:119-126`：判 `error.code === VERSION_CONFLICT_CODE` → 重拉 + 抛 `ModuleVersionConflictError`。但 `setModuleToggle` 不发 version，P3-4a 后端（plain PATCH 无乐观锁）**不会返回 `VERSION_CONFLICT`**——此分支永不触发。且 `ModuleVersionConflictError` **无任何调用方捕获**（grep：仅 `queries/modules.ts` 内 throw，SettingsPage 无 `instanceof ModuleVersionConflictError` 处理，对比 budget tab 的 `VersionConflictError` 有完整 catch `SettingsPage.tsx:273`）。→ 见 **H1/M1**。 |
| `readModuleVersions`/`useModuleVersions` | ❌ **纯幽灵文档** | `queries/modules.ts:54,97` 注释提到"toggle mutation reads it back via `readModuleVersions`/`useModuleVersions`"，但**这两个符号不存在**（grep 全仓无定义）。是版本化契约时代的遗留注释，简化后未删。 |
| `ModuleDto` import 未用 `version` | ⚠️ | `queries/modules.ts:32` import `ModuleDto`，仅 `syncCaches` 参数类型 `{ data: ModuleDto[] }`（行 84）用到。`ModuleDto.version` 字段在类型里强制存在但运行时从不读——后端若不返回 `version`，TS 不报错（结构类型只查读取面），但类型与实际 wire shape 漂移。 |

### 3. SettingsPage：数据源 + mutation 接线 + pendingModule 二次确认 — ⚠️ 见 M2/M3

| 要点 | 结论 | 依据 |
|---|---|---|
| `moduleSettings` 数据源改 `useModules` | ✅ 正确 | `SettingsPage.tsx:179-181`：`modulesQuery = useModules()`；`moduleSettings = modulesQuery.data ?? []`。从 `useApp()` 解构移除 `moduleSettings`/`toggleModule`（行 169），仅留 `user, tasks`。`pendingModule`/`filteredModules`/`enabledCount` 全部基于新 `moduleSettings`——下游消费一致。 |
| `requestModuleToggle` 接 mutation（normal 模块） | ✅ 接线正确，⚠️ toast 乐观 | `SettingsPage.tsx:220-230`：`moduleToggleMutation.mutate({ key: setting.id, enabled: !setting.enabled })` + `notify(...)`。但 `notify` 在 `mutate` 后**同步立即**弹出"已停用/已启用"成功 toast——**未等 `onSuccess`/`onError`**，是乐观 toast。mutation 失败时用户已看到成功提示，且无 `onError` 回滚/纠错 toast。→ 见 **M2**。 |
| `confirmModuleToggle` 接 mutation（core 模块） | ✅ 接线正确，⚠️ 同上 | `SettingsPage.tsx:232-240`：`mutate({ key: pendingModule.id, enabled: !pendingModule.enabled })` + `notify` + `setPendingModuleId(null)`。pendingModule 二次确认弹窗逻辑**完整保留**（`setPendingModuleId` 行 222 / `pendingModule` 行 201）。同样乐观 toast + 立即关弹窗。 |
| pendingModule 二次确认保留 | ✅ 正确 | core 模块（`risk==='core'`）走 `setPendingModuleId`（行 222）→ 弹窗 → `confirmModuleToggle`（行 232）。normal 模块直接 toggle。逻辑与迁移前一致，仅 `toggleModule` 换成 `mutate`。 |
| mutation loading/error 态接线 | ❌ **缺失** | `moduleToggleMutation` 的 `isPending`/`isError`/`onSuccess`/`onError` **均未在 SettingsPage 使用**（grep `SettingsPage.tsx` 无 `moduleToggleMutation.isPending/.error/.onError`，对比 budget tab `updateBudgetMutation.isPending` 行 382-383 有完整 loading + `onError` 行 272-286 有 VersionConflictError catch）。模块开关无 loading 禁用态、无失败 toast、无 `modulesQuery.isLoading/.error` 渲染分支（行 179 拿到 `data ?? []`，loading 时静默空数组）。→ 见 **M2/M3**。 |

### 4. App.test：mock 稳定引用 + 断言语义 — ✅ 正确，⚠️ 注释误导（见 L1）

| 要点 | 结论 | 依据 |
|---|---|---|
| `vi.mock('./queries/modules')` 稳定引用 | ✅ 正确 | `App.test.tsx:103-116`：`MOCK_MODULES`（模块级 const 数组）+ `moduleToggleMutateMock = vi.fn()`（模块级，非 `() => vi.fn()` 工厂）。`useModules: () => ({ data: MOCK_MODULES, isLoading: false })`、`useSetModuleToggle: () => ({ mutate: moduleToggleMutateMock, isPending: false })`。**每次渲染返回同一 mutate 引用**——P2-3b 教训（稳定引用避免 `vi.fn()` 每次 new 导致断言丢失）已落实。 |
| `MOCK_MODULES` 字段 | ✅ 正确 | 7 个模块（task_dispatch/agents/repositories/knowledge/skills/accounts/dashboard），全部 `enabled: true`，risk 分布与 `data/mock.ts:initialModuleSettings` 一致。knowledge 是 normal + enabled——满足测试"开关后路由仍可达"的新断言。 |
| 断言语义改 PATCH 触发 | ✅ 正确 | `App.test.tsx:476`：`expect(moduleToggleMutateMock).toHaveBeenCalledWith(expect.objectContaining({ key: 'knowledge', enabled: false }))`。断言 **mutation 被调用**（PATCH 触发），而非旧的"断言 AppContext 镜像后链接消失"（行 472-480 旧逻辑已删）。`objectContaining` 容忍额外字段，语义正确。 |
| 注释"AppContext 镜像由真实 onSuccess 完成" | ❌ **误导** | `App.test.tsx:474-475` 注释称"AppContext 镜像由真实 useSetModuleToggle onSuccess 完成，集成行为由浏览器实测覆盖"。但测试里 `useSetModuleToggle` 被 `vi.mock` **整体替换**为 `() => ({ mutate: moduleToggleMutateMock })`——**真实 `onSuccess`（含 `syncCaches`/`replaceModuleSettings`）在测试中永不执行**。测试实际验证的只是"mutate 被调用"，AppContext 镜像是被 mock 掉的，注释把"被 mock 跳过的集成行为"说成"由真实 onSuccess 完成"——自相矛盾。→ 见 **L1**。 |
| 新断言"路由正常可达" | ✅ 正确 | `App.test.tsx:480`：`expect(await screen.findByRole('heading', { name: '知识库' })).toBeInTheDocument()`。因 `MOCK_MODULES` 里 knowledge 仍 `enabled: true`（AppContext `initialModuleSettings` 也是 true），且 mock mutate 不改 AppContext，故 `ModuleGate`（`App.tsx:35` `!setting || setting.enabled → return children`）放行——断言与 mock 状态自洽。旧断言"423 MODULE LOCKED"（行 479-480 旧）已删。 |

### 5. 遗留：AppContext moduleSettings 仍被 ModuleGate/AppShell 读 + syncCaches 镜像 — ✅ 验证通过

| 要点 | 结论 | 依据 |
|---|---|---|
| `syncCaches` 还在 | ✅ | `queries/modules.ts:80-90`。`onSuccess`（行 117）与 `onError`（行 124）均调用。`setQueryData` + `replaceModuleSettings` 双缓存同步。 |
| `replaceModuleSettings` 接线 | ✅ | `AppContext.tsx:245-247`（`useCallback` 空依赖稳定身份）+ `app-context.ts:61` 类型声明 + `AppContext.tsx:273` 注入 value。`useSetModuleToggle` 经 `useApp()` 取用（`queries/modules.ts:105`）。 |
| ModuleGate/AppShell 读 AppContext | ✅ | `App.tsx:33` `ModuleGate` 读 `useApp().moduleSettings`；`AppShell.tsx:44,52` 读 `moduleSettings` 算 `enabledModules`。镜像后导航/路由守卫实时联动——**任务说明的"MVP：ModuleGate 下次刷新生效"已被 `syncCaches` 镜像超越**（实际是实时生效，比 MVP 更好，但与 `.pm-task-p3-4b.md:9,23` 的"下次刷新生效"标注不符——是正向偏离，非问题）。 |
| `toggleModule`/`initialModuleSettings` 保留 | ✅ 合理 | `AppContext.tsx:232-236` `toggleModule` 仍在（mock 时代遗留），但 SettingsPage 已不调用。`initialModuleSettings`（`data/mock.ts:459`）仍是 AppContext 初值——首次渲染到 `useModules` resolve 前的过渡态用它，避免空闪烁。可保留（过渡态占位），但 `toggleModule` 已成死代码（grep：仅 AppContext 内定义，无外部调用方）。→ 见 **L3**。 |

---

## 发现

### 高

#### H1 — types.ts + 三处文件头注释描述了一套不存在的"版本化 PUT + 乐观锁 + confirm + 409"契约，与实际 plain PATCH 代码严重失配（系统性误导 + 死代码）
- **文件**：
  - `src/types.ts:744-810`（注释块 + `ModuleDto.version` + `ModuleToggleDto` + `ModuleToggleConfirm`）
  - `src/api/modules.ts:1-20`（头注释描述 PUT/version/confirm/409/422，与下方行 57-63 JSDoc 的 plain PATCH 自相矛盾）
  - `src/queries/modules.ts:1-25`（头注释描述版本化 PUT + 409 + `ModuleVersionConflictError`）、`:54,97`（引用不存在的 `readModuleVersions`/`useModuleVersions`）、`:64-78,119-126`（`ModuleVersionConflictError` 类 + `onError` 409 死分支）
- **现状**：P3-4a 实际实现的是 `GET /v1/modules` + `PATCH /v1/modules/{key} { enabled }`（`.pm-task-p3-4b.md:3,8` 明确；主工程无乐观锁）。但本任务新增的类型与文档描述了一套**完全不同的、更复杂的契约**：
  - `ModuleToggleDto`（`types.ts:798-805`）声明 body 含 `version: number`（必填）+ `confirm?: ModuleToggleConfirm` + `reason?`——但 `setModuleToggle` 实际只发 `{ enabled }`（`api/modules.ts:70`）。
  - `ModuleDto.version`（`types.ts:779`）声明乐观锁版本——但 `toModuleSetting` 丢弃它（`api/modules.ts:36-44`），`useSetModuleToggle` 不读它，`setModuleToggle` 不回传它。
  - `ModuleToggleConfirm`（`types.ts:783-790`）声明 core 模块 confirm DTO（`acknowledged/moduleKey/targetEnabled`）——但 `setModuleToggle` 不发 confirm，注释（`api/modules.ts:62`）自己也说"server does not take a confirm DTO"。
  - `useSetModuleToggle.onError`（`queries/modules.ts:119-126`）判 `VERSION_CONFLICT` 并抛 `ModuleVersionConflictError`——但 plain PATCH 不发 version，后端不会返回此 code，**分支永不触发**。
  - `ModuleVersionConflictError`（`queries/modules.ts:70-78`）被定义并 throw，但**全仓无任何 `instanceof ModuleVersionConflictError` 捕获**（SettingsPage 模块开关无 `onError` 接线，对比 budget 的 `VersionConflictError` 有 `SettingsPage.tsx:273` catch）。
  - `readModuleVersions`/`useModuleVersions` 在注释（`queries/modules.ts:54,97`）中被引用为"读取缓存 version"的机制，但**符号不存在**。
- **风险**：
  - **误导维护者**：后续维护者读 types.ts/头注释会以为存在乐观锁 + confirm + 409 机制，要么照着写不存在的字段（发 `version`/`confirm` 后端忽略或报错），要么以为有冲突保护而省略前端校验。
  - **死代码膨胀**：`ModuleVersionConflictError`（9 行）+ `onError` 409 分支（8 行）+ `ModuleToggleDto`/`ModuleToggleConfirm`（20 行）+ `ModuleDto.version` 永不执行/永不读，增加认知负担。
  - **契约漂移风险**：若后端未来真加乐观锁，维护者可能以为前端"已支持"（因为类型/注释都在），实际 `setModuleToggle` 根本不发 version——静默失效。
  - **`onError` 抛 `ModuleVersionConflictError` 无人接**：若后端因任何原因返回 409（哪怕非 version），此分支 throw 一个无人捕获的 error，在 React Query v5 里 mutation `onError` throw 会变成未处理 rejection——与"标准 error toast 路径"（注释行 101 声称）相反。
- **修复建议**（二选一，强倾向 A）：
  - **A. 对齐到实际 plain PATCH 契约（推荐）**：(1) `types.ts` 删除 `ModuleToggleDto`/`ModuleToggleConfirm`，`ModuleDto` 删 `version` 字段（或保留为可选 `version?` 若后端列表确实回传但前端不用——需确认 P3-4a GET 响应是否含 version）；注释块改写为 `GET /modules → { data: ModuleDto[] }` + `PATCH /modules/{key} { enabled } → ModuleDto`。(2) `api/modules.ts` 头注释（行 1-20）删 version/confirm/409/422 描述，与行 57-63 JSDoc 统一。(3) `queries/modules.ts` 删 `ModuleVersionConflictError` 类 + `onError` 409 分支 + `VERSION_CONFLICT_CODE` + 头注释中版本化/冲突描述 + `readModuleVersions`/`useModuleVersions` 幽灵引用；`useSetModuleToggle` 只留 `onSuccess` 重拉+镜像。
  - **B. 反向对齐到版本化契约（不推荐）**：若 P3-4a 后端**实际**是版本化 PUT（任务说明写错了），则改 `setModuleToggle` 发 `{ enabled, version, confirm? }`，SettingsPage 从 `useModules` 读 version 回传，core 模块构造 `ModuleToggleConfirm`，并接 `ModuleVersionConflictError` catch。改动大、与任务说明冲突，需先向后端确认。
  - **判定依据**：`.pm-task-p3-4b.md:3,8` + `api/modules.ts:62` 注释自证 plain PATCH——选 A。
- **判定**：高。系统性文档/类型/代码三方失配，误导性强，且含未接线 throw 的潜在未处理 rejection。

### 中

#### M1 — `useSetModuleToggle` 无任何调用方接 `onError`/`isPending`/`isError`，mutation 失败静默 + 乐观 toast 误导
- **文件**：`src/pages/SettingsPage.tsx:220-240`（`requestModuleToggle`/`confirmModuleToggle`）；`src/queries/modules.ts:103-128`（mutation 定义）
- **现状**：`SettingsPage` 调 `moduleToggleMutation.mutate(...)` 后**同步立即** `notify('已停用/已启用…', { tone: 'success'/'warning' })`，不接 `onSuccess`/`onError`，不读 `isPending`/`isError`。`useSetModuleToggle` 的 `onSuccess`（重拉+镜像）在 mutation 成功时执行，但 SettingsPage 的 toast 不依赖它（已提前弹）。mutation 失败时：`onSuccess` 不跑（AppContext 不镜像，UI 状态与后端不一致），但用户已看到"已停用"成功 toast——**用户以为成功，实际失败，且无纠错提示**。
- **对比**：同文件 budget tab（`SettingsPage.tsx:266-286`）`updateBudgetMutation` 有完整 `onSuccess`（行 266）+ `onError`（行 272，catch `VersionConflictError` + error toast）+ `isPending`（行 382-383 禁用按钮 + loading 文案）。模块开关无任何等价接线。
- **风险**：
  - **乐观 toast 与实际结果脱节**：网络/权限/后端错误时用户看到成功提示，刷新后才发现模块没变——信任损伤。
  - **无 loading 态**：开关点击后无视觉反馈（按钮不 disable、无 spinner），慢网络下用户可能重复点击触发多次 PATCH。
  - **失败无 toast**：`handleApiError`（P3-2 已统一）在模块开关场景完全没用上——与 P3-2"统一错误文案"目标脱节。
- **修复建议**：(1) `notify` 从 `mutate` 后同步弹改为 `onSuccess` 回调里弹（或 `mutate(vars, { onSuccess: () => notify(...) })`），确保成功才提示。(2) 接 `onError: (error) => notify(handleApiError(error), { tone: 'error', title: '更新失败' })`。(3) 开关 control 读 `moduleToggleMutation.isPending` 禁用 + loading 态（参考 budget 按钮 `SettingsPage.tsx:382-383`）。(4) `modulesQuery.isLoading/.error` 加骨架/错误态渲染分支（参考 budget `SettingsPage.tsx:371-374`）。

#### M2 — `useModules` 无 loading/error 态渲染，loading 时 `moduleSettings = []` 静默空列表
- **文件**：`src/pages/SettingsPage.tsx:179-181`；对比 `:371-374`（budget 有 error 态）
- **现状**：`const moduleSettings = modulesQuery.data ?? []`。`modulesQuery.isLoading`/`.error` 未读。GET `/modules` resolve 前，`moduleSettings` 是空数组——`enabledCount=0`、`moduleSettings.length=0`、`filteredModules=[]`，UI 渲染空模块列表（无骨架、无"加载中"）。GET 失败时同样静默空列表，无错误态/重试按钮。
- **风险**：首次进 /settings 模块 tab 时空白闪烁（无骨架占位），与 budget tab（有 `isLoading` 骨架 + `error` 重试）体验割裂；GET 失败时用户以为"没有模块"而非"加载失败"。
- **修复建议**：参照 budget tab 加 `modulesQuery.isLoading ? <骨架> : modulesQuery.error ? <错误态+重试> : <列表>`。中优先。

#### M3 — App.test 注释声称"AppContext 镜像由真实 onSuccess 完成"，但 `useSetModuleToggle` 被整体 mock、`onSuccess` 永不执行
- **文件**：`src/App.test.tsx:113-116`（mock）+ `:474-475,479`（注释）
- **现状**：`vi.mock('./queries/modules', () => ({ useModules: ..., useSetModuleToggle: () => ({ mutate: moduleToggleMutateMock, isPending: false }) }))` 把 `useSetModuleToggle` 整体替换为一个只暴露 `mutate` 的 stub——**真实 `onSuccess`（`syncCaches`/`replaceModuleSettings` 镜像 AppContext）在测试中完全不执行**。但注释（行 474-475）写"AppContext 镜像由真实 useSetModuleToggle onSuccess 完成，集成行为由浏览器实测覆盖"——把被 mock 跳过的行为说成"由真实 onSuccess 完成"，自相矛盾。行 479"开关 PATCH 不镜像 AppContext（集成层）"又与 474-475 矛盾。
- **风险**：注释误导维护者以为测试覆盖了镜像集成；实际测试只验证"mutate 被调用"，AppContext 镜像零覆盖（镜像逻辑的正确性完全靠浏览器手动实测，无回归保护——`queries/modules.ts` 的 `syncCaches`/`replaceModuleSettings` 接线若接错，测试不会失败）。
- **修复建议**：改注释为准确描述——"测试仅断言 mutate 调用（PATCH 触发）；AppContext 镜像由 `useSetModuleToggle` 真实 `onSuccess`/`syncCaches` 完成，此处被 mock 跳过，集成正确性靠浏览器实测 + 后续可补 `queries/modules.test.ts` 覆盖"。或补一个 `queries/modules.test.ts` 用 `renderHook` + spy `replaceModuleSettings`/`queryClient.setQueryData` 验证 `onSuccess` 镜像行为。中优先（注释准确性必改，测试补充可后续）。

### 低

#### L1 — `api/modules.ts` 头注释（行 1-20）与 `setModuleToggle` JSDoc（行 57-63）描述两套矛盾契约
- **文件**：`src/api/modules.ts:1-20` vs `:57-63`
- **现状**：头注释说"versioned PUT + confirm + 409 VERSION_CONFLICT + 422 CORE_MODULE_CONFIRMATION_REQUIRED"；下方 `setModuleToggle` JSDoc 说"PATCH /api/v1/modules/{key}，server does not take a confirm DTO"。同一文件两段契约描述冲突。属 H1 的局部表现，单独列出因其在最小范围内即可修。
- **修复建议**：删头注释的 version/confirm/409/422 段，统一为 plain PATCH 描述（随 H1 一起改）。低优先。

#### L2 — `AppContext.toggleModule` 已成死代码（SettingsPage 迁移后无调用方）
- **文件**：`src/state/AppContext.tsx:232-236`；`app-context.ts:50`（类型声明）
- **现状**：`toggleModule`（mock 时代的本地翻转）仍定义并注入 AppContext value，但 grep 全仓：**仅 AppContext 内定义，无任何外部 `useApp().toggleModule` 调用方**（SettingsPage 已改 `moduleToggleMutation.mutate`）。`initialModuleSettings` 仍作为 AppContext 初值（过渡态占位）合理保留，但 `toggleModule` 函数本身是死代码。
- **风险**：极低。死函数占位，未来维护者可能误以为还在用而继续维护，或误调用导致与 REST 双写（AppContext 翻转 + REST 不一致）。
- **修复建议**：确认无其他消费方后删 `toggleModule`（定义 + 类型声明 + value 注入 + useMemo 依赖）。`initialModuleSettings`/`moduleSettings`/`replaceModuleSettings` 保留（ModuleGate/AppShell 仍读）。低优先。

#### L3 — `queries/modules.ts` 头注释引用 `GET /config/modules` / `PUT /config/modules/{key}`，实际路径是 `/modules`（PATCH）
- **文件**：`src/queries/modules.ts:8,12,93`；`api/modules.ts:4-6,47,58`
- **现状**：多处注释写 `GET /config/modules`、`PUT /config/modules/{key}`，但代码实际请求 `GET /modules`（`api/modules.ts:54`）、`PATCH /modules/{key}`（`api/modules.ts:68`）。`/config/modules` 是 P3-4a 早期命名残留（实际后端是 `/modules`，见 `api/modules.ts:47,58` 的 JSDoc 已写 `/api/v1/modules`）。
- **风险**：低。路径注释误导，但代码正确。维护者按注释找后端路由会找不到 `/config/modules`。
- **修复建议**：随 H1 一起把注释里的 `/config/modules` 改 `/modules`、`PUT` 改 `PATCH`。低优先。

---

## 未发现问题（确认正确）

- **数据源迁移**：`moduleSettings` 从 `useApp()` 改 `useModules()`，`useApp()` 解构移除 `moduleSettings`/`toggleModule`，下游 `pendingModule`/`filteredModules`/`enabledCount`/`coreDisabled` 全部基于新数据源——迁移干净，无残留双源读取。
- **pendingModule 二次确认**：core 模块 `setPendingModuleId` → 弹窗 → `confirmModuleToggle`，逻辑完整保留，仅 `toggleModule` 换 `mutate`。
- **`useModules` select 桥接**：`response.data.map(toModuleSetting)` 在缓存层映射，`toModuleSetting` 字段 1:1（key→id 重命名 + version 丢弃），正确。
- **`syncCaches` 双缓存同步**：`setQueryData`（RQ 缓存）+ `replaceModuleSettings`（AppContext 镜像）——`onSuccess` 后 ModuleGate/AppShell 实时联动，比任务说明的"MVP 下次刷新生效"更好（正向偏离）。
- **`replaceModuleSettings` 稳定身份**：`useCallback` 空依赖（`AppContext.tsx:245-247`），`useSetModuleToggle` 的 `useApp()` value 不因 moduleSettings 变化而 churn——正确。
- **App.test mock 稳定引用**：`MOCK_MODULES` + `moduleToggleMutateMock` 模块级 const，`useSetModuleToggle: () => ({ mutate: moduleToggleMutateMock })` 每次返回同一引用——P2-3b 教训落实，断言不丢。
- **App.test 断言语义**：改断言 `mutate` 被调用（PATCH 触发）而非 AppContext 镜像后链接消失——与 mock 状态（knowledge 仍 enabled）自洽，`findByRole('heading', { name: '知识库' })` 通过。
- **附带 P3-2 修复核验**：`errors.ts:50-53` H1 修复（`VERSION_CONFLICT` 收窄，`STATE_CONFLICT` 透传）+ `errors.test.ts` 补 `STATE_CONFLICT` 用例（断言 `toBe('任务已存在')`）+ `AgentsPage.tsx:135` M1 修复（`handleApiError` 对齐 UsersPage）——P3-2 review 遗留修复正确，非 P3-4b 核心，已确认无副作用。
- **测试基线**：`npx vitest run src/App.test.tsx` 12/12 通过。

---

## 建议处置优先级

1. **H1**（types/文档/注释描述不存在的版本化 PUT 契约 + 死代码 + 未接线 throw）——系统性失配，先向后端确认 P3-4a 实际契约（plain PATCH 已自证），再按 A 方案对齐：删 `ModuleToggleDto`/`ModuleToggleConfirm`/`ModuleVersionConflictError`/`onError` 409 分支/幽灵 `readModuleVersions` 引用，改写三处头注释 + types 注释块。**发布前应修。**
2. **M1**（mutation 无 onError/isPending 接线 + 乐观 toast 误导）——接 `onSuccess`/`onError`/`isPending`，toast 改成功后弹 + 失败 toast。**发布前应修**（用户可见的成功/失败误导）。
3. **M2**（`useModules` 无 loading/error 态）——加骨架 + 错误重试，对齐 budget tab。
4. **M3**（App.test 注释误导 + 镜像零覆盖）——改注释为准确描述；补 `queries/modules.test.ts` 验证 `onSuccess` 镜像。
5. **L1**（`api/modules.ts` 头注释自相矛盾）——随 H1 一起改。
6. **L3**（注释路径 `/config/modules` → `/modules`、PUT → PATCH）——随 H1 一起改。
7. **L2**（`toggleModule` 死代码）——确认无消费方后删。

---

> 报告生成于本地独立审查（Codex 运行时不可用）。未修改任何代码。基线：`npx vitest run src/App.test.tsx` 12/12 通过（已二次复核：React Query v5 `@tanstack/react-query@^5.84.1`；`ModuleVersionConflictError` 全仓零消费方——仅 `queries/modules.ts:70,125` 定义/抛出，无任何 `instanceof` 捕获；`AppShell.tsx:52` + `App.tsx:33` 读 `moduleSettings`，`syncCaches` 镜像确实保持导航实时联动）。
