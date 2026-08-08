# 代码审查报告 — P1-2c TaskInspector 写操作迁移

**审查提交**：`84e555f` — feat(tasks): P1-2c TaskInspector write ops
**审查模式**：codex-review-and-fix 手动模式（Codex 不可用，独立审查）
**审查范围**：`src/pages/TasksPage.tsx`（TaskInspector 写操作）、`src/types.ts`（allowedActions）、`src/state/toast-context.ts`（ToastTone）、`src/components/ToastProvider.tsx`（error tone）、`src/api/tasks.ts`（toTask）
**结论**：迁移方向正确——写操作由 mock 的 `updateTaskStatus` 改为 `useExecuteTask`/`useCancelTask` mutation，按钮由 `allowedActions` 驱动，错误走 `tone: 'error'`。发现 **1 高 / 4 中 / 4 低**，均已附行号与修复建议。本报告不改代码。

---

## 高（High）

### H1 — error toast 缺少样式，红色 tone 实际渲染成绿色「成功」外观

**文件**：`src/styles.css:2568-2670`（toast 全段），对照 `src/components/ToastProvider.tsx:69`

**问题**：本次提交在类型层（`toast-context.ts:3` 把 `ToastTone` 扩为 `'success'|'info'|'warning'|'error'`）和组件层（`ToastProvider.tsx:18` 加 `error: '操作失败'` 标题、`:25` 加 `error: AlertTriangle` 图标）都补齐了 error，**但 CSS 完全没有补 `.toast-error` 规则**。

`ToastProvider.tsx:69` 渲染 `className={`toast toast-${toast.tone}`}`，error 会生成 `toast toast-error`。而 `styles.css` 仅有：
- `.toast-icon`（默认 emerald 绿，`:2602-2610`）
- `.toast-info .toast-icon`（蓝，`:2612`）
- `.toast-warning .toast-icon`（琥珀，`:2617`）
- `.toast-progress`（默认 emerald 绿，`:2648-2657`）
- `.toast-info .toast-progress`（蓝，`:2659`）
- `.toast-warning .toast-progress`（琥珀，`:2663`）

**没有 `.toast-error .toast-icon`，也没有 `.toast-error .toast-progress`**。因此一个 `tone: 'error'` 的 toast 会：图标用默认 emerald 绿底、进度条用默认 emerald 绿——**视觉上与成功 toast 一模一样**。本次提交的核心目的之一（execute/cancel 失败时给用户清晰的错误反馈）在 UI 上完全不成立：用户看到的是「操作已完成」的绿色提示，内容却是「操作失败」。

这是「toast error tone 完整性」审查要点的直接命中——类型/组件补了，样式漏了。

**修复建议**：在 `src/styles.css:2620` 之后（warning 图标规则后）和 `:2665` 之后（warning progress 规则后）补 error 配色，复用已有红色变量（`--red` / `--red-soft` 或 `--danger`，需与项目既有变量对齐；若没有 error-soft，可参考 warning 用 `--amber`/`--amber-soft` 的模式）：

```css
.toast-error .toast-icon {
  color: var(--red);
  background: var(--red-soft);
}
/* ... */
.toast-error .toast-progress {
  background: var(--red);
}
```

> 注：审查者未在 styles.css 中确认存在 `--red`/`--red-soft` 变量，落地前需 grep 确认项目实际的红色变量名（可能叫 `--danger`/`--danger-soft` 或 `--rose`）。`defaultTitles`/`toastIcons` 已就绪，只差 CSS。

---

## 中（Medium）

### M1 — 主按钮 / 取消按钮无 `isPending` 守卫，可重复触发并发 mutation

**文件**：`src/pages/TasksPage.tsx:290-300`（primaryAction）、`:307-313`（cancelTask）、`:371-372`（主按钮渲染）、`:376-377`（取消按钮渲染）

**问题**：`executeMutation.mutateAsync(task.id)` 与 `cancelMutation.mutateAsync(task.id)` 都是 fire-and-forget 的 `.then().catch()`，组件已取到 `executeMutation`/`cancelMutation` 却**完全没用 `isPending`**：

- 按钮没有 `disabled={executeMutation.isPending || cancelMutation.isPending}`，用户在请求 in-flight 期间可连续点击「开始执行」/「取消」，发出多次 `POST /tasks/{id}/execute`（幂等 key 虽能去重，但仍是无意义的并发请求 + 多次 toast）。
- `primaryAction` 不返回 promise，调用方（`onClick`）也无法感知完成。

更隐蔽的问题：**execute 与 cancel 之间互不感知**。用户点「开始执行」后请求未返回时点「取消」，两个 mutation 同时在飞，后到者覆盖缓存与 UI 状态，状态显示可能错乱。

**修复建议**：
1. 主按钮 `disabled={executeMutation.isPending}`，取消按钮 `disabled={cancelMutation.isPending}`（或共用一个 `const busy = executeMutation.isPending || cancelMutation.isPending` 同时禁用两者，避免上条交叉触发）。
2. 可选：`primaryAction`/`cancelTask` 开头 `if (executeMutation.isPending) return` 早退。

```tsx
const busy = executeMutation.isPending || cancelMutation.isPending
// ...
<Button variant="primary" icon={primaryIcon} onClick={primaryAction}
  disabled={busy}>{primaryLabel}</Button>
// ...
<Button variant="ghost" icon={<X size={15} />} onClick={cancelTask}
  disabled={busy}>取消</Button>
```

### M2 — `showPrimary` 不看任务终态，已完成/已取消任务对有权限用户仍显示「开始执行」

**文件**：`src/pages/TasksPage.tsx:286`、`:371-372`

**问题**：
```ts
const showPrimary = (canApprove || canExecuteAction) || canExecute
```
旧逻辑（`TasksPage.tsx` diff 中删除的 `:368` 行）用 `['pending','assigned','awaiting_approval','running','failed'].includes(task.status) && canExecute` 做了**状态白名单**——`succeeded`/`cancelled` 不显示主按钮，改显示「查看结果」。

新逻辑 `showPrimary` 只看动作/能力，**完全去掉了状态守卫**。于是对一个 `succeeded` 或 `cancelled` 的任务，只要 `allowedActions` 含 `execute`（后端按角色算，未必按状态收敛）或角色有 `task:execute` 能力，仍会显示「开始执行」按钮。点下去会向后端 `POST /tasks/{id}/execute` 一个已终态的任务——大概率 409/400，落到 `tone:'error'` toast。这是回归：旧代码在终态任务上显示「查看结果」，新代码显示一个点了必失败的「开始执行」。

`canCancel` 侧同样：`{(canCancelAction || canCancel) ?`（`:376`）也不再排除 `succeeded`/`cancelled`，已取消任务可能仍显示「取消」按钮。

**根因**：注释（`:280-281`）说「allowedActions 驱动写按钮」，但 `useCapability('task:execute')`（`:269`）是**角色级**能力，与具体任务状态无关；而 `allowedActions` 理论上应是「角色+状态」资源级。问题出在 `|| canExecute` 这个兜底：它把纯角色能力当成资源级动作，绕过了状态判断。

**修复建议**：保留终态守卫，与 allowedActions 取交集而非「或」：

```ts
const terminal = task.status === 'succeeded' || task.status === 'cancelled'
const showPrimary = !terminal && (canApprove || canExecuteAction || canExecute)
// ...
{!terminal && (canCancelAction || canCancel) ? (
  <Button ...>取消</Button>
) : null}
```

> 说明：理想情况下后端 `allowedActions` 应已对终态任务剔除 `execute`/`cancel`，则 `canExecute` 兜底本就不会触发。但前端不应假设后端一定收敛——`!terminal` 是低成本的防御。若团队约定「严格信任后端 allowedActions，canExecute 兜底仅在 allowedActions 为空时启用」，则应把 `|| canExecute` 改为 `|| (actions.length === 0 && canExecute)`，避免兜底覆盖终态。

### M3 — `useCapability` 兜底语义过宽：`allowedActions` 含 `execute` 但不含 `approve` 时，`canExecute` 仍参与主按钮显隐

**文件**：`src/pages/TasksPage.tsx:286`

**问题**：`showPrimary = (canApprove || canExecuteAction) || canExecute`。设计意图（注释 `:281`）是「allowedActions 为空但角色仍有 task:execute 权限时按钮仍可见」——即 `canExecute` 是**空数组兜底**。但当前写法是 `|| canExecute`，**只要角色有 `task:execute`，无论 `allowedActions` 是否为空、是否含 `execute`，主按钮都显示**。

具体反例：后端对某任务返回 `allowedActions: ['approve']`（不含 `execute`，例如该任务此状态下不应执行但应批准）。按设计，`canApprove` 已为 true，主按钮显示「批准执行」——这没问题。但若后端返回 `allowedActions: ['edit']`（不含 execute 也不含 approve），按资源级语义此任务不应有主操作；然而 `canExecute`（角色级）为 true 仍会让 `showPrimary` 为 true，主按钮显示「开始执行」——与后端资源级判定矛盾，点了大概率失败。

**修复建议**：把兜底严格限定为「allowedActions 缺失」场景：

```ts
const actions = task.allowedActions ?? []
const hasActions = actions.length > 0
const canApprove = actions.includes('approve')
const canExecuteAction = actions.includes('execute')
// 仅当后端未给出 allowedActions（旧/mock 数据）时，退回角色级能力兜底
const showPrimary = hasActions
  ? (canApprove || canExecuteAction)
  : canExecute
```

这与 M2 的修复方向一致（都收敛兜底范围），可合并处理。

### M4 — execute 成功文案分支不区分「批准后进入待审批」与「真正启动」，且 `awaiting_approval` 分支文案语义可疑

**文件**：`src/pages/TasksPage.tsx:291-296`

**问题**：
```ts
executeMutation.mutateAsync(task.id).then(({ task: result }) => {
  if (result.status === 'awaiting_approval') {
    notify('审批已通过，任务进入执行队列。', { title: '任务已批准' })
  } else {
    notify('任务已启动。', { title: '任务已启动' })
  }
})
```

两个疑点：

1. **语义矛盾**：分支条件是「返回状态 = `awaiting_approval`」（仍在等审批），文案却是「审批已通过，任务进入执行队列」「任务已批准」。`awaiting_approval` 字面意思是「等待审批」，说「审批已通过」自相矛盾。旧代码（diff 中删除段）的 `awaiting_approval` 分支是把状态**改为** `assigned`（即审批通过→分配），文案「审批已通过，任务进入 Agent 分配队列」对旧流程成立。但新代码读的是**后端返回的 status**，后端返回 `awaiting_approval` 表示「这次 execute 触发了审批流程、现在要等人批」，不是「已批准」。文案与状态语义脱节。

2. **`else` 兜底过宽**：`running`/`assigned`/`pending`/`failed` 全走「任务已启动」。若后端对 `awaiting_approval` 任务 execute 后返回仍是 `awaiting_approval`（触发审批但未变状态），会落到第一个分支说「已批准」——错误。若返回 `assigned`（已分配待启动），落到 else 说「已启动」——也不准确。

**修复建议**：让文案与后端实际返回的 `result.status` 精确对应，停止用 execute 响应猜测审批语义：

```ts
.then(({ task: result }) => {
  switch (result.status) {
    case 'awaiting_approval':
      notify('任务已提交，等待审批。', { title: '待审批' }); break
    case 'running':
      notify('Agent 已开始执行。', { title: '任务已启动' }); break
    case 'assigned':
      notify('任务已进入分配队列。', { title: '任务已分配' }); break
    default:
      notify(`任务状态已更新为「${result.status}」。`, { title: '状态已更新' })
  }
})
```

> 这条偏文案/语义正确性，是否算 bug 取决于后端 execute 在各状态下的真实返回。建议与后端确认 `POST /tasks/{id}/execute` 在 `awaiting_approval`/`assigned`/`running` 输入下的返回 status 矩阵，再定文案。审查者按字面 `awaiting_approval` = 待审批判定当前文案为错。

---

## 低（Low）

### L1 — `changeMode` 的 `_mode` 参数与 `modes` 数组使读者误以为仍会调用后端

**文件**：`src/pages/TasksPage.tsx:303-305`、`:346-353`

**问题**：`changeMode(_mode)` 现在只 `notify` 一句「暂不支持」，`_mode` 未使用（前缀 `_` 已标注，合规）。但 `modes` 数组（`:274-278`）和 segmented control（`:348-352`）仍正常渲染并可点击，点击只弹 info toast。功能上没问题，但 UX 上「可点的执行模式切换」+「点击提示暂不支持」略误导；注释（`:302`）已诚实说明，可接受。

**修复建议**（可选）：若短期不会支持，可给 segmented control 加 `disabled` 或 `aria-disabled`，避免用户反复点击试探；或保留现状（注释已交代）。非必改。

### L2 — `ExecuteTaskResponse.executionId`/`approvalId` 恒为 `null`，类型上却未体现，分支文案也无法利用

**文件**：`src/types.ts:209-213`、`src/pages/TasksPage.tsx:291`

**问题**：`ExecuteTaskResponse` 把 `executionId: null` / `approvalId: null` 写成字面量类型（非 `string | null`），暗示 MVP 永远是 null。`primaryAction` 解构了 `{ task: result }` 但忽略了 `executionId`/`approvalId`——本来可以用 `approvalId != null` 来判断「是否触发了审批」，比用 `result.status === 'awaiting_approval'` 更直接（见 M4）。当前两者都是 null，无法用。

**修复建议**（可选）：与后端确认 execute 响应未来是否会返回真实 `executionId`/`approvalId`。若会，类型改为 `string | null` 并在 `primaryAction` 用 `approvalId` 判断审批分支；若 MVP 内恒 null，维持现状即可。属类型表达力问题，非缺陷。

### L3 — 测试 mock 的 `useCancelTask` 仍是空 `mutateAsync: vi.fn()`，cancel 路径无成功断言覆盖

**文件**：`src/App.test.tsx:63`

**问题**：`useExecuteTask` 的 mock 已升级为返回 `{ task: {..., status:'running'}, executionId:null, approvalId:null }`（`:55-62`），匹配真实 `ExecuteTaskResponse`。但 `useCancelTask` 仍是 `() => ({ mutateAsync: vi.fn(), isPending: false })`——`vi.fn()` 默认返回 `undefined`。真实 `cancelTask` 返回 `TaskDto`，`useCancelTask` 的 `onSuccess`（`queries/tasks.ts:96`）会用 `task.id` invalidate，但 mock 的 `mutateAsync` 返回 undefined，若测试走到 cancel 成功断言会因 `onSuccess` 拿到 undefined 而行为不一致。当前测试（`:215-224`）只覆盖了 execute 成功，**cancel 成功/失败、execute 失败（error toast）路径完全无测试**。

**修复建议**：
1. `useCancelTask` mock 补返回值：`mutateAsync: vi.fn(async () => ({ ...MOCK_TASK, status: 'cancelled' }))`。
2. 补充测试用例：点「取消」→ 断言 warning toast「任务已取消」；mock `useExecuteTask.mutateAsync` reject → 断言 error toast（验证 M1/H1 的错误展示链路）。

### L4 — `assigneeKind: 'user'` 在测试 mock 中不在 DTO 合法集合内，靠 `toTask` 静默兜底

**文件**：`src/App.test.tsx:21`（`assigneeKind: 'user'`），对照 `src/api/tasks.ts:80-82`

**问题**：`toTask` 的 `assigneeKind` 归一化（`tasks.ts:80-82`）只接受 `'digital'|'coder'|'qa'`，`'user'` 不在内，会落到 `rich.assigneeKind ?? 'coder'` 兜底为 `'coder'`。测试 mock 用 `'user'` 不会报错（被静默改写），但与真实后端 `assigneeKind` 枚举不符，属测试数据不严谨。非本次提交引入（MOCK_TASK 早于 P1-2c），但本次提交改了 MOCK_TASK 的 `allowedActions`，顺手可修。

**修复建议**（可选）：`MOCK_TASK.assigneeKind` 改为 `'coder'` 或 `'qa'`，与 `TaskDto.assigneeKind` 语义一致。非必改。

---

## 与后端契约一致性（要点 4 专项）

| 契约点 | 实现位置 | 结论 |
|---|---|---|
| `POST /tasks/{id}/execute` 请求体 `{ confirm: true }` | `api/tasks.ts:147-151` | ✅ 符合（P1-2a 审查 H1 已修，body 保留） |
| `POST /tasks/{id}/execute` 响应 `{ task, executionId, approvalId }` | `types.ts:209-213`、`queries/tasks.ts:85`、`TasksPage.tsx:291` | ✅ 解构 `{ task: result }` 正确；`executionId/approvalId` 恒 null 见 L2 |
| `POST /tasks/{id}/cancel` 请求体 `{ reason }` 可选 | `api/tasks.ts:154-161` | ✅ `reason` 可选，无 reason 时 body 为 `undefined` |
| `POST /tasks/{id}/cancel` 响应 `TaskDto` | `types.ts`、`queries/tasks.ts:96` | ✅ `onSuccess(task)` 拿 `task.id` invalidate 正确 |
| `allowedActions` 字段透传 | `api/tasks.ts:92`（`dto.allowedActions ?? []`）、`types.ts:186`（DTO）、`:65`（UI Task） | ✅ 透传与兜底正确 |
| `TaskDto.allowedActions` 枚举 `edit\|execute\|cancel\|approve\|rejectChanges\|assign` | `types.ts:186` 注释 | ✅ 与 inspector 使用的 `approve`/`execute`/`cancel` 一致 |

契约层面**无问题**。execute/cancel 请求形状、响应解构、缓存失效（list + detail 双 invalidate）均正确。问题集中在 **UI 层**（H1 样式、M1-M4 按钮/mutation 行为）。

---

## 汇总

| 级别 | 编号 | 摘要 | 文件:行 |
|---|---|---|---|
| 高 | H1 | error toast 无 CSS，红色错误渲染成绿色成功外观 | styles.css:2620/2665（缺 .toast-error） |
| 中 | M1 | 按钮 无 isPending 守卫，可并发重复触发 execute/cancel | TasksPage.tsx:290-313/371-377 |
| 中 | M2 | showPrimary 不看终态，succeeded/cancelled 任务仍显示「开始执行」 | TasksPage.tsx:286/371-377 |
| 中 | M3 | useCapability 兜底过宽，allowedActions 非空时仍覆盖资源级判定 | TasksPage.tsx:286 |
| 中 | M4 | execute 成功文案与 awaiting_approval 状态语义矛盾 | TasksPage.tsx:291-296 |
| 低 | L1 | changeMode 仍渲染可点击的无效模式切换 | TasksPage.tsx:303-305/346-353 |
| 低 | L2 | ExecuteTaskResponse.executionId/approvalId 恒 null 未用于审批判断 | types.ts:209-213 |
| 低 | L3 | useCancelTask mock 空 mutateAsync，cancel/失败路径无测试 | App.test.tsx:63 |
| 低 | L4 | 测试 mock assigneeKind:'user' 不在 DTO 合法集合 | App.test.tsx:21 |

**优先处理**：H1（错误提示完全失效，本次提交核心目标之一）→ M2/M3（终态任务显示必失败按钮 + 兜底语义，可合并修）→ M1（并发守卫）→ M4（文案，需与后端确认）。L 级可后续清理。
