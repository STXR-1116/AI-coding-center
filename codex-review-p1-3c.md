# P1-3c 代码审查报告（手动模式 · Codex 不可用）

- **审查范围**：`git diff b5df733..aa0ba2a`
  - `src/pages/WorkspacePage.tsx` — `ConversationPane` + 新增 `StreamingChat` + `useStreamChat`/`useConversation` 接线
  - `src/App.test.tsx` — React Query Provider 接入 + `./queries/conversations` mock
- **审查要点**：StreamingChat 生命周期 / ConversationPane 数据源 / 双数据源一致性 / 内存性能 / 测试质量
- **参考实现**：`src/hooks/useStreamChat.ts`、`src/queries/conversations.ts`、`src/state/AppContext.tsx`
- **结论**：未改代码。以下按 高 / 中 / 低 列出，含文件行号与修复建议。

---

## 高（High）

### H1 — `OutputPane` 仍从 `useApp()` 读会话，与 `ConversationPane` 的 REST 数据源割裂
- **文件**：`src/pages/WorkspacePage.tsx:387`（`OutputPane`）、`:136`（`ConversationPane`）
- **现状**：
  - `ConversationPane` 已迁移到 `useConversations()`（React Query，REST `ConversationDto`，无 `projectId`/无 `messages.entities`）。
  - `OutputPane` 仍 `const { selectedConversationId, conversations } = useApp()`，读的是 AppContext 里的 **mock `Conversation[]`**（`initialConversations`，带 `projectId: 'repo-1'`、`messages[].entities`）。
  - `OutputPane` 用 `conversations.find(item => item.id === selectedConversationId)` 取 `conversation`，再 `conversation?.messages.flatMap(...entities)` 计算产出（`:391-392`）。
- **失败场景**：真实后端下，AppContext 的 `conversations`（mock）与 REST 会话列表 id 完全不相关；`selectedConversationId` 由 `ConversationPane` 经 `selectConversation(created.id)` 设为 REST 会话 id，`OutputPane` 在 mock 列表里 `find` 不到 → 永远落到 `!conversation` 的"尚未选择会话"空态，会话产出面板功能性失效。当前测试通过只因 mock 的 REST 列表刻意返回 `conv-1`/`conv-2`，与 `initialConversations[0].id='conv-1'` 偶然重合，掩盖了割裂。
- **修复建议**：`OutputPane` 同样改用 `useConversation(selectedConversationId)`（或 `useConversations()` + find）作为单一数据源；若产出（entities）尚无 REST 字段，应在迁移文档中明确标注为已知缺口并让 `OutputPane` 优雅降级，而非继续依赖 mock 实体。`selectProject`（`AppContext.tsx:147-148`）也仍在按 `conversations.filter(...projectId===id)` 设置选中——这是同一割裂的另一处，需一并纳入后续迁移。

---

## 中（Medium）

### M1 — `removeConversation` 把选中态清成空串 `''` 而非 `null`，污染 `selectedConversationId` 语义
- **文件**：`src/pages/WorkspacePage.tsx:159`
- **现状**：删除当前选中会话后执行 `selectConversation(remaining.at(-1)?.id ?? '')`。`selectConversation(id: string)`（`AppContext.tsx:140`）直接 `setSelectedConversationId(id)`，于是 `selectedConversationId` 变成 `''`（空串），而非 `null`。
- **失败场景**：
  1. `ConversationPane` 里 `conversation = conversationsForProject.find(item => item.id === selectedConversationId)`（`:136`）——空串 find 不到，`conversation` 为 `undefined`，行为与 `null` 看似一致；但 `StreamingChat` 的 `key={conversation?.id ?? 'none'}`（`:212`）与 `conversationId={conversation?.id ?? ''}`（`:213`）都依赖这个语义，空串 `''` 作为"已选中但无效"的中间态会让 `useConversation('')` 走 `enabled: !!id` 的禁用分支（`conversations.ts:52`），逻辑虽能跑通但与"未选中=空"的约定不一致，后续若有 `if (selectedConversationId) {...}` 判定（空串为 falsy，恰好侥幸）就会埋雷。
  2. `OutputPane`（`:391`）find 空串同样为 `undefined`，但语义仍是"选中了某个不存在的会话"。
- **修复建议**：让 `selectConversation` 的入参类型支持 `null`（`AppContext.tsx:140` + `app-context.ts:46` 改为 `(id: string | null) => void`），删除后传 `null`；或新增一个 `clearConversation()`。避免用 `''` 表达"无选中"。

### M2 — `retry` 依赖 `draft`，但出错路径下 `draft` 已被清空，"重试"按钮恒为禁用
- **文件**：`src/pages/WorkspacePage.tsx:299-302`（`retry`）、`:283-293`（`sendDraft`）、`:357`（按钮 `disabled={!draft.trim()}`）
- **现状**：
  - `sendDraft` 在校验通过后**先** `setDraft('')`（`:286`），再 `await chat.start(content)`。若流式以 `error` 终态，`draft` 此时已是空串。
  - `retry` 判 `if (!draft.trim()) return`，错误栏的"重试"按钮 `disabled={!draft.trim()}`——因此出错后重试按钮总是禁用、点击也直接 return，**永远无法重发上一条消息**。
- **失败场景**：用户发送一条消息 → 流式失败 → 错误栏出现"重试"按钮但灰显；用户必须手动重打一遍原文才能重试。重试功能名存实亡。
- **修复建议**：用一个 `lastSent` ref/state 缓存最近一次发送的 `content`；`retry` 用 `lastSent` 调 `chat.start`，按钮 `disabled` 改为 `!lastSent || streaming`。或出错时不清空 `draft`、回填 `content`。当前"清空 draft 再发"的实现需配合调整。

### M3 — `pendingSend` 消费 effect 在 `hasConversation` 为 false 时静默丢弃，且 createConversation 失败的回滚存在竞态
- **文件**：`src/pages/WorkspacePage.tsx:258-265`（消费 effect）、`:169-173`（`handleNeedConversation`）
- **现状**：
  - 消费 effect：`if (!pendingSend || !hasConversation) return`。`hasConversation` 取决于 `conversationId`，而 `conversationId` 来自 `ConversationPane` 的 `conversation?.id`，后者依赖 `selectConversation(created.id)` 触发的 AppContext 重渲染 + `useConversations()` 列表刷新。
  - `handleNeedConversation`：`setPendingSend(content)` → `await createConversation()`。`createConversation` 成功才 `selectConversation(created.id)`；失败则 `setPendingSend(null)` 回滚。
  - **竞态**：`setPendingSend` 与 `selectConversation` 是两次独立 setState。在 `await createConversation()` 期间若用户又触发一次发送（双击/回车连按），第二次 `handleNeedConversation` 会覆盖 `pendingSend`，第一次的会话创建可能先 resolve 并 `selectConversation`，导致第二次的 content 被绑到第一个会话上发送。`sendDraft` 仅有 `streaming` 守卫，无"创建中"守卫。
- **失败场景**：无会话时快速连发两条 → 两条都可能投递到同一新建会话，或第二条 content 被第一条的 key 重挂消费吞掉（因为 `onConsumePending` 清空了 `pendingSend`，第二条 set 的值被第一条 effect 运行时清掉）。
- **修复建议**：加 `creating` 守卫（如 `useRef<boolean>` 或 mutation 的 `isPending`），在创建中禁用发送入口；或让 `pendingSend` 支持队列。至少在 `sendDraft` 的 `!hasConversation` 分支前判断 `createConversationMutation.isPending`。

### M4 — `handleStreamDone` 的详情失效与 `useConversation` 缓存竞态：流式增量与持久消息可能短暂重复
- **文件**：`src/pages/WorkspacePage.tsx:176-179`（`handleStreamDone`）、`:248`、`:339-347`
- **现状**：流式 `done` 后，`StreamingChat` 仍渲染 `chat.assistantText`（`:339`）作为流式增量气泡，同时 `handleStreamDone` 失效详情 → `useConversation` 重新拉取，返回的 `messages` 末尾会包含 assistant 的最终消息。在详情刷新完成、`chat.assistantText` 尚未被清空的窗口内，**同一条 assistant 消息会出现两次**（一次流式气泡、一次持久气泡）。
- **失败场景**：流式结束 → 详情 invalidate → refetch 返回含 assistant 消息的列表 → 此时 `chat.status==='done'` 但 `assistantText` 仍非空 → feed 里出现两个相同内容的 agent 气泡，直到下一次状态变化才消失。
- **修复建议**：`done` 后清空 `chat.assistantText`（hook 暴露的 `reset()` 或在 `onStreamDone` 后置空），或在渲染层用 `chat.status === 'done'` 隐藏流式增量气泡（`{chat.assistantText && chat.status !== 'done' ? ... : null}`）。当前 `useStreamChat` 的 `onDone` 会把 `assistantText` 设为最终全文且不清空，需配合。

---

## 低（Low）

### L1 — `prevStatusRef` 初始化读取渲染期 `chat.status`，key 重挂后首帧即"无变化"判定成立（无害但脆弱）
- **文件**：`src/pages/WorkspacePage.tsx:269-276`
- **现状**：`const prevStatusRef = useRef(chat.status)` 在首次渲染捕获 `'idle'`。effect 比较 `prevStatusRef.current === chat.status`，首帧相等直接 return。由于 key 重挂时 `useStreamChat` 重置为 `idle`，首帧不会误触发 `onStreamDone`。逻辑正确。
- **风险**：若未来 `useStreamChat` 初始状态改为非 `idle`（如恢复进行中的流），`prevStatusRef` 会吞掉首次终态通知。属潜在脆弱点。
- **修复建议**：可接受现状；若想稳健，用 `'idle'` 字面量初始化 ref 而非 `chat.status`，并在注释中说明"仅响应状态变迁、忽略初值"。

### L2 — `formatTime` 用本地时区 `getHours/getMinutes`，跨时区/服务器 UTC 会显示不一致
- **文件**：`src/pages/WorkspacePage.tsx:377-383`
- **现状**：`new Date(createdAt).getHours()` 取本地时区。后端返回 ISO（UTC），不同客户端时区下显示的小时分钟不同。
- **风险**：低——工作台时间显示为相对即时反馈，时区差异不影响功能。但与 `AppContext.sendMessage` 用的 `Intl.DateTimeFormat('zh-CN', {hour12:false})`（同样本地时区）一致，故风格统一。
- **修复建议**：可接受；若需确定性，统一用 `Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })`。

### L3 — `feedRef` 滚动 effect 依赖 `chat.assistantText`（高频变化），流式期间每个 delta 触发一次 `scrollTop` 赋值
- **文件**：`src/pages/WorkspacePage.tsx:252-255`
- **现状**：依赖数组 `[messages.length, chat.assistantText, chat.status]`。流式时 `assistantText` 每个 delta 更新 → effect 重跑 → `feed.scrollTop = feed.scrollHeight`。
- **风险**：低——单元素 scrollTop 赋值开销极小；但若用户在流式中向上滚动查看历史，会被每个 delta 强制拉回底部，破坏手动滚动意图。
- **修复建议**：加"是否贴底"判断（滚动前记录 `feed.scrollHeight - feed.scrollTop - feed.clientHeight < threshold`，仅贴底时才自动滚动），是聊天 UI 常见模式。

### L4 — 测试：`useConversation` mock 返回 `messages: []`，未覆盖"有持久消息 + 流式增量"渲染路径
- **文件**：`src/App.test.tsx:108-112`（`useConversation` mock）、`:96-106`（`useConversations` mock）
- **现状**：mock 的 `useConversation` 恒返回空 `messages`；`useConversations` 返回静态两条。删除测试只断言 `deleteMutateMock` 被调（`:252`），不再断言 UI 刷新（注释承认"mock 静态列表不刷新 UI"）。
- **风险**：中低——`StreamingChat` 的"持久消息渲染 + 流式增量附加 + done 后失效"这条核心链路（`:329-347`）无任何测试覆盖；M4 的重复气泡问题、消息 role 映射（`assistant`→`agent`）均无回归保护。
- **修复建议**：补一个 `StreamingChat` 组件级测试（或 `useStreamChat` 集成测试），mock `useConversation` 返回带 messages、mock `useStreamChat` 推进 status，断言 feed 渲染与 done 后 invalidate 调用。当前 `useStreamChat.test.tsx` 存在但未覆盖接线层。

### L5 — 测试：`deleteMutateMock` 为模块级共享 `vi.fn`，跨用例未重置，存在串扰风险
- **文件**：`src/App.test.tsx:97`
- **现状**：`const deleteMutateMock = vi.fn(...)` 在模块顶层声明（因 `vi.mock` 提升需用函数声明/变量）。未在 `beforeEach` 中 `mockClear`。
- **风险**：低——当前仅一个删除用例；若后续新增删除相关断言，`toHaveBeenCalledWith` 会命中历史调用。
- **修复建议**：在 `beforeEach`（若已有则复用）中 `deleteMutateMock.mockClear()`，或改用 `vi.hoisted` 工厂返回独立 mock。

---

## 汇总

| 级别 | 编号 | 位置 | 主题 |
|---|---|---|---|
| 高 | H1 | WorkspacePage.tsx:387 / :136 | OutputPane 与 ConversationPane 数据源割裂（mock vs REST） |
| 中 | M1 | WorkspacePage.tsx:159 | 删除后选中态清成 `''` 而非 `null` |
| 中 | M2 | WorkspacePage.tsx:299-302 / :286 | 重试按钮恒禁用（draft 已清空） |
| 中 | M3 | WorkspacePage.tsx:258-265 / :169-173 | pendingSend 双发竞态、无创建中守卫 |
| 中 | M4 | WorkspacePage.tsx:176-179 / :339-347 | done 后流式增量与持久消息短暂重复 |
| 低 | L1 | WorkspacePage.tsx:269-276 | prevStatusRef 初值取渲染期 status（脆弱） |
| 低 | L2 | WorkspacePage.tsx:377-383 | formatTime 本地时区 |
| 低 | L3 | WorkspacePage.tsx:252-255 | 流式 delta 强制贴底滚动 |
| 低 | L4 | App.test.tsx:108-112 | useConversation mock 空 messages，核心渲染链路无覆盖 |
| 低 | L5 | App.test.tsx:97 | deleteMutateMock 跨用例未清理 |

**优先处理**：H1（功能性失效，被测试掩盖）→ M2（重试失效）→ M4（可见的重复气泡）→ M3（并发竞态）→ M1（语义一致性）。
