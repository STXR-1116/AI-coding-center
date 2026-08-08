# 代码审查报告 — P2-3b（SettingsPage 预算配置 + RepositoriesPage 注册/测试接 REST）

**审查方式**：手动模式（Codex 运行时不可用，独立审查）
**审查范围**：`git diff b084c8b..90179c4`（7 文件 / +383 −17）
**涉及文件**：`src/api/config.ts`、`src/queries/config.ts`、`src/types.ts`、`src/api/repositories.ts`、`src/queries/repositories.ts`、`src/pages/RepositoriesPage.tsx`、`src/pages/SettingsPage.tsx`
**构建/测试**：`npm test --run` → 57 passed（8 files），全绿
**发现统计**：真实 7 条（高 1 / 中 4 / 低 2），误报 0，待确认 0

> 说明：本报告只判真、不改代码（遵循任务要求"不要改代码"）。行号基于审查 HEAD `90179c4`。

---

## 🔴 高（1 条）

### H1 — 契约对齐不完整：`TokenBudgetConfig` 仍残留 4 个后端不存在的旧字段，PUT 会发送多余字段

**文件**：[src/types.ts:725-744](src/types.ts#L725)

**问题**：
`.pm-task-p2-3b-fix.md` 明确要求把 `TokenBudgetConfig` 改成后端 config-dto 形状——**仅 `base / per100Chars / min / max`**（"P2-3a 后端实际是 base/per100Chars/min/max"）。`平台说明.md:101` 也佐证后端是 "`tokenBudget.base` 等 4 参数"。但提交的 `TokenBudgetConfig` 仍保留全部 8 个字段：

```ts
export interface TokenBudgetConfig {
  monthlyTokenBudget: number       // 旧字段，后端无
  singleTaskTokenLimit: number     // 旧字段，后端无
  budgetWarningThreshold: number   // 旧字段，后端无
  base: number
  per100Chars: number
  min: number
  max: number
  version: number
}
```

**判真依据**：
1. `SettingsPage.saveBudget()`（[src/pages/SettingsPage.tsx:262](src/pages/SettingsPage.tsx#L262)）把整个 `budgetForm` 直接传给 `updateBudgetMutation.mutate(budgetForm, ...)`，而 `mutationFn` 透传给 `updateTokenBudgetConfig(input)` → `put('/config/token-budget', input)`（[src/api/config.ts:34](src/api/config.ts#L34)）。所以 PUT 请求体里**会带上 `monthlyTokenBudget / singleTaskTokenLimit / budgetWarningThreshold` 三个后端不认识的字段**。
2. 表单 UI 只编辑 `base/per100Chars/min/max`（[SettingsPage.tsx:376](src/pages/SettingsPage.tsx#L376)），这 3 个旧字段永远停留在 `DEFAULT_TOKEN_BUDGET` 的 mock 值上被原样回传——后端若做严格 DTO 校验（zod/class-validator `strict()` 或 `forbidNonWhitelisted`），PUT 会被 **422** 拒绝；即便后端宽松忽略，也违反"契约对齐完整性"这一审查要点，且给后端留隐患。
3. 类型注释（types.ts:725-730）自称"Combines the runtime budget caps the UI edits (monthlyTokenBudget / singleTaskTokenLimit / budgetWarningThreshold)"——但 UI 实际并不编辑这三个字段（已被 4 参数模型替代），注释与实现矛盾。

**修复建议**：
- 从 `TokenBudgetConfig` 删除 `monthlyTokenBudget / singleTaskTokenLimit / budgetWarningThreshold` 三个字段，只留 `base / per100Chars / min / max / version`。
- 同步删除 `DEFAULT_TOKEN_BUDGET`（[SettingsPage.tsx:103-112](src/pages/SettingsPage.tsx#L103)）中对应的 3 个键。
- `PlatformConfig` 接口（[SettingsPage.tsx:39-60](src/pages/SettingsPage.tsx#L39)）中那 3 个字段是另一个本地 mock 配置（用于"执行策略/通知"tab，未接 REST），可保留；但需确认它们不再被预算 tab 引用（当前预算 tab 已改用 `budgetForm.*`，确认无残留引用即可）。
- 修正 types.ts:725-730 的注释，去掉对三个旧字段的描述。

**风险**：高。后端若严格校验，整个"保存预算"闭环在生产环境直接 422 失败——这正是本任务要交付的核心功能。

---

## 🟡 中（4 条）

### M1 — `Idempotency-Key` 对 PUT 不生效：注释声称防重，实际只对 POST 生效

**文件**：[src/api/config.ts:36-40](src/api/config.ts#L36) 配合 [src/api/client.ts:77-79](src/api/client.ts#L77)

**问题**：
`updateTokenBudgetConfig` 注释明确写"the client attaches an `Idempotency-Key`"（config.ts:13、37），代码传了 `{ idempotent: true }`。但 `buildHeaders` 的判定是：

```ts
// client.ts:77
if (opts.idempotent && (opts.method ?? 'GET').toUpperCase() === 'POST') {
  headers['Idempotency-Key'] = crypto.randomUUID()
}
```

只对 **POST** 加 `Idempotency-Key`，PUT 走不到这个分支——所以 token-budget 的 PUT **永远不会带幂等键**，注释与实现不符。网络重试时 PUT 可能重复落库（虽然乐观锁 `version` 在第二次会因版本已递增而 409，提供了一层保护，但这不是幂等键的语义）。

**判真依据**：直接读 `buildHeaders` 源码——`method === 'PUT'` 不满足 `'POST'` 条件。

**修复建议**（二选一）：
- 若后端确实支持 PUT 幂等键：把 `client.ts:77` 的条件放宽为 `['POST','PUT'].includes((opts.method ?? 'GET').toUpperCase())`，并在 `RequestOptions.idempotent` 的注释里说明覆盖 POST/PUT。
- 若后端 PUT 幂等仅靠 `version` 乐观锁保证：删掉 `updateTokenBudgetConfig` 里 `{ idempotent: true }` 与相关注释，避免误导。鉴于乐观锁已能防重复落库，倾向后者；但需与 P2-3a 后端确认。

### M2 — `queries/config` 未在 App.test mock，预算 tab 实为测试盲区（且现有 mock 不完整）

**文件**：[src/App.test.tsx:161-184](src/App.test.tsx#L161)

**问题**：
任务要求"App.test 若挂 → vi.mock queries/config + repositories mock 扩展 testRepository"。实际：
1. `App.test.tsx` **没有** `vi.mock('./queries/config')`。SettingsPage 在组件顶层调用 `useTokenBudgetConfig()`（[SettingsPage.tsx:183](src/pages/SettingsPage.tsx#L183)），意味着任何渲染 SettingsPage 的测试都会触发真实 `fetch('/api/v1/config/token-budget')`。
2. `queries/repositories` 的 mock（App.test.tsx:161-184）**没有**导出 `useRegisterRepository / useTestRepository`，而 RepositoriesPage 现在导入并调用二者（[RepositoriesPage.tsx:36](src/pages/RepositoriesPage.tsx#L36)、[127](src/pages/RepositoriesPage.tsx#L127)）。

**为什么测试还绿（57 passed）**：
- 唯一渲染 `/settings` 的测试（App.test.tsx:375）只停在默认的"模块开关" tab，从不切到"运行与预算" tab，所以 `budgetQuery` 的数据/错误态都不被读取；jsdom 里 fetch 失败被 React Query 吞成 query error，不抛出，测试不崩。
- 没有测试交互 RepositoriesPage 的"接入表单"或"测试连接"按钮，所以 `useRegisterRepository/useTestRepository` 的缺失不被触发。

**判真依据**：grep 确认 `queries/config` 在 App.test 中零引用；repositories mock 块内无 `useRegisterRepository`/`useTestRepository` 导出。

**修复建议**：
- 在 App.test.tsx 加 `vi.mock('./queries/config', () => ({ configKeys:{...}, useTokenBudgetConfig: () => ({ data: MOCK_TOKEN_BUDGET, isLoading:false }), useUpdateTokenBudgetConfig: () => ({ mutate: vi.fn(), isPending:false }), VersionConflictError }))`，避免测试打真实网络。
- 在 repositories mock 块补 `useRegisterRepository: () => ({ mutate: vi.fn(), isPending:false })` 与 `useTestRepository: () => ({ mutate: vi.fn(), isPending:false })`。
- 补一个切到"运行与预算"tab 的渲染断言（至少断言四个 base/per100Chars/min/max 输入框可见），把预算 tab 纳入覆盖。

### M3 — `testRepository` 结果 toast 的 `latencyMs ?? '?'` 与类型矛盾（类型是必填 number）

**文件**：[src/pages/RepositoriesPage.tsx:229](src/pages/RepositoriesPage.tsx#L229)

**问题**：
```tsx
testMutation.mutate(selected.id, { onSuccess: (r) => notify(
  r.ok ? `连接正常（${r.latencyMs ?? '?'}ms）` : (r.message ?? '仓库不可达'), ...) })
```
但 `RepositoryTestResult.latencyMs: number` 是**必填**（[types.ts:428](src/types.ts#L428)），且注释明确"latencyMs the round-trip time (0 on failure)"。对必填 number 用 `?? '?'` 是死代码——`r.latencyMs` 永远不会是 null/undefined，`?? '?'` 永远走左分支。

**判真依据**：类型定义 `latencyMs: number`（非可选），`??` 的右操作数不可达。

**修复建议**：直接 `` `连接正常（${r.latencyMs}ms）` ``，去掉 `?? '?'`。若想防御后端某天返回 null，则应把类型改成 `latencyMs?: number` 并保留 `??`——但当前类型与用法不一致，需统一。注意：失败分支里 `r.message ?? '仓库不可达'` 同理（message 也是必填），但 message 缺省回退在 UX 上更合理，可保留。

### M4 — 注册表单 `description` 与 `language` 字段被静默丢弃

**文件**：[src/pages/RepositoriesPage.tsx:191-192](src/pages/RepositoriesPage.tsx#L191)

**问题**：
表单状态含 `description` 和 `language` 两个字段（[RepositoriesPage.tsx:147](src/pages/RepositoriesPage.tsx#L147)），UI 也有对应输入框（`#repository-description`、`#repository-language`，行 332/335），用户填了内容。但 `registerMutation.mutate({ name, vcsType, url, localPath, defaultBranch })` 只传 5 个字段，`description` 与 `language` 既不在 `RegisterRepositoryInput`（[types.ts:406-414](src/types.ts#L406)）里，也没被发送——用户输入被静默吞掉。

**判真依据**：`RegisterRepositoryInput` 无 `description`/`language` 字段；mutate 调用未包含二者。

**修复建议**（二选一）：
- 若后端 `POST /repositories` 支持这两个字段：在 `RegisterRepositoryInput` 加 `description?: string` 与 `language?: string`，并在 mutate 调用里补上。
- 若后端不支持：从表单 UI 移除这两个输入框（避免收集了又不传的误导），或在描述里注明"暂未接入"。倾向先确认 P2-3a 注册 DTO 是否含 description/language 再定。

---

## 🟢 低（2 条）

### L1 — `useEffect` 依赖 `budgetQuery.data` 会把"用户未保存的编辑"覆盖回服务端值

**文件**：[src/pages/SettingsPage.tsx:193-198](src/pages/SettingsPage.tsx#L193)

**问题**：
```ts
useEffect(() => {
  if (budgetQuery.data) {
    setBudgetForm(budgetQuery.data)
    setBudgetSaved(budgetQuery.data)
  }
}, [budgetQuery.data])
```
React Query 默认 `staleTime:0`，`budgetQuery.data` 在窗口 refetch（refetchOnWindowFocus）或被 invalidate 后引用会变。当前实现里 `useUpdateTokenBudgetConfig` 的 `onSuccess`/`onError` 用 `setQueryData` 写入的是同一个 cache，会触发本 effect 再次 `setBudgetForm(data)`。正常保存流程下 `data` 就是刚返回的值，覆盖无害；但**冲突（409）场景**下顺序是：mutation `onError` → `setQueryData(latest)` → effect 触发 `setBudgetForm(latest)`，与 `saveBudget` 的 `onError` 里 `setBudgetForm(error.latest)` 重复执行同一赋值（幂等，无害）。真正的隐患是：用户改了一半字段未保存时切走再切回 tab、或窗口失焦 refetch 拿到新 `data`，会**把用户未保存的编辑清空**。

**判真依据**：React Query refetchOnWindowFocus 默认开启；effect 无条件用 server data 覆盖 form。

**修复建议**：用一个"已初始化"标志位只同步首次：`const [hydrated, setHydrated] = useState(false)`，effect 内 `if (!hydrated && budgetQuery.data) { setBudgetForm(...); setBudgetSaved(...); setHydrated(true) }`。冲突场景的 latest 同步交给 `saveBudget` 的 `onError`（已有），不依赖此 effect。

### L2 — 进度条 `warning` 阈值硬编码 90，与"预算告警阈值"配置脱钩

**文件**：[src/pages/SettingsPage.tsx:375](src/pages/SettingsPage.tsx#L375)

**问题**：
预算概览进度条 `warning={monthlyBudgetUsage >= 90}`（行 375）写死 90%。原 mock 时代是用 `config.budgetWarningThreshold`（可配置）驱动的，对齐后端 4 参数模型后后端已无"告警阈值"概念，于是硬编码 90。这是契约对齐的合理副作用，但：
- "当前样例用量 / budgetForm.max"的语义也偏弱——`max` 是"单任务估算上限"，拿它当月度预算分母显示"月度预算 X% 已使用"在语义上对不上（`settings-summary-strip` 行 311 同样用 `monthlyBudgetUsage` 标"月度预算"）。
- 注释（行 202）写"当前样例用量 vs 任务估算上限"，承认了语义偏移。

**判真依据**：后端 4 参数模型无 monthly 概念，UI 仍标"月度预算"是遗留语义。

**修复建议**：低优先。要么把"月度预算"文案改为"预算用量（vs 任务上限 max）"对齐实际分母；要么后端若其实有 monthly cap 字段则补回。当前不阻塞功能，留作 P2-4 文案/语义清理。

---

## ✅ 已验证正确的设计（无需改动）

- **409 冲突处理路径**（[src/queries/config.ts:62-83](src/queries/config.ts#L62)）：`onError` 判 `error instanceof ApiClientError && error.code === 'VERSION_CONFLICT'` → 重拉 latest 落 cache → 抛 `VersionConflictError(latest)`；SettingsPage `saveBudget.onError` 用 `instanceof VersionConflictError` 捕获并对齐 form/saved + info toast。路径完整、闭环正确。✅
- **version 同步**：成功路径 `onSuccess` 用服务端返回的递增 config `setQueryData` + SettingsPage `setBudgetForm(data)/setBudgetSaved(data)`，version 正确流转。✅
- **加载态/错误态**（[SettingsPage.tsx:373-375](src/pages/SettingsPage.tsx#L373)）：`budgetQuery.isLoading` 骨架、`budgetQuery.error` 重试态、`refetch()` 按钮齐全。✅
- **dirty / 保存 / 撤销逻辑**（[SettingsPage.tsx:255-291](src/pages/SettingsPage.tsx#L255)）：`budgetDirty = JSON.stringify(form) !== JSON.stringify(saved)`；保存/撤销按钮 `disabled={!budgetDirty || isPending}`；`resetBudget` 回退到 `budgetSaved`。逻辑正确。✅
- **`registerRepository` 输入形状**（[repositories.ts:90-96](src/api/repositories.ts#L90)）：`url` 字段已正确加入 `RegisterRepositoryInput` 并在 mutate 调用中映射 `url: form.remoteUrl`（[RepositoriesPage.tsx:192](src/pages/RepositoriesPage.tsx#L192)）——本任务 P2-3b-fix 的核心契约修复（"register input field url"）已落实。✅
- **`testRepository` 端点**（[repositories.ts:103-110](src/api/repositories.ts#L103)）：`encodeURIComponent(id)` 路径安全，`idempotent:true` 对 POST 生效（与 M1 的 PUT 不同，此处正确）。✅
- **`ApiClientError.code` 读取**：`ApiClientError` 暴露 `readonly code: string`（[client.ts:34](src/api/client.ts#L34)），`onError` 中 `error.code` 访问合法。✅

---

## 未能修复的高风险项

- **H1**（契约残留 3 字段）已判真且属高风险，但本任务要求"不要改代码"，故未动手。建议作为 P2-3b 收尾的必改项：删 3 字段 + 同步 `DEFAULT_TOKEN_BUDGET` + 修注释 + 跑 build/test 验证后端 PUT 不再 422。这是阻塞"保存预算"生产可用的第一优先级。

---

## 失败处理说明

Codex 运行时不可用（手动模式）。本次审查由独立通读 diff + 源码 + 后端契约文档（`平台说明.md`、`.pm-task-p2-3b-fix.md`、`README.md`）+ 实跑 `npm test --run`（57 green）完成，未自造 Codex 输出。所有 finding 均经源码行号核实。
