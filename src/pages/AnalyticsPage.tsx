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
  History,
  LoaderCircle,
  Search,
  ShieldCheck,
  TimerReset,
  UsersRound,
  XCircle,
  Zap,
} from 'lucide-react'
import { ApiClientError } from '../api/client'
import { exportAuditLogs } from '../api/audit'
import { handleApiError } from '../queries/errors'
import { Button, Dialog, ProgressBar, StatusBadge } from '../components/ui'
import { MobileViewTabs } from '../components/layout'
import { useAuditLogs, useDashboardSummary, useMetricsSummary, type DashboardRange } from '../queries/dashboard'
import { useToast } from '../state/useToast'
import type {
  AgentMetricBreakdownDto,
  AuditLogDto,
  DashboardSummaryDto,
  MetricsSummaryDto,
} from '../types'
import '../secondary-pages.css'

type RangeKey = DashboardRange
type MetricKey = 'tokens' | 'duration' | 'success' | 'executions'
type AuditActor = 'all' | 'user' | 'agent'

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

/** 任务状态分布项的展示名（后端 status 为字符串枚举值）。 */
const taskStatusLabels: Record<string, string> = {
  pending: '待处理',
  assigned: '已分配',
  awaiting_approval: '待审批',
  running: '进行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

function AnalyticsMetric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return (
    <article className={`analytics-metric analytics-metric-${tone}`}>
      <span className="analytics-metric-icon">{icon}</span>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  )
}

function StatePanel({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="state-panel" role="status">
      <span className="state-panel-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
    </div>
  )
}

function formatMetric(metric: MetricKey, value: number) {
  if (metric === 'tokens') return value >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : value.toLocaleString()
  if (metric === 'success') return `${value.toFixed(0)}%`
  if (metric === 'duration') return `${value.toFixed(0)}m`
  return value.toFixed(0)
}

/**
 * 已知告警类动作——既非失败也不宜标「成功」（心跳异常、预算告警、回收等）。
 * 后端 `AuditLogDto` 依文档契约无 `result` 字段，故按动作名启发式 + detail 解析。
 */
const WARNING_ACTIONS = ['heartbeat', 'budget_warn', 'reclaim', 'stale', 'warn', 'warning']

/**
 * 推断审计事件结果。优先解析 `detail`（JSON 字符串）中的 `result`/`level`/`status`
 * 字段取真实结果；否则按动作名启发式：含 fail → failed，已知告警类 → warning，其余 success。
 * 比纯 `/fail/i.test(action)` 二元推断更保守——不把告警类动作谎报为成功，也降低 failover
 * /prefill 等动作名的误判。
 */
function inferAuditResult(log: AuditLogDto): 'success' | 'warning' | 'failed' {
  if (log.detail) {
    try {
      const parsed = JSON.parse(log.detail) as Record<string, unknown>
      const raw = String(parsed.result ?? parsed.level ?? parsed.status ?? '').toLowerCase()
      if (raw === 'failed' || raw === 'fail' || raw === 'error') return 'failed'
      if (raw === 'warning' || raw === 'warn') return 'warning'
      if (raw === 'success' || raw === 'ok') return 'success'
    } catch {
      // detail 非 JSON——回落到动作名启发式
    }
  }
  const action = log.action.toLowerCase()
  if (/fail/i.test(log.action)) return 'failed'
  if (WARNING_ACTIONS.some((keyword) => action.includes(keyword))) return 'warning'
  return 'success'
}

/**
 * Bridge a backend `MetricsSummaryDto.perAgent[]` entry to a chartable row for
 * the trend bar chart. The backend exposes per-agent token/success/fail
 * breakdowns rather than a daily time series, so we chart one bar per agent —
 * preserving the existing bar-chart UI while binding it to real data.
 */
interface TrendPoint {
  label: string
  tokens: number
  duration: number
  success: number
  executions: number
}

function toTrendPoints(perAgent: AgentMetricBreakdownDto[]): TrendPoint[] {
  if (!perAgent.length) return []
  return perAgent.map((item) => {
    const total = item.successCount + item.failCount
    return {
      label: item.agentName ?? item.agentId ?? '未知 Agent',
      tokens: item.tokenUsed,
      // 后端无 per-agent 时长 → 用全局平均（由调用方覆盖）
      duration: 0,
      success: total ? (item.successCount / total) * 100 : 0,
      executions: total,
    }
  })
}

export function AnalyticsPage() {
  const { notify } = useToast()
  const summaryQuery = useDashboardSummary()
  const [range, setRange] = useState<RangeKey>('30d')
  const metricsQuery = useMetricsSummary(range)
  const [metric, setMetric] = useState<MetricKey>('tokens')
  const [mobileView, setMobileView] = useState<'trend' | 'agents' | 'audit'>('trend')
  const [auditQuery, setAuditQuery] = useState('')
  const [actorType, setActorType] = useState<AuditActor>('all')
  const [auditLimit, setAuditLimit] = useState(6)
  const [selectedAudit, setSelectedAudit] = useState<AuditEvent | null>(null)
  const [exporting, setExporting] = useState(false)

  const summary: DashboardSummaryDto | undefined = summaryQuery.data
  const metrics: MetricsSummaryDto | undefined = metricsQuery.data

  // 全局平均时长（毫秒 → 分钟），用于 duration 维度兜底
  const avgDurationMin = summary?.metricsSummary
    ? summary.metricsSummary.avgDurationMs / 60000
    : metrics?.summary
      ? metrics.summary.avgDurationMs / 60000
      : 0
  const successRate = summary ? summary.successRate * 100 : 0
  const tokenTotal = summary?.totalTokenUsed ?? 0
  const agentsCount = summary?.agentsCount ?? 0
  const agentsByStatus = summary?.agentsByStatus ?? []
  const onlineAgents = agentsByStatus
    .filter((item) => ['idle', 'busy'].includes(item.status))
    .reduce((sum, item) => sum + item.count, 0)
  const staleAgents = agentsByStatus
    .filter((item) => ['stale', 'offline'].includes(item.status))
    .reduce((sum, item) => sum + item.count, 0)
  const tasksByStatus = summary?.tasksByStatus ?? []
  const completedTasks = tasksByStatus
    .filter((item) => ['succeeded', 'failed'].includes(item.status))
    .reduce((sum, item) => sum + item.count, 0)

  const chartData = useMemo<TrendPoint[]>(() => {
    const points = toTrendPoints(metrics?.perAgent ?? [])
    // duration 维度用全局平均填充（后端无 per-agent 时长）
    return points.map((point) => ({ ...point, duration: avgDurationMin }))
  }, [metrics?.perAgent, avgDurationMin])
  const maxChartValue = Math.max(...chartData.map((point) => point[metric]), metric === 'success' ? 100 : 1)

  // 审计日志：useAuditLogs 拉取最近一页；前端再按 actorType/搜索过滤
  const auditQueryResult = useAuditLogs({ pageSize: 50 })
  const auditLogs: AuditLogDto[] = auditQueryResult.data?.data ?? []

  const filteredAudits = useMemo<AuditEvent[]>(() => {
    const text = auditQuery.trim().toLowerCase()
    return auditLogs.map((log): AuditEvent => ({
      id: log.id,
      time: log.createdAt,
      actor: log.actorId,
      actorType: (log.actorType === 'agent' ? 'agent' : 'user') as Exclude<AuditActor, 'all'>,
      action: log.action,
      target: log.entityId,
      // 后端无 result 字段 → 优先解析 detail JSON，否则按动作名启发式（见 inferAuditResult）
      result: inferAuditResult(log),
      projectId: log.entityType,
      detail: log.detail,
      traceId: log.id,
    })).filter((event) => {
      if (actorType !== 'all' && event.actorType !== actorType) return false
      return !text || `${event.actor} ${event.action} ${event.target} ${event.detail} ${event.traceId}`.toLowerCase().includes(text)
    })
  }, [actorType, auditQuery, auditLogs])

  // 导出审计日志：GET /audit-logs/export → blob → objectURL 触发下载。
  // 走 fetch 而非浏览器直链，以便统一 401/403/500 错误处理（handleApiError toast，不静默）。
  const exportAudit = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const blob = await exportAuditLogs()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      anchor.download = `audit-logs-${stamp}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      notify('审计日志已导出', { tone: 'success' })
    } catch (error) {
      notify(handleApiError(error), { tone: 'error', title: '导出失败' })
    } finally {
      setExporting(false)
    }
  }

  // 加载/错误态：summary 是页面骨架，失败时整页降级
  if (summaryQuery.isLoading) {
    return (
      <div className="analytics-page secondary-page">
        <StatePanel icon={<LoaderCircle size={22} className="spin" />} title="正在加载可观测数据" description="从后端拉取仪表盘汇总…" />
      </div>
    )
  }
  if (summaryQuery.error) {
    return (
      <div className="analytics-page secondary-page">
        <StatePanel icon={<AlertTriangle size={22} />} title="可观测数据加载失败" description={(summaryQuery.error as ApiClientError)?.message ?? '请稍后重试或检查登录状态。'} />
      </div>
    )
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
        <Button variant="secondary" size="sm" icon={<ArrowDownToLine size={15} />} disabled={exporting} onClick={exportAudit}>{exporting ? '导出中…' : '导出审计'}</Button>
        </div>
      </header>

      <section className="analytics-metric-grid" aria-label="核心指标">
        <AnalyticsMetric icon={<CircleDollarSign size={21} />} label="Token 消耗" value={tokenTotal.toLocaleString()} detail={`累计 Token 用量`} tone="blue" />
        <AnalyticsMetric icon={<Clock3 size={21} />} label="平均执行时长" value={`${avgDurationMin.toFixed(0)} 分钟`} detail={avgDurationMin <= 45 ? '处于健康区间' : '需要关注长任务'} tone="violet" />
        <AnalyticsMetric icon={<CheckCircle2 size={21} />} label="任务成功率" value={`${successRate.toFixed(1)}%`} detail={`${completedTasks} 个已结束任务`} tone="green" />
        <AnalyticsMetric icon={<Activity size={21} />} label="在线 Agent" value={`${onlineAgents} / ${agentsCount}`} detail={`${staleAgents} 个心跳异常`} tone="orange" />
      </section>

      <MobileViewTabs
        value={mobileView}
        onChange={(value) => setMobileView(value as 'trend' | 'agents' | 'audit')}
        options={[{ value: 'trend', label: '趋势' }, { value: 'agents', label: 'Agent', count: agentsCount }, { value: 'audit', label: '审计', count: filteredAudits.length }]}
        className="analytics-mobile-tabs"
      />

      <div className="analytics-content-scroll" data-scroll-region="analytics-content">
      <section className="analytics-main-grid analytics-workbench" aria-label="执行观测工作台" data-layout-region="workbench">
        <article className="analytics-trend-panel analytics-focus-panel" role="tabpanel" aria-label="执行趋势" data-layout-region="main">
          <header className="analytics-panel-header">
            <div><span className="panel-icon"><BarChart3 size={17} /></span><span><strong>执行趋势</strong><small>{rangeLabels[range]}按 Agent 聚合</small></span></div>
            <div className="analytics-metric-tabs">
              {(Object.keys(metricLabels) as MetricKey[]).map((value) => (
                <button key={value} className={metric === value ? 'is-active' : ''} onClick={() => setMetric(value)}>{metricLabels[value].label}</button>
              ))}
            </div>
          </header>
          {metricsQuery.isLoading ? <StatePanel icon={<LoaderCircle size={20} className="spin" />} title="正在加载度量数据" description="从后端拉取时间序列聚合…" />
            : metricsQuery.error ? <StatePanel icon={<AlertTriangle size={20} />} title="度量数据加载失败" description={(metricsQuery.error as ApiClientError)?.message ?? '可能当前角色无 metric:read 能力。'} />
            : (
          <>
          <div className="analytics-chart-summary">
            <span>{metricLabels[metric].label}</span>
            <strong>{chartData.length ? formatMetric(metric, chartData.reduce((total, point) => total + point[metric], 0) / chartData.length) : '—'}</strong>
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
            <span><Zap size={14} />峰值 {chartData.length ? formatMetric(metric, Math.max(...chartData.map((point) => point[metric]))) : '—'}</span>
            <span><TimerReset size={14} />数据每 5 分钟聚合</span>
          </footer>
          </>
            )}
        </article>

        <aside className="agent-observability-panel analytics-inspector-panel" role="tabpanel" aria-label="Agent 健康度" data-layout-region="inspector">
          <header className="analytics-panel-header">
            <div><span className="panel-icon"><Bot size={17} /></span><span><strong>Agent 健康度</strong><small>状态分布与执行表现</small></span></div>
          </header>
          <div className="agent-health-list" data-scroll-region="analytics-agent-list">
            {agentsByStatus.map((item) => {
              const label = taskStatusLabels[item.status] ?? item.status
              return (
                <div key={item.status} className="agent-health-row">
                  <span className="mini-avatar"><Bot size={13} /></span>
                  <span className="agent-health-main"><strong>{label}</strong><small>{item.status}</small></span>
                  <span className="agent-health-stats"><b>{item.count}</b><small>个实例</small></span>
                  <StatusBadge status={item.status as 'idle' | 'busy' | 'offline' | 'stale'} />
                  <ChevronRight size={15} />
                </div>
              )
            })}
            {!agentsByStatus.length ? <div className="audit-empty"><Bot size={20} /><strong>暂无 Agent 状态数据</strong><span>稍后重试或检查 Agent 列表。</span></div> : null}
          </div>
          <div className="selected-agent-summary">
            <header><div><strong>Agent 执行表现</strong><span>按 Agent 拆分的 Token 与成败</span></div></header>
            <div className="selected-agent-metrics">
              <span><small>总 Token</small><strong>{(metrics?.summary.totalTokenUsed ?? 0).toLocaleString()}</strong></span>
              <span><small>成功</small><strong>{metrics?.summary.successCount ?? 0}</strong></span>
              <span><small>失败</small><strong>{metrics?.summary.failCount ?? 0}</strong></span>
            </div>
            <div className="selected-agent-budget"><span><span>成功率</span><b>{((metrics?.summary.successRate ?? 0) * 100).toFixed(0)}%</b></span><ProgressBar value={(metrics?.summary.successRate ?? 0) * 100} /></div>
          </div>
        </aside>
      </section>

      <section className="audit-panel analytics-audit-panel" role="tabpanel" aria-label="审计追踪" data-layout-region="audit">
        <header className="analytics-panel-header audit-panel-heading">
          <div><span className="panel-icon"><ShieldCheck size={17} /></span><span><strong>审计追踪</strong><small>业务写入失败不会阻塞主流程</small></span></div>
          <div className="audit-tools">
            <label className="compact-search"><Search size={15} /><input value={auditQuery} onChange={(event) => { setAuditQuery(event.target.value); setAuditLimit(6) }} placeholder="搜索操作、对象或 Trace ID" /></label>
            <label className="toolbar-select"><Filter size={14} /><select value={actorType} onChange={(event) => { setActorType(event.target.value as AuditActor); setAuditLimit(6) }} aria-label="操作主体"><option value="all">全部主体</option><option value="user">用户</option><option value="agent">Agent</option></select><ChevronDown size={13} /></label>
          </div>
        </header>

        <div className="audit-table-wrap" data-scroll-region="analytics-audit-table">
          {auditQueryResult.isLoading ? <StatePanel icon={<LoaderCircle size={20} className="spin" />} title="正在加载审计日志" description="从后端拉取最近操作记录…" />
            : auditQueryResult.error ? <StatePanel icon={<AlertTriangle size={20} />} title="审计日志加载失败" description={(auditQueryResult.error as ApiClientError)?.message ?? '可能当前角色无 audit:read 能力。'} />
            : (
          <table className="audit-table">
            <thead><tr><th>时间</th><th>操作主体</th><th>动作</th><th>对象</th><th>结果</th><th><span className="sr-only">详情</span></th></tr></thead>
            <tbody>
              {filteredAudits.slice(0, auditLimit).map((event) => (
                <tr key={event.id} onClick={() => setSelectedAudit(event)}>
                  <td><Clock3 size={13} />{event.time}</td>
                  <td><span className={`audit-actor audit-actor-${event.actorType}`}>{event.actorType === 'user' ? <UsersRound size={13} /> : <Bot size={13} />}</span><span><strong>{event.actor}</strong><small>{event.actorType}</small></span></td>
                  <td><code>{event.action}</code></td>
                  <td><strong>{event.target}</strong></td>
                  <td><span className={`audit-result audit-result-${event.result}`}>{event.result === 'success' ? <CheckCircle2 size={13} /> : event.result === 'warning' ? <AlertTriangle size={13} /> : <XCircle size={13} />}{event.result === 'success' ? '成功' : event.result === 'warning' ? '告警' : '失败'}</span></td>
                  <td><button aria-label={`查看 ${event.id} 详情`} onClick={(clickEvent) => { clickEvent.stopPropagation(); setSelectedAudit(event) }}><ChevronRight size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
            )}
          {!auditQueryResult.isLoading && !auditQueryResult.error && !filteredAudits.length ? <div className="audit-empty"><History size={20} /><strong>没有匹配的审计记录</strong><span>调整筛选条件后再试。</span></div> : null}
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
            <dl><div><dt>主体</dt><dd>{selectedAudit.actor} ({selectedAudit.actorType})</dd></div><div><dt>对象</dt><dd>{selectedAudit.target}</dd></div><div><dt>Trace ID</dt><dd><code>{selectedAudit.traceId}</code></dd></div><div><dt>类型</dt><dd>{selectedAudit.projectId}</dd></div></dl>
            <section><strong>事件说明</strong><p>{selectedAudit.detail}</p></section>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
