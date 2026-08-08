import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, LoaderCircle, LockKeyhole, RotateCcw, Settings } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { AppShell } from './components/AppShell'
import { Button } from './components/ui'
import { useApp } from './state/useApp'
import { useRealtimeEvents } from './hooks/useRealtimeEvents'

const TasksPage = lazy(() => import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })))
const RequirementsPage = lazy(() => import('./pages/RequirementsPage').then((module) => ({ default: module.RequirementsPage })))
const AgentsPage = lazy(() => import('./pages/AgentsPage').then((module) => ({ default: module.AgentsPage })))
const RepositoriesPage = lazy(() => import('./pages/RepositoriesPage').then((module) => ({ default: module.RepositoriesPage })))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then((module) => ({ default: module.KnowledgePage })))
const SkillsPage = lazy(() => import('./pages/SkillsPage').then((module) => ({ default: module.SkillsPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))

function RouteLoading() {
  return (
    <div className="route-loading" role="status">
      <LoaderCircle size={20} />
      <div><strong>正在载入工作区</strong><span>同步页面组件与当前项目上下文...</span></div>
    </div>
  )
}

function ModuleGate({ moduleId, children }: { moduleId: string; children: ReactNode }) {
  const navigate = useNavigate()
  const { moduleSettings } = useApp()
  const setting = moduleSettings.find((item) => item.id === moduleId)
  if (!setting || setting.enabled) return children

  return (
    <section className="route-state route-state-locked">
      <span><LockKeyhole size={24} /></span>
      <small>423 · MODULE LOCKED</small>
      <h2>{setting.label}已停用</h2>
      <p>{setting.description}当前不可用。平台管理员可在设置中心重新启用该模块。</p>
      <Button variant="primary" icon={<Settings size={15} />} onClick={() => navigate('/settings')}>前往设置中心</Button>
    </section>
  )
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <section className="route-state">
      <span><AlertTriangle size={24} /></span>
      <small>404 · NOT FOUND</small>
      <h2>页面不存在</h2>
      <p>当前地址没有对应的工作台页面，请返回任务中心继续。</p>
      <Button variant="primary" onClick={() => navigate('/tasks')}>返回任务中心</Button>
    </section>
  )
}

class AppErrorBoundary extends Component<{ children: ReactNode; routeKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CodingCenter route error', error, info)
  }

  componentDidUpdate(previous: { routeKey: string }) {
    if (previous.routeKey !== this.props.routeKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="route-state route-state-error" role="alert">
        <span><AlertTriangle size={24} /></span>
        <small>页面载入失败</small>
        <h2>这个页面暂时无法显示</h2>
        <p>{this.state.error.message || '发生了未预期的前端错误。'}</p>
        <Button variant="primary" icon={<RotateCcw size={15} />} onClick={() => window.location.reload()}>重新载入</Button>
      </section>
    )
  }
}

function RoutedApplication() {
  const location = useLocation()
  return (
    <AppErrorBoundary routeKey={`${location.pathname}${location.search}`}>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tasks" element={<RequireAuth><ModuleGate moduleId="task_dispatch"><TasksPage /></ModuleGate></RequireAuth>} />
          <Route path="/workspace" element={<RequireAuth><ModuleGate moduleId="repositories"><WorkspacePage /></ModuleGate></RequireAuth>} />
          <Route path="/workspace/:repositoryId" element={<RequireAuth><ModuleGate moduleId="repositories"><WorkspacePage /></ModuleGate></RequireAuth>} />
          <Route path="/requirements" element={<RequireAuth><RequirementsPage /></RequireAuth>} />
          <Route path="/agents" element={<RequireAuth><ModuleGate moduleId="agents"><AgentsPage /></ModuleGate></RequireAuth>} />
          <Route path="/repositories" element={<RequireAuth><ModuleGate moduleId="repositories"><RepositoriesPage /></ModuleGate></RequireAuth>} />
          <Route path="/knowledge" element={<RequireAuth><ModuleGate moduleId="knowledge"><KnowledgePage /></ModuleGate></RequireAuth>} />
          <Route path="/skills" element={<RequireAuth><ModuleGate moduleId="skills"><SkillsPage /></ModuleGate></RequireAuth>} />
          <Route path="/analytics" element={<RequireAuth><ModuleGate moduleId="dashboard"><AnalyticsPage /></ModuleGate></RequireAuth>} />
          <Route path="/users" element={<RequireAuth><UsersPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  )
}

/**
 * RealtimeBridge — 登录后常驻订阅 SSE 实时事件（P1-7b）。
 *
 * 放在路由外、App 顶层：登录态（auth.user 存在）时订阅 /api/v1/events，
 * 任务状态/进度变更自动 invalidate React Query 缓存；登出即断开。App 已在
 * QueryClientProvider 内，故 useRealtimeEvents 内的 useQueryClient 可用。
 */
function RealtimeBridge() {
  const { auth } = useApp()
  useRealtimeEvents(!!auth.user)
  return null
}

export function App() {
  return (
    <AppShell>
      <RealtimeBridge />
      <RoutedApplication />
    </AppShell>
  )
}
