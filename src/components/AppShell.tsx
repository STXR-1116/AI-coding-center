import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  BrainCircuit,
  ChevronDown,
  CircleUserRound,
  Command,
  FileCode2,
  GitBranch,
  LayoutDashboard,
  Menu,
  MessageSquareCode,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state/useApp'
import { CreateTaskDialog } from './CreateTaskDialog'
import { Dialog, IconButton } from './ui'

const navItems = [
  { to: '/tasks', label: '任务管理', icon: LayoutDashboard, moduleId: 'task_dispatch' },
  { to: '/workspace', label: '开发工作台', icon: MessageSquareCode, moduleId: 'repositories' },
  { to: '/requirements', label: '需求管理', icon: FileCode2 },
  { to: '/agents', label: 'Agent 与小队', icon: Bot, moduleId: 'agents' },
  { to: '/repositories', label: '版本库', icon: GitBranch, moduleId: 'repositories' },
  { to: '/knowledge', label: '知识库', icon: BrainCircuit, moduleId: 'knowledge' },
  { to: '/skills', label: '技能管理', icon: Boxes, moduleId: 'skills' },
  { to: '/analytics', label: '可观测中心', icon: Activity, moduleId: 'dashboard' },
  { to: '/settings', label: '设置中心', icon: Settings },
]

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, projects, activeProjectId, setActiveProjectId, tasks, requirements, moduleSettings } = useApp()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')

  const basePath = `/${location.pathname.split('/')[1] || 'tasks'}`
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const enabledModules = new Set(moduleSettings.filter((setting) => setting.enabled).map((setting) => setting.id))
  const visibleNavItems = navItems.filter((item) => !item.moduleId || enabledModules.has(item.moduleId))

  const changeProject = (id: string) => {
    setActiveProjectId(id)
    if (basePath === '/workspace') navigate(`/workspace?project=${id}`)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const results = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []
    return [
      ...tasks.map((task) => ({ type: '任务', id: task.id, title: task.title, path: '/tasks' })),
      ...requirements.map((requirement) => ({ type: '需求', id: requirement.id, title: requirement.title, path: '/requirements' })),
      ...projects.map((project) => ({ type: '项目', id: project.id, title: project.name, path: `/workspace?project=${project.id}` })),
    ].filter((item) => `${item.id} ${item.title}`.toLowerCase().includes(query)).slice(0, 8)
  }, [projects, requirements, search, tasks])

  return (
    <div className="app-canvas">
      <button className={mobileNavOpen ? 'nav-scrim is-visible' : 'nav-scrim'} aria-label="关闭导航" onClick={() => setMobileNavOpen(false)} />
      <aside className={mobileNavOpen ? 'sidebar is-open' : 'sidebar'}>
        <div className="brand-lockup">
          <img className="brand-mark" src="/coding-center-mark.svg" alt="CodingCenter" draggable="false" />
          <div>
            <strong>CodingCenter</strong>
            <span>Agent orchestration</span>
          </div>
          <IconButton label="关闭导航" className="sidebar-close" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to === '/workspace' ? `/workspace?project=${activeProjectId}` : to} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="workspace-switcher">
          <div className="workspace-switcher-label">
            <span>当前工作区</span>
            <Plus size={15} />
          </div>
          <label>
            <Sparkles size={16} />
            <select value={activeProjectId} onChange={(event) => changeProject(event.target.value)} aria-label="切换项目">
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>

        <div className="sidebar-user">
          <span className="avatar">BR</span>
          <div>
            <strong>{user.name}</strong>
            <span>{user.title}</span>
          </div>
          <ChevronDown size={16} />
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-heading">
            <IconButton label="打开导航" className="mobile-menu" onClick={() => setMobileNavOpen(true)}>
              <Menu size={19} />
            </IconButton>
            <div className="topbar-context">
              <span>CODING CENTER</span>
              <strong>{activeProject.name}</strong>
            </div>
          </div>

          <button className="global-search" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
            <span>搜索任务、项目或文件...</span>
            <kbd><Command size={12} /> K</kbd>
          </button>

          <div className="topbar-actions">
            <div className="project-quick-status">
              <GitBranch size={15} />
              <span>{activeProject.branch}</span>
              <i className={`repo-state repo-state-${activeProject.status}`} />
            </div>
            <IconButton label="通知" className="notification-button">
              <Bell size={18} />
              <span className="notification-dot" />
            </IconButton>
            <IconButton label="消息">
              <Users size={18} />
            </IconButton>
            <button className="new-task-button" onClick={() => setCreateOpen(true)}>
              <Plus size={17} />
              <span>新建任务</span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => navigate('/tasks')} />
      <Dialog open={searchOpen} onClose={() => { setSearchOpen(false); setSearch('') }} title="全局搜索" description="查找任务、需求和项目。" size="lg">
        <div className="command-search-input">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入标题或编号" autoFocus />
        </div>
        <div className="search-results">
          {!search.trim() ? (
            <div className="search-hint"><CircleUserRound size={20} /> 输入关键词开始搜索</div>
          ) : results.length ? (
            results.map((result) => (
              <button key={`${result.type}-${result.id}`} onClick={() => { if (result.type === '项目') setActiveProjectId(result.id); navigate(result.path); setSearchOpen(false); setSearch('') }}>
                <span>{result.type}</span>
                <strong>{result.title}</strong>
                <small>{result.id}</small>
              </button>
            ))
          ) : (
            <div className="search-hint">没有匹配结果</div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
