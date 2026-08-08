# Codex 代码审查报告 — P1-2d CreateTaskDialog REST

**审查对象**：commit `3b0aab8`（feat(tasks): P1-2d CreateTaskDialog REST — requirement dropdown + createTask mutation, remove mock addTask/priority/executionMode）
**审查模式**：手动独立审查（Codex 运行时不可用）
**审查范围**：`src/components/CreateTaskDialog.tsx`、`src/api/requirements.ts`、`src/queries/requirements.ts`、`src/queries/errors.ts`、`src/queries/tasks.ts`（re-export）、`src/types.ts`（RequirementDto）、`src/api/requirements.test.ts`，附带 `src/App.test.tsx` mock 改动
**审查日期**：2026-08-07

---

## 总体评价

P1-2d 是一次干净、范围克制的 REST 迁移：移除 mock `addTask`/`priority`/`executionMode`，改为 `useRequirements` 下拉 + `useCreateTask` mutation。数据层（`listRequirements` 的 `unwrap:false`、`RequirementDto` 契约、`handleApiError` 抽取与 re-export 兼容）实现正确，与既有 `tasks.ts` 模式高度一致。`handleApiError` 从 `tasks.ts` 移到 `errors.ts` 并 re-export 的迁移是零行为变更的，`TasksPage` 现有 `import { ..., handleApiError } from '../queries/tasks'` 不受影响。

主要问题集中在 **提交按钮的 loading 态缺失**（中）与 **`useEffect` 默认选中逻辑的边界竞态**（中），其余为测试覆盖与契约健壮性建议。

| 级别 | 编号 | 文件:行 | 摘要 |
|------|------|---------|------|
| 中 | M1 | `src/components/CreateTaskDialog.tsx:57` | 提交按钮未反映 mutation pending，可重复点击造成重复提交 |
| 中 | M2 | `src/components/CreateTaskDialog.tsx:20-24` | `useEffect` 默认选中在「关闭→重开 + 需求列表变化」时有选中陈旧值的窗口 |
| 中 | M3 | `src/components/CreateTaskDialog.tsx:26-43` | 提交成功后未重置 `requirementId`，重开对话框残留上次选择 |
| 低 | L1 | `src/components/CreateTaskDialog.tsx:46` | `canSubmit` 未纳入 `title` 非空，与 `submit` 内守卫不完全对齐 |
| 低 | L2 | `src/api/requirements.test.ts` | 测试未覆盖 `listRequirements` 的非 2xx 抛错路径与 `unwrap:false` 边界 |
| 低 | L3 | `src/types.ts:108-110` | `RequirementDto.status`/`priority` 为裸 `string`，未与后端枚举对齐 |
| 低 | L4 | `src/queries/requirements.ts:24` | `useRequirements` 无 `staleTime`，对话框每次打开都重新 fetch（可接受，记录） |
| 低 | L5 | `src/components/CreateTaskDialog.tsx:41` | `onCreated?.()` / `onClose()` 在 catch 分支不执行——行为正确但值得显式注释 |

---

## 详细发现

### M1 — 提交按钮未反映 mutation pending（重复提交风险）【中】

**文件**：`src/components/CreateTaskDialog.tsx:11, 46, 57`

**问题**：
`createMutation = useCreateTask()` 拿到了 mutation 句柄，但 `canSubmit`（行 46）和提交按钮的 `disabled`（行 57）都**没有纳入 `createMutation.isPending`**：

```ts
const createMutation = useCreateTask()
...
const canSubmit = !!requirementId && !reqsLoading && requirements.length > 0
...
<Button variant="primary" ... disabled={!canSubmit}>创建任务</Button>
```

`submit` 是 `async`，`await createMutation.mutateAsync(...)` 期间按钮仍可点击。用户连点两次会触发两次 `POST /tasks`（虽然 client 给 POST 加了 `Idempotency-Key`，但每次 `post()` 调用都 `crypto.randomUUID()` 生成**新**的 key——见 `client.ts:91`——所以两个 key 不同，后端幂等键去重失效，可能落库两条任务）。

**后果**：网络慢时重复提交 → 重复创建任务。

**修复建议**：
```ts
const canSubmit = !!requirementId && !reqsLoading && requirements.length > 0 && !createMutation.isPending
```
并在按钮文案上可加 loading 提示（可选）。注意：`disabled` 会阻止 `form onSubmit`，但用 `form="create-task-form"` 的外部按钮在 disabled 时本身不会触发 submit，安全。

---

### M2 — `useEffect` 默认选中的边界竞态【中】

**文件**：`src/components/CreateTaskDialog.tsx:20-24`

**问题**：
```ts
useEffect(() => {
  if (open && requirements.length && !requirementId) {
    setRequirementId(requirements[0].id)
  }
}, [open, requirements, requirementId])
```

守卫 `!requirementId` 意味着：**只要 `requirementId` 已经有值，就不再纠正它**。考虑序列：

1. 打开对话框，需求列表 `[{id:'req-1'},{id:'req-2'}]` → effect 设 `requirementId='req-1'`。
2. 用户手动改选 `req-2`。
3. 关闭对话框（`open=false`）。`requirementId` 仍是 `'req-2'`，**未被重置**（见 M3）。
4. 期间需求列表刷新，`req-2` 被取消/删除，列表变成 `[{id:'req-1'}]`。
5. 重新打开对话框（`open=true`）。effect 检查 `!requirementId` → 为 false（仍是 `'req-2'`）→ **不纠正**。
6. `<select value="req-2">` 但 options 里没有 `req-2` → 浏览器行为：选中第一个 option，但 React state 仍是 `'req-2'`。此时 `canSubmit` 为 true（`!!requirementId`），点击提交会带着一个**已不存在**的 `requirementId='req-2'` 发请求 → 后端 404/400。

**后果**：重开对话框时可能提交一个失效的 `requirementId`。

**修复建议**：effect 改为「打开时若当前值不在列表中则重置为第一个」：
```ts
useEffect(() => {
  if (!open) return
  if (requirements.length === 0) {
    if (requirementId) setRequirementId('')
    return
  }
  const stillValid = requirements.some((r) => r.id === requirementId)
  if (!stillValid) setRequirementId(requirements[0].id)
}, [open, requirements])  // 依赖里去掉 requirementId，避免设值回环
```
这样无论重开还是列表变化，都能保证 `requirementId` 始终指向一个真实存在的需求。

---

### M3 — 提交成功后未重置 `requirementId`【中】

**文件**：`src/components/CreateTaskDialog.tsx:35-39`

**问题**：
```ts
notify(`任务已创建：${task.id}`, { title: '任务已创建' })
setTitle('')
setSummary('')
onCreated?.(task.id)
onClose()
```
成功后重置了 `title` 和 `summary`，但**没有重置 `requirementId`**。结合 M2，下次打开对话框时下拉会残留上次选中的需求。虽然残留值通常仍有效（需求不会被频繁删除），但「创建任务」对话框的语义应是每次打开都是干净状态——`title`/`summary` 都清空了，唯独 `requirementId` 残留，行为不一致。

**后果**：重开对话框看到上次的残留选择，与已清空的标题/说明不一致；若该需求已失效则触发 M2 的链路。

**修复建议**：成功分支补一行 `setRequirementId('')`（或在 `onClose` 触发时统一重置全部字段）。注意若加 `setRequirementId('')`，M2 的 effect 会在下次打开时重新选默认值，二者配合最稳。

---

### L1 — `canSubmit` 与 `submit` 守卫不完全对齐【低】

**文件**：`src/components/CreateTaskDialog.tsx:28, 46`

**问题**：
- `submit` 守卫：`if (!title.trim() || !requirementId) return`
- `canSubmit`：`!!requirementId && !reqsLoading && requirements.length > 0`

`canSubmit` **没有检查 `title.trim()`**。意味着标题为空时按钮是 enabled 的（虽然 `<input ... required>` 会让浏览器原生表单校验阻止 submit，按钮看起来可点但点了会触发浏览器「请填写此字段」提示）。

**后果**：依赖浏览器原生 `required` 兜底，按钮视觉态与实际可提交态不一致——用户以为能点，点了被浏览器拦下，体验割裂。`title` 有 `required`，但 `requirementId` 对应的 `<select>` 也有 `required`，而 `requirementId=''` 时 `canSubmit` 已经 false，所以 select 的 required 实际从未生效（被 `disabled` 或空 option 兜住）。两处字段的可提交判定逻辑不对称。

**修复建议**：`canSubmit` 加 `&& !!title.trim()`，让按钮在标题空时也禁用，逻辑自洽。

---

### L2 — `requirements.test.ts` 未覆盖错误路径与 unwrap 边界【低】

**文件**：`src/api/requirements.test.ts`

**问题**：测试覆盖了正常解析（envelope、空参数 URL）和 `fetchRequirement` 解包，但**缺少**：
1. **非 2xx 抛 `ApiClientError`**：`listRequirements`/`fetchRequirement` 在 4xx/5xx 时应抛 `ApiClientError`，无测试锁定（对比 `tasks.test.ts` 是否有对应覆盖，本层零覆盖）。
2. **`unwrap:false` 的边界**：列表响应缺少 `page` 字段或 `data` 为非数组时的行为未测。
3. `fetchRequirement` 用 `await import('./requirements')` 动态导入，而 `listRequirements` 用静态导入——同一文件两种导入风格，无注释说明原因（推测是为避免顶部 import 影响 stub 顺序，但 `vi.stubGlobal` 在 `afterEach` 才 unstub，静态导入也能工作，风格不统一）。

**后果**：错误分支零覆盖，回归时易被无声破坏（与 P1-2a 审查 L4 同类问题）。

**修复建议**：补一个「404 → 抛 ApiClientError，error.code 正确」的用例；统一导入风格。

---

### L3 — `RequirementDto` 的 `status`/`priority` 为裸 `string`【低】

**文件**：`src/types.ts:103-114`

**问题**：
```ts
export interface RequirementDto {
  ...
  /** draft|analyzing|in_progress|done|cancelled */
  status: string
  priority: string | null
  ...
}
```
`status` 用注释标注枚举值，但类型是裸 `string`。这与 `TaskDto` 的做法一致（`TaskDto.status: string`，注释说明），是**有意为之**——DTO 层保持 wire 透传，UI 层再 normalize。但本仓库已有 `RequirementStatus` 类型别名（`src/types.ts:10`，`'draft' | 'analyzing' | 'in_progress' | 'done' | 'cancelled'`），DTO 却没用它。`TaskDto` 那边至少有 `asStatus()` 在 normalize；`RequirementDto` 目前**没有任何 normalize 函数**，`CreateTaskDialog` 直接用 `requirement.id`/`requirement.title`，不碰 status，所以当前无 bug。

**后果**：当前安全。但若后续 UI 需要按 `RequirementDto.status` 渲染（如需求下拉显示状态徽标），裸 `string` 会让 TypeScript 失去校验。低优先记录——与 `TaskDto` 风格一致，可接受。

**修复建议**：无需立即改。若后续要消费 status，建议加 `toRequirement(dto)` normalize 函数（参照 `toTask`），并把 DTO 的 `status` 收窄为 `RequirementStatus`。

---

### L4 — `useRequirements` 无 `staleTime`，每次打开对话框都重新 fetch【低】

**文件**：`src/queries/requirements.ts:24-29`

**问题**：
```ts
export function useRequirements(filters?: RequirementListParams) {
  return useQuery({
    queryKey: requirementsKeys.list(filters),
    queryFn: () => listRequirements(filters),
  })
}
```
未设 `staleTime`。`CreateTaskDialog` 在 `AppShell` 常驻挂载（`AppShell.tsx:169`），所以 `useRequirements` 实际上**一直挂载**，不是「每次打开才 fetch」——但 React Query 默认 `staleTime: 0`，窗口重聚焦或 `invalidateQueries` 时都会重新请求。由于 `useCreateTask` 的 `onSuccess` 只 `invalidateQueries({ queryKey: tasksKeys.lists() })`（行 58），**不碰 requirements**，所以创建任务不会让需求列表失效——这是对的（创建任务不改变需求列表）。

**后果**：当前行为合理。但需求下拉数据刷新策略未显式定义（依赖默认 staleTime=0 + refetchOnWindowFocus）。若需求列表很大或后端慢，频繁 refetch 可能影响体验。

**修复建议**：无需立即改。若体验有问题，可给 `useRequirements` 加 `staleTime: 30_000` 之类。记录此决策点即可。

---

### L5 — catch 分支不执行 `onCreated`/`onClose` 的语义值得显式注释【低】

**文件**：`src/components/CreateTaskDialog.tsx:40-42`

**问题**：
```ts
} catch (error) {
  notify(handleApiError(error), { tone: 'error' })
}
```
失败时只 toast 错误，**不关闭对话框、不调用 `onCreated`**——这是正确的（失败应让用户留在对话框里修正后重试）。但这个意图没有注释，对比 P1-2c 的 `TaskInspector` 写操作在审查中显式讨论过「失败保留状态」语义，这里沉默通过。

**后果**：当前正确。低优先——建议加一行注释说明「失败不关闭，保留输入供重试」，避免后续维护者误改成「无论成败都关闭」。

**修复建议**：catch 块加注释 `// 失败时保留对话框打开，让用户修正后重试（不调用 onClose/onCreated）`。

---

## 数据层与兼容性专项核查

### ✅ `listRequirements` 的 `unwrap:false`（`src/api/requirements.ts:35-37`）
```ts
return get<RequirementListResponse>(`/requirements${toQuery(params)}`, { unwrap: false })
```
正确。`client.ts:118` 的逻辑是 `opts.unwrap === false ? body : body.data`，列表响应 `{ data, page }` 需要完整 envelope 传给调用方，`unwrap:false` 返回整个 body。与 `listTasks`（`tasks.ts:126`）模式一致。`useRequirements` 的 `queryFn` 返回 `RequirementListResponse`，`CreateTaskDialog` 通过 `reqsData?.data` 取数组——链路正确。

### ✅ `RequirementDto` 契约一致性（`src/types.ts:94-114`）
字段与后端契约（注释标注 P1-5a）对齐：`id/title/description/status/priority/submitterId/submitterType/createdAt/updatedAt`。`priority`/`submitterId`/`submitterType` 为 `string | null`，与 `TaskDto` 的 nullable 风格一致。`App.test.tsx` mock 数据（行 70-71）提供完整字段，类型匹配。`requirements.test.ts` 的 `makeRequirement` 工厂（行 27-39）覆盖所有字段。**契约一致**。

### ✅ `handleApiError` 抽取的兼容性（`src/queries/errors.ts` + `src/queries/tasks.ts:24` re-export）
- `errors.ts:16` 定义 `handleApiError`，逻辑与原 `tasks.ts` 中的版本**逐字一致**（`error instanceof ApiClientError ? error.message : '操作失败'`）。
- `tasks.ts:24` `export { handleApiError } from './errors'` —— re-export 保持原导出路径。
- `TasksPage.tsx:35` `import { useTasks, useExecuteTask, useCancelTask, handleApiError } from '../queries/tasks'` —— 仍从 `tasks` 导入，re-export 兜住，**零破坏**。
- `CreateTaskDialog.tsx:5` 直接从 `'../queries/errors'` 导入 —— 新代码用新路径，正确。
- `tasks.ts` 顶部 `import { ApiClientError } from '../api/client'` 已随 `handleApiError` 移除（diff 第 11 行删掉），`tasks.ts` 不再需要 `ApiClientError`，**无悬空导入**。

**迁移干净，无破坏性变更**。

### ✅ `createTask` mutation 参数形状（`src/components/CreateTaskDialog.tsx:30-34`）
```ts
const task = await createMutation.mutateAsync({
  requirementId,
  title: title.trim(),
  spec: summary.trim() || undefined,
})
```
对照 `CreateTaskInput`（`tasks.ts:96-101`）：`{ requirementId: string; title: string; spec?: string; tokenBudget?: number }`。
- `requirementId` ✅ 必填，提供。
- `title` ✅ 必填，`title.trim()`。
- `spec` ✅ 可选，`summary.trim() || undefined`（空串转 undefined，不会发空 spec）。
- `tokenBudget` 未传 —— 可选，后端用默认值，正确。

**参数形状完全匹配契约**。

### ✅ `onSuccess`/`onError` 与缓存失效（`src/queries/tasks.ts:53-61`）
```ts
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
    },
  })
}
```
- `onSuccess` 失效 `tasksKeys.lists()`（所有任务列表）——正确，新建任务后列表需刷新。未失效 `requirements` 列表——正确，创建任务不改变需求列表。
- **无 `onError`** —— mutation 层不处理错误，错误由 `CreateTaskDialog.submit` 的 `try/catch` 捕获并 toast。这是本仓库的既定模式（`useExecuteTask`/`useCancelTask` 也无 `onError`，由 `TasksPage` 的 try/catch 处理）。**一致**。
- `invalidateQueries` 不失效 detail —— 新建任务的 detail 尚未被任何查询缓存，无需失效。正确。

### ✅ `App.test.tsx` mock 完整性（`src/App.test.tsx:65-79`）
mock `useRequirements` 返回 `{ data: { data: [...], page: {...} } }, isLoading: false }`，形状与真实 `useRequirements` 返回的 `UseQueryResult<RequirementListResponse>` 一致。`requirementsKeys` 也被 mock（行 66），避免任何对真实 query key 的依赖。**mock 正确**。

---

## 测试质量评估

**`src/api/requirements.test.ts`（92 行，新增）**：
- ✅ 风格与 `tasks.test.ts` 对齐：stub `global.fetch` 而非 mock client 模块，符合本仓库约定。
- ✅ `jsonResponse`/`makeRequirement`/`stubFetch` 工厂复用合理，`lastUrl` 捕获 URL 断言清晰。
- ✅ 覆盖了 envelope 解析、空参数 URL、`fetchRequirement` 解包三个核心路径。
- ⚠️ 缺错误路径（见 L2）。
- ⚠️ `fetchRequirement` 用动态 `import()`（行 79）而 `listRequirements` 用静态 import，风格不统一，无注释。

**`src/App.test.tsx` mock 补充（15 行）**：必要且正确——`CreateTaskDialog` 常驻 `AppShell`，不 mock 会触发真实 fetch。mock 数据字段完整。

**整体测试覆盖**：`CreateTaskDialog` 本身**无组件级测试**（codegraph 标注 ⚠️ no covering tests），仅通过 `App.test.tsx` 的 mock 间接覆盖「能渲染不崩」。表单校验、默认选中、提交禁用、loading 态、错误 toast 均无直接测试锁定。这是本 PR 最大的测试缺口，但与 P1-2a/2b/2c 的测试策略一致（数据层有单测，组件层依赖集成测试），可作为后续 P1 阶段的统一补测项。

---

## 结论

P1-2d 实现质量良好，数据层与兼容性迁移**无破坏性问题**。主要可改进点：

1. **M1（重复提交）**：提交按钮必须纳入 `createMutation.isPending`，这是真实可触发的 bug（网络慢 + 双击 → 重复任务），建议必修。
2. **M2 + M3（默认选中竞态 + 残留）**：组合起来会导致重开对话框提交失效 `requirementId`，建议一起修——M3 重置 + M2 effect 校验有效性。
3. **L1-L5**：体验与健壮性改进，低优先，可纳入后续清理。

**建议**：修 M1、M2、M3 后合入；L 级可单独跟进或记入 backlog。
