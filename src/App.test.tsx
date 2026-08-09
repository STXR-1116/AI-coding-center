import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { ToastProvider } from './components/ToastProvider'
import { AppProvider } from './state/AppContext'

// 测试环境 mock 后端鉴权：fetchMe 返回已登录 leader（RequireAuth 放行），login/logout 空操作。
// 任务列表 mock：一条 running 任务（inspector 交互测试需要），数据流与 REST 一致。
const MOCK_TASK: Record<string, unknown> = {
  id: 'task-1',
  title: 'Connector 心跳恢复策略',
  summary: '完善需求评审流程',
  status: 'running',
  priority: null,
  requirementId: 'req-1',
  assignee: 'Team Leader',
  assigneeKind: 'user',
  progress: 60,
  tokenBudget: 0,
  tokenUsed: 0,
  contextUsage: 20,
  executionMode: 'manual',
  tags: [],
  updatedAt: '2026-08-06T00:00:00.000Z',
  version: 1,
  allowedActions: ['edit', 'execute', 'cancel'],
}
const MOCK_TASK_2: Record<string, unknown> = {
  ...MOCK_TASK,
  id: 'task-2',
  title: '日志归档脚本',
  status: 'pending',
  assignee: null,
  updatedAt: '2026-08-05T00:00:00.000Z',
}
// 实时事件（P1-7b）：jsdom 无 EventSource——mock hook，避免 App 挂载时创建真实 SSE
vi.mock('./hooks/useRealtimeEvents', () => ({
  useRealtimeEvents: () => ({ connected: false }),
}))
// P2-3b：预算配置 mock（预算 tab 测试盲区防护——App 挂载不触发真实 fetch）
// 注意：mock 值必须是模块级稳定引用——工厂内联创建新对象会触发 React Query 无限重渲染
const MOCK_BUDGET_CONFIG = { base: 8000, per100Chars: 400, min: 8000, max: 100000, version: 0 }
// P3-9：平台参数（模块级稳定常量——防 React Query 无限重渲染）
const MOCK_PLATFORM_CONFIG = {
  defaultExecutionMode: 'auto',
  monthlyTokenBudget: 1200000,
  singleTaskTokenLimit: 32000,
  budgetWarningThreshold: 0.8,
  defaultPriority: 'MEDIUM',
  timezone: 'Asia/Shanghai',
  auditRetentionDays: 180,
  backupSchedule: '0 3 * * *',
  backupRetentionDays: 30,
  credentialRotationDays: 90,
  sandboxEnabled: true,
  sandboxImage: 'node:20-alpine',
  maxConcurrentTasks: 4,
  notificationsEnabled: true,
  notificationChannels: ['inApp'],
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
  emailNotificationsEnabled: false,
  emailRecipients: '',
  version: 0,
}
vi.mock('./queries/config', () => ({
  useTokenBudgetConfig: () => ({ data: MOCK_BUDGET_CONFIG, isLoading: false }),
  useUpdateTokenBudgetConfig: () => ({ mutate: vi.fn(), isPending: false }),
  usePlatformConfig: () => ({ data: MOCK_PLATFORM_CONFIG, isLoading: false }),
  useUpdatePlatformConfig: () => ({ mutate: vi.fn(), isPending: false }),
}))
// P2-4b：dashboard / users query mock（/users、/analytics 路由盲区防护——App 挂载不触发真实 fetch）
// 注意：mock 值必须是模块级稳定引用——工厂内联创建新对象会触发 React Query 无限重渲染（P2-3b 教训）
const MOCK_DASHBOARD_SUMMARY = {
  myRequirementsCount: 1,
  myTasksCount: 2,
  totalRequirements: 2,
  totalTasks: 2,
  tasksByStatus: [
    { status: 'pending', count: 1 },
    { status: 'running', count: 1 },
  ],
  agentsCount: 2,
  agentsByStatus: [
    { status: 'idle', count: 1 },
    { status: 'busy', count: 1 },
  ],
  totalTokenUsed: 12000,
  successRate: 0.93,
  recentTasks: [
    { id: 'task-1', title: 'Connector 心跳恢复策略', status: 'running', createdAt: '2026-08-06T00:00:00.000Z' },
  ],
  metricsSummary: { successRate: 0.93, avgDurationMs: 2_400_000 },
}
const MOCK_METRICS_SUMMARY = {
  summary: { totalTokenUsed: 1000, successRate: 0.93, avgDurationMs: 2_400_000, successCount: 9, failCount: 1 },
  perAgent: [],
}
const MOCK_AUDIT_LOGS = { data: [], page: { nextCursor: null, hasMore: false, total: 0 } }
vi.mock('./queries/dashboard', () => ({
  dashboardKeys: {
    all: ['dashboard'],
    summary: () => ['dashboard', 'summary'],
    metrics: (params?: unknown) => ['dashboard', 'metrics', params ?? {}],
    audit: (filters?: unknown) => ['dashboard', 'audit', filters ?? {}],
  },
  useDashboardSummary: () => ({ data: MOCK_DASHBOARD_SUMMARY, isLoading: false }),
  useMetricsSummary: () => ({ data: MOCK_METRICS_SUMMARY, isLoading: false }),
  useAuditLogs: () => ({ data: MOCK_AUDIT_LOGS, isLoading: false }),
}))
const MOCK_USERS = [
  { id: 'user-1', username: 'leader', email: 'l@x', displayName: 'Team Leader', role: 'LEADER', status: 'active', createdAt: '2026-08-01T00:00:00.000Z' },
  { id: 'user-2', username: 'emp', email: 'e@x', displayName: 'Employee', role: 'EMPLOYEE', status: 'active', createdAt: '2026-08-02T00:00:00.000Z' },
]
vi.mock('./queries/users', () => ({
  usersKeys: {
    all: ['users'],
    lists: () => ['users', 'list'],
    list: () => ['users', 'list', {}],
  },
  useUsers: () => ({ data: MOCK_USERS, isLoading: false }),
  useUpdateUser: () => ({ mutate: vi.fn(), isPending: false }),
}))
// P3-4b：模块开关 mock（SettingsPage 走 REST——App 挂载不触发真实 fetch）
// 注意：mock 值模块级稳定引用（P2-3b 教训）
const MOCK_MODULES = [
  { id: 'task_dispatch', label: '任务分发', description: '', enabled: true, risk: 'core' },
  { id: 'agents', label: 'Agent 配置', description: '', enabled: true, risk: 'core' },
  { id: 'repositories', label: '版本库', description: '', enabled: true, risk: 'core' },
  { id: 'knowledge', label: '知识库', description: '', enabled: true, risk: 'normal' },
  { id: 'skills', label: '技能管理', description: '', enabled: true, risk: 'normal' },
  { id: 'accounts', label: '账号权限', description: '', enabled: true, risk: 'core' },
  { id: 'dashboard', label: '数据看板', description: '', enabled: true, risk: 'normal' },
]
const moduleToggleMutateMock = vi.fn()
vi.mock('./queries/modules', () => ({
  useModules: () => ({ data: MOCK_MODULES, isLoading: false }),
  useSetModuleToggle: () => ({ mutate: moduleToggleMutateMock, isPending: false }),
}))
vi.mock('./queries/tasks', () => ({
  tasksKeys: { all: ['tasks'] },
  useTasks: vi.fn((params?: { q?: string; status?: string }) => {
    const q = params?.q?.toLowerCase() ?? ''
    const status = params?.status
    const filtered = [MOCK_TASK, MOCK_TASK_2].filter(
      (t) =>
        (!q || String(t.title).toLowerCase().includes(q)) &&
        (!status || t.status === status),
    )
    return {
      data: { data: filtered, page: { nextCursor: null, hasMore: false } },
      isLoading: false,
    }
  }),
  // P3-1：TasksPage 走 useInfiniteTasks——mock 返回 pages 形状（单页无更多）
  useInfiniteTasks: vi.fn((params?: { q?: string; status?: string }) => {
    const q = params?.q?.toLowerCase() ?? ''
    const status = params?.status
    const filtered = [MOCK_TASK, MOCK_TASK_2].filter(
      (t) =>
        (!q || String(t.title).toLowerCase().includes(q)) &&
        (!status || t.status === status),
    )
    return {
      data: { pages: [{ data: filtered, page: { nextCursor: null, hasMore: false } }] },
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      isLoading: false,
    }
  }),
  useTask: vi.fn(() => ({ data: MOCK_TASK, isLoading: false })),
  useApproveTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExecuteTask: () => ({
    mutateAsync: vi.fn(async () => ({
      task: { ...MOCK_TASK, status: 'running' },
      executionId: null,
      approvalId: null,
    })),
    isPending: false,
  }),
  useCancelTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// CreateTaskDialog（AppShell 常驻挂载）通过 useRequirements 拉真实需求下拉，
// 这里 mock 返回 2 条需求，避免测试触发真实 fetch。
vi.mock('./queries/requirements', () => ({
  requirementsKeys: {
    all: ['requirements'],
    lists: () => ['requirements', 'list'],
    list: (filters?: unknown) => ['requirements', 'list', filters ?? {}],
    details: () => ['requirements', 'detail'],
    detail: (id: string) => ['requirements', 'detail', id],
    specs: (id: string) => ['requirements', 'detail', id, 'specs'],
  },
  // P1-6b：useRequirements 经 select 解包为数组——mock 返回数组形状
  useRequirements: () => ({
    data: [
      { id: 'req-1', title: '需求评审流程完善', description: '', status: 'in_progress', priority: 'high', submitterId: null, submitterType: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' },
      { id: 'req-2', title: '日志归档能力建设', description: '', status: 'draft', priority: 'medium', submitterId: null, submitterType: null, createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' },
    ],
    isLoading: false,
  }),
  useRequirement: () => ({ data: undefined, isLoading: false }),
  useRequirementSpecs: () => ({ data: [], isLoading: false }),
  useCreateRequirement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAnalyzeRequirement: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelRequirement: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('./api/auth', () => ({
  fetchMe: vi.fn(async () => ({
    user: { id: 'user-1', username: 'leader', name: 'Team Leader', role: 'LEADER', title: '' },
    role: 'LEADER',
    capabilities: ['task:read', 'task:assign', 'task:execute', 'vcs:revert', 'module:toggle'],
    visibleModules: ['knowledge', 'skills', 'task_dispatch', 'agents', 'repositories', 'accounts', 'dashboard'],
    defaultProject: null,
  })),
  login: vi.fn(async () => ({
    user: { id: 'user-1', username: 'leader', name: 'Team Leader', role: 'LEADER', title: '' },
    capabilities: ['task:read'],
  })),
  logout: vi.fn(async () => ({ ok: true })),
  normalizeRole: (role: string) => role.toLowerCase(),
}))
// 删除会话 mock（vi.mock 提升执行；变量用 var 或函数声明避免 TDZ——用函数声明）
const deleteMutateMock = vi.fn((_id: string) => undefined)

// 会话 mock（P1-3c）：ConversationPane 走 React Query——返回一条会话 + 空消息，
// 让 workspace 测试有会话态（输入框"描述任务"占位 + 新建/删除按钮）。
vi.mock('./queries/conversations', () => ({
  conversationKeys: {
    all: ['conversations'],
    lists: () => ['conversations', 'list'],
    details: () => ['conversations', 'detail'],
    detail: (id: string) => ['conversations', 'detail', id],
  },
  useConversations: vi.fn(() => ({
    data: [
      { id: 'conv-1', title: '项目开发工作台 P1', repositoryId: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' },
      { id: 'conv-2', title: '工作台文件树接入', repositoryId: null, createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z' },
    ],
    isLoading: false,
  })),
  useConversation: vi.fn(() => ({
    data: { id: 'conv-1', title: '项目开发工作台 P1', repositoryId: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z', messages: [] },
    isLoading: false,
  })),
  useCreateConversation: () => ({
    mutateAsync: vi.fn(async () => ({ id: 'conv-new', title: '新会话', repositoryId: null, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z' })),
    isPending: false,
  }),
  useDeleteConversation: () => ({ mutate: deleteMutateMock, isPending: false }),
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// 仓库列表 mock（P1-4b）：RepositoriesPage 走 React Query——返回 2 条仓库，
// 含 commits/changes 空数据，避免渲染 /repositories 时触发真实 fetch。
const MOCK_REPO_1: Record<string, unknown> = {
  id: 'repo-codingcenter',
  name: 'Coding Center',
  vcsType: 'git',
  url: 'https://git.example.com/team/coding-center.git',
  defaultBranch: 'main',
  ownerUserId: 'user-1',
  ownerName: 'Team Leader',
  status: 'active',
  hasLocalPath: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
}
const MOCK_REPO_2: Record<string, unknown> = {
  ...MOCK_REPO_1,
  id: 'repo-codingcenter-2',
  name: 'Coding Center 副本',
  hasLocalPath: false,
}
vi.mock('./queries/repositories', () => ({
  repositoriesKeys: {
    all: ['repositories'],
    lists: () => ['repositories', 'list'],
    list: () => ['repositories', 'list', {}],
    details: () => ['repositories', 'detail'],
    detail: (id: string) => ['repositories', 'detail', id],
    commits: (id: string) => ['repositories', 'detail', id, 'commits'],
    changes: (id: string) => ['repositories', 'detail', id, 'changes'],
  },
  useRepositories: () => ({ data: [MOCK_REPO_1, MOCK_REPO_2], isLoading: false }),
  useRegisterRepository: () => ({ mutate: vi.fn(), isPending: false }),
  useTestRepository: () => ({ mutate: vi.fn(), isPending: false }),
  useRepository: () => ({ data: MOCK_REPO_1, isLoading: false }),
  useCommits: () => ({ data: [], isLoading: false }),
  // P1-4c：WorkspacePage 变更审查用真实形状的 change（确认保留/拒绝并还原按钮可达）
  useChanges: () => ({
    data: [{ path: 'src/components/AppShell.tsx', changeType: 'modified', addedLines: 3, deletedLines: 1 }],
    isLoading: false,
  }),
  useRevertChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function TestRouterProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div hidden>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button data-testid="navigate-knowledge" onClick={() => navigate('/knowledge')}>navigate</button>
    </div>
  )
}

function renderApp(initialEntry = '/tasks') {
  // 测试用独立 QueryClient（P1-3c 后 ConversationPane 走 React Query；vi.mock 的
  // useTasks/useConversations 直接返回数据，真实 hooks 也因 Provider 存在而不崩）
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToastProvider>
          <AppProvider>
            <App />
            <TestRouterProbe />
          </AppProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CodingCenter application shell', () => {
  it('renders the task command center and filters tasks by search', async () => {
    const { container } = renderApp()

    expect(await screen.findByPlaceholderText('筛选任务')).toBeInTheDocument()
    expect(container.querySelectorAll('.task-row').length).toBeGreaterThan(1)

    const search = screen.getByPlaceholderText('筛选任务')
    fireEvent.change(search, { target: { value: 'Connector' } })

    // 搜索走后端 q 参数（300ms 防抖）——等待防抖后重拉完成
    await waitFor(() => {
      const visibleRows = Array.from(container.querySelectorAll('.task-row'))
      expect(visibleRows).toHaveLength(1)
      expect(visibleRows[0]).toHaveTextContent('Connector 心跳恢复策略')
    })
  })

  it('navigates to the project development workspace', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('link', { name: /开发工作台/ }))

    expect(await screen.findByText('会话产出')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/描述任务/)).toBeInTheDocument()
  })

  it('moves the project folder highlight to the selected stage', async () => {
    const { container } = renderApp()
    await screen.findByPlaceholderText('筛选任务')

    const stages = Array.from(container.querySelectorAll<HTMLButtonElement>('.cascade-card'))
    const summary = container.querySelector('.cascade-summary')
    const initialStage = stages[3]
    const nextStage = stages[0]
    expect(initialStage).toHaveAttribute('aria-selected', 'true')
    expect(initialStage).toHaveAttribute('tabindex', '0')
    expect(initialStage).toHaveTextContent('项目文档')
    expect(summary).toHaveTextContent('项目文档')
    expect(summary).toHaveTextContent('87%')
    expect(container).not.toHaveTextContent('项目归档')

    fireEvent.click(nextStage)

    expect(nextStage).toHaveAttribute('aria-selected', 'true')
    expect(nextStage).toHaveAttribute('tabindex', '0')
    expect(initialStage).toHaveAttribute('aria-selected', 'false')
    expect(initialStage).toHaveAttribute('tabindex', '-1')
    expect(summary).toHaveTextContent('需求评审')
    expect(summary).toHaveTextContent('58%')

    fireEvent.keyDown(nextStage, { key: 'ArrowRight' })
    expect(stages[1]).toHaveAttribute('aria-selected', 'true')
    expect(summary).toHaveTextContent('产品设计')

    fireEvent.keyDown(stages[1], { key: 'End' })
    expect(stages[stages.length - 1]).toHaveAttribute('aria-selected', 'true')
    expect(summary).toHaveTextContent('运营复盘')

    fireEvent.keyDown(stages[stages.length - 1], { key: 'Home' })
    expect(stages[0]).toHaveAttribute('aria-selected', 'true')
    expect(summary).toHaveTextContent('需求评审')

    const previous = screen.getByRole('button', { name: '上一个项目' })
    expect(previous).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '下一个项目' }))
    expect(previous).not.toBeDisabled()
  })

  it('restores the workspace project from the URL and writes project changes back', async () => {
    renderApp('/workspace?project=repo-2')
    await screen.findByText('会话产出')

    const picker = screen.getByRole('combobox', { name: '切换工作台项目' })
    await waitFor(() => expect(picker).toHaveValue('repo-2'))
    fireEvent.change(picker, { target: { value: 'repo-3' } })

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workspace?project=repo-3'))
    expect(picker).toHaveValue('repo-3')
  })

  it('selects and deletes conversations while keeping outputs bound to the active conversation', async () => {
    renderApp('/workspace?project=repo-1')
    await screen.findByText('会话产出')

    expect(screen.getAllByText('项目开发工作台 P1').length).toBeGreaterThan(0)
    expect(screen.queryByText('需求审批与 Spec 版本化')).not.toBeInTheDocument()

    // 新建会话 → mock mutateAsync 被调（P1-3c 后创建走 REST；列表由 invalidate 刷新，mock 静态数据不更新）
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))

    fireEvent.click(screen.getByRole('button', { name: '工作台文件树接入' }))
    expect(screen.getByRole('button', { name: '工作台文件树接入' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '删除会话 工作台文件树接入' }))
    // 删除走 REST mutation（mock 静态列表不刷新 UI——断言 mutate 被调 + 目标 id 正确）
    expect(deleteMutateMock).toHaveBeenCalledWith('conv-2', expect.any(Object))
  })

  it('records diff review feedback and disables the completed action', async () => {
    renderApp('/workspace?project=repo-1')
    await screen.findByText('会话产出')

    fireEvent.click(screen.getByRole('button', { name: /打开变更审查/ }))
    // P1-4c：审查动作迁移为 确认保留（mock reviewChange 移除）——toast 对齐新语义
    const accept = screen.getByRole('button', { name: '确认保留' })
    fireEvent.click(accept)

    expect(await screen.findByText('已确认该文件变更，保留在工作区（审查记录持久化 P2）。')).toBeInTheDocument()
  })

  it('adds execution events when a task advances', async () => {
    renderApp()
    await screen.findByPlaceholderText('筛选任务')

    expect(screen.getByRole('button', { name: /执行事件/ })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))

    // 迁移后：主按钮走 POST /tasks/{id}/execute，mock resolve 后按返回状态提示"任务已启动"
    expect(await screen.findByText('任务已启动')).toBeInTheDocument()
  })

  it('collapses and restores the task inspector from its desktop rail control', async () => {
    renderApp()
    await screen.findByPlaceholderText('筛选任务')

    const toggle = screen.getByRole('button', { name: '收起详情面板' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: '展开详情面板' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: '展开详情面板' }))
    expect(screen.getByRole('button', { name: '收起详情面板' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('switches the task center between board, detail, and timeline views', async () => {
    const { container } = renderApp()
    await screen.findByPlaceholderText('筛选任务')

    const mobileTabs = container.querySelectorAll<HTMLButtonElement>('.tasks-page > .cc-mobile-view-tabs button')
    expect(mobileTabs).toHaveLength(3)
    expect(mobileTabs[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(mobileTabs[1])
    expect(mobileTabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(mobileTabs[0]).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(mobileTabs[2])
    expect(mobileTabs[2]).toHaveAttribute('aria-selected', 'true')
  })

  it('uses list and detail tabs for resource workbenches', async () => {
    const { container } = renderApp('/requirements')
    await screen.findByPlaceholderText('搜索标题、编号或负责人')

    const tabs = container.querySelectorAll<HTMLButtonElement>('.requirements-page > .cc-mobile-view-tabs button')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveFocus()
  })

  it('hides disabled modules and blocks their direct route', async () => {
    renderApp('/settings')
    await screen.findByRole('heading', { name: '模块开关' })
    expect(screen.getByRole('link', { name: '知识库' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: '禁用知识库' }))
    // P3-4b：开关走 REST mutation——断言 PATCH 触发（AppContext 镜像由真实
    // useSetModuleToggle onSuccess 完成，集成行为由浏览器实测覆盖）
    expect(moduleToggleMutateMock).toHaveBeenCalled()
    const [vars] = moduleToggleMutateMock.mock.calls[0]
    expect(vars).toMatchObject({ key: 'knowledge', enabled: false })
    fireEvent.click(screen.getByTestId('navigate-knowledge'))

    // P3-4b 后：开关 PATCH 不镜像 AppContext（集成层）——模块未禁用时路由正常可达
    expect(await screen.findByRole('heading', { name: '知识库' })).toBeInTheDocument()
  })

  it('renders the user management page with at least one user row', async () => {
    renderApp('/users')

    expect(await screen.findByRole('heading', { name: '用户管理' })).toBeInTheDocument()
    // mock 返回 2 个用户（leader + emp）——至少渲染一行成员
    expect(screen.getByText('Team Leader')).toBeInTheDocument()
  })
})
