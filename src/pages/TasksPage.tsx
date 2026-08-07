import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownWideNarrow,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  ClipboardList,
  Clock3,
  Filter,
  FolderKanban,
  Gauge,
  GitCommitHorizontal,
  Layers3,
  ListFilter,
  MoreHorizontal,
  Play,
  Search,
  Sparkles,
  UsersRound,
  X,
  Zap,
} from 'lucide-react'
import { useApp } from '../state/useApp'
import { useToast } from '../state/useToast'
import type { ExecutionMode, Task, TaskEvent, TaskStatus } from '../types'
import { Button, IconButton, PriorityBadge, ProgressBar, StatusBadge } from '../components/ui'
import { PageHeader, SummaryStrip, WorkbenchLayout } from '../components/layout'

const statusOrder: TaskStatus[] = ['awaiting_approval', 'running', 'assigned', 'pending', 'failed', 'succeeded', 'cancelled']

const projectStages = [
  { id: 'review', label: '需求评审', cycle: '2025 · Q2', progress: 58, caption: '完成度', taskIndex: 1 },
  { id: 'design', label: '产品设计', cycle: '2025 · Q2', progress: 66, caption: '完成度', taskIndex: 2 },
  { id: 'build', label: '开发实现', cycle: '2025 · Q2', progress: 76, caption: '完成度', taskIndex: 0 },
  { id: 'docs', label: '项目文档', cycle: '2025 · Q2', progress: 87, caption: '完成度', taskIndex: 3 },
  { id: 'quality', label: '质量验证', cycle: '2025 · Q2', progress: 82, caption: '完成度', taskIndex: 4 },
  { id: 'release', label: '版本上线', cycle: '2025 · Q2', progress: 92, caption: '完成度', taskIndex: 5 },
  { id: 'prepare', label: '发布准备', cycle: '2025 · Q2', progress: 90, caption: '完成度', taskIndex: 0 },
  { id: 'monitor', label: '数据监控', cycle: '2025 · Q2', progress: 84, caption: '完成度', taskIndex: 2 },
  { id: 'insights', label: '运营复盘', cycle: '2025 · Q2', progress: 94, caption: '完成度', taskIndex: 1 },
] as const

function TaskRow({ task, active, onClick }: { task: Task; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? 'task-row is-active' : 'task-row'} onClick={onClick}>
      <span className={`task-state-dot task-state-${task.status}`} />
      <span className="task-row-main">
        <strong>{task.title}</strong>
        <small>{task.id} · {task.assignee}</small>
      </span>
      <PriorityBadge priority={task.priority} />
      <span className="task-row-time">{task.dueAt}</span>
    </button>
  )
}

function ProjectCascade({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  const [activeIndex, setActiveIndex] = useState(3)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  const initialCenterRef = useRef(true)
  const activeStage = projectStages[activeIndex]
  const cardGap = projectStages.length <= 4 ? 22 : projectStages.length <= 6 ? 16 : 12

  const centerCard = useCallback((index: number, behavior: ScrollBehavior) => {
    const viewport = viewportRef.current
    const rail = cardsRef.current
    const card = rail?.querySelector<HTMLElement>(`[data-cascade-index="${index}"]`)
    if (!viewport || !rail || !card) return

    const target = card.offsetLeft + card.offsetWidth / 2 - viewport.clientWidth / 2
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const left = Math.min(maxScroll, Math.max(0, target))
    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ left, behavior })
    } else {
      viewport.scrollLeft = left
    }
  }, [])

  const selectStage = (index: number, focus = false) => {
    const nextIndex = Math.max(0, Math.min(projectStages.length - 1, index))
    setActiveIndex(nextIndex)
    const task = tasks.length ? tasks[projectStages[nextIndex].taskIndex % tasks.length] : undefined
    if (task) onSelect(task)

    if (focus) {
      const focusCard = () => cardRefs.current[nextIndex]?.focus({ preventScroll: true })
      if (typeof window === 'undefined') focusCard()
      else window.setTimeout(focusCard, 0)
    }
  }

  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = initialCenterRef.current || prefersReducedMotion ? 'auto' : 'smooth'
    initialCenterRef.current = false
    const timer = window.setTimeout(() => centerCard(activeIndex, behavior), 0)
    return () => window.clearTimeout(timer)
  }, [activeIndex, centerCard])

  const handleStageKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowLeft') nextIndex = index - 1
    if (event.key === 'ArrowRight') nextIndex = index + 1
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = projectStages.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    if (nextIndex === index || nextIndex < 0 || nextIndex >= projectStages.length) return
    selectStage(nextIndex, true)
  }

  return (
    <div className="cascade-stage" aria-label="项目执行阶段">
      <div
        className="cascade-summary"
        id="project-stage-detail"
        role="tabpanel"
        aria-labelledby={`project-stage-tab-${activeStage.id}`}
        aria-live="polite"
        data-selected-stage={activeStage.id}
      >
        <ArrowUpRight className="cascade-summary-arrow" size={17} aria-hidden="true" />
        <span>{activeStage.label}</span>
        <strong>{activeStage.cycle}</strong>
        <b>{activeStage.progress}<small>%</small></b>
        <p>{activeStage.caption}</p>
      </div>
      <div className="cascade-controls" role="group" aria-label="项目阶段导航">
        <button type="button" className="cascade-control" aria-label="上一个项目" title="上一个项目" disabled={activeIndex === 0} onClick={() => selectStage(activeIndex - 1)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" className="cascade-control" aria-label="下一个项目" title="下一个项目" disabled={activeIndex === projectStages.length - 1} onClick={() => selectStage(activeIndex + 1)}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div
        className="cascade-viewport"
        ref={viewportRef}
        aria-label="项目阶段文件夹滚动区域"
        data-scroll-region="project-stages"
      >
        <div
          className="cascade-cards"
          ref={cardsRef}
          id="project-stage-tabs"
          role="tablist"
          aria-label="项目阶段文件夹"
          data-card-count={projectStages.length}
          style={{ '--cascade-gap': `${cardGap}px` } as React.CSSProperties}
        >
          {projectStages.map((stage, index) => {
            const active = index === activeIndex
            return (
              <button
                key={stage.id}
                ref={(node) => { cardRefs.current[index] = node }}
                data-cascade-index={index}
                data-stage-id={stage.id}
                className={active ? 'cascade-card is-highlighted' : 'cascade-card'}
                id={`project-stage-tab-${stage.id}`}
                role="tab"
                aria-selected={active}
                aria-controls="project-stage-detail"
                tabIndex={active ? 0 : -1}
                aria-label={`${stage.label}，完成度 ${stage.progress}%`}
                onClick={() => selectStage(index)}
              onKeyDown={(event) => handleStageKeyDown(event, index)}
              title={`查看${stage.label}详情`}
            >
              <span className="cascade-card-visual" aria-hidden="true">
                <span className="cascade-card-shadow" />
                <span className="cascade-card-back">
                  <span className="cascade-card-tab" />
                </span>
                <span className="cascade-card-sheet">
                  <span className="cascade-sheet-grid" />
                </span>
                <span className="cascade-card-front" />
                <span className="cascade-card-edge cascade-card-edge-side" />
                <span className="cascade-card-edge cascade-card-edge-bottom" />
                <span className="cascade-card-content">
                  <UsersRound size={15} />
                  <strong>{stage.label}</strong>
                </span>
              </span>
            </button>
            )
          })}
        </div>
      </div>
      <div className="cascade-floor" />
    </div>
  )
}

function Timeline({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  const rows = [
    { label: '需求与评审', color: 'blue', task: tasks[1], width: '34%', left: '7%' },
    { label: '交互与架构', color: 'cyan', task: tasks[2], width: '43%', left: '29%' },
    { label: '核心功能开发', color: 'green', task: tasks[0], width: '48%', left: '45%' },
    { label: '测试与验收', color: 'violet', task: tasks[3], width: '31%', left: '65%' },
  ]
  return (
    <section className="timeline-panel">
      <header>
        <div><CalendarDays size={16} /><strong>项目时间线</strong><span>2026 年 8 月</span></div>
        <div className="timeline-actions"><button>周 <ChevronDown size={13} /></button><button>今天</button></div>
      </header>
      <div className="timeline-grid">
        <div className="timeline-dates">
          {Array.from({ length: 13 }, (_, index) => <span key={index}>{index + 3}</span>)}
        </div>
        <span className="today-line"><b>8</b></span>
        {rows.map((row) => (
          <div className="timeline-row" key={row.label}>
            <span>{row.label}</span>
            <button className={`timeline-bar timeline-${row.color}`} style={{ width: row.width, left: row.left }} onClick={() => onSelect(row.task)}>
              {row.task.title}<small>{row.task.progress}%</small>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function TaskEventTimeline({ events }: { events: TaskEvent[] }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="inspector-section task-event-section">
      <button className="task-event-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span><Activity size={14} />执行事件</span>
        <small>{events.length} 个节点</small>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open ? (
        <ol className="task-event-list">
          {events.map((event, index) => (
            <li key={event.id} className={index === events.length - 1 ? `task-event task-event-${event.type} is-current` : `task-event task-event-${event.type}`}>
              <span className="task-event-marker"><i /></span>
              <div><header><strong>{event.title}</strong><time>{event.createdAt}</time></header><p>{event.description}</p></div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

function TaskInspector({ task }: { task: Task }) {
  const { updateTaskMode, updateTaskStatus } = useApp()
  const { notify } = useToast()
  const modes: { value: ExecutionMode; label: string }[] = [
    { value: 'manual', label: '手动' },
    { value: 'auto', label: '自动' },
    { value: 'full', label: '全权' },
  ]

  const primaryAction = () => {
    if (task.status === 'awaiting_approval') {
      updateTaskStatus(task.id, 'assigned')
      notify('审批已通过，任务进入 Agent 分配队列。', { title: '任务已批准' })
    } else if (task.status === 'assigned' || task.status === 'pending' || task.status === 'failed') {
      updateTaskStatus(task.id, 'running')
      notify('Agent 已开始执行，新的执行事件已写入时间线。', { title: '任务已启动' })
    } else if (task.status === 'running') {
      updateTaskStatus(task.id, 'succeeded')
      notify('任务已完成，可继续检查结果与文件变更。', { title: '任务已完成' })
    }
  }

  const changeMode = (mode: ExecutionMode) => {
    updateTaskMode(task.id, mode)
    notify(`执行模式已切换为${modes.find((item) => item.value === mode)?.label ?? mode}。`, { title: '执行策略已更新', tone: 'info' })
  }

  const cancelTask = () => {
    updateTaskStatus(task.id, 'cancelled')
    notify('任务已停止，未完成的执行资源将被释放。', { title: '任务已取消', tone: 'warning' })
  }

  const primaryLabel = task.status === 'awaiting_approval' ? '批准执行' : task.status === 'running' ? '标记完成' : '开始执行'
  const primaryIcon = task.status === 'awaiting_approval' ? <Check size={15} /> : task.status === 'running' ? <CheckCircle2 size={15} /> : <Play size={15} />

  return (
    <aside className="task-inspector" role="tabpanel" aria-label="任务详情">
      <header className="inspector-heading">
        <div><Sparkles size={17} /><strong>智能详情</strong></div>
        <IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton>
      </header>
      <div className="inspector-body" data-scroll-region="inspector-body">
        <span className="inspector-id">{task.id}</span>
        <div className="inspector-title-row">
          <h2>{task.title}</h2>
          <PriorityBadge priority={task.priority} />
        </div>
        <p className="inspector-summary">{task.summary}</p>

        <dl className="detail-list">
          <div><dt>执行 Agent</dt><dd><span className="mini-avatar"><Bot size={13} /></span>{task.assignee}</dd></div>
          <div><dt>所属项目</dt><dd><FolderKanban size={14} />{task.projectName}</dd></div>
          <div><dt>截止时间</dt><dd><CalendarDays size={14} />{task.dueAt}</dd></div>
          <div><dt>当前状态</dt><dd><StatusBadge status={task.status} /></dd></div>
          <div><dt>Token</dt><dd>{task.tokenUsed.toLocaleString()} / {task.tokenBudget.toLocaleString()}</dd></div>
        </dl>

        <div className="inspector-section">
          <div className="section-label"><span>上下文使用率</span><strong className={task.contextUsage > 80 ? 'text-danger' : ''}>{task.contextUsage}%</strong></div>
          <ProgressBar value={task.contextUsage} warning={task.contextUsage > 80} />
          {task.contextUsage > 80 ? <p className="inline-warning"><AlertTriangle size={14} />建议拆分任务或精简上下文</p> : null}
        </div>

        <div className="inspector-section">
          <span className="section-title">执行模式</span>
          <div className="segmented-control">
            {modes.map((mode) => (
              <button key={mode.value} className={task.executionMode === mode.value ? 'is-active' : ''} onClick={() => changeMode(mode.value)}>{mode.label}</button>
            ))}
          </div>
        </div>

        <TaskEventTimeline events={task.events} />

        <div className="tag-list">
          {task.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>

        <section className="ai-advice">
          <header><Bot size={16} /><strong>AI 助手建议</strong></header>
          <ul>
            {task.status === 'failed' ? <li>先检查 MCP 连接与凭证有效性，再重试执行。</li> : null}
            {task.contextUsage > 70 ? <li>上下文接近上限，建议把测试和实现拆成两个任务。</li> : <li>当前上下文健康，可继续由现有 Agent 执行。</li>}
            <li>变更完成后建议先运行类型检查和关键路径测试。</li>
          </ul>
        </section>
      </div>
      <footer className="inspector-footer">
        {['pending', 'assigned', 'awaiting_approval', 'running', 'failed'].includes(task.status) ? (
          <Button variant="primary" icon={primaryIcon} onClick={primaryAction}>{primaryLabel}</Button>
        ) : (
          <Button variant="secondary" icon={<GitCommitHorizontal size={15} />}>查看结果</Button>
        )}
        {!['succeeded', 'cancelled'].includes(task.status) ? (
          <Button variant="ghost" icon={<X size={15} />} onClick={cancelTask}>取消</Button>
        ) : null}
      </footer>
    </aside>
  )
}

export function TasksPage() {
  const { tasks } = useApp()
  const [scope, setScope] = useState<'all' | 'mine' | 'assigned'>('all')
  const [status, setStatus] = useState<'all' | TaskStatus>('all')
  const [query, setQuery] = useState('')
  const [sortNewest, setSortNewest] = useState(true)
  const [selectedId, setSelectedId] = useState(tasks[0]?.id)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'board' | 'detail' | 'timeline'>('board')

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    let result = tasks.filter((task) => {
      if (status !== 'all' && task.status !== status) return false
      if (scope === 'mine' && task.assignee !== 'Atlas Coder') return false
      if (scope === 'assigned' && ['pending', 'cancelled', 'succeeded'].includes(task.status)) return false
      return !text || `${task.id} ${task.title} ${task.projectName} ${task.assignee}`.toLowerCase().includes(text)
    })
    if (!sortNewest) result = [...result].reverse()
    return result
  }, [query, scope, sortNewest, status, tasks])

  const selected = tasks.find((task) => task.id === selectedId) ?? filtered[0] ?? tasks[0]
  const selectTask = (taskId: string, view: 'detail' | 'timeline' = 'detail') => {
    setSelectedId(taskId)
    setMobileView(view)
  }
  const metrics = {
    today: tasks.filter((task) => !['succeeded', 'cancelled'].includes(task.status)).length,
    running: tasks.filter((task) => task.status === 'running').length,
    completed: tasks.filter((task) => task.status === 'succeeded').length,
    overdue: tasks.filter((task) => task.status === 'failed').length,
  }

  const groups = useMemo(() => {
    return statusOrder
      .map((groupStatus) => ({ status: groupStatus, tasks: filtered.filter((task) => task.status === groupStatus) }))
      .filter((group) => group.tasks.length)
  }, [filtered])

  return (
    <div className="tasks-page">
      <PageHeader title="任务管理" description="高效规划、智能协同、结果驱动" />
      <SummaryStrip items={[
        { label: '今日待办', value: metrics.today, detail: '较昨日 ↑ 20%', icon: <ClipboardList size={16} />, tone: 'blue' },
        { label: '进行中', value: metrics.running, detail: '队列健康', icon: <Zap size={16} />, tone: 'green' },
        { label: '已完成', value: metrics.completed, detail: '本周 86%', icon: <CheckCircle2 size={16} />, tone: 'violet' },
        { label: '需要关注', value: metrics.overdue, detail: '较昨日 ↓ 40%', icon: <AlertTriangle size={16} />, tone: 'red' },
      ]} />

      <WorkbenchLayout
        className="task-workbench"
        inspector={selected ? <TaskInspector task={selected} /> : null}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((value) => !value)}
        mobileView={mobileView}
        onMobileViewChange={(value) => setMobileView(value as 'board' | 'detail' | 'timeline')}
        mobileViewOptions={[{ value: 'board', label: '看板', count: filtered.length }, { value: 'detail', label: '详情' }, { value: 'timeline', label: '时间线' }]}
      >
        <div className="task-center-column" role="tabpanel" aria-label="任务看板">
          <div className="board-toolbar">
            <div>
              <h2>任务看板</h2>
              <div className="scope-tabs">
                <button className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>全部任务</button>
                <button className={scope === 'mine' ? 'is-active' : ''} onClick={() => setScope('mine')}>我负责的</button>
                <button className={scope === 'assigned' ? 'is-active' : ''} onClick={() => setScope('assigned')}>已分配</button>
              </div>
            </div>
            <div className="board-tools">
              <label className="compact-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选任务" /></label>
              <label className="toolbar-select"><ListFilter size={15} /><select value={status} onChange={(event) => setStatus(event.target.value as 'all' | TaskStatus)}><option value="all">全部状态</option><option value="running">进行中</option><option value="awaiting_approval">待审批</option><option value="assigned">已分配</option><option value="failed">失败</option><option value="succeeded">已完成</option></select><ChevronDown size={13} /></label>
              <IconButton label="筛选"><Filter size={17} /></IconButton>
              <IconButton label="排序" className={sortNewest ? 'is-selected' : ''} onClick={() => setSortNewest((value) => !value)}><ArrowDownWideNarrow size={17} /></IconButton>
            </div>
          </div>

          <div className="board-overview">
            <div className="task-groups" data-scroll-region="task-list">
              {groups.length ? groups.slice(0, 4).map((group) => (
                <section key={group.status} className="task-group">
                  <header><div><span className={`task-state-dot task-state-${group.status}`} /><strong>{group.status === 'awaiting_approval' ? '需要审批' : group.status === 'running' ? '执行中' : group.status === 'assigned' ? '已分配' : group.status === 'failed' ? '需要处理' : group.status === 'succeeded' ? '已完成' : '待处理'}</strong><b>{group.tasks.length}</b></div><ChevronDown size={15} /></header>
                  <div>{group.tasks.map((task) => <TaskRow key={task.id} task={task} active={selected?.id === task.id} onClick={() => selectTask(task.id)} />)}</div>
                </section>
              )) : (
                <div className="task-filter-empty"><CircleDashed size={24} /><strong>没有匹配任务</strong><span>调整筛选条件后再试</span></div>
              )}
            </div>
            <ProjectCascade tasks={tasks} onSelect={(task) => selectTask(task.id)} />
          </div>

          <Timeline tasks={tasks} onSelect={(task) => selectTask(task.id)} />
        </div>
      </WorkbenchLayout>

      <section className="mobile-task-summary">
        <div><Gauge size={17} /><span>平均进度</span><strong>{Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)}%</strong></div>
        <div><UsersRound size={17} /><span>在线 Agent</span><strong>3 / 5</strong></div>
        <div><Clock3 size={17} /><span>平均执行</span><strong>42m</strong></div>
        <div><Layers3 size={17} /><span>项目数</span><strong>3</strong></div>
      </section>
    </div>
  )
}
