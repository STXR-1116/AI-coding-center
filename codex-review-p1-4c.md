# 代码审查报告 — P1-4c（WorkspacePage 变更审查 REST 迁移 + revert 按钮）

**审查模式**：codex-review-and-fix 手动模式（Codex 运行时不可用，独立审查）
**审查范围**：`git diff 9271e6f..ec85452`
- `src/pages/WorkspacePage.tsx`（+87/−43）
- `src/App.test.tsx`（+8/−5）

**测试状态**：`src/App.test.tsx` 11/11 通过（vitest 3.2.7，4.71s）

**总体评价**：迁移质量较高。`useCommits`/`useChanges` 的 `detailEnabled(hasLocalPath)` 门控、`WorktreeChangeDto` 字段映射、`revertChange` onSuccess invalidate 覆盖（`changes` + `detail` 双键）均正确，与 RepositoriesPage 既有模式一致。`ChangeItem` 在 WorkspacePage 内已彻底移除，无残留引用。发现 0 高 / 3 中 / 3 低，均为语义/健壮性问题，不阻塞。

---

## ❌ 未接受（误报，0 条）

无。Codex 未运行，本报告为独立审查结论。

---

## 中等（3 条）

### M1 — "确认保留"按钮被 `vcs:revert` 权限门控误锁（语义缺陷）

**位置**：`src/pages/WorkspacePage.tsx:543`

```tsx
{canRevert && repoId ? <Button variant="primary" ... onClick={() => review('accepted')}>确认保留</Button> : null}
{canRevert && repoId ? <Button variant="danger" ... onClick={() => review('rejected')}>拒绝并还原</Button> : <p className="diff-note">需要 vcs:revert 权限（LEADER/ADMIN）。</p>}
```

**问题**：两个按钮共用 `canRevert && repoId` 门控。但 `review('accepted')` 路径只 `notify` 一个 toast（"已确认该文件变更，保留在工作区"），**不触发任何写操作**，是纯只读的确认动作。把它与需要 `vcs:revert` 权限的"拒绝并还原"绑在同一门控上，导致没有还原权限的用户（如 CONTRIBUTOR）连"确认保留"都无法点击——一个不改变任何状态的按钮被权限挡住了，语义不对。

**判真依据**：`review()` 函数（:497-505）中 `accepted` 分支仅 `notify(...)` 后 return，无 `onRevert` 调用、无 mutation。门控本意是保护还原写操作，却顺带锁住了只读确认。

**修复建议**：将"确认保留"的门控放宽为 `repoId`（有仓库即可，因为它不写）：
```tsx
{repoId ? <Button variant="primary" ... onClick={() => review('accepted')}>确认保留</Button> : null}
{canRevert && repoId ? <Button variant="danger" ...>拒绝并还原</Button> : <p className="diff-note">需要 vcs:revert 权限（LEADER/ADMIN）。</p>}
```
> 注：若产品意图是"审查动作整体需 LEADER/ADMIN"，则当前实现正确，但应在 `diff-note` 文案中说明"确认/拒绝均需权限"，而非只提还原。建议与 PM 确认审查权限边界后再定。

---

### M2 — revert 成功后 `selectedChangeId` 不重置，选中态指向已消失的 path

**位置**：`src/pages/WorkspacePage.tsx:567`、`:570`、`:625`

**问题**：`revertChange.mutate` 成功后 invalidate `changes` 键（`repositories.ts:94-96`），`restChanges` 刷新，被还原的 path 从列表消失。但 `selectedChangeId` 仍持有该 path 字符串：
```tsx
const selectedChange = restChanges?.find((change) => change.path === selectedChangeId) ?? restChanges?.[0]
```
`find` 返回 `undefined` → 回退 `restChanges?.[0]`。**行为上不会崩**（有 `?? restChanges?.[0]` 兜底），但用户原先选中的是第 3 个文件，还原后选中态静默跳到第 1 个文件，详情面板内容突变，体验上像是"跳选"。若还原后列表为空，`selectedChange` 变 `undefined`，详情面板正确显示"选择一个变更文件"空态——这条路径没问题。

**判真依据**：`selectedChangeId` 是 `useState('')`，无 useEffect 在 `restChanges` 变化时校正；revert onSuccess 只 `notify`，未 `setSelectedChangeId`。

**修复建议**：在 `onRevert` 的 `onSuccess` 中清空选中态，让其回退到列表首项或空态：
```tsx
onSuccess: () => {
  notify('已还原该文件变更。', { title: '还原成功' })
  setSelectedChangeId('')  // 回退到 restChanges?.[0]
}
```

---

### M3 — 死代码：`useApp().changes` / `reviewChange` / `ChangeItem` 在 AppContext 中无消费者

**位置**：`src/state/AppContext.tsx:231`、`:265`、`:290`；`src/state/app-context.ts:41`、`:55`；`src/types.ts:180`；`src/data/mock.ts:425`

**问题**：P1-4c 把 WorkspacePage 从 `useApp().changes` + `reviewChange` 迁移到 REST（`useChanges` + `useRevertChange`）。迁移后 grep `src/pages/` 与 `src/components/` 对 `.changes` / `reviewChange` 的消费**零命中**——这两个全局 state 字段及 `reviewChange` 函数成为 AppContext 中的死代码，`ChangeItem` 接口与 `initialChanges` mock 也仅被这些死代码引用。

**判真依据**：
```
grep -rn "\.changes\b\|reviewChange" src/pages/ src/components/  → 0 命中（排除 restChanges/useChanges）
```
`AppContext.tsx:231` 的 `reviewChange` 仍 `setChanges(...)` 操作已无人读取的 `changes` state。

**说明**：本次任务范围是 WorkspacePage 迁移，清理 AppContext 属于相邻代码改动（违反 Surgical Changes 原则），故**不建议在本 PR 改**。但应记录为后续清理项，避免死代码长期留存误导。

**修复建议**（后续单独 PR）：移除 `AppContext` 的 `changes` state / `reviewChange` / `initialChanges` mock / `ChangeItem` 接口，或确认是否仍有其他未迁移页面依赖（当前 grep 显示无）。

---

## 低（3 条）

### L1 — `restRepoId as string` 强制断言依赖隐式门控，缺防御

**位置**：`src/pages/WorkspacePage.tsx:625`

```tsx
onRevert={(path) => { revertChange.mutate({ id: restRepoId as string, path }, { ... }) }}
```

**问题**：`restRepoId` 类型为 `string | undefined`，此处 `as string` 绕过类型检查。安全性依赖 `DiffDrawer` 内 `canRevert && repoId` 门控——只有 `repoId` 非 undefined 时"拒绝并还原"按钮才渲染，故 `onRevert` 在正常路径下不会被 `undefined` 触发。但这是**隐式跨组件契约**：`onRevert` 的签名 `(path: string) => void` 不表达"调用方需保证 repoId 已就绪"，未来若 DiffDrawer 外有其他调用方（或门控逻辑改动），`as string` 会把 undefined 传进 `revertChange`，发出 `POST /repositories/undefined/changes/revert`。

**判真依据**：当前唯一调用点 `review('rejected')`（:502）确实只在 `canRevert && repoId` 为真时可达。风险是未来的，非当前 bug。

**修复建议**：在 `onRevert` 回调内显式守卫，消除 `as string`：
```tsx
onRevert={(path) => {
  if (!restRepoId) return  // 防御：门控失效时不发请求
  revertChange.mutate({ id: restRepoId, path }, { ... })
}}
```

---

### L2 — `selectedChangeId` 切换仓库时不重置（P2 映射后会错位）

**位置**：`src/pages/WorkspacePage.tsx:567`

**问题**：MVP 固定 `restRepoId = restRepos?.[0]?.id`，不随项目切换器变化（P2 映射已标注于 :557 注释）。因此当前 `selectedChangeId` 不会因仓库切换而错位——**无即时 bug**。但 P2 接入"项目切换器 ↔ REST 仓库映射"后，若 `selectedChangeId` 仍持有旧仓库的 path，新仓库 `restChanges` 中 `find` 失败 → 回退首项。这与 P1-4b 已为 RepositoriesPage 修复的 `selectedCommit` 切仓库重置（commit `9271e6f` M3）是同类问题。

**判真依据**：`selectedChangeId` 为 `useState('')`，无 `useEffect` 监听 `restRepoId` 变化重置；RepositoriesPage 的同类问题已在 P1-4b 修复，此处未对齐。

**修复建议**（P2 映射时一并处理）：
```tsx
useEffect(() => { setSelectedChangeId('') }, [restRepoId])
```

---

### L3 — 测试未覆盖"拒绝并还原"路径与 revert mutation 断言

**位置**：`src/App.test.tsx:298-310`

**问题**：测试用例 `records diff review feedback and disables the completed action`（:298）标题仍含 "disables the completed action"，但 P1-4c 移除了 `disabled={selected.status !== 'pending'}` 与"已接受"状态断言——**标题与实际断言不符**。更关键的是：
- 只测了"确认保留"（`accepted` → toast），**未测"拒绝并还原"**（`rejected` → `onRevert` → `revertChange.mutate`）。
- mock `useRevertChange` 返回 `{ mutateAsync: vi.fn(), isPending: false }`（:165），但组件用的是 `revertChange.mutate`（:625）。`useRevertChange` 真实 hook 返回 `useMutation` 结果，含 `.mutate`，mock 未显式提供 `.mutate` → 测试中点"拒绝并还原"会因 `revertChange.mutate is not a function` 崩溃。当前测试没点这个按钮，故未暴露。

**判真依据**：
- mock（:165）：`useRevertChange: () => ({ mutateAsync: vi.fn(), isPending: false })` —— 无 `mutate` 字段。
- 组件（:625）：`revertChange.mutate(...)`。
- 测试（:307）：只 click `确认保留`，未 click `拒绝并还原`。

**修复建议**：
1. mock 补 `mutate`：`useRevertChange: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })`，或直接 mock 整个 `useMutation` 形状。
2. 新增用例：click `拒绝并还原` → 断言 `revertChange.mutate` 被以 `{ id: <repoId>, path: 'src/components/AppShell.tsx' }` 调用。
3. 更新用例标题，去掉 "disables the completed action"（已无此行为）。

---

## 已确认正确的要点（审查清单回执）

| 审查点 | 结论 |
|---|---|
| ExplorerPane `useCommits` 数据/loading/error/empty 四态 | ✅ `:140-146` 四分支齐全，`detailEnabled=false` 优先短路不发请求 |
| `detailEnabled(hasLocalPath)` 门控 | ✅ `:112` `useCommits(restRepoId, detailEnabled)`，hook 内 `enabled: !!id && enabled`（`repositories.ts:72`）双保险 |
| `WorktreeChangeDto` 字段映射 | ✅ `path/addedLines/deletedLines/changeType` 全部正确映射（:526-528、:532），无 `id/filePath/additions/deletions` 残留 |
| `changeTypeLabel` added/modified/deleted | ✅ `:77-81` 三态 + 默认 fallback |
| revert 按钮 `canRevert(vcs:revert) + repoId` 双条件 | ✅ `:543-544` 双门控（但见 M1：accepted 被误锁） |
| review 语义：接受=保留 / 拒绝=真实还原 | ✅ `:499-505` rejected 走 `onRevert`（git checkout），accepted 仅 toast |
| `restRepoId` MVP 取第一个仓库 + P2 标注 | ✅ `:557-558` 注释明确标注 P2 映射 |
| `revertChange` onSuccess invalidate | ✅ `repositories.ts:94-99` invalidate `changes(vars.id)` + `detail(vars.id)`，覆盖变更列表与详情 |
| `repositoriesKeys.changes` 是否被覆盖 | ✅ revert 后 `changes(id)` 键被 invalidate，`restChanges` 会重新拉取 |
| `ChangeItem` 移除后残留引用 | ✅ WorkspacePage 内无残留（仅 AppContext 死代码，见 M3） |
| `reviewChange` mock 清理 | ✅ test 注释说明已移除，未再引用 mock 的 reviewChange |
| diff 内容预览 P2 标注 | ✅ `:536` `diff 内容预览在 P2` 明确标注 |
| 测试通过 | ✅ 11/11 green |

---

## 待你确认

1. **M1 审查权限边界**："确认保留"是否应与"拒绝并还原"同需 `vcs:revert` 权限？若否（只读确认无需权限），按 M1 建议放宽门控；若是，更新 `diff-note` 文案说明两者均需权限。请与 PM 确认。
2. **M3 死代码清理时机**：`AppContext.changes`/`reviewChange`/`ChangeItem` 是否在本 PR 清理，还是留后续 PR？我倾向后者（保 Surgical Changes），但需登记为 TODO。

---

*审查人：Claude（独立审查，Codex 运行时不可用）*
*日期：2026-08-07*
