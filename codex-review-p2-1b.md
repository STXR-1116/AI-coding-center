# Codex Review & Fix — P2-1b (AgentsPage REST)

**审查模式**：codex-review-and-fix 手动模式（Codex 运行时不可用，Claude 独立审查）
**审查范围**：`git diff 4369b87..0dd1ca2`
**涉及文件**：
- `src/api/agents.ts`（新增，76 行）
- `src/queries/agents.ts`（新增，101 行）
- `src/pages/AgentsPage.tsx`（重构，mock → REST）
- `src/types.ts`（新增 AgentDto / SquadDto 等 DTO，+113 行）

**审查方法**：逐文件对照 diff + 当前磁盘源码；以 `src/api/client.ts`（unwrap/idempotent/patch 语义）、`src/queries/repositories.ts`（既有最佳实践基准）、`src/state/useToast.ts`（notify 签名）、`src/App.test.tsx`（测试 mock 覆盖）为参照系交叉验证。`vitest run src/App.test.tsx` 实测 11 green。

---

## 总结

P2-1b 的整体质量**高**。api/queries 两层严格复刻了 P1-4b `repositories` 的成熟范式（key 工厂、`__disabled__` 禁用态 key、list/detail 双 invalidate、`select` 解包 `{ data }`、`unwrap: false` 保留分页 envelope），types.ts 的 DTO 与 api 注释中的后端契约自洽，AgentsPage 的 mock 残留清理彻底。

**无 High 级问题**。下面 1 个 Medium、5 个 Low，均为健壮性/一致性/可维护性改进，非阻断。

| 级别 | 数量 |
|------|------|
| High | 0 |
| Medium | 1 |
| Low | 5 |

---

## Medium

### M1 — `toAgent` 把 `executionMode`/`periodResetAt` 塞进交叉类型，UI 侧反复 `as` 强转，类型不收敛
**文件**：`src/pages/AgentsPage.tsx`
**行号**：`toAgent` 返回处约 L168；消费处 L382、L390（inspector 读 `executionMode`）

**现状**：
`Agent`（UI 域类型，`src/types.ts`）**不含** `executionMode` 与 `periodResetAt` 字段。`toAgent` 用 `as Agent & { executionMode: ExecutionMode; periodResetAt: string | null }` 把这两个 DTO 字段"挂载"到返回值上。随后 inspector 在两处又用 `(selectedAgent as Agent & { executionMode: ExecutionMode }).executionMode` 读回：

```tsx
// L382
{executionModeLabels[(selectedAgent as Agent & { executionMode: ExecutionMode }).executionMode ?? 'manual']}
// L390
className={((selectedAgent as Agent & { executionMode: ExecutionMode }).executionMode ?? 'manual') === mode ? ...}
```

**问题**：
1. 同一个"扩展字段"声明散落在 `toAgent`（写侧）与两处消费点（读侧），三次重复同一交叉类型，任何一处改名/加字段都得同步改三处，易漏。
2. `as Agent & {...}` 在读侧是**不安全断言**——TypeScript 不校验运行时该字段真的存在。若未来某条代码路径用一个"裸 `Agent`"（非 `toAgent` 产出）赋给 `selectedAgent`，读 `executionMode` 得到 `undefined`，靠 `?? 'manual'` 兜底能不崩但语义静默错误。
3. `periodResetAt` 被 `toAgent` 写入但**全文件无任何消费点**——死字段。

**建议**（不改代码，仅给方向）：
把 `executionMode`（及若需要的 `periodResetAt`）正式并入 UI 域 `Agent` 接口（`src/types.ts`），标注为"后端回显、UI 兜底"。这样 `toAgent` 直接返回 `Agent`，消费侧零 `as`，类型收敛到单一来源。`periodResetAt` 若 UI 暂不展示则删掉，避免死字段误导后续维护者以为它被用了。

---

## Low

### L1 — `patchAgent` 的"运行位置"按钮调用形同空操作：patch 传 `{ status: 当前status }`
**文件**：`src/pages/AgentsPage.tsx`
**行号**：L389（本地/云端两个 `onClick`）

**现状**：
```tsx
<button ... onClick={() => patchAgent(selectedAgent.id, { status: selectedAgent.status }, '运行位置已记录')}>本地</button>
<button ... onClick={() => patchAgent(selectedAgent.id, { status: selectedAgent.status }, '运行位置已记录')}>云端</button>
```
两个按钮（本地 / 云端）传的 patch 完全相同——都是 `{ status: 当前status }`，即把当前 status 原样 PATCH 回去，**没有实际改变任何字段**。后端 `UpdateAgentPatch` 也没有 `runtime`/`runtimeMode` 字段（types.ts L663-669 仅 `name/kind/status/executionMode/tokenBudget`），所以"运行位置"本就无对应后端写入口。

**问题**：
- 点击会真的发一次 `PATCH /agents/{id}`（带无变化的 body），后端可能接受也可能因"无字段变化"返回校验错误；无论哪种，toast 都显示"运行位置已记录"——**对用户说谎**（运行位置并未被持久化，因为 DTO 里根本没有这个字段，刷新后 `toAgent` 永远把 runtime 兜底成 `'cloud'`）。
- 两个按钮行为完全一致，"本地"按钮的高亮（`selectedAgent.runtime === 'local'`）永远是 false（`toAgent` 硬编码 `runtime: 'cloud'`），即"本地"永远是未选中态、点了也不亮。

**建议**：
后端 MVP 不支持运行位置写入时，"运行位置" segmented control 应**禁用 + 提示**（与"检查心跳"同处理，`notify('运行位置待后端 runtime 接口接入。', { tone: 'info' })`），而非发一个空 PATCH 并谎报成功。这与同文件 `handleCreateSquad`/`toggleSquadMember` 对"未接入后端能力"的诚实处理（info toast + 不写库）保持一致——此处破坏了那套一致性。

---

### L2 — `handleRegisterAgent` 把表单 `runtime`（`'local'|'cloud'`）当作 `runtimeMode` 提交，但 `runtimeMode` 后端语义未在 DTO 注释中约束
**文件**：`src/pages/AgentsPage.tsx` L311；`src/types.ts` L643

**现状**：
```tsx
const input: RegisterAgentInput = {
  name: agentForm.name.trim(),
  kind: agentForm.kind,
  runtimeMode: agentForm.runtime,   // 'local' | 'cloud'
  ...
}
```
`RegisterAgentInput.runtimeMode` 注释为 `/** local|cloud */`，与表单 `runtime` 取值一致——**类型上自洽**。

**问题（轻微）**：
- `AgentListParams`（types.ts L624-632）也有 `runtimeMode?: string`，且 `api/agents.ts` 的 `toQuery` 会把它拼进 `GET /agents?runtimeMode=` 查询串（L46）。但 AgentsPage **从不传 `runtimeMode` 给 `useAgents`**（`useAgents()` 无参调用，L229）。即该过滤参数在前端是死代码路径——后端实现了但前端没接 UI。非 bug，但属于"DTO 声明了能力、UI 未接"的半成品，值得在注释或后续任务中标记。
- `AgentDto`（响应）**没有** `runtimeMode` 字段，而 `RegisterAgentInput`（请求）有。即注册时能指定 runtimeMode，但回显时拿不到——这印证了 L1 中"运行位置刷新后必回退 cloud"的根因。这是后端 DTO 设计，前端只能兜底，但 `toAgent` 注释 L156 已诚实说明"后端 MVP 不回显 runtime/model"，可接受。

**建议**：无需立即改；若后续接 runtime 过滤 UI，复用 `useAgents(filters)` 即可。当前可作为已知 gap 记录。

---

### L3 — `useAgent`（detail hook）已定义但 AgentsPage 未使用
**文件**：`src/queries/agents.ts` L52-58

**现状**：`useAgent(id)` 完整实现（含 `enabled` 门控 + `__disabled__` key），但 `AgentsPage` 只用 `useAgents()`（列表）+ inspector 从列表派生选中项，**从不调用 `useAgent`**。

**问题**：dead code。codegraph blast-radius 也确认 `useAgent` 无调用方。它占用了"detail 单查"的语义位，但当前列表响应已含全量字段（`AgentDto`），单查无增量价值，故未接。

**建议**：保留无妨（与 `repositories` 的 `useRepository` 对称、为未来 inspector 独立拉取留口子）；但若短期无计划，可删以免误导。倾向保留并在注释中说明"列表已含全字段，inspector 走列表派生，单查 hook 备用"。

---

### L4 — `useUpdateAgent` 的 `onSuccess` invalidate `detail(vars.id)`，但 AgentsPage 从不缓存 detail
**文件**：`src/queries/agents.ts` L64-66

**现状**：`useUpdateAgent` 成功后 invalidate list + `detail(vars.id)`。这与 `repositories`/`tasks` 范式一致（L3 的 `useAgent` 不被调用，故 detail 缓存恒为空）。

**问题**：无 bug——invalidate 一个不存在的 key 是 no-op，React Query 安全。但与 L3 联动看，这条 detail invalidate 当前是**无效操作**（无 detail query 会被命中）。

**建议**：保留（对称、未来接 `useAgent` 后即生效，零成本）。无需改。仅记录"当前为预防性 invalidate"。

---

### L5 — 测试：`App.test.tsx` 未 mock `./queries/agents`，AgentsPage 在测试中从不挂载 → 零覆盖
**文件**：`src/App.test.tsx`（无 agents mock）；`src/App.tsx` L13（`AgentsPage = lazy(...)`）、L101（`/agents` 路由）

**现状**：
- `App.test.tsx` mock 了 tasks / requirements / conversations / repositories / auth / useRealtimeEvents，但**没有** mock `./queries/agents` 或 `./api/agents`。
- 11 个测试用例的 `initialEntry` 分别是 `/tasks`、`/workspace`、`/requirements`、`/settings`——**无一导航到 `/agents`**。
- `AgentsPage` 是 `lazy()` + `ModuleGate` 守卫，仅在路由命中 `/agents` 时才挂载。
- 实测 `vitest run src/App.test.tsx` → 11 green。

**结论**：
- **当前不会触发真实 fetch**：AgentsPage 不挂载 → `useAgents`/`useSquads`/`useUpdateAgent`/`useRegisterAgent` 不执行 → 不会发 `GET /agents`、`GET /squads`。所以"页面渲染时真实 fetch？"的答案是：**测试中不会**，因为页面根本没渲染。✅ 这一点是安全的，不是 bug。
- **但代价是零覆盖**：P2-1b 新增的 ~210 行（api + queries + AgentsPage 重构）**没有任何测试**。codegraph blast-radius 对四个新导出均报 `⚠️ no covering tests found`。`toAgent`/`toSquad` 的枚举兜底（`asKind`/`asStatus`/`asExecutionMode`）、mutation 的 toast 接线、加载/错误/空三态、注册表单的 `runtimeMode` 映射——全部未测。
- **潜在回归风险**：若未来有人给 `App.test.tsx` 加一个 `/agents` 用例（很自然——`agents` 就在 `visibleModules` 里，L100），而又忘了 mock `./queries/agents`，则 jsdom 下会发真实 `fetch` → `/api/v1/agents` → 失败/超时，测试变 flaky。这正是 P1-7b 在 `useRealtimeEvents` 上踩过的坑（EventSource 无 mock 导致 App 挂载崩，L38-41 注释记录了教训）。

**建议**：
1. **短期（推荐）**：若要给 AgentsPage 加测试，新建独立 `src/pages/AgentsPage.test.tsx`，在 `QueryClientProvider` + `ToastProvider` 下显式 mock `../queries/agents`（返回 `data: AgentDto[]`、`isLoading`/`error` 可控），逐态断言。不要依赖 `App.test.tsx` 的路由挂载。
2. **防御性**：在 `App.test.tsx` 顶部预置 `vi.mock('./queries/agents', ...)`（哪怕当前无 /agents 用例），与 tasks/repositories 等同级，杜绝未来加用例时的裸 fetch。这与该文件已为 `useRealtimeEvents` 做的"预防性 mock"（L39-41）同思路。
3. 至少补 `toAgent` 的纯函数单测（枚举兜底是逻辑密集点，最易回归，且零 React 依赖、成本最低）。

---

## 逐项核对（审查要点回执）

### 1. api 层（`src/api/agents.ts`）
- **unwrap 一致性** ✅：list（`listAgents`/`listSquads`）用 `unwrap: false` 保留 `{ data, page }` 分页 envelope；`fetchAgent`/`registerAgent`/`updateAgent` 走默认 unwrap 取 `data`。与 `client.ts` L118 语义一致。
- **updateAgent patch 形状** ✅：`patchRequest<AgentDto>('/agents/{id}', patch)`，`patch` 透传 body（client.ts L127），`UpdateAgentPatch` 字段（name/kind/status/executionMode/tokenBudget）与 api 注释 L15 契约一致。
- **错误处理** ✅：api 层不 try/catch，非 2xx 由 `client.request` 抛 `ApiClientError`（client.ts L110-112），上层 query/mutation 自然捕获。`encodeURIComponent(id)`（L62/L76）防路径注入，正确。
- **idempotent** ✅：`registerAgent` 传 `{ idempotent: true }`，client 仅对 POST 附 `Idempotency-Key`（client.ts L90），与一次性凭证语义匹配。

### 2. queries（`src/queries/agents.ts`）
- **keys** ✅：`agentsKeys` 工厂结构与 `repositoriesKeys`/`tasksKeys` 逐一对称（all/lists/list/details/detail/squads）。
- **invalidate（update 后）** ✅：`useUpdateAgent` invalidate `lists()`（前缀，覆盖所有 filter 变体）+ `detail(vars.id)`（精确）。`useRegisterAgent` invalidate `lists()`。见 L4 备注（detail 当前 no-op 但无害）。
- **enabled 门控 + disabled key 工厂** ✅：`useAgent` 用 `enabled: !!id` + `queryKey: agentsKeys.detail(id ?? '__disabled__')`，与 `repositories` M1 修复（注释 L504-506）完全同型——禁用态 key 不落 detail 前缀树，避免被前缀 invalidate 误伤。设计正确。

### 3. AgentsPage
- **mock 残留** ✅ 清理彻底：`initialAgents`（`../data/mock`）import 已删；`initialSquads` 常量已删；`executionModes` 本地 state 已删；`setAgentRows`/`setSquads`/`setExecutionModes` 全部移除。`grep` 确认 src 内仅 `agents.ts`/`AgentsPage.tsx`/`types.ts` 提及新 DTO，无 `data/mock` agents 残留。
- **状态/模式切换 mutation 接线** ⚠️ 见 L1：执行模式切换（`{ executionMode: mode }`）接对了；但"运行位置"按钮发空 PATCH（`{ status: 当前status }`）+ 谎报成功；"恢复连接/停用"（`{ status: 'idle'/'offline' }`）接对了。"检查心跳"诚实降级为 info toast，正确。
- **注册表单** ✅：`handleRegisterAgent` 走 `registerAgentMutation.mutate`，`onSuccess` 显示一次性凭证 secret（`res.credential.secret`）、清表单、关 dialog、选中新建项；按钮 `disabled={isPending}` + "注册中…"文案；`onError` 走 `ApiClientError.message` 兜底。接线完整。
- **squads tab** ✅：列表走 `useSquads`，加载/错误/空三态齐全（L430-432）；inspector 的 `focus` 空兜底（L406）；创建/成员管理诚实降级为 info toast（后端 POST /squads 未在本任务范围，注释 L341 说明）。Lead 下拉新增空 `option`（L461），避免初始无选中。
- **加载/错误/空态** ✅：agents 列表（L415-417）与 squads 列表（L430-432）均三态完备；`StatePanel` 组件复用，`role="status"` 可达。

### 4. 类型完整性（AgentDto vs 后端）
- 后端 `agent-dto.ts` 不在本仓（独立 main 后端），无法逐字段 diff。但 `AgentDto`（types.ts L596-613）字段集 `{ id, name, role, kind, status, executionMode, tokenBudget, periodResetAt, createdAt, updatedAt }` 与 api 注释（L11-16）及 `RegisterAgentInput`/`UpdateAgentPatch` 契约**自洽**。
- `executionMode: string | null`（可空）与 `asExecutionMode` 兜底 `'manual'`（L146）匹配——后端旧数据可能 null，前端兜底正确。✅
- `tokenBudget: number`（必填，非可空）但 `toAgent` 用 `dto.tokenBudget ?? 0`（L162）——`??` 对 `number` 必填字段是冗余但无害的防御。✅
- **唯一 gap**：`AgentDto` 无 `runtimeMode`/`model` 回显字段，故 `toAgent` 把 `model` 兜底为 `dto.role ?? ''`（L158）、`runtime` 硬编码 `'cloud'`（L157）。注释 L156 已诚实标注。这是后端 MVP 范围决定的，前端处理得当。

### 5. 测试
- 见 L5 详述。**结论：当前测试不会触发真实 fetch**（AgentsPage 在测试中不挂载），但 P2-1b 新代码**零测试覆盖**，且未来加 `/agents` 用例时有裸 fetch 的 flaky 风险。

---

## 建议处理优先级

| 优先 | 项 | 理由 |
|------|----|------|
| 1 | L1（运行位置空 PATCH + 谎报） | 用户可见的语义错误：点了说成功、实际没存；与同文件其他"未接入"处理的诚实原则不一致 |
| 2 | L5（测试覆盖） | ~210 行新代码零覆盖；建议至少补 `toAgent` 纯函数单测 + `App.test.tsx` 预防性 mock |
| 3 | M1（executionMode 类型收敛） | 三处重复交叉类型，维护成本；正式并入 `Agent` 接口可一劳永逸 |
| 4 | L3/L4（useAgent dead code + 无效 invalidate） | 保留无害，仅记录 |
| 5 | L2（runtimeMode 半成品） | 后端契约 gap，记录待后续任务 |

---

**审查结论**：P2-1b 可合并。无 High 级阻断；L1 是唯一"用户可见语义瑕疵"，建议合并前或紧随其后修复；其余为健壮性/可维护性改进，可排入后续。测试覆盖是最大技术债，建议尽快补 AgentsPage 单测。
