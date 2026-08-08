# 代码审查报告 — P1-4b 仓库数据层 + RepositoriesPage REST 迁移

**审查范围**：`git diff 506a963..b774046`
**涉及文件**：`src/api/repositories.ts`、`src/queries/repositories.ts`、`src/types.ts`、`src/pages/RepositoriesPage.tsx`、`src/api/repositories.test.ts`、`src/App.test.tsx`
**审查模式**：codex-review-and-fix 手动模式（Codex 运行时不可用，独立审查）
**验证**：`tsc -b --noEmit` 通过；`vitest run` 相关测试 20/20 通过

---

## 总体结论

迁移质量高。REST 数据源替换完整，无残留 `projects` mock 引用（已确认 `RepositoriesPage` 内不再引用 `Project` 类型 / `repoStatusLabels` / `CommitRecord` / `syncRepository` / `changeBranch`），加载/错误态齐备，DTO 与后端契约一致，测试断言真实。数据层 `unwrap:false` envelope 处理、`encodeURIComponent`、错误抛 `ApiClientError` 均正确。

发现 **0 高 / 4 中 / 5 低**。无阻断性问题，下方为可改进点。

---

## 中（Medium）

### M1 — `useRepository` 禁用态 query key 绕开 keys 工厂，破坏 key 一致性
**文件**：`src/queries/repositories.ts:51-53`

```ts
queryKey: id
  ? repositoriesKeys.detail(id)
  : ['repositories', 'detail', '__disabled__'],
```

keys 工厂的设计目的（文件头注释）是「集中化，使 mutation 无需重新推导 key 形状即可精确 invalidate」。这里禁用态却手写了 `['repositories','detail','__disabled__']`，绕开工厂。后果：
- 该字面量与 `repositoriesKeys.details()`（= `['repositories','detail']`）是前缀关系，任何 `invalidateQueries({ queryKey: repositoriesKeys.details() })` 会意外命中这条禁用态缓存。
- 后续若有人按工厂约定写 invalidate，行为不可预期。

`useCommits`/`useChanges` 用 `id ?? ''`（line 69/81）也有同类问题：禁用时 key 退化为 `['repositories','detail','','commits']`，空串 `''` 是合法但语义模糊的 id 占位。

**修复建议**：禁用态统一用一个稳定的「哨兵」key，且不挂在 `detail` 前缀下，避免被前缀 invalidate 误伤。例如：

```ts
// 在 keys 工厂里
disabled: () => ['repositories', '__disabled__'] as const,

// useRepository
queryKey: id ? repositoriesKeys.detail(id) : repositoriesKeys.disabled(),
```

`useCommits`/`useChanges` 在 `enabled:false` 时 key 内容无关紧要（不会 fetch），但仍建议用哨兵而非空串 id，保持「禁用态 key 不落入 detail 前缀树」。

---

### M2 — `useCommits` 的 `limit` 未进入 query key，切换 limit 会读到旧缓存
**文件**：`src/queries/repositories.ts:68-72`

```ts
queryKey: repositoriesKeys.commits(id ?? ''),   // 不含 limit
queryFn: () => listCommits(id as string, limit), // queryFn 用了 limit
```

key 不含 `limit`，但 `queryFn` 依赖 `limit`。若同一仓库先以 `limit=10` 查询、再以 `limit=50` 查询，React Query 命中同一 key 直接返回 10 条的缓存，不会重新请求。当前页面调用 `useCommits(effectiveSelectedId, detailEnabled)` 不传 `limit`（line 161），所以**当前无实际触发**；但 API 已暴露 `limit` 形参，是埋点隐患。

**修复建议**：把 `limit` 纳入 key，或显式注明「limit 固定、不参与缓存」：

```ts
commits: (id: string, limit?: number) =>
  [...repositoriesKeys.detail(id), 'commits', limit ?? null] as const,
```

并相应更新 `useCommits` 的 `queryKey: repositoriesKeys.commits(id ?? '', limit)`。

---

### M3 — `selectedCommit` 在切换仓库后不重置，可能错误高亮
**文件**：`src/pages/RepositoriesPage.tsx:130、167、297`

`selectedCommit` 初始为 `''`（line 130），用户在某仓库点选一条 commit 后 `selectedCommit` 存下其 hash（line 297）。切换到另一个仓库时，`selectedCommit` 仍保留旧 hash：

```ts
const selectedCommitRecord = commits.find((commit) => commit.hash === selectedCommit) ?? commits[0]
```

`find` 失败会回退到 `commits[0]`，所以「选中态」显示正确（回退首条）。但列表渲染用 `selectedCommitRecord?.hash === commit.hash` 判定 `is-active`（line 297）——回退场景下 `selectedCommitRecord` 是 `commits[0]`，其 hash 等于首条 commit，首条会被高亮，这没问题。

**真正的隐患**：若两个仓库恰好存在相同 hash 的 commit（同一仓库多分支、或 fork 关系），`find` 命中旧 hash，会高亮错误的那条而非 `commits[0]`。概率低但非零，且语义上「selectedCommit 跨仓库残留」本身是个 stale state。

**修复建议**：仓库切换时清空 `selectedCommit`。由于 `selected` 由 `filtered` 派生，可用 `useEffect` 监听 `effectiveSelectedId`：

```ts
useEffect(() => {
  setSelectedCommit('')
  setShowAllCommits(false)
}, [effectiveSelectedId])
```

---

### M4 — `useRevertChange` invalidate `detail(vars.id)`，但页面从未缓存 detail 查询
**文件**：`src/queries/repositories.ts:92-99`

```ts
onSuccess: (_data, vars) => {
  void queryClient.invalidateQueries({ queryKey: repositoriesKeys.changes(vars.id) })
  void queryClient.invalidateQueries({ queryKey: repositoriesKeys.detail(vars.id) })
}
```

`RepositoriesPage` 用的是 `useRepositories`（list，经 `select` 取 `data`），**没有**调用 `useRepository`（detail 单条）。所以 `invalidateQueries({ detail(vars.id) })` 在当前页面是空操作——没有 detail 缓存可失效。

审查要点提到的「revert 后 changes 失效」是对的：`changes(vars.id)` 的 invalidate 正确（P1-4c 接上 revert 按钮后，`useChanges` 的 key 是 `changes(effectiveSelectedId)`，前缀匹配命中）。

但还有一处缺口：**revert 后 list 缓存未 invalidate**。revert 会改变工作区变更状态，但 list 项里的 `updatedAt`/健康度可能需要刷新；更重要的是 list 顶栏「待处理变更」计数依赖 `changes`（已 invalidate，OK）。当前 P1-4b 不接 revert 按钮（只读），此 hook 是预埋，**无实际触发路径**，故定中而非高。

**修复建议**（P1-4c 接 revert 时一并处理）：
- 若 revert 不改变 list 内容（仅工作区文件），保留 `changes` invalidate 即可，去掉空操作的 `detail` invalidate，或补 `lists()` invalidate。
- 若 revert 会更新 `updatedAt`，补 `invalidateQueries({ queryKey: repositoriesKeys.lists() })`。

---

## 低（Low）

### L1 — `formatTime` 仅返回日期（无时分），与「最近更新」语义偏弱
**文件**：`src/pages/RepositoriesPage.tsx:56-63`

`formatTime` 把 ISO `updatedAt` 格式化为 `YYYY-MM-DD`，丢弃了时分。列表行（line 267）和详情（line 208）都用它显示「最近更新」。对仓库列表「最近更新」而言，同日多次更新的仓库会显示相同日期，区分度低。mock 时代是「8 分钟前 / 昨天 19:24」等相对文案，信息量更高。

`formatCommitTime`（line 66）保留了时分，对比之下 `formatTime` 的截断显得不一致。

**修复建议**：`formatTime` 也保留到分钟，或对近期时间用相对文案（「刚刚 / N 分钟前 / 今天 HH:MM / YYYY-MM-DD」）。非阻断，属体验优化。

---

### L2 — `repoHealthLabels` 用 `as 'active' | 'disabled'` 强转，未覆盖后端未知状态
**文件**：`src/pages/RepositoriesPage.tsx:46-49、202、266`

```ts
const repoHealthLabels: Record<'active' | 'disabled', string> = { active: '已接入', disabled: '已停用' }
// 用法
repoHealthLabels[selected.status as 'active' | 'disabled'] ?? selected.status
```

`RepositoryDto.status` 类型是 `string`（types.ts:336），运行时若后端返回 `active|disabled` 之外的状态（如未来的 `archived`），`as` 强转会让 `repoHealthLabels[unknown]` 返回 `undefined`，再 `?? selected.status` 兜底显示原始字符串——兜底是有的，不会崩。但强转掩盖了类型不安全。

**修复建议**：把 `RepositoryDto.status` 收窄为 `'active' | 'disabled'`（若后端契约确定只有这两值），或把 map 改为 `Record<string, string>` 并显式 fallback，去掉 `as`。前者更佳（编译期保证）。

---

### L3 — `App.test.tsx` 的 mock `repositoriesKeys` 与真实工厂结构不完全一致
**文件**：`src/App.test.tsx:143-152`

mock 里 `list: () => ['repositories', 'list', {}]` 固定返回 `{}` 作 filters 段，而真实工厂 `list(filters?)` 传 `filters ?? {}`。当前页面调用 `useRepositories()` 不传参，二者恰好都产出 `{}`，一致。

但 mock 的 `details: () => ['repositories', 'detail']` 等是手写数组，未引用真实 `repositoriesKeys`。一旦真实工厂调整 key 形状（如 M1/M2 修复时），mock 不会同步，测试会假绿。

**修复建议**：测试里直接 `import { repositoriesKeys } from '../queries/repositories'` 复用真实工厂构造 key，仅 mock 返回数据的 hooks。或保留当前 mock 但加注释说明「key 形状需与 factories 手动同步」。属测试维护性。

---

### L4 — `useRepository`、`useRevertChange` 已导出但页面未使用（预埋代码）
**文件**：`src/queries/repositories.ts:49、87`

`useRepository` 在页面中未被调用（页面从 list 结果取 `selected`，不走 detail 单条端点）；`useRevertChange` 也未接 UI（revert 属 P1-4c 范围，本任务只读）。二者均有测试覆盖（`repositories.test.ts` 测了 `fetchRepository`/`revertChange` 底层；`App.test.tsx` mock 了 hook 形状）。

预埋本身符合任务边界（queries 层一次性建好），但 `useRepository` 在本任务的数据流里**没有调用方**，属可选导出。

**修复建议**：保留即可（P1-4c 会用）。若追求最小化，可在 P1-4c 接入时再导出 `useRepository`。无需现在改。

---

### L5 — 顶部「待处理变更」统计语义变更：从「全仓库」收窄到「当前选中仓库」
**文件**：`src/pages/RepositoriesPage.tsx:223`

```ts
{ label: '待处理变更', value: changes.length, detail: detailEnabled ? `${changesTotal} 行待审查` : '需本地路径', ... }
```

mock 时代 `modifiedCount` 统计的是**所有** `status==='modified'` 的仓库数（line 旧逻辑）。迁移后 `changes.length` 只反映**当前选中仓库**的工作区变更。语义从「全仓库待处理变更数」变成「选中仓库的变更文件数」，且未选中仓库或无 localPath 时显示 0/「需本地路径」。

这是迁移到真实数据后的合理收窄（后端 MVP 无聚合「全仓库变更」端点），但用户看到的指标含义变了，且数值会随选中仓库跳动。

**修复建议**：非阻断。建议把 label 改为更准确的「当前仓库变更」或「选中仓库待审查」，避免与旧语义混淆；或在 detail 文案里点明「仅当前选中仓库」。属产品语义澄清。

---

## 已验证正确的要点（审查要点逐条回应）

1. **数据层 envelope / 错误处理 / DTO 一致性** ✅
   - `listRepositories` 用 `unwrap:false` 拿 `{ data, page }`（repositories.ts:62-66），`client.ts:118` 正确返回整个 body；其余端点 unwrap 到 DTO。✅
   - 错误：非 2xx 走 `ApiClientError.fromResponse`（client.ts:110-112），`repositories.test.ts` 覆盖 404/409 路径，断言 `status/code/message`。✅
   - DTO 字段：`RepositoryDto`（id/name/vcsType/url/defaultBranch/ownerUserId/ownerName/status/hasLocalPath/createdAt/updatedAt）与 `CommitDto`/`WorktreeChangeDto`/`RevertResult` 字段齐全；`encodeURIComponent(id)` 全端点应用。后端 `repository-dto.ts` 不在本仓（前端独立仓），但 `types.ts` 注释标注字段来源且与 P1-4a 契约描述一致。✅
   - 注：任务 spec line 8 提到的 `description/enabled/visibility` 字段在实际 `RepositoryDto` 中未出现（用了 `status/hasLocalPath`）——spec 写的是「按 P1-4a 实际字段」，实际类型覆盖了 spec 草案，正确。

2. **queries keys 稳定性 / invalidate** ✅（含 M1/M2/M4 改进点）
   - keys 工厂集中化、层级清晰（all→lists→list(filters) / details→detail(id)→commits/changes）。✅
   - `select: (res) => res.data` 正确解包 list envelope 给 UI（repositories.ts:45）。✅
   - `useCommits`/`useChanges` 用 `enabled: !!id && enabled` 双重门控，避免无 localPath 时 400。✅
   - invalidate 改进点见 M1（key 一致性）、M2（limit 入 key）、M4（detail invalidate 空操作）。

3. **RepositoriesPage REST 替换完整性 / 前端过滤 / 加载错误态 / 详情联动** ✅
   - 无残留 `Project`/`projects`/`repoStatusLabels`/`CommitRecord`/`syncRepository`/`changeBranch` 引用（grep 确认）。`useApp()` 仅取 `tasks`（关联任务统计，仍走 AppContext，合理）。✅
   - 文件树仍用 `repositoryTree`/`codePreview` mock —— 属 P1-4c 范围，本任务不做，正确保留。✅
   - 前端过滤：`filtered` 对 REST 全量列表做 `vcs/status/text` 三维 filter（line 146-153），符合「列表 REST 拉全量 + 前端 filter」模式。✅
   - 加载/错误态：list 区三态（isLoading/error/empty/数据，line 255-271），commits 区四态（未配置 localPath/loading/error/empty/数据，line 293-303），均用 `StatePanel`。✅
   - 详情联动：选中仓库 → `effectiveSelectedId` 驱动 `useCommits`/`useChanges`，`detailEnabled` 由 `hasLocalPath` 门控，changes 统计进 inspector + 顶栏。✅
   - 改进点见 M3（selectedCommit 跨仓库残留）、L5（顶栏变更统计语义收窄）。

4. **测试质量** ✅（含 L3 改进点）
   - `repositories.test.ts`：stub `global.fetch` 而非 mock client，断言 URL（含 query string）、method、body、`Idempotency-Key` header、envelope 解包、错误码——断言真实且覆盖 9 个用例。✅
   - `App.test.tsx`：mock `queries/repositories` 返回 2 条仓库（一有一无 localPath），覆盖渲染路径，避免真实 fetch。✅
   - 改进点见 L3（mock key 与真实工厂手动同步的维护风险）。

---

## 修复优先级建议

| 编号 | 级别 | 是否阻断 | 建议时机 |
|------|------|----------|----------|
| M1 | 中 | 否 | 本任务可顺手修（key 工厂一致性） |
| M2 | 中 | 否 | 本任务可顺手修（limit 入 key） |
| M3 | 中 | 否 | 本任务可顺手修（切仓库清 selectedCommit） |
| M4 | 中 | 否 | 留 P1-4c 接 revert 时一并处理 |
| L1-L5 | 低 | 否 | 体验/维护性，择机 |

**结论**：P1-4b 可合并。M1/M2/M3 建议本任务内修复（改动小、提升健壮性），M4 随 P1-4c 处理。无高严重度问题。
