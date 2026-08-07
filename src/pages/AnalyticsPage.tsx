import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  Gauge,
  History,
  Search,
  ShieldCheck,
  TimerReset,
  UsersRound,
  XCircle,
  Zap,
} from 'lucide-react'
import { Button, Dialog, ProgressBar, StatusBadge } from '../components/ui'
import { MobileViewTabs } from '../components/layout'
import { agents } from '../data/mock'
import { useApp } from '../state/useApp'
import '../secondary-pages.css'

type RangeKey = '7d' | '30d' | '90d'
type MetricKey = 'tokens' | 'duration' | 'success' | 'executions'
type AuditActor = 'all' | 'user' | 'agent' | 'service'

interface TrendPoint {
  label: string
  tokens: number
  duration: number
  success: number
  executions: number
}

interface AuditEvent {
  id: string
  time: string
  actor: string
  actorType: Exclude<AuditActor, 'all'>
  action: string
  target: string
  result: 'success' | 'warning' | 'failed'
  projectId: string
  detail: string
  traceId: string
}

const rangeLabels: Record<RangeKey, string> = {
  '7d': '最近 7 天',
  '30d': '最近 30 天',
  '90d': '最近 90 天',
}

const metricLabels: Record<MetricKey, { label: string; unit: string }> = {
  tokens: { label: 'Token 消耗', unit: 'Token' },
  duration: { label: '平均执行时长', unit: '分钟' },
  success: { label: '执行成功率', unit: '%' },
  executions: { label: '执行次数', unit: '次' },
}

const trendSeries: Record<RangeKey, TrendPoint[]> = {
  '7d': [
    { label: '周四', tokens: 13200, duration: 38, success: 91, executions: 9 },
    { label: '周五', tokens: 18600, duration: 46, success: 94, executions: 12 },
    { label: '周六', tokens: 9100, duration: 32, success: 96, executions: 6 },
    { label: '周日', tokens: 7600, duration: 28, success: 100, executions: 5 },
    { label: '周一', tokens: 22400, duration: 51, success: 88, executions: 14 },
    { label: '周二', tokens: 27800, duration: 43, success: 95, executions: 17 },
    { label: '今天', tokens: 24100, duration: 41, success: 93, executions: 15 },
  ],
  '30d': [
    { label: '第 1 周', tokens: 63800, duration: 44, success: 92, executions: 41 },
    { label: '第 2 周', tokens: 79200, duration: 48, success: 91, executions: 49 },
    { label: '第 3 周', tokens: 71400, duration: 39, success: 95, executions: 46 },
    { label: '第 4 周', tokens: 93200, duration: 42, success: 94, executions: 58 },
    { label: '本周', tokens: 106800, duration: 41, success: 93, executions: 63 },
  ],
  '90d': [
    { label: '5 月下', tokens: 118000, duration: 53, success: 88, executions: 72 },
    { label: '6 月上', tokens: 146000, duration: 49, success: 90, executions: 86 },
    { label: '6 月下', tokens: 172000, duration: 47, success: 91, executions: 101 },
    { label: '7 月上', tokens: 214000, duration: 45, success: 92, executions: 126 },
    { label: '7 月下', tokens: 238000, duration: 43, success: 94, executions: 141 },
    { label: '8 月', tokens: 257000, duration: 41, success: 93, executions: 153 },
  ],
}

const auditEvents: AuditEvent[] = [
  { id: 'audit-1081', time: '今天 15:42:18', actor: 'Atlas Coder', actorType: 'agent', action: 'execute', target: 'CC-2026-031', result: 'success', projectId: 'repo-1', detail: '完成文件树安全路径检查并上报执行进度。', traceId: 'tr_2cda91f8' },
  { id: 'audit-1080', time: '今天 15:36:04', actor: 'Brandon', actorType: 'user', action: 'assign', target: 'CC-2026-031', result: 'success', projectId: 'repo-1', detail: '将任务分配给 Atlas Coder，执行模式设为自动。', traceId: 'tr_7f302bd4' },
  { id: 'audit-1079', time: '今天 15:20:51', actor: 'Connector', actorType: 'service', action: 'heartbeat', target: 'agent-lin', result: 'warning', projectId: 'repo-2', detail: '本地 Connector 连续三个周期未上报心跳，Agent 标记为 stale。', traceId: 'tr_d01e3cb7' },
  { id: 'audit-1078', time: '今天 14:58:32', actor: 'Iris QA', actorType: 'agent', action: 'execute', target: 'CC-2026-027', result: 'failed', projectId: 'repo-3', detail: 'ContextDB MCP 健康检查失败，已按策略跳过知识库检索。', traceId: 'tr_f53b6c20' },
  { id: 'audit-1077', time: '今天 14:41:09', actor: 'Nova PM', actorType: 'agent', action: 'analyze', target: 'REQ-104', result: 'success', projectId: 'repo-1', detail: '生成 Spec v2 并等待管理角色审批。', traceId: 'tr_2ebd9031' },
  { id: 'audit-1076', time: '今天 13:16:44', actor: 'Brandon', actorType: 'user', action: 'update', target: 'repo-2', result: 'success', projectId: 'repo-2', detail: '更新 Agent Runtime 的默认分支配置。', traceId: 'tr_89a012ad' },
  { id: 'audit-1075', time: '今天 11:03:26', actor: 'Token Meter', actorType: 'service', action: 'budget_warn', target: 'agent-atlas', result: 'warning', projectId: 'repo-1', detail: 'Atlas Coder 周期 Token 用量达到预算的 61.4%。', traceId: 'tr_3718ab95' },
  { id: 'audit-1074', time: '昨天 18:22:10', actor: 'Ming', actorType: 'user', action: 'review', target: 'CC-2026-028', result: 'success', projectId: 'repo-1', detail: '接受任务变更审查中的两个文件。', traceId: 'tr_93caef40' },
  { id: 'audit-1073', time: '昨天 17:40:05', actor: 'Scheduler', actorType: 'service', action: 'reclaim', target: 'CC-2026-029', result: 'warning', projectId: 'repo-2', detail: '检测到 Agent 心跳异常，任务进入待回收观察窗口。', traceId: 'tr_17b5d8a1' },
]

const durationByTask: Record<string, number> = {
  'CC-2026-031': 48,
  'CC-2026-030': 31,
  'CC-2026-029': 52,
  'CC-2026-028': 67,
  'CC-2026-027': 44,
  'CC-2026-026': 36,
}

function AnalyticsMetric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return (
    <article className={`analytics-metric analytics-metric-${tone}`}>
      <span className="analytics-metric-icon">{icon}</span>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  )
}

function formatMetric(metric: MetricKey, value: number) {
  if (metric === 'tokens') return value >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : value.toLocaleString()
  if (metric === 'success') return `${value.toFixed(0)}%`
  if (metric === 'duration') return `${value.toFixed(0)}m`
  return value.toFixed(0)
}

export function AnalyticsPage() {
  const { tasks, projects } = useApp()
  const [range, setRange] = useState<RangeKey>('30d')
  const [projectId, setProjectId] = useState('all')
  const [metric, setMetric] = useState<MetricKey>('tokens')
  const [mobileView, setMobileView] = useState<'trend' | 'agents' | 'audit'>('trend')
  const [auditQuery, setAuditQuery] = useState('')
  const [actorType, setActorType] = useState<AuditActor>('all')
  const [auditLimit, setAuditLimit] = useState(6)
  const [selectedAudit, setSelectedAudit] = useState<AuditEvent | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0].id)

  const scopedTasks = useMemo(
    () => projectId === 'all' ? tasks : tasks.filter((task) => task.projectId === projectId),
    [projectId, tasks],
  )
  const scopeRatio = tasks.length ? Math.max(0.18, scopedTasks.length / tasks.length) : 1
  const rangeFactor = range === '7d' ? 0.28 : range === '90d' ? 2.7 : 1
  const tokenTotal = Math.round(scopedTasks.reduce((total, task) => total + task.tokenUsed, 0) * rangeFactor)
  const completed = scopedTasks.filter((task) => ['succeeded', 'failed'].includes(task.status))
  const successRate = completed.length ? completed.filter((task) => task.status === 'succeeded').length / completed.length * 100 : 0
  const averageDuration = scopedTasks.length
    ? scopedTasks.reduce((total, task) => total + (durationByTask[task.id] ?? 40), 0) / scopedTasks.length
    : 0
  const onlineAgents = agents.filter((agent) => ['idle', 'busy'].includes(agent.status)).length
  const budgetTotal = scopedTasks.reduce((total, task) => total + task.tokenBudget, 0)
  const budgetUsage = budgetTotal ? scopedTasks.reduce((total, task) => total + task.tokenUsed, 0) / budgetTotal * 100 : 0

  const chartData = useMemo(() => trendSeries[range].map((point) => ({
    ...point,
    tokens: Math.round(point.tokens * scopeRatio),
    executions: Math.max(1, Math.round(point.executions * scopeRatio)),
  })), [range, scopeRatio])
  const maxChartValue = Math.max(...chartData.map((point) => point[metric]), metric === 'success' ? 100 : 1)

  const filteredAudits = useMemo(() => {
    const text = auditQuery.trim().toLowerCase()
    return auditEvents.filter((event) => {
      if (projectId !== 'all' && event.projectId !== projectId) return false
      if (actorType !== 'all' && event.actorType !== actorType) return false
      return !text || `${event.actor} ${event.action} ${event.target} ${event.detail} ${event.traceId}`.toLowerCase().includes(text)
    })
  }, [actorType, auditQuery, projectId])

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0]

  const exportAudit = () => {
    const rows = [
      ['time', 'actor', 'actor_type', 'action', 'target', 'result', 'trace_id'],
      ...filteredAudits.map((event) => [event.time, event.actor, event.actorType, event.action, event.target, event.result, event.traceId]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `codingcenter-audit-${range}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`analytics-page secondary-page analytics-redesign mobile-view-${mobileView}`}>
      <header className="secondary-page-header analytics-page-header">
        <div className="secondary-page-heading">
          <span className="secondary-page-kicker"><Activity size={14} />运行观测</span>
          <h2>可观测中心</h2>
          <p>把执行趋势、Agent 健康与审计事件放在同一个可扫描工作区。</p>
        </div>
        <div className="analytics-commandbar">
        <div className="analytics-range-tabs" aria-label="统计时间范围">
          {(Object.keys(rangeLabels) as RangeKey[]).map((value) => (
            <button key={value} className={range === value ? 'is-active' : ''} onClick={() => setRange(value)}>{rangeLabels[value]}</button>
          ))}
        </div>
        <label className="toolbar-select analytics-project-filter">
          <BarChart3 size={15} />
          <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setAuditLimit(6) }} aria-label="按项目筛选">
            <option value="all">全部项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <ChevronDown size={13} />
        </label>
        <Button variant="secondary" size="sm" icon={<ArrowDownToLine size={15} />} onClick={exportAudit}>导出审计</Button>
        </div>
      </header>

      <section className="analytics-metric-grid" aria-label="核心指标">
        <AnalyticsMetric icon={<CircleDollarSign size={21} />} label="Token 消耗" value={tokenTotal.toLocaleString()} detail={`预算使用 ${budgetUsage.toFixed(1)}%`} tone="blue" />
        <AnalyticsMetric icon={<Clock3 size={21} />} label="平均执行时长" value={`${averageDuration.toFixed(0)} 分钟`} detail={averageDuration <= 45 ? '处于健康区间' : '需要关注长任务'} tone="violet" />
        <AnalyticsMetric icon={<CheckCircle2 size={21} />} label="任务成功率" value={`${successRate.toFixed(1)}%`} detail={`${completed.length} 个已结束任务`} tone="green" />
        <AnalyticsMetric icon={<Activity size={21} />} label="在线 Agent" value={`${onlineAgents} / ${agents.length}`} detail={`${agents.filter((agent) => agent.status === 'stale').length} 个心跳异常`} tone="orange" />
      </section>

      <MobileViewTabs
        value={mobileView}
        onChange={(value) => setMobileView(value as 'trend' | 'agents' | 'audit')}
        options={[{ value: 'trend', label: '趋势' }, { value: 'agents', label: 'Agent', count: agents.length }, { value: 'audit', label: '审计', count: filteredAudits.length }]}
        className="analytics-mobile-tabs"
      />

      <div className="analytics-content-scroll" data-scroll-region="analytics-content">
      <section className="analytics-main-grid analytics-workbench" aria-label="执行观测工作台" data-layout-region="workbench">
        <article className="analytics-trend-panel analytics-focus-panel" role="tabpanel" aria-label="执行趋势" data-layout-region="main">
          <header className="analytics-panel-header">
            <div><span className="panel-icon"><BarChart3 size={17} /></span><span><strong>执行趋势</strong><small>{rangeLabels[range]}聚合数据</small></span></div>
            <div className="analytics-metric-tabs">
              {(Object.keys(metricLabels) as MetricKey[]).map((value) => (
                <button key={value} className={metric === value ? 'is-active' : ''} onClick={() => setMetric(value)}>{metricLabels[value].label}</button>
              ))}
            </div>
          </header>
          <div className="analytics-chart-summary">
            <span>{metricLabels[metric].label}</span>
            <strong>{formatMetric(metric, chartData.reduce((total, point) => total + point[metric], 0) / chartData.length)}</strong>
            <small>{metric === 'tokens' || metric === 'executions' ? '周期平均' : '当前平均'}</small>
          </div>
          <div className="analytics-bar-chart" role="img" aria-label={`${metricLabels[metric].label}趋势图`}>
            <div className="analytics-chart-grid"><i /><i /><i /><i /></div>
            {chartData.map((point) => {
              const value = point[metric]
              const height = Math.max(8, value / maxChartValue * 100)
              return (
                <div className="analytics-bar-column" key={point.label}>
                  <span className="analytics-bar-value">{formatMetric(metric, value)}</span>
                  <div className="analytics-bar-slot"><span className={`analytics-bar analytics-bar-${metric}`} style={{ '--bar-height': `${height}%` } as CSSProperties} /></div>
                  <small>{point.label}</small>
                </div>
              )
            })}
          </div>
          <footer className="analytics-chart-footer">
            <span><Zap size={14} />峰值 {formatMetric(metric, Math.max(...chartData.map((point) => point[metric])))}</span>
            <span><TimerReset size={14} />数据每 5 分钟聚合</span>
          </footer>
        </article>

        <aside className="agent-observability-panel analytics-inspector-panel" role="tabpanel" aria-label="Agent 健康度" data-layout-region="inspector">
          <header className="analytics-panel-header">
            <div><span className="panel-icon"><Bot size={17} /></span><span><strong>Agent 健康度</strong><small>心跳、预算与执行表现</small></span></div>
          </header>
          <div className="agent-health-list" data-scroll-region="analytics-agent-list">
            {agents.map((agent) => {
              const usage = agent.tokenBudget ? agent.tokenUsed / agent.tokenBudget * 100 : 0
              return (
                <button key={agent.id} className={selectedAgent.id === agent.id ? 'agent-health-row is-active' : 'agent-health-row'} onClick={() => setSelectedAgentId(agent.id)}>
                  <span className="mini-avatar"><Bot size={13} /></span>
                  <span className="agent-health-main"><strong>{agent.name}</strong><small>{agent.currentTask ?? '暂无执行任务'}</small></span>
                  <span className="agent-health-stats"><b>{agent.successRate}%</b><small>{usage.toFixed(0)}% 预算</small></span>
                  <StatusBadge status={agent.status} />
                  <ChevronRight size={15} />
                </button>
              )
            })}
          </div>
          <div className="selected-agent-summary">
            <header><div><strong>{selectedAgent.name}</strong><span>{selectedAgent.model} / {selectedAgent.runtime === 'local' ? '本地运行时' : '云端运行时'}</span></div><StatusBadge status={selectedAgent.status} /></header>
            <div className="selected-agent-metrics"><span><small>成功率</small><strong>{selectedAgent.successRate}%</strong></span><span><small>Token</small><strong>{selectedAgent.tokenUsed.toLocaleString()}</strong></span><span><small>心跳</small><strong>{selectedAgent.lastHeartbeat}</strong></span></div>
            <div className="selected-agent-budget"><span><span>周期预算</span><b>{Math.round(selectedAgent.tokenUsed / selectedAgent.tokenBudget * 100)}%</b></span><ProgressBar value={selectedAgent.tokenUsed / selectedAgent.tokenBudget * 100} warning={selectedAgent.tokenUsed / selectedAgent.tokenBudget > 0.8} /></div>
          </div>
        </aside>
      </section>

      <section className="audit-panel analytics-audit-panel" role="tabpanel" aria-label="审计追踪" data-layout-region="audit">
        <header className="analytics-panel-header audit-panel-heading">
          <div><span className="panel-icon"><ShieldCheck size={17} /></span><span><strong>审计追踪</strong><small>业务写入失败不会阻塞主流程</small></span></div>
          <div className="audit-tools">
            <label className="compact-search"><Search size={15} /><input value={auditQuery} onChange={(event) => { setAuditQuery(event.target.value); setAuditLimit(6) }} placeholder="搜索操作、对象或 Trace ID" /></label>
            <label className="toolbar-select"><Filter size={14} /><select value={actorType} onChange={(event) => { setActorType(event.target.value as AuditActor); setAuditLimit(6) }} aria-label="操作主体"><option value="all">全部主体</option><option value="user">用户</option><option value="agent">Agent</option><option value="service">服务</option></select><ChevronDown size={13} /></label>
          </div>
        </header>

        <div className="audit-table-wrap" data-scroll-region="analytics-audit-table">
          <table className="audit-table">
            <thead><tr><th>时间</th><th>操作主体</th><th>动作</th><th>对象</th><th>结果</th><th><span className="sr-only">详情</span></th></tr></thead>
            <tbody>
              {filteredAudits.slice(0, auditLimit).map((event) => (
                <tr key={event.id} onClick={() => setSelectedAudit(event)}>
                  <td><Clock3 size={13} />{event.time}</td>
                  <td><span className={`audit-actor audit-actor-${event.actorType}`}>{event.actorType === 'user' ? <UsersRound size={13} /> : event.actorType === 'agent' ? <Bot size={13} /> : <Gauge size={13} />}</span><span><strong>{event.actor}</strong><small>{event.actorType}</small></span></td>
                  <td><code>{event.action}</code></td>
                  <td><strong>{event.target}</strong></td>
                  <td><span className={`audit-result audit-result-${event.result}`}>{event.result === 'success' ? <CheckCircle2 size={13} /> : event.result === 'warning' ? <AlertTriangle size={13} /> : <XCircle size={13} />}{event.result === 'success' ? '成功' : event.result === 'warning' ? '告警' : '失败'}</span></td>
                  <td><button aria-label={`查看 ${event.id} 详情`} onClick={(clickEvent) => { clickEvent.stopPropagation(); setSelectedAudit(event) }}><ChevronRight size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredAudits.length ? <div className="audit-empty"><History size={20} /><strong>没有匹配的审计记录</strong><span>调整筛选条件后再试。</span></div> : null}
        </div>
        {auditLimit < filteredAudits.length ? <footer className="audit-pagination"><Button variant="ghost" size="sm" onClick={() => setAuditLimit((value) => value + 4)}>加载更多</Button><span>已显示 {Math.min(auditLimit, filteredAudits.length)} / {filteredAudits.length}</span></footer> : null}
      </section>
      </div>

      <Dialog
        open={Boolean(selectedAudit)}
        onClose={() => setSelectedAudit(null)}
        title="审计事件详情"
        description={selectedAudit ? `${selectedAudit.id} / ${selectedAudit.time}` : undefined}
        footer={<Button variant="secondary" onClick={() => setSelectedAudit(null)}>关闭</Button>}
      >
        {selectedAudit ? (
          <div className="audit-detail">
            <div className={`audit-detail-result audit-detail-${selectedAudit.result}`}>{selectedAudit.result === 'success' ? <CheckCircle2 size={18} /> : selectedAudit.result === 'warning' ? <AlertTriangle size={18} /> : <XCircle size={18} />}<span><strong>{selectedAudit.action}</strong><small>{selectedAudit.result === 'success' ? '操作成功完成' : selectedAudit.result === 'warning' ? '操作完成并产生告警' : '操作执行失败'}</small></span></div>
            <dl><div><dt>主体</dt><dd>{selectedAudit.actor} ({selectedAudit.actorType})</dd></div><div><dt>对象</dt><dd>{selectedAudit.target}</dd></div><div><dt>Trace ID</dt><dd><code>{selectedAudit.traceId}</code></dd></div><div><dt>项目</dt><dd>{projects.find((project) => project.id === selectedAudit.projectId)?.name ?? selectedAudit.projectId}</dd></div></dl>
            <section><strong>事件说明</strong><p>{selectedAudit.detail}</p></section>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
