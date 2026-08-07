import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, LoaderCircle, LockKeyhole, RotateCcw, Settings } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Button } from './components/ui'
import { useApp } from './state/useApp'

const TasksPage = lazy(() => import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })))
const RequirementsPage = lazy(() => import('./pages/RequirementsPage').then((module) => ({ default: module.RequirementsPage })))
const AgentsPage = lazy(() => import('./pages/AgentsPage').then((module) => ({ default: module.AgentsPage })))
const RepositoriesPage = lazy(() => import('./pages/RepositoriesPage').then((module) => ({ default: module.RepositoriesPage })))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then((module) => ({ default: module.KnowledgePage })))
const SkillsPage = lazy(() => import('./pages/SkillsPage').then((module) => ({ default: module.SkillsPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

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
          <Route path="/tasks" element={<ModuleGate moduleId="task_dispatch"><TasksPage /></ModuleGate>} />
          <Route path="/workspace" element={<ModuleGate moduleId="repositories"><WorkspacePage /></ModuleGate>} />
          <Route path="/workspace/:repositoryId" element={<ModuleGate moduleId="repositories"><WorkspacePage /></ModuleGate>} />
          <Route path="/requirements" element={<RequirementsPage />} />
          <Route path="/agents" element={<ModuleGate moduleId="agents"><AgentsPage /></ModuleGate>} />
          <Route path="/repositories" element={<ModuleGate moduleId="repositories"><RepositoriesPage /></ModuleGate>} />
          <Route path="/knowledge" element={<ModuleGate moduleId="knowledge"><KnowledgePage /></ModuleGate>} />
          <Route path="/skills" element={<ModuleGate moduleId="skills"><SkillsPage /></ModuleGate>} />
          <Route path="/analytics" element={<ModuleGate moduleId="dashboard"><AnalyticsPage /></ModuleGate>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  )
}

export function App() {
  return <AppShell><RoutedApplication /></AppShell>
}
