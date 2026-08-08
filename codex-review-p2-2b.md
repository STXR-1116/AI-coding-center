# Codex 审核修复报告 — P2-2b（KnowledgePage + SkillsPage 接 REST）

**审查模式**：手动模式（Codex 运行时不可用，Claude 独立审查）
**审查范围**：`git diff 88c83ca..367a877` — 7 文件 / +992 -302 行
  - `src/api/knowledge.ts`（新）、`src/api/skills.ts`（新）
  - `src/queries/knowledge.ts`（新）、`src/queries/skills.ts`（新）
  - `src/pages/KnowledgePage.tsx`、`src/pages/SkillsPage.tsx`、`src/types.ts`
**判真结果**：独立审查 8 条 → 真实 6 条 / 误报 0 / 待确认 2 条
**回归验证**：`npx vitest run` → 8 files / **57 passed**（与 commit "57 green" 一致）

> 不改代码（按要求）。下方"修复建议"为供后续修复参考的方案，未执行。

---

## ✅ 已确认问题（按严重度排序）

### 🔴 高-1 · KnowledgePage 的 Agent 绑定状态永远显示为"未绑定"（功能性缺陷）

**文件**：`src/api/knowledge.ts:105`、`src/api/knowledge.ts:113-118`、`src/pages/KnowledgePage.tsx`（`selected.boundAgents`，diff 第 675/677 行）

**问题**：
- 列表桥 `toKnowledgeBase(dto: KnowledgeBaseDto)` 恒返回 `boundAgents: []`（knowledge.ts:105）——这是对的，因为列表 DTO（`KnowledgeBaseDto`）只有 `boundAgentCount`，没有 `boundAgents` 数组。
- 详情桥 `toKnowledgeBaseDetail`（knowledge.ts:113-118）会从 `dto.boundAgents` 填充绑定列表——**但全仓库无人调用它**。
- `KnowledgePage` 只用 `useKnowledgeBases()`（列表）+ `toKnowledgeBase`（列表桥），**从不调用 `useKnowledgeBase(id)` 取详情**。
- 绑定 UI 读 `selected.boundAgents.includes(agent.id)`（diff 675 行）→ 列表项 `boundAgents` 恒为 `[]` → **所有 Agent 复选框永远 unchecked，即便后端实际已绑定**。

**为何这是 bug 而非设计**：对照 `SkillsPage`——skills 列表 DTO 是 `SkillDetailDto`（列表一次性带 `boundAgents` 全文，见 skills.ts:187-188 注释 + types.ts:1529 `data: SkillDetailDto[]`），`SkillsPage` 用 `toBoundAgentIds(dto)` 正确渲染绑定。KB 与 Skill 的列表契约不同（KB 列表不带绑定明细，只有 count），但两个页面用了同样的"只读列表"策略，导致 KB 侧绑定状态丢失。

**失效场景**：用户在 `/knowledge` 选中一个已绑定 3 个 Agent 的知识库 → 详情区"Agent 绑定"section 显示 0 个已勾选；用户以为未绑定，再次勾选触发 `bindMutation`（幂等 upsert，不报错但语义混乱）；更糟的是，若用户取消一个本应已勾选的复选框，会误触发 `unbindMutation` 解绑一个用户以为"没绑定"的 Agent。

**修复建议**（二选一）：
1. **推荐**：`KnowledgePage` 选中项时调用 `useKnowledgeBase(selected?.id)` 取详情，用详情桥 `toKnowledgeBaseDetail` 渲染 `boundAgents`（需把 `toKnowledgeBaseDetail` 接进页面）。与 `SkillsPage` 不同的是 KB 必须走详情端点，因为列表不带绑定明细。
2. 或：在列表桥里用 `dto.boundAgentCount` 至少显示数量徽标（已通过 `boundAgents.length` 显示，但恒为 0），并明确标注"绑定明细需展开详情"——但勾选态仍无法正确反映，治标不治本。

---

### 🟡 中-1 · 详情查询 hooks + 详情桥全是死代码（与高-1 同根）

**文件**：`src/queries/knowledge.ts:51` `useKnowledgeBase`、`src/queries/skills.ts:49` `useSkill`、`src/api/knowledge.ts:113` `toKnowledgeBaseDetail`、`src/api/knowledge.ts:119` `fetchKnowledgeBase`、`src/api/skills.ts:140` `fetchSkill`、`src/queries/knowledge.ts:79` `useUpdateKnowledgeBase`、`src/queries/skills.ts:70` `useUpdateSkillManifest`

**问题**：grep 全仓库确认这些导出**零外部调用方**（仅在各自 queries 文件内部 import）。它们对应的 invalidation 分支（`knowledgeKeys.detail(id)` / `skillsKeys.detail(id)`）也因此从未真正命中活动 query——invalidation 不报错但是空操作。

**为何留它**：任务 brief（`.pm-task-p2-2b.md:11,23`）明确要求实现 `useKnowledgeBase`/`useSkill` 及 detail invalidation，作为"与 P2-1b agents 同款"的完整数据层骨架，预留 P2-3 详情/编辑 UI 接入。属"有意预留"。

**结论**：单独看不构成 bug（导出未使用不破坏构建/测试）。但它与高-1 同根——正因为 `useKnowledgeBase` 没被页面接上，才导致 KB 绑定态丢失。**建议保留 hooks，但必须在修复高-1 时把 `useKnowledgeBase` 接进 KnowledgePage**，否则骨架永远跑不到。

**修复建议**：随高-1 一并处理；若短期不接详情，至少在 `useKnowledgeBase`/`useSkill`/`toKnowledgeBaseDetail` 上加 `// TODO(P2-3): 接入详情面板` 注释，表明有意预留，避免后续审查误判为遗忘。

---

### 🟡 中-2 · `testConnection` 用 `void knowledgeBase` 静默吞参，留有误导性"测试连接"按钮

**文件**：`src/pages/KnowledgePage.tsx`（diff 568-578 行，`testConnection` 函数）

**问题**：迁移后 `testConnection` 改为 `void knowledgeBase; notify('连通性检查待后端 health-check 接口接入（P2-2a 未实现）。', { tone: 'info' })`。按钮文案仍是"测试连接"，点击只弹一条 info toast 说"待接入"。

- `void knowledgeBase` 是为消除 unused-param lint 的惯用法，本身无害，但语义上"测试连接"已不测试任何东西。
- 用户点击"测试连接"得到的是"待接入"提示，而非真实连通性结果——属于诚实的降级提示（与 P2-1b 的"honest runtime-location toast"同思路），可接受，但按钮文案未随功能降级调整，易误导。

**失效场景**：用户为排查 KB 不可达点"测试连接"，只看到"待接入"，无法判断是网络问题还是凭证问题。

**修复建议**：按钮文案改为"测试连接（即将支持）"或 `disabled` 并加 `title="health-check 接口待 P2-3 接入"`；保留 `void knowledgeBase` 即可。属体验问题，非阻断。

---

### 🟡 中-3 · 停用后无"重新启用"路径，但按钮仍在（单向操作伪装成双向）

**文件**：`src/pages/KnowledgePage.tsx`（diff 686 行，inspector footer 的"停用挂载/启用挂载"按钮）

**问题**：按钮逻辑：`selected.enabled ? handleDisable(selected) : notify('重新启用知识库待后端接口接入（P2-2a 仅实现 disable）。')`。即：
- 启用态点按钮 → 真实 `POST /disable`（可用）。
- 停用态点按钮 → 只弹 info"待接入"（不可用）。

但按钮文案对两种状态都显示（"停用挂载" / "启用挂载"），停用态按钮看起来可点，实际只弹提示。与中-2 同类：诚实降级，但 UI 未反映"此路不通"。

**失效场景**：用户停用一个 KB 后想重新启用，点"启用挂载"只看到"待接入"，需联系后端或直接改库——操作不可逆的体感很强。

**修复建议**：停用态时把按钮 `disabled` 并加 `title`，或隐藏"启用挂载"分支只留 disabled 提示。注意 `disabled={selected.enabled ? disableMutation.isPending : false}` 当前对停用态恒 `false`（可点），应改为停用态也 disabled。

---

### 🟢 低-1 · `BindResult` 类型假设后端返回 `{ data: { ok: true } }`，无法在本仓库验证

**文件**：`src/types.ts:1480-1483`（`BindResult`）、`src/api/knowledge.ts:158/167`、`src/api/skills.ts:356/368`

**问题**：bind/unbind 的响应类型声明为 `BindResult = { ok: boolean }`，types.ts:1480 注释称"`{ data: { ok: true } }` unwrapped"。由于后端不在本仓库（前端 monorepo），无法直接核对 P2-2a 后端 bind/unbind 端点的实际响应体。若后端实际返回的是空 204 或 `{ data: { success: true } }` 等其他形状，client 的默认 unwrap（取 `body.data`）会得到 `undefined`，`BindResult.ok` 读到 `undefined`（falsy）——但页面 `onSuccess` 只 toast"已绑定/已解绑"，不读返回值，所以**即使形状不符也不会运行时崩溃**，只是类型与实际不符的隐患。

**失效场景**：未来若有代码读 `BindResult.ok` 做分支，会因形状不符误判失败。

**修复建议**：本仓库无法验证，标记为"待确认"（见下）。若 P2-2a 后端确认返回 `{ data: { ok: true } }`，则无问题；否则调整 `BindResult` 或 bind/unbind 的 unwrap 策略。当前不阻断。

---

### 🟢 低-2 · App.test 未 mock `queries/knowledge` + `queries/skills`（潜在裸 fetch 风险，当前未触发）

**文件**：`src/App.test.tsx`（整体 mock 清单：tasks/requirements/conversations/repositories/auth，**缺 knowledge/skills**）

**问题**：App.test mock 了所有在测试路由下会挂载的页面数据层，但未 mock `./queries/knowledge` 与 `./queries/skills`。`visibleModules`（App.test:100）包含 `'knowledge'` 和 `'skills'`。

**为何当前不炸**：
- `KnowledgePage`/`SkillsPage` 是 `lazy` + 路由级（App.tsx:15-16, 103-104），仅在 `/knowledge`、`/skills` 路由下挂载。
- App.test 的 11 个用例只访问 `/tasks`、`/workspace`、`/requirements`、`/settings`——**从不导航到 `/knowledge` 或 `/skills`**。
- 唯一涉及 knowledge 的用例（`hides disabled modules...`，App.test:374-385）在 `/settings` 关闭知识库模块后点 `navigate-knowledge` probe 跳 `/knowledge`，但 `ModuleGate`（App.tsx:30-45）在 `KnowledgePage` 渲染前就返回 `MODULE LOCKED` 屏——页面不挂载，`useKnowledgeBases` 不触发。

故当前 57 绿。但这是**脆弱的隐式依赖**：一旦有人加一个"导航到 /knowledge 断言列表"的测试，`useKnowledgeBases` 会真发 fetch（jsdom 下打到 `/api/v1/knowledge-bases`，404/网络错→`knowledgeBasesQuery.error`→渲染错误 StatePanel，测试可能 flaky 或失败）。

**修复建议**：参照 App.test 对 `./queries/repositories` 的 mock 模式（App.test:161-180）， preemptively 加 `vi.mock('./queries/knowledge')` + `vi.mock('./queries/skills')`，返回空列表 + `isLoading:false`，与 brief 第 30 行"App.test 若挂 → vi.mock queries/knowledge + queries/skills"一致。当前不阻断，但属测试债务。

---

## ❓ 待你确认（2 条）

### 待确认-1 · `BindResult` 响应形状（同低-1）

本仓库无后端代码，无法独立判真 `POST /knowledge-bases/{id}/agents/{agentId}` 与 `DELETE` 同路径的返回体是否真是 `{ data: { ok: true } }`。代码注释如此声明，且页面不读返回值故不崩。**需你对照 P2-2a 后端 route 实现确认**。若不符，调整 `src/types.ts:1480` 的 `BindResult` 或 bind/unbind 的 unwrap。

### 待确认-2 · KB 列表 DTO 是否真的不带 `boundAgents`（决定高-1 修复路径）

高-1 的修复方案取决于 P2-2a 后端 `GET /knowledge-bases` 列表项是否带绑定 Agent 明细。代码与 types.ts 注释断言"列表只带 `boundAgentCount`，明细只在 `GET /{id}`"（types.ts:1445-1448、knowledge.ts:83-86）。**需你对照 P2-2a 后端 `knowledge-dto.ts` 确认**：
- 若列表确不带明细 → 高-1 必须走"页面接 `useKnowledgeBase(id)` 详情"方案。
- 若列表其实带 `boundAgents`（与 Skill 列表一致）→ 把 `KnowledgeBaseDto` 改为带 `boundAgents`，列表桥直接填充，无需详情请求（更简单）。

---

## ❌ 未接受（0 条）

无 Codex 报告，无误报项。

---

## 未能修复的高风险项

- **高-1**（KB 绑定态丢失）：识别为真，但属功能性缺陷，需你拍板修复路径（待确认-2 的答案决定方案）。建议优先处理。
- 其余均为中/低，不阻断当前 57 绿。

---

## 附：审查中排除的非问题（说明，不计入 finding）

1. **README API 契约与代码偏差**（README:507-514 描述 `health`/`health-check`/`PUT agents` 整体绑定等完整 API；代码实现 `active`/`disabled` + `POST /disable` + `POST/DELETE agents/{agentId}` 单条绑定）：README 描述的是*目标完整规范*，P2-2a 实现的是 *MVP 子集*，代码注释（knowledge.ts:7-36、skills.ts:183-210）已明确标注 MVP 与完整规范的差异并说明"随 backend 增长 defaults 落地"。属有意分阶段，非缺陷。排除。
2. **`asStatus` / `asCategory` 容错默认值**：对未知 status 默认 `'active'`、未知 category 默认 `'workflow'`——防御性编程，后端契约扩展时不会崩。合理，排除。
3. **`parseManifest` try/catch 容错**：malformed manifest 返回 `{}` 不崩——注释（skills.ts:252-254）说明"UI must never crash on a read"。合理，排除。
4. **disabled key 工厂 `id ?? '__disabled__'`**：与 P2-1b `queries/agents` 同款（agents.ts:54-55），避免字面量落入 detail 前缀树被前缀 invalidate 误伤。模式一致，排除。
5. **`state-panel` CSS 类**：与 AgentsPage（P2-1b 基线）共用，AgentsPage 渲染正常，样式已存在。排除。
6. **list `select: (res) => res.data` 与 `unwrap: false` 配合**：client.ts:118 对 `unwrap:false` 返回整个 body，`select` 再取 `.data`，与 agents/repositories 模式一致。排除。
