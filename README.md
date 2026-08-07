# CodingCenter Web

CodingCenter Web 是多 Agent 协同编码调度平台的前端原型。它面向员工、Leader 和 PM，覆盖任务看板、需求与 Spec、Agent/Connector 管理、项目工作台、对话提炼、代码变更审查、Token 预算和平台配置。

当前仓库只包含前端服务。页面数据来自 `src/data/mock.ts`，交互状态保存在 React Context 中，刷新页面后会恢复为初始数据。生产接入时应以本文的后端契约为准，将 mock 数据和 Context 写操作替换为 API 与实时事件。

当前版本面向 PC 浏览器，默认优化分辨率为 `1920x1080`，并覆盖 `1600x900`、`1440x900`、`1366x768` 和 `1280x720`。移动端仅保留基础回退，不作为上线验收目标。

## 页面范围

| 路由 | 页面 | 当前前端能力 |
| --- | --- | --- |
| `/tasks` | 任务管理 | 分组任务列表、项目焦点舞台、文件夹队列、项目时间线和智能详情 |
| `/workspace?project={id}` | 开发工作台 | 项目/分支工具栏、文件树、代码预览、Agent 会话、会话产出和 Diff 审查 |
| `/requirements` | 需求管理 | 状态筛选、需求进度、Spec 版本和关联任务 |
| `/agents` | Agent 与小队 | Agent 健康状态、运行位置、Token 预算、技能绑定和小队视图 |
| `/repositories` | 版本库 | 仓库状态、分支、文件树、代码预览、提交记录和关联任务 |
| `/knowledge` | 知识库 | ContextDB 来源、健康检查、活动记录和 Agent 绑定 |
| `/skills` | 技能管理 | Skill 目录、版本状态、权限、调用统计和 Agent 绑定 |
| `/analytics` | 可观测中心 | Token/时长/成功率趋势、Agent 健康和审计追踪 |
| `/settings` | 设置中心 | 模块开关、运行预算、安全备份和通知策略 |

根路径 `/` 自动跳转到 `/tasks`。工作台项目通过 `?project=` 写入 URL；未知路径展示前端 404，已禁用模块展示模块锁定状态。

## 前端架构

- React 19 + TypeScript：页面与业务类型。
- Vite 7：本地开发、构建和静态资源服务。
- React Router：页面路由和工作台导航。
- 路由按页面懒加载，并提供 Suspense 载入态、错误边界、404 和模块禁用态。
- TanStack React Query：后端请求缓存、失效和重试。当前原型已挂载 Query Client，待接入 API client。
- React Context：仅承载原型期的本地可变状态；生产环境不应将它作为服务端数据真相源。
- URL 状态：工作台项目写入 `?project=`，支持刷新恢复、分享和浏览器前进后退。
- 领域约束：任务状态更新统一经过前端状态机；后端仍须重复校验所有转换。
- 全局反馈：Toast 队列为创建、审批、审查和配置操作提供一致的 `aria-live` 反馈。
- Recharts：Dashboard 指标图表。
- Lucide React：操作按钮和状态图标。
- Vitest + Testing Library：组件与交互测试。
- Playwright：九个业务路由、五档 PC 视口、滚动边界、键盘交互和无障碍媒体偏好的布局回归。

## 设计与布局

- 共享 Shell 使用固定 `100dvh` 工作区。页头和摘要自然占高，主工作台填满剩余空间，长内容只在列表、正文、文件树或 Inspector 内部滚动。
- `PageHeader`、`SummaryStrip` 和 `WorkbenchLayout` 统一页面边缘、模块间距和主区/Inspector 等高规则。
- 开发工作台的页头与其他页面一样位于透明页面画布上；白色阅读表面仅包裹项目工具栏和三栏工作区。
- 任务看板使用横向项目焦点轨道。项目文件夹保留实体厚度、玻璃材质、绿色选中态、Hover 预览、键盘切换、两侧渐隐和右下角切换器。
- 主面板和 Inspector 使用高不透明度阅读表面；侧栏、顶栏、弹窗和浮动工具条使用较强的半透明材质，避免多层玻璃叠加影响可读性。
- 控件提供统一的按下反馈和 `:focus-visible` 轮廓，并支持 `prefers-reduced-motion`、`prefers-reduced-transparency` 和 `prefers-contrast: more`。
- 品牌图标位于 `public/coding-center-mark.svg`，同时用于左上角品牌标记和浏览器 favicon。

样式职责：

```text
src/styles.css             共享设计 token、组件视觉和页面内部样式
src/layout-redesign.css    Shell、PC 断点、工作台几何和滚动边界
src/resource-pages.css     需求、Agent、仓库、知识库和 Skill 页面
src/secondary-pages.css    可观测中心和设置中心
```

主要目录：

```text
public/
  coding-center-mark.svg   品牌图标与 favicon
src/
  components/       页面框架和复用组件
  data/mock.ts      原型数据
  pages/             九个业务页面
  state/            原型期本地状态、任务状态机、Toast Context
  main.tsx          Router、React Query 和应用入口
  types.ts          前端业务类型与状态枚举
e2e/
  layout.spec.ts    PC 布局与交互回归测试
```

接入后端时建议增加：

```text
src/
  api/client.ts     鉴权、错误解析、幂等键和请求封装
  api/*.ts          按领域拆分的接口函数
  queries/*.ts      React Query keys、queries 和 mutations
  realtime/         WebSocket/SSE 连接、重连和缓存失效
```

## 本地运行

要求 Node.js `20.19+` 或 `22.12+`，推荐使用当前 Node.js LTS。

```bash
corepack enable
pnpm install
pnpm dev
```

开发服务默认监听 [http://127.0.0.1:4173](http://127.0.0.1:4173)。

其他命令：

```bash
pnpm build        # TypeScript 检查并生成生产构建
pnpm preview      # 本地预览生产构建
pnpm lint         # ESLint 检查
pnpm test         # Vitest 组件与交互测试
pnpm test:layout  # Playwright PC 布局与浏览器交互测试
```

后端接入建议使用以下环境变量：

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_WS_URL=ws://127.0.0.1:8000/api/v1/events/ws
```

不得把仓库、知识库、Agent 或用户密钥放入 `VITE_*` 变量。Vite 会将这些变量编译进浏览器产物。

## 后端契约总则

### 协议约定

- API 前缀：`/api/v1`。
- 普通请求和响应使用 `application/json; charset=utf-8`，字段统一使用 `camelCase`。
- ID 使用不可猜测的 UUID 或同等强度字符串。展示编号可另设 `displayId`，不能作为权限判断依据。
- 时间使用 UTC ISO 8601，例如 `2026-08-05T08:30:00Z`。时长统一为毫秒，Token 数为非负整数。
- 访问令牌通过 `Authorization: Bearer <accessToken>` 发送。Web 端 refresh token 应存放在 `HttpOnly + Secure + SameSite` Cookie 中。
- 密钥、凭证、refresh token 和仓库绝对路径均为 write-only；查询接口只返回 `configured: true`、尾号或掩码。
- 单资源成功响应为 `{ "data": { ... } }`。列表响应为 `{ "data": [...], "page": { "nextCursor": null, "hasMore": false } }`。
- 列表统一支持 `cursor`、`limit`，默认 `limit=30`，最大 `100`；领域接口可增加 `status`、`ownerId`、`repositoryId`、`q`、`from`、`to` 等过滤参数。
- 创建异步操作返回 `202 Accepted`，响应至少包含 `operationId` 或 `executionId`、当前状态和可选的 `approvalId`。
- 资源应带整数 `version`。更新使用 `If-Match: <version>` 或请求体 `version` 做乐观锁，冲突返回 `409 VERSION_CONFLICT`。
- 删除用户、Agent、Squad、知识库、Skill、仓库和会话时默认软删除、禁用或废弃，不物理清除审计链路。
- 二进制下载、Skill 上传、NDJSON 和实时事件是响应 envelope 的例外。

成功响应示例：

```json
{
  "data": {
    "id": "task-7e4f",
    "version": 4,
    "allowedActions": ["execute", "cancel", "editTokenBudget"]
  }
}
```

### 权限返回值

前端不得仅根据 `role` 推导按钮权限。后端是授权真相源，必须同时提供：

- `GET /auth/me` 中的全局 `capabilities: string[]`，例如 `task.assign`、`requirement.analyze`、`vcs.revert`。
- 每个资源中的 `allowedActions: string[]`，例如 `edit`、`analyze`、`execute`、`approve`、`rejectChanges`。

前端用这些字段控制入口和按钮，后端仍须在每次请求时重新鉴权。`allowedActions` 只用于改善体验，不是安全边界。

平台说明对 PM 权限有冲突：角色总表规定 PM 不直接分配或取消任务，任务章节又写 leader/pm 可取消或触发执行。实现时以服务端返回的 `capabilities` 和资源级 `allowedActions` 为唯一权威，不在前端硬编码冲突规则。建议默认基线为 PM 负责查看、分析、拆解和模板管理，Leader 负责分配、取消及高风险执行；部署方可通过策略配置调整。

## 状态与枚举

```ts
type HumanRole = 'employee' | 'leader' | 'pm'
type UserStatus = 'active' | 'disabled'

type AgentKind = 'digital' | 'coder' | 'qa' | 'assistant'
type AgentStatus = 'idle' | 'busy' | 'offline' | 'stale'
type RuntimeMode = 'local' | 'cloud'
type ConnectorStatus = 'online' | 'offline' | 'stale'

type RequirementStatus = 'draft' | 'analyzing' | 'in_progress' | 'done' | 'cancelled'
type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'awaiting_approval'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
type ExecutionStatus =
  | 'queued'
  | 'awaiting_approval'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
type ExecutionMode = 'manual' | 'auto' | 'full'
type Priority = 'low' | 'medium' | 'high' | 'urgent'

type ApprovalAction = 'TASK_EXECUTE' | 'VCS_REVERT' | 'ARTIFACT_PUSH'
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'

type VcsKind = 'git' | 'svn'
type PushStatus = 'not_started' | 'pushing' | 'succeeded' | 'failed'
type ChangeStatus = 'pending' | 'accepted' | 'rejected'
type KnowledgeHealth = 'healthy' | 'degraded' | 'unreachable' | 'disabled'
type SkillStatus = 'active' | 'deprecated'
type OperationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
```

核心状态机：

- 需求：`draft -> analyzing -> in_progress -> done | cancelled`。每次分析都生成新的不可变 Spec 快照。
- 任务：`pending -> assigned -> running -> succeeded | failed | cancelled`；需要审批时在执行前进入 `awaiting_approval`。失败任务可通过重试生成新 execution，不覆盖旧 execution。
- Agent：`idle <-> busy`；心跳超时进入 `stale`，明确下线进入 `offline`。回收任务后才能重新分配。
- `manual`：显式执行请求后创建审批；本地模式批准后回到可拉取的 `assigned`，云端模式批准后进入 `running`。
- `auto`：可自动执行，`VCS_REVERT` 等高危动作仍创建审批。
- `full`：允许自主执行，不创建业务审批，但仍鉴权、留审计并受 Token 限流。
- `tokenBudget=0` 和 Agent 周期预算 `limit=0` 表示不限额；不是“禁止使用”。`contextUsage` 为 `0..100`，超过 `80` 时前端告警。

## 鉴权、用户与 RBAC

### Auth 与用户接口

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `POST` | `/auth/login` | `{ email, password, deviceName }`；返回 user、短期 access token、过期时间、capabilities，并设置 refresh cookie |
| `POST` | `/auth/refresh` | 轮换 refresh token，撤销旧 token，返回新 access token |
| `POST` | `/auth/logout` | 撤销当前 refresh session |
| `POST` | `/auth/logout-all` | 撤销当前用户所有设备 session |
| `GET` | `/auth/me` | 当前用户、角色、全局 capabilities、可见模块和默认项目 |
| `PATCH` | `/users/me` | 仅修改姓名、头像、偏好等非关键字段 |
| `GET` / `POST` | `/users` | 用户列表与创建；列表支持 role/status/q |
| `GET` / `PATCH` | `/users/{userId}` | 用户详情；修改角色或状态需要对应 capability |
| `POST` | `/users/{userId}/disable` | 禁用用户，不物理删除 |
| `POST` | `/users/{userId}/sessions/revoke` | 强制下线该用户全部设备 |

推荐 RBAC 基线：

| 主体 | 默认范围 |
| --- | --- |
| employee | 自己的会话、需求及关联任务/结果；可提交和取消自己的需求；查看授权项目与面向员工的 Digital/Assistant |
| leader | 全量业务数据；任务分配/取消/执行；审批高危操作；用户、Agent、Squad、配置、仓库和审计管理 |
| pm | 全量需求/任务可见；需求分析、任务拆解、模板和规划；分配/取消/执行是否开放由 capabilities 决定 |
| digital | 仅访问绑定用户/会话；可代用户创建需求、修改自己代提交的 draft；不可调度或回写执行结果 |
| coder / qa | 仅访问自己承接的 task、execution、上下文与产出；可 claim、上报进度和结果，不可操作其他任务 |
| assistant | MVP 可按配置承担对话与执行，但每次调用仍按任务 scope 和 capabilities 校验 |

Agent 使用独立凭证，不复用用户 access token。服务端必须从凭证解析 Agent 身份和任务 scope，不能信任请求体里的 `agentId`。

## 需求、Spec 与模板

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` / `POST` | `/requirements` | 查询或创建需求；创建字段：`title`、`description`、`priority`、`repositoryId?`、`conversationId?`、`templateId?`、`templateValues?` |
| `GET` / `PATCH` | `/requirements/{id}` | 详情与编辑；普通提交者和 Digital 仅可修改 draft |
| `POST` | `/requirements/{id}/analyze` | 异步分析、创建不可变 Spec 和任务；返回 `202 { operationId, requirement }` |
| `POST` | `/requirements/{id}/cancel` | `{ reason }`；取消需求并级联取消尚未终态的任务 |
| `GET` | `/requirements/{id}/specs` | 按版本倒序返回 Spec 快照 |
| `GET` | `/requirements/{id}/specs/{version}` | 指定不可变 Spec；含分析输入、结构化 spec、估算依据和创建者 |
| `GET` / `POST` | `/requirement-templates` | 模板列表与创建 |
| `GET` / `PATCH` / `DELETE` | `/requirement-templates/{id}` | 模板详情、更新、停用 |
| `POST` | `/requirement-templates/{id}/render` | `{ variables }`；由服务端安全渲染 `{date}` 等占位符并返回预填字段 |
| `GET` | `/operations/{operationId}` | 查询分析等后台操作状态和失败原因 |

Requirement 应返回 `owner`、`createdByActor`、`repository`、`currentSpecVersion`、任务计数、`allowedActions`。Digital 代提交时，`ownerUserId` 必须由绑定关系确定，不能允许任意冒充。

## 任务、执行、审批与结果

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` / `POST` | `/tasks` | 查询或管理侧创建任务；支持 requirement/repository/agent/squad/status/priority 过滤；任务摘要返回 `contextUsage` |
| `GET` / `PATCH` | `/tasks/{id}` | 详情与编辑；响应包含 `contextUsage`；`executionMode`、`tokenBudget`、仓库 ref/path 仅可在允许状态修改 |
| `POST` | `/tasks/{id}/assign` | `{ agentId }` 或 `{ squadId }` 二选一；并发占用冲突返回 409 |
| `POST` | `/tasks/{id}/execute` | `{ confirm: true }`；返回 execution，或需要审批时返回 approval 和 `awaiting_approval` |
| `POST` | `/tasks/{id}/retry` | 为失败任务创建新 execution，保留历史结果 |
| `POST` | `/tasks/{id}/cancel` | `{ reason }`；取消任务并通知运行时停止当前 execution |
| `GET` | `/tasks/{id}/executions` | 执行历史、模型、时长、Token、状态和 failureReason |
| `GET` | `/tasks/{id}/events` | 游标分页读取执行事件；返回 `type`、`title`、`description`、`sequence`、`createdAt` 和可选 detail |
| `GET` | `/tasks/{id}/result` | 最新成功或终态结果、output、artifacts、commitHash、pushStatus |
| `GET` | `/approvals` | 待审批列表；支持 action/status/requester/target 过滤 |
| `GET` | `/approvals/{id}` | 风险说明、目标资源、请求参数摘要与 allowedActions |
| `POST` | `/approvals/{id}/approve` | `{ comment? }`；审批后由服务端继续原操作 |
| `POST` | `/approvals/{id}/reject` | `{ comment }`；拒绝后恢复/更新目标状态 |

任务列表、创建和详情响应中的 `contextUsage` 统一为 `0..100` 的整数百分比，表示当前任务已占用的有效上下文窗口比例；未知时返回 `null`，不能用 `0` 代替未知。服务端可同时返回 `contextTokens`、`contextLimitTokens` 和 `contextMeasuredAt` 供诊断，但前端当前告警直接以 `contextUsage > 80` 为准。

执行请求示例：

```json
{
  "confirm": true,
  "expectedTaskVersion": 7
}
```

```json
{
  "data": {
    "task": { "id": "task-1", "status": "awaiting_approval", "version": 8 },
    "executionId": "exec-1",
    "approvalId": "approval-1"
  }
}
```

Agent/Connector 回写接口：

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `POST` | `/runtime/tasks/{taskId}/claim` | 原子领取任务；校验 Agent、Connector、execution 和 task scope |
| `POST` | `/runtime/executions/{executionId}/started` | 上报实际启动时间、模型和 CLI/runtime 版本 |
| `POST` | `/runtime/executions/{executionId}/progress` | `{ sequence, phase, message, progress, tokenUsageDelta }`；sequence 单调递增 |
| `POST` | `/runtime/executions/{executionId}/result` | `{ status, output, tokenUsage, model, artifacts, commitHash?, pushStatus?, failureReason? }` |

所有 runtime 回写必须携带 `Idempotency-Key`。服务端只允许 execution 对应的 Agent 回写，并以 `(executionId, idempotencyKey)` 和进度 `sequence` 双重去重，避免重复 Token 计数和乱序覆盖。

`GET /tasks/{id}/events` 必须按 `sequence` 稳定排序，至少覆盖 `created`、`assigned`、`approval`、`started`、`checkpoint`、`completed`、`failed` 和 `cancelled`。事件是追加式审计记录，不允许客户端改写；敏感 runtime payload 应只返回脱敏摘要。

Token 使用建议统一结构：

```json
{
  "input": 12000,
  "output": 3500,
  "cachedInput": 2400,
  "total": 15500,
  "normalizedModel": "codex",
  "rawModel": "provider/model-version"
}
```

## Agent、Connector 与 Squad

### Agent

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` | `/agents` | Agent 列表；支持 kind/status/runtimeMode/q，查询响应不包含任何 credential secret |
| `POST` | `/agents` | 注册 Agent；请求字段含 name/kind/runtimeMode/model/config/executionMode/tokenBudgetPeriod；响应一次性签发独立 credential |
| `GET` / `PATCH` / `DELETE` | `/agents/{id}` | 详情、配置修改、注销；DELETE 为软注销并撤销凭证 |
| `POST` | `/agents/{id}/credentials/rotate` | 轮换独立 Agent 凭证；secret 只在本次响应出现 |
| `POST` | `/agents/{id}/credentials/revoke` | 撤销全部或指定凭证 |
| `POST` | `/runtime/agents/heartbeat` | Agent 心跳；服务端从凭证识别 Agent |
| `GET` / `PUT` | `/agents/{id}/knowledge-bases` | 查询或整体更新知识库绑定 ID 列表 |
| `GET` / `PUT` | `/agents/{id}/skills` | 查询或整体更新 Skill 版本绑定 |

`tokenBudgetPeriod` 建议为 `{ "period": "day|week|month", "limit": 300000, "used": 120000, "resetsAt": "..." }`。

`POST /agents` 注册响应示例：

```json
{
  "data": {
    "agent": { "id": "agent-atlas", "name": "Atlas Coder", "kind": "coder", "version": 1 },
    "credential": {
      "id": "cred-0198",
      "secret": "cc_agent_once_only",
      "createdAt": "2026-08-05T08:30:00Z"
    }
  }
}
```

`credential.secret` 仅在注册或轮换成功的这一次响应中出现，服务端只保存不可逆摘要；之后的 Agent 列表、详情、日志和审计均不得回显。调用方丢失 secret 时只能轮换，不能查询找回。

### Connector

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `POST` | `/runtime/connectors/register` | 注册本地 Connector；上报 cliKind、版本、可执行路径摘要、OS 和能力；返回一次性凭证 |
| `POST` | `/runtime/connectors/heartbeat` | 上报 online/busy、当前 execution 和环境健康信息 |
| `GET` | `/runtime/connectors/tasks/pull` | 长轮询拉取任务；支持 `waitSeconds<=30`，过滤 manual 未批准任务 |
| `GET` | `/connectors` | 管理侧列表；支持 online/offline/stale、owner、cliKind 过滤 |
| `GET` / `PATCH` | `/connectors/{id}` | 管理侧详情、禁用和云端回退配置 |
| `POST` | `/connectors/{id}/credentials/rotate` | 轮换 Connector 凭证 |

心跳超时阈值由服务端配置。Connector stale/offline 后，本地任务应保持可解释的挂起状态并产生事件；reclaim 必须原子化，旧 Connector 的迟到结果不得覆盖新 execution。

### Squad

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` / `POST` | `/squads` | 列表和创建，创建字段 `{ name, leadAgentId }` |
| `GET` / `PATCH` / `DELETE` | `/squads/{id}` | 详情、修改、解散；DELETE 不物理删除历史关系 |
| `POST` | `/squads/{id}/members` | `{ agentId, role: 'lead|coder|qa' }` |
| `DELETE` | `/squads/{id}/members/{agentId}` | 移除成员，运行中任务需先处理归属 |

## 仓库、文件、Git/SVN、Diff 与回滚

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` / `POST` | `/repositories` | 仓库列表与注册；Git 使用 `url?`、`localPath?`、`defaultBranch`，SVN 使用 `repositoryUrl?`、`localPath?`、`trunkPath`、`tagsPath?`；均含 `vcs` 和 write-only 凭证 |
| `GET` / `PATCH` / `DELETE` | `/repositories/{id}` | 详情、修改、禁用；不返回明文凭证或绝对本地路径 |
| `POST` | `/repositories/{id}/test` | 测试 URL/path、凭证和 Git 默认 branch 或 SVN trunk，返回结构化诊断 |
| `GET` | `/repositories/{id}/refs` | Git 返回 branch/tag/HEAD；SVN 返回 trunk/tag 逻辑位置及各自最新 `revision` |
| `GET` | `/repositories/{id}/status` | 通用 clean/modified/syncing 摘要；Git 另含 ahead/behind，SVN 另含 workingRevision/remoteRevision |
| `GET` | `/repositories/{id}/commits` | Git 用 `ref` 查询并返回 `commitHash`、parents、refs；SVN 用 `location`、`revision?` 查询并返回数值 `revision`、changedPaths |
| `GET` | `/repositories/{id}/tree` | Git 使用 `ref`；SVN 使用 `location=trunk|tag:{name}` 和 `revision?`；均支持 `path`、`depth<=3` |
| `GET` | `/repositories/{id}/file` | Git 使用 `ref`，SVN 使用 `location` 和 `revision?`；返回 content/encoding/language/size/contentHash |
| `GET` | `/repositories/{id}/diff` | Git 使用 `base/head/path?`；SVN 使用 `location/fromRevision/toRevision/path?`；返回文件摘要和 unified diff |
| `POST` | `/repositories/{id}/reverts` | 判别式 DTO；Git 创建 revert commit，SVN 对已提交 revision 执行反向合并并提交新 revision；两者均可能先创建审批 |
| `GET` | `/tasks/{taskId}/changes` | 当前任务文件变更、增删行数和审查状态 |
| `GET` | `/tasks/{taskId}/changes/{changeId}/diff` | 单文件 diff，支持分页/分块 |
| `POST` | `/tasks/{taskId}/changes/{changeId}/accept` | 标记接受并审计，不直接信任客户端 diff 内容 |
| `POST` | `/tasks/{taskId}/changes/{changeId}/reject` | `{ reason, confirm: true }`；服务端按 VCS 与变更是否已提交选择安全恢复方式，必要时创建 VCS_REVERT 审批 |
| `GET` | `/tasks/{taskId}/artifacts` | 代码产出引用、`vcs`、Git `commitHash?`/SVN `revision?`、目标 ref/location 和 publishStatus |
| `POST` | `/tasks/{taskId}/artifacts/{artifactId}/push` | 仅 Git：`{ branch, confirm: true }`；异步执行 push 并完整审计 |
| `POST` | `/tasks/{taskId}/artifacts/{artifactId}/commit` | 仅 SVN：`{ location, message, confirm: true }`；提交已审查工作副本并返回新 revision |

仓库响应必须返回能力矩阵，前端据此显示或禁用操作，不能仅根据 `vcs` 猜测部署能力：

```json
{
  "capabilities": {
    "listRefs": true,
    "readHistory": true,
    "readAtRevision": true,
    "diff": true,
    "revertCommitted": true,
    "discardWorkingChanges": true,
    "push": false,
    "commit": true,
    "createTag": true
  }
}
```

| 语义 | Git | SVN |
| --- | --- | --- |
| 当前开发线 | `branch`，可指向 commit/tag | `location`，值为 `trunk` 或 `tag:{name}`；具体快照由正整数 `revision` 标识 |
| 标签 | tag ref；发布到远端需 push | `tagsPath/{name}`；通过服务端 `svn copy trunk@REV tags/name` 创建，不视为分支 push |
| 撤销已提交变更 | `git revert <commitHash>` 生成新 commit | `svn merge -c -<revision>` 反向合并到已注册工作副本，再 `svn commit` 生成新 revision |
| 丢弃未提交变更 | 仅恢复服务端计算出的任务文件集合 | `svn revert` 仅用于同一受控文件集合；它不能撤销仓库中的历史 revision |
| 发布产出 | `push` 指定 branch | SVN 没有 push；使用 `commit` 将工作副本变更提交到 trunk 或明确授权的 tag location |

回滚请求体必须带 `vcs` 判别字段，不能把 SVN revision 填入 `commitHash`：

```json
{ "vcs": "git", "commitHash": "9a24f31", "branch": "main", "reason": "审查拒绝", "confirm": true, "taskId": "task-1" }
```

```json
{ "vcs": "svn", "revision": 1842, "location": "trunk", "commitMessage": "Revert r1842: 审查拒绝", "reason": "审查拒绝", "confirm": true, "taskId": "task-1" }
```

### 版本库安全要求

- 本地仓库根目录只能由具备配置权限的用户预先注册。文件 API 不接受客户端提供任意绝对路径。
- 对每个 path 做 URL 解码、规范化和真实路径解析；最终路径必须等于仓库根或以 `repoRoot + pathSeparator` 开头，且符号链接解析后仍在根目录内。
- 文件树默认深度不超过 3，每目录不超过 500 项，排除 `.git`、`node_modules`、`.next` 等目录，并返回 `truncated` 标志。
- 文件预览上限为 512 KiB。二进制返回 `415 BINARY_FILE_UNSUPPORTED`，超限返回 `413 FILE_TOO_LARGE`；不要把二进制内容误解码后返回。
- Git/SVN 命令必须使用 `execFile` 或等价的参数数组调用，禁止 shell 拼接。Git commit hash 仅接受 `^[0-9a-f]{7,40}$`；SVN revision 必须是正整数；branch/ref、trunk/tag location 均须经对应 VCS 原生校验并限制在已注册仓库内。
- Git 已提交历史只允许通过 `git revert` 生成新 commit，禁止 `reset --hard`；SVN 已提交历史只允许反向合并后再提交新 revision，`svn revert` 只用于丢弃未提交工作副本变更。两类操作都要求 `vcs.revert` capability、二次确认、审批策略和审计记录。
- Git push 或 SVN commit 前必须确认目标 branch/location。失败时记录 `publishStatus=failed` 与脱敏 `publishError`，清理失败产生的本地临时状态，不伪造远端成功；SVN 请求不得执行名为 push 的伪操作。
- 仓库凭证加密独立存储，任何查询、日志、事件和 Agent 上下文都不得回显。远端 URL 应限制协议并防止 SSRF。
- Diff 和日志响应应设置总大小、单文件和耗时上限，超限时分页或返回可重试的截断结果。

## 会话、消息与 NDJSON 聊天

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` / `POST` | `/conversations` | 查询或新建会话；创建字段 `{ title?, repositoryId?, digitalAgentId?, requestedRuntimeMode? }` |
| `GET` / `PATCH` / `DELETE` | `/conversations/{id}` | 详情、软删除；PATCH 字段 `{ title?, repositoryId?, digitalAgentId?, requestedRuntimeMode?, version }`，严格校验 owner |
| `GET` | `/conversations/{id}/messages` | 游标分页读取历史消息和 entities |
| `GET` | `/conversations/{id}/outputs/summary` | 会话级产出摘要；返回关联需求、任务、状态计数和最近更新时间，供工作台右栏聚合展示 |
| `POST` | `/chat/stream` | 发送消息并以 NDJSON 流式返回 Digital 回复、实体和完成帧 |

创建、更新和详情响应均应返回 `digitalAgentId`、`requestedRuntimeMode`、服务端实际采用的 `effectiveRuntimeMode`，以及未发生回退时为 `null` 的 `fallbackReason`。`fallbackReason` 建议为 `{ code, message }`，例如 `CONNECTOR_STALE`；它是服务端调度结果，客户端不能写入。切换 Agent 或请求运行时只影响后续消息，不改写既有消息与产出归属。

`GET /conversations/{id}/outputs/summary` 至少返回 `counts: { requirements, tasks, running, completed }`、`requirements[]` 和 `tasks[]`。需求项包含 `id/title/status/priority/currentSpecVersion/updatedAt`；任务项包含 `id/title/status/progress/assignee/contextUsage/updatedAt`。关联关系由服务端依据 `conversationId` 聚合，不能接受客户端上传的 ID 列表作为真相源。

`POST /chat/stream` 请求：

```json
{
  "conversationId": "conv-1",
  "repositoryId": "repo-1",
  "clientMessageId": "0198-client-uuid",
  "content": "接入仓库文件树，并增加安全预览。"
}
```

请求必须带 `Idempotency-Key`。响应头：

```http
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

每帧是单行 JSON，并以 `\n` 结尾。允许的帧：

```json
{"type":"accepted","requestId":"req-1","userMessage":{"id":"msg-u1","role":"user","content":"...","createdAt":"..."}}
{"type":"status","phase":"thinking","label":"正在理解项目上下文"}
{"type":"delta","messageId":"msg-a1","sequence":1,"text":"我已"}
{"type":"delta","messageId":"msg-a1","sequence":2,"text":"整理需求"}
{"type":"entity","entity":{"type":"requirement","id":"req-1","title":"仓库文件树接入","status":"draft"}}
{"type":"entity","entity":{"type":"task","id":"task-1","title":"实现安全文件预览","status":"assigned"}}
{"type":"done","agentMessage":{"id":"msg-a1","role":"agent","content":"我已整理需求。","createdAt":"..."},"entities":[{"type":"requirement","id":"req-1","title":"仓库文件树接入","status":"draft"}],"fallback":"acp","usage":{"total":1830}}
{"type":"error","error":{"code":"DIGITAL_RUNTIME_UNAVAILABLE","message":"数字人暂时不可用","requestId":"req-1","retryable":true}}
```

约束：

- `fallback` 为 `acp | oneshot | template`，用于诊断和轻量提示，不影响消息结构。
- Hermes 回复末尾的 `---JSON---` 是后端内部协议。后端必须剥离该段、校验结构后再以 entity/done 帧返回，前端不得解析或展示原始控制行。
- `sequence` 必须递增；前端按顺序拼接 delta。服务端在 `accepted` 前持久化 user message，在 `done` 前持久化 agent message。
- HTTP 响应开始后发生的错误只能通过 `error` 帧表达。客户端断开不应重复创建需求；重试使用相同 `clientMessageId` 和幂等键。
- 服务端只注入当前会话最近消息和已授权项目上下文，不能读取其他用户会话或未授权仓库。
- 需求/任务创建失败可以降级为纯对话，但 `done` 应带 `sideEffectErrors`，供前端显示可重试状态。

## 知识库与 Skill

### ContextDB 知识库

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` | `/knowledge-bases` | 列表；支持 q/health/enabled，返回健康、检索参数、用量与绑定摘要字段 |
| `POST` | `/knowledge-bases` | 注册 MCP server；`name`、`description?`、`mcpServerUrl`、`authType`、write-only `credential?`、`config` |
| `GET` / `PATCH` / `DELETE` | `/knowledge-bases/{id}` | 详情、配置、禁用；credential 永不回显 |
| `POST` | `/knowledge-bases/{id}/health-check` | 立即检查可达性与凭证，返回 health、checkedAt、latencyMs 和安全错误摘要 |
| `GET` | `/knowledge-bases/{id}/agents` | 查看绑定 Agent |
| `PUT` | `/knowledge-bases/{id}/agents` | 整体更新绑定 ID 列表 |

知识库列表项至少包含 `id`、`name`、`description`、`mcpServerUrl`、`health`、`enabled`、`authType`、`credentialConfigured`、`lastCheckedAt`、`latencyMs`、`calls24h`、`boundAgentCount`、`config: { retrievalMode, topK, threshold }`、`version` 和 `allowedActions`。`health` 使用 `healthy | degraded | unreachable | disabled`；健康检查中的错误仅返回稳定 `code` 和脱敏 `message`，不得携带上游响应体或凭证。

平台只保存绑定、连接配置和凭证，不保存向量或记忆内容。检索参数作为不解释语义的 config 透传。MCP 不可达时应发告警事件并让 Agent 跳过该知识库，而不是阻塞全部执行。MCP URL 同样需要协议限制、SSRF 防护和凭证脱敏。

### Skill

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` / `POST` | `/skills` | 列表；创建可用 JSON manifest 或 multipart 上传能力包 |
| `GET` / `PATCH` | `/skills/{id}` | Skill 元数据；不能原地修改已发布版本内容 |
| `POST` | `/skills/{id}/versions` | 创建不可变版本，返回内容哈希和审计信息 |
| `GET` | `/skills/{id}/versions` | 版本历史 |
| `GET` | `/skills/{id}/versions/{version}` | 固定版本详情；返回 manifest、contentHash、permissions、作者/审核者、状态和创建时间 |
| `GET` | `/skills/{id}/versions/{version}/files` | 固定版本文件清单；返回 path、size、mimeType、contentHash，不返回根目录之外的路径 |
| `GET` | `/skills/{id}/versions/{version}/download` | 下载该不可变版本的归档；返回二进制、Content-Disposition 和内容哈希响应头 |
| `POST` | `/skills/{id}/versions/{version}/deprecate` | 废弃指定不可变版本，但保留已有任务引用 |
| `POST` | `/skills/{id}/versions/{version}/activate` | 恢复指定版本并将其设为默认，不改写版本内容 |
| `GET` / `PUT` | `/skills/{id}/agents` | 读取或整体更新 Agent 绑定；读取返回 Agent 摘要和固定的 Skill version |
| `GET` / `PUT` | `/tasks/{taskId}/skills` | 读取或更新任务绑定，为任务固定具体 Skill version 和 contentHash |

服务端注入执行上下文时必须使用任务记录的固定版本和内容哈希。脚本在沙箱/受限环境执行，并记录作者、审核者和调用审计。

## 平台配置与 Token 预算

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` | `/config/effective` | 当前用户可见模块、只读有效配置、capabilities；用于导航和功能降级 |
| `GET` | `/config/modules` | 七个模块开关及影响说明 |
| `PUT` | `/config/modules/{key}` | 版本化更新 `{ enabled, reason, version, confirm? }`；立即生效，核心模块必须提交 confirm DTO |
| `GET` / `PUT` | `/config/runtime` | 版本化运行配置：defaultExecutionMode、staleAfterMinutes、reclaimAfterMinutes、cloudFallback |
| `GET` / `PUT` | `/config/token-budget` | 版本化全局 Token 预算参数 |
| `GET` / `PUT` | `/config/security` | 版本化安全配置：sandboxScripts、credentialRotationDays、auditRetentionDays |
| `GET` / `PUT` | `/config/backup` | 版本化备份配置：enabled、scheduleTime、timeZone、verifyAfterCreate |
| `GET` / `PUT` | `/config/notifications` | 版本化通知配置：失败/预算/Agent 告警、每日摘要、邮箱和免打扰时段 |

模块 key：`knowledge`、`skills`、`task_dispatch`、`agents`、`repositories`、`accounts`、`dashboard`。

核心模块变更的 `confirm` DTO 示例：

```json
{
  "enabled": false,
  "reason": "计划维护窗口",
  "version": 5,
  "confirm": {
    "acknowledged": true,
    "moduleKey": "task_dispatch",
    "targetEnabled": false
  }
}
```

`risk=core` 时 `confirm` 必填，且 `moduleKey`、`targetEnabled` 必须与 URL 和目标状态一致；缺失或不一致返回 `422 CORE_MODULE_CONFIRMATION_REQUIRED`。普通模块可省略 `confirm`。服务端仍须校验 capability、资源 version，并把 reason、影响范围和操作者写入审计。

四类页面配置的 DTO 形状如下；PUT 使用同一形状提交完整配置，不能把其他分类字段混入请求：

```ts
type RuntimeConfigDto = {
  defaultExecutionMode: 'manual' | 'auto' | 'full'
  staleAfterMinutes: number
  reclaimAfterMinutes: number
  cloudFallback: boolean
  version: number
}

type SecurityConfigDto = {
  sandboxScripts: boolean
  credentialRotationDays: number
  auditRetentionDays: number
  version: number
}

type BackupConfigDto = {
  enabled: boolean
  scheduleTime: string
  timeZone: string
  verifyAfterCreate: boolean
  version: number
}

type NotificationConfigDto = {
  notifyTaskFailure: boolean
  notifyBudgetWarning: boolean
  notifyAgentStale: boolean
  dailyDigest: boolean
  email: string
  quietHours: {
    enabled: boolean
    start: string
    end: string
    timeZone: string
  }
  version: number
}
```

建议 Token 全局配置 DTO：

```json
{
  "monthlyTokenBudget": 1200000,
  "singleTaskTokenLimit": 32000,
  "budgetWarningThreshold": 80,
  "base": 24000,
  "complexityFactor": 1.25,
  "historyFactor": 1.1,
  "streamCheckIntervalTokens": 256,
  "version": 3
}
```

通知配置中的免打扰时段建议使用 `quietHours: { "enabled": true, "start": "22:00", "end": "08:00", "timeZone": "Asia/Hong_Kong" }`。上述 runtime、token-budget、security、backup、notifications 的 GET 响应和 PUT 请求都必须包含整数 `version`；PUT 成功后返回递增后的完整配置，冲突按总则返回 `409 VERSION_CONFLICT`。这些接口是后端接入契约，当前前端原型的保存按钮仍只更新本地状态。

任务通过 `PATCH /tasks/{id}` 设置 `tokenBudget`，Agent 通过 `PATCH /agents/{id}` 设置 `tokenBudgetPeriod`。预算采用预扣、增量计量和未消费退回；流式检查超额时终止 execution，设置 `failureReason.code=OVER_BUDGET` 并广播事件。

模块开关写入后立即生效并使缓存失效。被禁用模块的接口统一返回 `423 MODULE_DISABLED`；`GET /config/effective`、鉴权和必要恢复接口不能被自身开关锁死。

## Dashboard、Metrics、Audit 与备份

| 方法 | 路径 | 用途与关键字段 |
| --- | --- | --- |
| `GET` | `/dashboard/summary` | `from/to/repositoryId`；任务状态、逾期、Agent、Token、成功率摘要 |
| `GET` | `/dashboard/timeseries` | `metric=tokenUsed|executionDuration|successRate`、interval、groupBy |
| `GET` | `/dashboard/task-distribution` | 按 status/priority/project/agent 聚合 |
| `GET` | `/metrics` | 细粒度指标查询，支持 metric、groupBy、actor、model、时间范围 |
| `GET` | `/audit-logs` | actorType/actorId/action/resourceType/resourceId/from/to 过滤和游标分页 |
| `GET` | `/backups` | 备份元数据：开始时间、大小、位置摘要、状态、校验时间 |
| `POST` | `/backups/{id}/verify` | 管理侧触发完整性校验，不通过浏览器下载数据库凭证 |

指标至少覆盖 Token 消耗、执行时长和成功率。审计 actor 必须区分 `user` 与 `agent`；`action` 使用稳定、可过滤的标识，除 create/update/delete/assign/execute/analyze/cancel/login/logout/token_revoke/push/revert/config_change 外，至少覆盖 `knowledge.register`、`knowledge.update`、`knowledge.disable`、`knowledge.health_check`、`knowledge.bind_agent`、`knowledge.unbind_agent`、`skill.create`、`skill.version_created`、`skill.version_activated`、`skill.deprecate`、`skill.download`、`skill.bind_agent` 和 `skill.unbind_agent`。审计写失败不得回滚业务，但必须写独立错误日志和告警。

## 实时事件

任务状态、执行进度、审批、Agent/Connector 健康和 Diff 更新不应依赖高频轮询。后端至少实现 WebSocket 或 SSE，推荐二者共享同一事件模型。

### WebSocket

浏览器 WebSocket 无法可靠附加 Authorization header，推荐先获取一次性 ticket：

1. `POST /events/tickets` 返回 `{ ticket, expiresAt }`，ticket 有效期不超过 60 秒且只能使用一次。
2. 连接 `GET /events/ws?ticket=<ticket>`。
3. 客户端可发送 `{"type":"subscribe","scopes":["project:repo-1","conversation:conv-1"]}`；服务端仍按 RBAC 过滤。

### SSE

`GET /events/stream?scope=project:repo-1`，使用同源 HttpOnly session 或 Authorization。支持 `Last-Event-ID` 续传，服务端每 15 至 30 秒发送 heartbeat。

统一事件 envelope：

```json
{
  "id": "evt-0198",
  "type": "execution.progress",
  "occurredAt": "2026-08-05T08:30:00Z",
  "resource": { "type": "execution", "id": "exec-1" },
  "version": 12,
  "payload": { "taskId": "task-1", "progress": 72, "tokenUsed": 18640 }
}
```

事件类型至少包括：

- `requirement.updated`、`requirement.spec_created`
- `task.created`、`task.updated`、`task.cancelled`
- `execution.started`、`execution.progress`、`execution.completed`
- `approval.created`、`approval.resolved`
- `agent.status_changed`、`connector.status_changed`
- `conversation.message_created`
- `repository.changes_updated`、`artifact.push_updated`
- `knowledge.health_changed`、`budget.warning`、`module.updated`

事件只发当前主体有权看到的数据，payload 不含 secret、完整 prompt 或仓库绝对路径。前端比较 `version`，忽略旧事件；断线重连无法续传时重新请求对应 query。服务端应保留短期事件游标，并在游标过期时发送 `resync_required`。

## 错误格式与 HTTP 状态

统一错误响应：

```json
{
  "error": {
    "code": "STATE_CONFLICT",
    "message": "当前任务状态不允许执行",
    "details": {
      "currentStatus": "cancelled",
      "allowedStatuses": ["assigned", "failed"]
    },
    "requestId": "req-0198",
    "retryable": false
  }
}
```

校验错误的 `details.fields` 使用 `{ field, code, message }[]`，不得返回堆栈、SQL、命令行、凭证或内部绝对路径。

| HTTP | 典型 code | 含义 |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | 参数格式、缺失字段或非法过滤条件 |
| `401` | `UNAUTHENTICATED`、`TOKEN_EXPIRED` | 未登录、令牌无效或已撤销 |
| `403` | `FORBIDDEN`、`TASK_SCOPE_VIOLATION` | 角色、capability、归属或 Agent task scope 不允许 |
| `404` | `NOT_FOUND` | 资源不存在；无权获知存在性时也可返回 404 |
| `409` | `STATE_CONFLICT`、`VERSION_CONFLICT`、`ALREADY_CLAIMED`、`IDEMPOTENCY_CONFLICT` | 状态机、并发、重复领取或幂等请求冲突 |
| `413` | `FILE_TOO_LARGE`、`PAYLOAD_TOO_LARGE` | 文件预览、Diff 或上传超限 |
| `415` | `BINARY_FILE_UNSUPPORTED`、`UNSUPPORTED_MEDIA_TYPE` | 不支持的文件/上传类型 |
| `422` | `BUSINESS_RULE_VIOLATION` | 参数合法但违反业务规则 |
| `423` | `MODULE_DISABLED` | 模块被平台开关锁定 |
| `429` | `RATE_LIMITED`、`TOKEN_BUDGET_EXCEEDED` | 请求限流或预算不足；带 `Retry-After`（适用时） |
| `502` | `UPSTREAM_ERROR` | Hermes、MCP、VCS 或模型服务失败 |
| `503` | `CONNECTOR_OFFLINE`、`RUNTIME_UNAVAILABLE` | 本地 Connector 或云端运行时不可用 |

## 幂等、并发与一致性

- 以下操作必须携带 `Idempotency-Key`：登录外的 token 轮换、需求分析、任务执行/重试/取消、审批决议、runtime claim/progress/result、聊天消息、push、revert、凭证轮换和其他异步副作用。
- 幂等键按 `actor + method + canonicalPath` 隔离，建议保留至少 24 小时。相同键和相同 payload 返回首次响应；相同键但 payload 不同返回 `409 IDEMPOTENCY_CONFLICT`。
- 服务端保存 payload 哈希、最终状态码和响应引用，不仅保存“已见过”标志。并发到达的同键请求只能有一个执行副作用。
- Agent 抢占任务使用数据库行锁或原子 compare-and-set。`idle -> busy`、task assignment 和 execution 创建应处于同一事务边界。
- 业务写入与事件发布使用 outbox 或等价机制，避免状态提交后没有事件。审计为旁路，不参与业务事务回滚。
- Token 增量按 execution 和 sequence 去重；失败/取消只退回未消费的预扣额度，不能重复退款。
- 客户端 mutation 携带资源 version。收到 409 后重新拉取资源和 `allowedActions`，不要盲目重放高风险操作。
- 取消、reclaim 或重试会产生新的 execution identity；旧 execution 的迟到 heartbeat、progress 和 result 必须拒绝或隔离为审计事件。

## 后端交付要求

后端应将 OpenAPI 3.1 schema 作为接口与枚举的单一真相源，并生成前端 TypeScript 类型。前端接入验收至少需要：

1. 上述 API 的 OpenAPI 文档和稳定的错误 code。
2. 可用于本地联调的种子账号：employee、leader、pm，以及 Digital、Coder、QA 测试凭证。
3. NDJSON 流式响应关闭代理缓冲的部署说明。
4. WebSocket/SSE 的鉴权、重放窗口和事件类型说明。
5. 仓库与 MCP 测试环境，不使用生产密钥。
6. 明确的 capability 策略，特别是 PM 的 assign/cancel/execute 权限；前端始终以 `capabilities` 与 `allowedActions` 为准。
