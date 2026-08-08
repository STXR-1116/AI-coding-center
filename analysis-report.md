# CodingCenter Web 前端工程分析报告

> 分析对象：`C:\Users\13588\Desktop\AI_Coding_Center`（CodingCenter Web 原型）
> 契约基准：`README.md`（完整后端 API 契约 + 枚举 + 状态机 + 安全要求）
> 结论先行：**这是一个高保真、纯前端的交互原型**。9 个页面、全局 Shell、路由懒加载、错误边界、模块禁用态、Toast 反馈、任务状态机都已完整实现并经过测试；但**数据 100% 来自 `src/data/mock.ts` 与组件内 `useState`，零网络请求**。React Query 已挂载但未使用，Recharts 已安装但未使用，`README` 建议的 `api/client.ts` / `queries/*.ts` / `realtime/` 目录均不存在。所有"写操作"（创建任务、审批、变更审查、模块开关、配置保存）都只更新本地内存，刷新即丢失。

---

## 0. 核心架构现状（全局）

| 维度 | 现状 | 与 README 契约的差距 |
| --- | --- | --- |
| 数据层 | `src/data/mock.ts` 导出静态数组（projects / tasks / requirements / agents / conversations / repositoryTree / changes / moduleSettings / codePreview）；`AppContext` 用 `useState` 承载 tasks/requirements/conversations/changes/moduleSettings，其余页面直接 `import { agents } from '../data/mock'` 后存入自己的局部 `useState` | 无任何 API 调用；README 的全部 REST 接口未接 |
| 网络层 | `src/` 内 **0 处** `fetch` / `axios`；`src/api/`、`src/queries/`、`src/realtime/` 目录**不存在** | README §前端架构明确建议新增 `api/client.ts` / `api/*.ts` / `queries/*.ts` / `realtime/`，均未创建 |
| React Query | `main.tsx` 实例化 `QueryClient`（staleTime 30s, retry 1）并 `QueryClientProvider` 包裹全应用；但**全仓无 `useQuery` / `useMutation` / `useInfiniteQuery` 调用**（仅 `main.tsx` 一行 import） | QueryClient 是"空挂载"，缓存能力完全闲置 |
| 实时事件 | 无 WebSocket / SSE；WorkspacePage 的"Agent 回复"用 `setTimeout(completeMessage, 650ms)` 模拟流式；任务状态靠用户手动点击 | README §实时事件要求 WS/SSE 推送 task/execution/approval/agent 健康等事件，未接 |
| 状态结构 | `AppContextValue`：user / tasks / requirements / projects / activeProjectId / selectedConversationId / conversations / changes / moduleSettings + 12 个 setter。`user` 硬编码为 `{id:'user-1', name:'Brandon', role:'leader', title:'产品经理'}` | README 要求 `GET /auth/me` 提供 capabilities + 可见模块；前端硬编码 role 且无 capabilities/allowedActions 驱动的权限控制 |
| 任务状态机 | `state/task-transitions.ts` 实现了 README 同名的 7 态状态机 + 事件文案；`canTransitionTaskStatus` 在每次状态写入前校验 | 与契约一致，但后端仍须重复校验（README 已声明） |
| 权限模型 | **前端未基于 capabilities/allowedActions 做任何按钮级控制**。SettingsPage 用 `user.role === 'leader' || 'pm'` 硬判"可管理模块"；TasksPage/WorkspacePage 的执行/审批/取消按钮按 task.status 显示，不按 allowedActions | README §权限返回值明确"前端不得仅根据 role 推导按钮权限"，当前实现违反此约束 |
| 图表 | AnalyticsPage 用**纯 CSS div 柱状图**（`analytics-bar` + `--bar-height`）；`recharts` 在 `package.json` 中但**未 import 任何图表组件**（仅 lucide 的 `BarChart3` 图标） | README §前端架构写"Recharts：Dashboard 指标图表"，实际未用 |
| 凭证/密钥 | KnowledgePage 注册表单收 `credential`（password 输入）但仅存内存；AgentsPage 注册后显示"一次性凭证"文案但不真实签发 | README 要求 credential secret 只在注册/轮换响应出现一次，当前无后端无从谈起 |

---

## 1. 逐页分析

### 1.1 TasksPage（`/tasks` · 任务管理）— 完成度：高（交互完整，数据 mock）

**已实现功能点**
- 顶部 `SummaryStrip`：今日待办 / 进行中 / 已完成 / 需要关注（实时由 tasks 派生）
- 看板工具栏：scope tabs（全部/我负责的/已分配）、搜索框、状态下拉筛选、排序切换
- 任务分组列表：按 `statusOrder`（awaiting_approval→running→assigned→pending→failed→succeeded→cancelled）分组，最多显示 4 组，每行含状态点/标题/编号/assignee/优先级/截止时间
- **项目焦点轨道 `ProjectCascade`**：9 张玻璃材质阶段卡片横向滚动，键盘 ←→/Home/End 切换，自动居中，选中后联动选中对应任务——这是页面最重的自研交互组件
- **项目时间线 `Timeline`**：4 行甘特条，点击跳转选中任务
- `TaskInspector`（右侧详情）：ID/标题/摘要/Agent/项目/截止/状态/Token、**上下文使用率进度条（>80 告警 + AI 建议）**、执行模式 segmented（manual/auto/full，写回 `updateTaskMode`）、**执行事件时间线**（折叠态，展示 task.events）、标签、AI 助手建议（按 status/contextUsage 分支文案）
- 底部操作：主按钮按状态切换（批准执行→开始执行→标记完成→查看结果）+ 取消按钮，均经 `updateTaskStatus`（受状态机校验）+ Toast

**数据来源**
- `tasks` ← `useApp()` ← `AppContext`（`useState(initialTasks)`）
- `ProjectCascade.projectStages`、`Timeline.rows` 为**页面内硬编码常量**（cycle 写死 "2025·Q2"，与任务无真实关联）
- 摘要数字、平均进度、在线 Agent "3/5"、平均执行 "42m" 部分硬编码

**交互完成度**：可操作（筛选/搜索/排序/选择/状态推进/模式切换/取消全部生效并 Toast 反馈）；时间线与项目轨道为展示型联动，不产生真实数据变更。

**mock 依赖**：tasks 全量 mock；事件由 mock.ts `taskEvents()` 按 status 拼装；无 API。

---

### 1.2 WorkspacePage（`/workspace?project={id}` · 开发工作台）— 完成度：高（最复杂页，三栏 + Diff 抽屉）

**已实现功能点**
- 项目工具栏：项目下拉、分支 chip、Connector 状态 chip（repo-2 显示 "Connector stale" + "切换云端"按钮，本地 state `cloudFallback`）
- **ExplorerPane**（左栏）：文件/Git 记录 tab；文件树 `FileTreeNode`（懒展开、图标按语言）；代码预览（`codePreview` 常量，行号渲染）；Git 记录为 4 条硬编码提交
- **ConversationPane**（中栏）：会话 tabs（多会话，新建/删除/切换）、项目上下文条、消息流（user/agent 气泡 + entities 卡片）、**模拟流式**（`sendMessage` 后 `setTimeout 650ms` 调 `completeMessage` 插入固定回复"已收到。我会结合当前项目上下文提炼需求…"）、停止生成、空态快捷输入、composer（@选 Agent / /调 Skill 仅占位文案）
- **OutputPane**（右栏）：按会话 message.entities 的 id 聚合 requirements + tasks（真实过滤），显示进度、批准执行（awaiting_approval 任务）、审查变更（succeeded 任务）
- **DiffDrawer**（底部抽屉）：文件列表、统一/并排视图切换、逐行 diff 渲染（+/-/@@ 着色）、**接受变更 / 拒绝并回滚**（`reviewChange` 写回 changes.status + Toast）
- URL `?project=` 双向同步（`useSearchParams`，刷新可恢复项目）；移动端 4 视图 tab（会话/文件/产出/变更）

**数据来源**
- conversations/changes/requirements/tasks ← `useApp()`；projects ← `useApp().projects`
- 文件树 ← `repositoryTree`（mock）；代码内容 ← `codePreview`（mock 常量，所有文件都显示同一段）；ExplorerPane 的 commit 列表为**组件内硬编码数组**

**交互完成度**：可操作（会话增删/发消息/模拟回复/任务审批/变更接受拒绝/项目切换/云端回退均生效）；但聊天回复是固定文案、文件预览是固定代码、commit 是静态列表。

**mock 依赖**：重度。README 的 `/conversations`、`/chat/stream`（NDJSON）、`/repositories/{id}/tree|file|commits|diff`、`/tasks/{id}/changes` 全部未接，全用 mock/常量。

---

### 1.3 RequirementsPage（`/requirements` · 需求管理）— 完成度：中高

**已实现功能点**
- `SummaryStrip`：需求总数/等待解析/执行中/完成率
- 状态 tabs（全部/草稿/解析中/执行中/已完成/已取消）+ 搜索 + 项目筛选 + 新建需求
- 需求列表行：标题/优先级/编号·项目/任务进度条（doneCount/taskCount）/状态
- 详情 Inspector：描述、负责人/项目/创建时间/当前 Spec 版本、任务完成度、**关联任务**（按 requirementId 真实过滤 tasks）、**Spec 版本历史**（按 specVersion 生成 v1..vN 列表，可折叠）
- 状态推进按钮：draft→"解析需求"（analyzing）、analyzing→"确认拆解"（in_progress）、取消需求；**状态变更仅存于组件 `statusOverrides` 局部 state**，不写回 AppContext
- 新建需求 Dialog：模板选择（feature/defect/infrastructure，预填描述）、标题、描述、项目、优先级；提交调 `addRequirement`（写回 AppContext）

**数据来源**
- requirements/tasks/projects ← `useApp()`
- `templates` 为页面内常量；状态覆盖用 `useState<Record<id,status>>`

**交互完成度**：可操作（筛选/搜索/创建/状态推进/取消生效）；但"解析需求"应是异步触发 `POST /requirements/{id}/analyze` 生成不可变 Spec + 任务，当前只是本地改状态标签。

**mock 依赖**：requirements 全 mock；Spec 历史是按版本号伪造的列表；无 API。

---

### 1.4 AgentsPage（`/agents` · Agent 与小队）— 完成度：高

**已实现功能点**
- Agent / 协作小队 双视图 tabs
- `SummaryStrip`：在线实例/执行中/平均成功率/需要关注
- Agent 列表行：头像/名称·类型·模型/运行时（本地·云端）/当前任务/Token 用量条/状态；支持状态+类型+搜索筛选
- Agent Inspector：心跳/运行时/成功率/默认模式、周期 Token 进度（>80 告警）、**运行位置切换**（local↔cloud，写回 `updateAgent`）、**默认执行模式切换**（写回 `executionModes` 局部 map）、已绑定技能（只读 tag）、当前任务 callout
- Agent 操作：恢复连接（stale/offline→idle）、检查心跳、启用/停用实例
- 注册 Agent Dialog：名称/类型/运行时/模型/周期 Token 预算；提交后**本地新增** + 显示"已生成一次性凭证"文案（不真实签发）
- 小队视图：小队卡片网格；Inspector 内**成员勾选**（toggle 成员，Lead 不可移除）；创建小队 Dialog（名称/职责/Lead）

**数据来源**
- `agents` ← 直接 `import { agents } from '../data/mock'` → 存入 `useState`（**不经过 AppContext**）
- `initialSquads` 为页面内常量

**交互完成度**：可操作（注册/创建小队/成员管理/运行时切换/心跳恢复/启停全部本地生效 + Toast）；凭证提示为占位文案。

**mock 依赖**：agents/squads 全 mock；无 API。README 的 `/agents`、`/agents/{id}/credentials/rotate`、`/squads`、`/agents/{id}/knowledge-bases|skills` 绑定接口均未接。

---

### 1.5 RepositoriesPage（`/repositories` · 版本库）— 完成度：高

**已实现功能点**
- `SummaryStrip`：已接入仓库/连接健康/待处理变更/关联任务
- 仓库概览/文件浏览/提交记录 三 tab + 搜索 + VCS(Git/SVN) + 状态筛选 + 接入仓库
- 概览列表行：VCS 图标/名称·描述/分支/语言/关联任务数/健康状态/更新时间
- 仓库 Inspector：健康卡（clean/modified/syncing 着色）、VCS/接入方式/语言/更新、**当前分支下拉**（写回 `changeBranch`，置 syncing）、关联任务（按 projectId 过滤）、上下文索引说明；操作：同步仓库（toggle syncing）、浏览文件
- 文件浏览 tab：文件树（`RepositoryTreeNode`，可展开折叠）+ 代码预览（package.json/README.md 有特例文本，其余显示 `codePreview`）+ "安全预览 512KB 二进制拒绝"页脚
- 提交记录 tab：commit 列表（6 条硬编码，含 refs 标签）+ commit 详情侧栏（作者/时间/分支引用/复制 Hash）
- 接入仓库 Dialog：名称/VCS/说明/远端地址/本地路径/默认分支/语言

**数据来源**
- projects/tasks ← `useApp()`；`repositories` 存入局部 `useState(projects)`（**与 AppContext 的 projects 脱钩**，切换项目不互通）
- `commits` 为页面内硬编码 `CommitRecord[]`；文件树 ← `repositoryTree`（mock）；预览 ← `codePreview`

**交互完成度**：可操作（接入/同步/切分支/文件浏览/commit 选择生效）；但 commit 是静态、文件预览是固定文本、分支切换不真实拉取。

**mock 依赖**：重度。README 的 `/repositories`、`/refs`、`/status`、`/commits`、`/tree`、`/file`、`/diff`、`/test`、`/reverts` 全未接。

---

### 1.6 KnowledgePage（`/knowledge` · 知识库）— 完成度：高

**已实现功能点**
- 自定义摘要卡（4 张）：已登记/健康服务/24h 调用/平均延迟（由 KB 列表派生）
- KB 列表行：图标/名称·描述·endpoint/绑定 Agent 数/延迟/今日调用/健康 badge/启用开关
- 健康/搜索筛选 + 注册知识库
- Inspector：健康 badge + 降级告警（非 healthy 显示"检索将自动降级"）、服务地址/鉴权/凭证（"已加密保存"）/最近检查、**检索参数**（模式 select + topK 滑块 + threshold 滑块，写回 `updateKnowledgeBase`）、**Agent 绑定**（checkbox 列表，toggle 写回）、操作：测试连接（按 endpoint 前缀判定 offline/healthy）、启用/停用挂载
- 活动面板：3 条硬编码检索活动
- 注册 Dialog：名称/用途/endpoint（URL 校验 http/https）/鉴权方式/检索模式/凭证（password，鉴权非 none 时必填）+ 表单错误提示

**数据来源**
- `initialKnowledgeBases` 为**页面内常量**（4 条），存入 `useState`；`agents` ← mock import
- 活动记录为硬编码 JSX

**交互完成度**：可操作（注册/测试连接/启停/检索参数调整/Agent 绑定全部本地生效）；凭证校验为前端 URL/必填校验，不真实探测。

**mock 依赖**：KB 全 mock；README 的 `/knowledge-bases`、`/health-check`、`/agents` 绑定接口未接。

---

### 1.7 SkillsPage（`/skills` · 技能管理）— 完成度：高

**已实现功能点**
- 摘要卡（4 张）：可用技能/Agent 绑定/累计调用/平均成功率
- 技能目录：搜索 + 分类(开发/质量/安全/工作流) + 状态(可用/废弃) 筛选 + 上传 Skill
- 技能列表行：分类图标/名称·版本/描述/分类·绑定数·调用数/状态 badge
- Inspector：固定版本/来源/作者/更新/执行表现、**Agent 绑定**（toggle switch 列表，废弃版本禁用）、**沙箱权限**（code tag 列表）、**包内容**（文件清单）、废弃版本影响提示；操作：版本记录（无 onClick）、废弃此版本/恢复此版本
- 上传 Dialog：名称/分类/能力说明/文件占位（"演示模式生成基础 SKILL.md"）

**数据来源**
- `initialSkills` + `initialBindings` 为**页面内常量**，存入 `useState`；`agents` ← mock import

**交互完成度**：可操作（上传/废弃恢复/Agent 绑定本地生效）；"版本记录"按钮无 onClick（占位）；文件上传为占位 UI。

**mock 依赖**：skills/bindings 全 mock；README 的 `/skills`、`/skills/{id}/versions`、`/download`、`/deprecate`、`/activate`、`/skills/{id}/agents` 绑定接口未接。

---

### 1.8 AnalyticsPage（`/analytics` · 可观测中心）— 完成度：中高（只读为主）

**已实现功能点**
- 命令栏：时间范围 tabs（7d/30d/90d）+ 项目筛选 + 导出审计（**真实生成 CSV 并触发下载**，唯一有真实副作用的导出）
- 4 张指标卡：Token 消耗/平均执行时长/任务成功率/在线 Agent（由 tasks + agents 派生，受项目范围与 rangeFactor 缩放）
- 执行趋势面板：4 指标 tabs（tokens/duration/success/executions）+ **纯 CSS 柱状图**（按 `trendSeries[range]` × `scopeRatio` 缩放渲染）+ 峰值/聚合说明
- Agent 健康度面板：Agent 列表（成功率/预算/状态）+ 选中 Agent 摘要（成功率/Token/心跳/周期预算条）
- 审计追踪：表格（时间/主体/动作/对象/结果）+ 搜索 + 主体(用户/Agent/服务) 筛选 + 加载更多 + 行点击弹窗详情（actor/target/traceId/项目/说明）
- 移动端 3 视图 tabs（趋势/Agent/审计）

**数据来源**
- tasks/projects ← `useApp()`；`agents` ← mock import
- `trendSeries`（3 个 range 的趋势点）、`auditEvents`（9 条）、`durationByTask` 为**页面内硬编码常量**

**交互完成度**：可操作（范围/指标/项目切换、审计筛选/分页/详情、CSV 导出生效）；但图表是静态数据缩放，无真实聚合；审计为固定 9 条。

**mock 依赖**：重度。README 的 `/dashboard/summary|timeseries|task-distribution`、`/metrics`、`/audit-logs` 全未接。**Recharts 装了没用**。

---

### 1.9 SettingsPage（`/settings` · 设置中心）— 完成度：高

**已实现功能点**
- 4 个 tab：模块开关 / 运行与预算 / 安全与备份 / 通知策略
- 访问 banner：显示当前身份 + "可管理/只读"（按 `user.role` 硬判）
- 摘要条：模块启用数/当前样例 Token/身份权限
- **模块开关 tab**：7 模块列表（图标/名称/风险标签 core·normal/描述/影响说明/状态）、搜索+风险筛选、SettingSwitch；**核心模块二次确认 Dialog**（显示影响范围/当前状态/变更后/操作者）；普通模块直接切换；切换调 `toggleModule`（写回 AppContext，影响全局导航与 ModuleGate）
- **运行与预算 tab**：默认执行模式 segmented、云端故障转移、失联/回收分钟数输入、月度总预算/单任务上限/告警阈值滑块（带当前用量预览条）
- **安全与备份 tab**：Skill 脚本沙箱、凭证轮换周期、审计保留周期、自动备份开关、计划时间、最近备份校验状态（"验证恢复"按钮无 onClick）
- **通知策略 tab**：任务失败/预算阈值/Agent 心跳/每日摘要开关、通知邮箱、免打扰时段开关+起止时间
- 非 modules tab 底部 savebar：保存配置 / 撤销更改（dirty 检测 `JSON.stringify` 对比），保存调 `setSavedConfig` + Toast（**仅本地 state，不写后端**）

**数据来源**
- moduleSettings/tasks/user ← `useApp()`；`config` 为页面内 `useState(defaultConfig)`
- `defaultConfig`、`moduleImpact` 为页面内常量

**交互完成度**：可操作（模块开关真实影响全局、配置编辑/保存/撤销/二次确认全部生效）；但保存只更新本地，README 明确"当前前端原型的保存按钮仍只更新本地状态"。

**mock 依赖**：config 全默认值；README 的 `/config/effective|modules|runtime|token-budget|security|backup|notifications`（版本化 PUT + 乐观锁）全未接。

---

## 2. 全局：AppShell / Layout / 路由

**路由（`src/App.tsx`）**
- `/` → `<Navigate to="/tasks" replace />`
- `/tasks`（ModuleGate `task_dispatch`）、`/workspace` + `/workspace/:repositoryId`（ModuleGate `repositories`）、`/requirements`（无 gate）、`/agents`（gate `agents`）、`/repositories`（gate `repositories`）、`/knowledge`（gate `knowledge`）、`/skills`（gate `skills`）、`/analytics`（gate `dashboard`）、`/settings`（无 gate）、`*` → `NotFound`
- **9 个页面全部 `lazy()` 懒加载**，外层 `<Suspense fallback={<RouteLoading/>}>` + `<AppErrorBoundary routeKey>`（路由切换自动清错）
- `ModuleGate`：读取 `moduleSettings`，禁用模块显示 423 锁定态 + "前往设置中心"按钮（**实际生效**：禁用 `task_dispatch` 后 `/tasks` 真的显示锁定页）
- `NotFound`：404 态 + 返回任务中心
- 注意：`/requirements` 与 `/settings` **未挂 ModuleGate**（README 模块 key 也不含 requirements，但 accounts 模块对应"账号权限"却无对应路由——前端无用户管理页）

**AppShell（`src/components/AppShell.tsx`）**
- 左侧固定 sidebar：品牌标记 + 9 项主导航（NavLink，按 enabledModules 过滤可见）+ 工作区切换器（项目 select）+ 用户卡片
- 顶栏 topbar：移动菜单按钮 + 当前项目上下文 + **全局搜索（⌘K）**（Dialog，搜 tasks/requirements/projects，跨域跳转）+ 项目分支状态 + 通知（带红点，无 onClick）/ 消息按钮 + **新建任务**按钮（打开 `CreateTaskDialog`）
- 移动端 nav-scrim 抽屉
- `CreateTaskDialog`：标题/说明/项目/优先级/执行模式（manual/auto/full 分段）→ `addTask` 写回 AppContext + Toast + 跳转 `/tasks`

**Layout 组件（`src/components/layout.tsx`）**
- `PageHeader`（eyebrow/title/description/actions/context）
- `SummaryStrip`（多 tone 摘要卡）
- `WorkbenchLayout`（主区 + 可折叠 Inspector + 移动端 tab 切换，含键盘导航 `MobileViewTabs`）
- `DisclosureButton`
- 复用度高，9 页统一几何与滚动边界

**Toast（`src/components/ToastProvider.tsx` + `state/toast-context.ts`）**
- `ToastProvider` 暴露 `notify(message, {title, tone, duration})` / `dismiss`
- `aria-live="polite"` 队列（最多 4 条，自动过期 + 进度条动画），success/info/warning 三态
- 被创建/审批/审查/配置/会话等操作广泛使用

---

## 3. 与 README 契约的差距清单（按接入优先级排序）

> 优先级判定：P0 = 阻塞核心业务闭环 / 安全红线；P1 = 核心页面真实数据；P2 = 管理类页面；P3 = 增强体验。

### P0 — 基础设施与安全基线（不接则全部页面都是壳）

| # | 差距 | 涉及 README | 现状 |
| --- | --- | --- | --- |
| 1 | **新建 `src/api/client.ts`**：鉴权（Bearer + refresh cookie）、错误解析（统一 error.code）、`Idempotency-Key`、乐观锁 `If-Match/version`、401 refresh 重试 | §后端契约总则、§幂等并发 | 不存在 |
| 2 | **接入 `GET /auth/me` + 登录流程**：获取 user、role、`capabilities[]`、可见模块、默认项目；替换硬编码 Brandon/leader | §鉴权与用户 | user 硬编码，无登录页 |
| 3 | **权限模型改造**：按钮显隐/禁用改由 `capabilities` + 资源 `allowedActions` 驱动，删除 SettingsPage 的 `role==='leader'\|\|'pm'` 硬判与 TasksPage 纯 status 驱动的操作按钮 | §权限返回值（明确禁止仅按 role 推导） | 违反契约 |
| 4 | **`GET /config/effective` 驱动导航与 ModuleGate**：可见模块、只读配置、capabilities 来自服务端，而非本地 `moduleSettings` state | §平台配置 | ModuleGate 读本地 state |
| 5 | **React Query 真正启用**：把 AppContext 的服务端数据（tasks/requirements/conversations/changes/agents/repos/kb/skills/audit/config）迁移为 `useQuery`/`useMutation`，配 query key 与失效策略 | §前端架构（已挂载待接入） | QueryClient 空挂载 |

### P1 — 核心业务页面接 API

| # | 差距 | 涉及 README | 现状（mock/本地） |
| --- | --- | --- | --- |
| 6 | **任务列表/详情/事件**：`GET /tasks`（cursor 分页、过滤）、`GET /tasks/{id}`、`GET /tasks/{id}/events`（sequence 排序）、`GET /tasks/{id}/executions|result` | §任务执行审批 | tasks 全 mock，events 由 mock.ts 拼装 |
| 7 | **任务写操作接 mutation**：`POST /tasks`（CreateTaskDialog）、`/tasks/{id}/assign`、`/execute`（含 `confirm`/`expectedTaskVersion`）、`/retry`、`/cancel`；`PATCH /tasks/{id}`（tokenBudget/mode） | §任务执行审批 | `addTask`/`updateTaskStatus`/`updateTaskMode` 仅本地 |
| 8 | **审批流**：`GET /approvals`、`/approvals/{id}`、`/approve`、`/reject`；TasksPage "批准执行"应走 approval 而非直接改 task 状态 | §任务执行审批 | 直接 `updateTaskStatus('assigned')` |
| 9 | **工作台会话与流式聊天**：`GET/POST /conversations`、`GET /conversations/{id}/messages`、`GET /conversations/{id}/outputs/summary`、`POST /chat/stream`（NDJSON：accepted/status/delta/entity/done/error 帧，按 sequence 拼接） | §会话消息 NDJSON | `sendMessage`+`setTimeout 650ms`+固定回复文案 |
| 10 | **仓库文件/提交/diff**：`GET /repositories/{id}/tree|file|commits|diff|refs|status`；Workspace 与 Repositories 两页共享 | §仓库文件 Git/SVN | `repositoryTree`/`codePreview`/硬编码 commits |
| 11 | **变更审查接 API**：`GET /tasks/{id}/changes`、`/changes/{id}/diff`、`POST /changes/{id}/accept|reject`（reject 可能触发 VCS_REVERT 审批）、`GET /tasks/{id}/artifacts`、`POST /artifacts/{id}/push|commit` | §仓库 Diff 回滚 | `reviewChange` 仅改本地 status |
| 12 | **需求分析异步流**：`POST /requirements/{id}/analyze`（202 + operationId）、`GET /operations/{id}` 轮询、`GET /requirements/{id}/specs`；当前"解析需求"只改本地状态标签 | §需求 Spec 模板 | `statusOverrides` 本地 state |
| 13 | **实时事件层**：`src/realtime/` WS（`POST /events/tickets` → `GET /events/ws?ticket=`）或 SSE（`GET /events/stream`，`Last-Event-ID` 续传）；订阅 task/execution/approval/agent/changes 事件并失效对应 query；按 `version` 忽略旧事件 | §实时事件 | 无，全靠用户手动点击 |

### P2 — 管理类页面接 API

| # | 差距 | 涉及 README | 现状 |
| --- | --- | --- | --- |
| 14 | **Agent 管理**：`GET/POST /agents`、`/agents/{id}`、`/credentials/rotate|revoke`、`/agents/{id}/knowledge-bases|skills`（PUT 整体绑定）、心跳 | §Agent Connector | agents mock import，凭证为占位文案 |
| 15 | **Squad**：`GET/POST /squads`、`/squads/{id}/members` | §Squad | 页面内 `initialSquads` 常量 |
| 16 | **知识库**：`GET/POST /knowledge-bases`、`/{id}/health-check`、`/agents` 绑定（PUT） | §ContextDB | 页面内 `initialKnowledgeBases` 常量 |
| 17 | **Skill**：`GET/POST /skills`、`/versions`、`/deprecate|activate`、`/agents` 绑定、`/download`；任务级 `GET/PUT /tasks/{id}/skills` | §Skill | 页面内 `initialSkills`/`initialBindings` 常量 |
| 18 | **仓库注册与测试**：`POST /repositories`、`/test`、`/reverts`、`/status` | §仓库 | `handleConnect` 仅本地新增 |
| 19 | **Dashboard/Metrics/Audit**：`GET /dashboard/summary|timeseries|task-distribution`、`/metrics`、`/audit-logs`（cursor 分页）；Recharts 真正用于趋势图 | §Dashboard | `trendSeries`/`auditEvents` 硬编码，CSS 柱状图 |
| 20 | **平台配置 PUT**：`PUT /config/modules/{key}`（核心模块 `confirm` DTO + 422）、`/runtime`、`/token-budget`、`/security`、`/backup`、`/notifications`（均带 version 乐观锁 + 409）；`GET /backups`、`POST /backups/{id}/verify` | §平台配置 | `saveConfig` 仅 `setSavedConfig` 本地 |
| 21 | **用户/账号管理页缺失**：README 有 `/users` 全套 RBAC，前端**无对应页面**（accounts 模块无路由） | §鉴权用户 | 页面不存在 |

### P3 — 体验与一致性增强

| # | 差距 | 说明 |
| --- | --- | --- |
| 22 | 分页：列表（tasks/requirements/audit 等）改 cursor 分页，替换"加载更多"本地切片 | README 列表统一 cursor+limit |
| 23 | 错误码处理：统一对接 `error.code`（STATE_CONFLICT/VERSION_CONFLICT/MODULE_DISABLED/TOKEN_BUDGET_EXCEEDED 等），409 时重拉资源 + allowedActions | §错误格式 |
| 24 | Recharts 启用：AnalyticsPage 趋势图改用 Recharts（已装未用），README 已声明 | §前端架构 |
| 25 | 时间/ID 规范化：mock 中 `updatedAt:'3 分钟前'`、`dueAt:'今天 18:00'`、`id:'CC-2026-031'` 等展示型字段，接 API 后须改为 UTC ISO 8601 + UUID，前端做格式化；displayId 与权限判断分离 | §协议约定 |
| 26 | 多页 state 一致性：RepositoriesPage 把 `projects` 复制进本地 `useState`，与 AppContext 脱钩；AgentsPage/Knowledge/Skills 直接 import mock 不经 Context——接 API 后应统一收敛到 query 缓存，避免多份数据源 | 架构一致性 |

---

## 4. 前端架构现状小结

- **技术栈**：React 19 + TS + Vite 7 + React Router 7 + @tanstack/react-query 5（空挂载）+ recharts 3（未用）+ lucide-react + Vitest + Playwright。
- **目录**：`components/`（AppShell/layout/ui/ToastProvider/CreateTaskDialog）、`pages/`（9 页）、`state/`（AppContext + task-transitions 状态机 + toast）、`data/mock.ts`（唯一数据源）、`types.ts`（领域类型，与 README 枚举基本对齐）。
- **`api/client.ts` 是否存在**：**否**。`src/api/`、`src/queries/`、`src/realtime/` 三个 README 建议目录均不存在。
- **React Query 使用情况**：`QueryClientProvider` 已在 `main.tsx` 挂载（staleTime 30s, retry 1），但**全仓 0 个 `useQuery`/`useMutation`**——纯空壳，缓存/失效/重试能力全部闲置。
- **state 结构**：`AppContext`（`useState` 承载 tasks/requirements/conversations/changes/moduleSettings + user/projects 常量 + 12 个 setter）+ 各页局部 `useState`（Agents/Repositories/Knowledge/Skills 直接 import mock 存局部 state，与 Context 脱钩）。`user` 硬编码 leader。任务状态机 `task-transitions.ts` 与 README 一致。Toast 为独立 Context。
- **总评**：作为原型，交互完成度、视觉一致性、可访问性（aria/键盘/ reduced-motion）、测试覆盖（Vitest + Playwright 九路由五视口）都达到很高水准；但**它是一个没有后端的精装样板间**——所有数据 mock、所有写操作本地、无网络层、无实时层、无权限模型、无登录。接入后端需从 P0 基础设施起步，逐页把 mock 与本地 state 替换为 React Query + API，并补齐实时事件与 RBAC。
