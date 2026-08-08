# 代码审查报告 — P1-6b（需求数据层补全 + RequirementsPage 接 REST）

**审查范围**：`git diff efde133..2fbe70a`
- `src/api/requirements.ts`（+create/analyze/specs/cancel）
- `src/queries/requirements.ts`（+keys/specs +4 hooks）
- `src/pages/RequirementsPage.tsx`（mock→REST 迁移）
- `src/types.ts`（+RequirementSpecDto/AnalysisResultDto/CancelRequirementResult/CreateRequirementInput）
- `src/components/CreateTaskDialog.tsx`（解包对齐）
- `src/App.test.tsx`（mock 形状对齐 select）

**审查模式**：codex-review-and-fix skill 手动模式（Codex 运行时不可用，独立审查）
**验证**：`npm test` 48/48 绿；`handleApiError`/`useToast` 签名已核对
**结论**：无 High。3 中、3 低。核心数据层与迁移逻辑正确，问题集中在「项目维度失效」与「状态门控语义」。

---

## 高（High）
无。

---

## 中（Medium）

### M1 — 项目筛选维度整体失效（projectId 永远不匹配）
**文件**：`src/pages/RequirementsPage.tsx:185`（筛选条件）、`:173/:328`（表单/工具栏项目选择器）、`:158-159`（`toRequirement` 硬编码）、`src/api/requirements.ts:60-63`（create 不发 projectId）

**问题**：
后端 `RequirementDto` 不含 `projectId`/`projectName`，`toRequirement`（RequirementsPage.tsx:157-159）把它们硬编码为 `''` 与 `'—'`。而筛选条件仍是 `requirement.projectId !== projectId`（:185）。因此只要用户在工具栏选了任一具体项目（非"全部"），`rows` 中所有项 `projectId === ''` 都不匹配 → **列表清空**。同理创建表单里的"所属项目"选择器（:352）与 `form.projectId`（:173/:215）写进 `form`，但 `handleCreate`（:197-201）发给 `createRequirement` 时**根本不带 projectId**，选了也白选——表单字段是死控件。

`RequirementDto` 无 projectId 是后端契约决定（P1-6a 不返回该字段），属已知缺口，但页面保留了一个对用户可见却**永远无结果**的筛选器与表单字段，这是体验退化而非降级兜底。

**修复建议**（二选一）：
1. **隐藏项目维度**（推荐，最小改动，对齐后端 MVP 事实）：移除工具栏项目筛选下拉（:328）、移除创建表单"所属项目"字段（:352）、移除 `form.projectId` 与 `projectId` state，筛选条件删掉 `projectId` 分支（:185）。SummaryStrip 的"覆盖 N 个项目"（:247 `projects.length`）改为按需求数口径或移除。
2. **保留但兜底**：若产品上需保留项目筛选入口，至少把 `toRequirement` 的 `projectId` 默认值改为一个可筛选的占位（如 `'unassigned'`）并在工具栏加"未分配"选项；同时 `CreateRequirementInput`/后端需支持 projectId 才能让表单字段真正生效——属 P2 范围，不应在 P1-6b 半实现。

当前"UI 看得见、点了无效果"的状态最差，建议至少走方案 1 把死控件摘掉。

### M2 — `analyzing` 状态成为死状态（无出口按钮）
**文件**：`src/pages/RequirementsPage.tsx:297-298`（footer 按钮门控）、`:54`（`VALID_STATUSES` 仍含 analyzing）

**问题**：
迁移前 footer 有两步按钮：`draft → 解析需求(→analyzing)`、`analyzing → 确认拆解(→in_progress)`。迁移后（:297-298）只剩 `draft → 解析需求`，且 `handleAnalyze` 走 `POST /analyze`，后端按 api 注释（requirements.ts:15-17）直接把状态翻为 `in_progress` 并产出 spec。即新流程是 `draft → in_progress`，**`analyzing` 不再被任何写操作产生**。

但 `VALID_STATUSES`（:54）、状态筛选下拉（:47）、`StatusBadge`（ui.tsx:39）仍保留 `analyzing`。后果：若 DB 里存在历史 `analyzing` 态需求（迁移期/旧数据/mock.ts:249 仍有该态），选中后 footer **无任何按钮**——既不能解析也不能取消之外推进，用户卡死。`asStatus`（:55-57）也会把后端返回的 `analyzing` 原样保留，不兜底。

**修复建议**：
- 若后端 P1-6a 确实只产 `in_progress`（与 api 注释一致）：在 `asStatus` 里把 `analyzing` 归一到 `in_progress`（或 `draft`），并在 `VALID_STATUSES`/下拉里移除 `analyzing`，让前端状态机与后端契约对齐。
- 若后端实际仍会先置 `analyzing` 再异步转 `in_progress`：则 footer 需补回 `analyzing → 确认拆解` 或轮询 detail。需与 P1-6a 后端实现核实（本审查未读后端代码）。
- 当前"按钮门控只认 draft"对纯新数据无害，但对 `analyzing` 残留数据是死锁，建议至少加 `asStatus` 归一兜底。

### M3 — `CreateTaskDialog` 解包对齐正确但 mock `requirementsKeys` 不完整，潜在 key 失效测试盲区
**文件**：`src/components/CreateTaskDialog.tsx:17`（`reqsData ?? []`）、`src/App.test.tsx:70`（mock `requirementsKeys`）

**问题**：
`CreateTaskDialog` 把 `reqsData?.data ?? []` 改为 `reqsData ?? []`（:17）正确对齐了 `useRequirements` 的 `select: res => res.data`（queries/requirements.ts:50）——现在 `useRequirements` 返回的就是 `RequirementDto[]`，`reqsData` 已是数组，`?? []` 兜底 isLoading/失败态也合理。**此改动本身正确。**

但 `App.test.tsx:70` 的 mock 只给了 `requirementsKeys: { all: ['requirements'] }`，缺 `lists/list/details/detail/specs`。RequirementsPage 迁移后大量使用 `requirementsKeys.lists()`/`.detail()`/`.specs()`（queries/requirements.ts:82/97/98/114/115）。App.test 走的是 `vi.mock('./queries/requirements')` 整模块替换，page 内调用的 `useRequirements` 等 hook 都被 mock 成返回固定值，**不经过真实 `requirementsKeys`**，所以 48 绿。但这意味着：一旦未来有测试直接引用 `requirementsKeys.specs(id)` 做 invalidate 断言，mock 会因 `lists is not a function` 崩。属于测试健壮性缺口，非当前 bug。

**修复建议**：
把 mock 的 `requirementsKeys` 补成与真实 factory 形状一致（参照 RepositoriesPage 测试 mock 模式）：
```ts
requirementsKeys: {
  all: ['requirements'],
  lists: () => ['requirements', 'list'],
  list: (f?: unknown) => ['requirements', 'list', f ?? {}],
  details: () => ['requirements', 'detail'],
  detail: (id: string) => ['requirements', 'detail', id],
  specs: (id: string) => ['requirements', 'detail', id, 'specs'],
},
```
保持与其它资源页 mock 风格一致即可，避免后续踩坑。

---

## 低（Low）

### L1 — `specSummary` 对 `content` 为 JSON 但非数组的健壮性
**文件**：`src/pages/RequirementsPage.tsx:81-95`（`specSummary`）

**问题**：
`specSummary` 用 `JSON.parse(spec.content)`，命中 `Array.isArray` 才走"N 个任务"分支，否则 `catch`/非数组都透传原文截断。逻辑正确且兜底充分。唯一小瑕疵：若 `content` 是 JSON 对象（如 `{ "tasks": [...] }`）而非裸数组，会落到原文透传分支，显示一坨 JSON 文本。后端注释（types.ts RequirementSpecDto）说 content 是"decomposition-result snapshot as a JSON string"，未保证是裸数组。

**修复建议**：非阻塞。若后端 spec content 结构是 `{ tasks: [...] }` 这类信封，可在 `Array.isArray` 判断前加 `parsed?.tasks` 的数组提取。当前实现已足够安全（最差显示截断原文），可等后端 content 形状固化再优化。

### L2 — `cancelRequirement` 返回的 `status` 字段未使用，无契约校验
**文件**：`src/api/requirements.ts:98-106`（`cancelRequirement`）、`src/queries/requirements.ts:108-117`（`useCancelRequirement`）、`src/types.ts`（`CancelRequirementResult.ok/status`）

**问题**：
`CancelRequirementResult` 定义了 `ok: boolean` 与 `status: string`，但 `useCancelRequirement` 的 `onSuccess` 仅 invalidate 缓存，`handleCancel`（RequirementsPage.tsx:233-239）直接 `notify('需求已取消')`，**既不检查 `result.ok` 也不读 `result.status`**。若后端返回 `{ ok: false, status: 'already_cancelled' }` 这类 200 但语义失败的情况，前端仍 toast 成功。

实际后端非 2xx 会抛 `ApiClientError` 走 catch（client 已处理），所以 `ok:false`+200 的概率低。属防御性缺口。

**修复建议**：非阻塞。可在 `handleCancel` 里 `const r = await cancelMutation.mutateAsync({ id }); if (!r.ok) { notify('取消失败：'+r.status, { tone: 'error' }); return }`。与 `analyze` 的 `result.tasksCreated` 读取风格保持一致即可。当前实现可接受。

### L3 — `latestSpecVersion` 排序依赖后端 newest-first 契约，无前端兜底排序
**文件**：`src/pages/RequirementsPage.tsx:197`（`specs[0].version`）、`:296`（spec 列表 `index === 0` 标"当前版本"）

**问题**：
`latestSpecVersion` 取 `specs[0].version`，spec 列表把 `index === 0` 标为"当前版本"。这依赖 `listRequirementSpecs` 返回 newest-first（api 注释 requirements.ts:81-83 声明"highest version first"）。若后端排序约定变化或漏排，`specs[0]` 可能是旧版本，"当前版本"标签会标错。

**修复建议**：非阻塞。可加一道前端兜底：`const sorted = [...(specs ?? [])].sort((a,b) => b.version - a.version)` 后再取 `[0]`，成本极低、消除对后端排序的隐式依赖。或在 `useRequirementSpecs` 的 `select` 里排序（与 `useRequirements` 的 select 风格统一）。当前实现可接受，因后端契约已明确。

---

## 已验证正确（无需改动）

- **api 层 unwrap 一致性**：`listRequirements` 用 `unwrap:false` 保留 `{data,page}` 分页信封（requirements.ts:47），其余 `fetchRequirement`/`createRequirement`/`analyzeRequirement`/`listRequirementSpecs`/`cancelRequirement` 走默认 unwrap 取 `{data}` 内层——与 client 契约一致。
- **create 请求形状**：`createRequirement` 发 `{title, summary, description, priority}`（RequirementsPage.tsx:198-203），`summary`/`description` 同传对齐后端"description 优先、summary 兜底"约定（requirements.ts:54-59 注释），`description→summary` 映射正确。
- **analyze/cancel 路径编码**：`encodeURIComponent(id)` 一致（requirements.ts:74/89/103）；cancel 无 reason 时省 body（:104）合理。
- **queries invalidate 策略**：`useAnalyzeRequirement` onSuccess 失效 `detail(id)+specs(id)+lists()`（queries/requirements.ts:97-99）——分析后 detail 状态翻转 + 新 spec 快照 + 列表状态计数都覆盖，正确。`useCreateRequirement` 失效 `lists()`、`useCancelRequirement` 失效 `detail+lists`，覆盖完整。
- **enabled 门控 + disabled key 工厂**：`useRequirementSpecs`/`useRequirement` 用 `enabled: !!id` 且 disabled 态 key 走 `requirementsKeys.detail/specs('__disabled__')` 工厂（:57/:66），避免字面量落入 detail 前缀树被 list mutation 前缀 invalidate 误伤——与 P1-4b `useRepository` 修复模式一致，正确。
- **statusOverrides 移除**：`statusOverrides` state 与 `updateStatus` 已删（diff 确认），`rows` 改为 `(requirements ?? []).map(toRequirement)`（:176），无残留 mock 状态流转。
- **创建表单迁移**：`handleCreate` 改 `createMutation.mutateAsync` + try/catch + `handleApiError` toast + `setSelectedId(created.id)` + 表单重置 + 关闭对话框（:191-216），完整。
- **分析按钮门控**：`disabled={analyzeMutation.isPending}` + 文案"解析中…"（:297），创建按钮同（:345），防止双击并发。
- **spec 版本区**：三态渲染（specsLoading / specs.length / 空态）完整（:293-307），`specSummary` 兜底充分。
- **CreateTaskDialog 解包**：`reqsData ?? []` 对齐 select 正确（见 M3 正文）。
- **toast 默认 tone**：成功 notify 不带 tone → 默认 `'success'`（ToastProvider.tsx:41），错误用 `tone:'error'`，正确。
- **测试**：48/48 绿；App.test mock 已补 `useRequirement/useRequirementSpecs/useCreateRequirement/useAnalyzeRequirement/useCancelRequirement`，`useRequirements` mock 改为数组形状对齐 select（App.test.tsx:71-78）。

---

## 修复优先级建议
1. **M1**（项目筛选死控件）——直接影响用户操作，建议本任务内修（方案 1 摘控件，10 分钟）。
2. **M2**（analyzing 死状态）——需与后端 P1-6a 核实状态机后定，至少加 `asStatus` 归一兜底。
3. **M3/L1/L2/L3**——健壮性优化，可并入下一轮或 P2。

> 本报告仅审查，未改动任何代码。
