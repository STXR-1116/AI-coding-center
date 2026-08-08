import { useMemo, useState, type FormEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Cpu,
  Gauge,
  KeyRound,
  Laptop,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { Button, Dialog, EmptyState, IconButton, ProgressBar, StatusBadge } from '../components/ui'
import { PageHeader, SummaryStrip, WorkbenchLayout } from '../components/layout'
import { useAgents, useRegisterAgent, useSquads, useUpdateAgent } from '../queries/agents'
import { ApiClientError } from '../api/client'
import { handleApiError } from '../queries/errors'
import { toAgent, toSquad } from '../api/agents'
import type { Squad } from '../api/agents'
import { useToast } from '../state/useToast'
import type {
  Agent,
  AgentStatus,
  ExecutionMode,
  RegisterAgentInput,
  UpdateAgentPatch,
} from '../types'
import '../resource-pages.css'

// DTO → UI 桥接（toAgent/toSquad + 枚举兜底）已下沉到 src/api/agents.ts，
// 与 src/api/tasks.ts 的 toTask 同型；纯函数单测见 src/api/agents.test.ts。

const kindLabels: Record<Agent['kind'], string> = {
  digital: '数字人',
  coder: 'Coder',
  qa: 'QA',
  assistant: '助理',
}

const executionModeLabels: Record<ExecutionMode, string> = {
  manual: '手动',
  auto: '自动',
  full: '全权',
}

function AgentAvatar({ agent }: { agent: Agent }) {
  return (
    <span className={`agent-avatar agent-avatar-${agent.kind}`}>
      {agent.kind === 'digital' ? <BrainCircuit size={18} /> : <Bot size={18} />}
    </span>
  )
}

function StatePanel({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
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

export function AgentsPage() {
  const { notify } = useToast()
  const agentsQuery = useAgents()
  const squadsQuery = useSquads()
  const updateAgentMutation = useUpdateAgent()
  const registerAgentMutation = useRegisterAgent()

  const [view, setView] = useState<'agents' | 'squads'>('agents')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | AgentStatus>('all')
  const [kind, setKind] = useState<'all' | Agent['kind']>('all')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedSquadId, setSelectedSquadId] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [squadDialogOpen, setSquadDialogOpen] = useState(false)
  const [credentialNotice, setCredentialNotice] = useState('')
  const [agentForm, setAgentForm] = useState({ name: '', kind: 'coder' as Agent['kind'], runtime: 'cloud' as Agent['runtime'], model: 'Codex', tokenBudget: 200000 })
  const [squadForm, setSquadForm] = useState({ name: '', focus: '', leadAgentId: '' })

  // 后端 DTO → UI 领域模型
  const agentRows: Agent[] = useMemo(
    () => (agentsQuery.data ?? []).map(toAgent),
    [agentsQuery.data],
  )
  const squads: Squad[] = useMemo(
    () => (squadsQuery.data ?? []).map(toSquad),
    [squadsQuery.data],
  )

  const filteredAgents = useMemo(() => {
    const text = query.trim().toLowerCase()
    return agentRows.filter((agent) => {
      if (status !== 'all' && agent.status !== status) return false
      if (kind !== 'all' && agent.kind !== kind) return false
      return !text || `${agent.name} ${agent.model} ${kindLabels[agent.kind]} ${agent.skills.join(' ')}`.toLowerCase().includes(text)
    })
  }, [agentRows, kind, query, status])

  // 首次拿到列表后默认选中第一个（列表刷新/选中项被删时回退到第一个）
  const selectedAgent = filteredAgents.find((agent) => agent.id === selectedAgentId) ?? filteredAgents[0]
  const selectedSquad = squads.find((squad) => squad.id === selectedSquadId) ?? squads[0]
  const onlineCount = agentRows.filter((agent) => ['idle', 'busy'].includes(agent.status)).length
  const busyCount = agentRows.filter((agent) => agent.status === 'busy').length
  const staleCount = agentRows.filter((agent) => ['stale', 'offline'].includes(agent.status)).length
  const averageSuccess = agentRows.length ? agentRows.reduce((sum, agent) => sum + agent.successRate, 0) / agentRows.length : 0

  // 真实写操作：PATCH /agents/{id} → invalidate + toast
  const patchAgent = (id: string, patch: UpdateAgentPatch, successMessage: string) => {
    updateAgentMutation.mutate(
      { id, patch },
      {
        onSuccess: () => notify(successMessage, { tone: 'success' }),
        onError: (error) => notify(
          // M1（审查修复）：与 UsersPage 对齐——handleApiError 特判 401/403/409 文案
          handleApiError(error),
          { tone: 'error', title: '更新失败' },
        ),
      },
    )
  }

  const handleRegisterAgent = (event: FormEvent) => {
    event.preventDefault()
    if (!agentForm.name.trim()) return
    const input: RegisterAgentInput = {
      name: agentForm.name.trim(),
      kind: agentForm.kind,
      runtimeMode: agentForm.runtime,
      model: agentForm.model.trim() || 'Codex',
      executionMode: 'manual',
      tokenBudget: agentForm.tokenBudget,
    }
    registerAgentMutation.mutate(input, {
      onSuccess: (res) => {
        notify(`已注册 Agent「${res.agent.name}」`, { tone: 'success' })
        setCredentialNotice(`已为 ${res.agent.name} 生成一次性凭证：${res.credential.secret}（仅本次显示，请立即安全保存）。`)
        setSelectedAgentId(res.agent.id)
        setAgentForm({ name: '', kind: 'coder', runtime: 'cloud', model: 'Codex', tokenBudget: 200000 })
        setAgentDialogOpen(false)
      },
      onError: (error) => notify(
        (error instanceof ApiClientError ? error.message : '注册失败，请稍后重试。'),
        { tone: 'error', title: '注册失败' },
      ),
    })
  }

  // Squads 创建表单仍为本地占位（后端 POST /squads 未在本任务范围；保留 UI，不写库）
  const handleCreateSquad = (event: FormEvent) => {
    event.preventDefault()
    if (!squadForm.name.trim() || !squadForm.leadAgentId) return
    notify('小队创建待后端接入（POST /squads）后生效。', { tone: 'info' })
    setSquadForm({ name: '', focus: '', leadAgentId: agentRows[0]?.id ?? '' })
    setSquadDialogOpen(false)
  }

  const toggleSquadMember = (_squadId: string, _agentId: string) => {
    // 成员管理走 POST /squads/{id}/members（不在本任务范围）；仅本地提示
    notify('成员调整待后端接入（POST /squads/{id}/members）后生效。', { tone: 'info' })
  }

  const inspector = view === 'agents' && selectedAgent ? (
    <aside className="agent-inspector" role="tabpanel" aria-label="Agent 详情">
      <header className="inspector-heading"><div><Sparkles size={17} /><strong>实例配置</strong></div><IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton></header>
      <div className="inspector-body" data-scroll-region="inspector-body">
        <div className="agent-profile"><AgentAvatar agent={selectedAgent} /><div><h2>{selectedAgent.name}</h2><p>{kindLabels[selectedAgent.kind]} · {selectedAgent.model || '—'}</p></div><StatusBadge status={selectedAgent.status} /></div>
        <dl className="detail-list">
          <div><dt>心跳</dt><dd><Activity size={14} />{selectedAgent.lastHeartbeat}</dd></div>
          <div><dt>运行时</dt><dd>{selectedAgent.runtime === 'local' ? <Laptop size={14} /> : <Cloud size={14} />}{selectedAgent.runtime === 'local' ? '本地 Connector' : '云端实例'}</dd></div>
          <div><dt>成功率</dt><dd><CheckCircle2 size={14} />{selectedAgent.successRate.toFixed(1)}%</dd></div>
          <div><dt>默认模式</dt><dd><Gauge size={14} />{executionModeLabels[(selectedAgent as Agent & { executionMode: ExecutionMode }).executionMode ?? 'manual']}</dd></div>
        </dl>

        <section className="inspector-section"><div className="section-label"><span>周期 Token</span><strong>{Math.round((selectedAgent.tokenUsed / Math.max(1, selectedAgent.tokenBudget)) * 100)}%</strong></div><ProgressBar value={Math.round((selectedAgent.tokenUsed / Math.max(1, selectedAgent.tokenBudget)) * 100)} warning={selectedAgent.tokenUsed / Math.max(1, selectedAgent.tokenBudget) > 0.8} /><small>{selectedAgent.tokenUsed.toLocaleString()} 已用，共 {selectedAgent.tokenBudget.toLocaleString()}</small></section>

        <section className="inspector-section"><span className="section-title">运行位置</span><div className="segmented-control"><button className={selectedAgent.runtime === 'local' ? 'is-active' : ''} onClick={() => patchAgent(selectedAgent.id, { status: selectedAgent.status }, '运行位置已记录')}>本地</button><button className={selectedAgent.runtime === 'cloud' ? 'is-active' : ''} onClick={() => patchAgent(selectedAgent.id, { status: selectedAgent.status }, '运行位置已记录')}>云端</button></div></section>
        <section className="inspector-section"><span className="section-title">默认执行模式</span><div className="segmented-control">{(['manual', 'auto', 'full'] as ExecutionMode[]).map((mode) => <button key={mode} className={((selectedAgent as Agent & { executionMode: ExecutionMode }).executionMode ?? 'manual') === mode ? 'is-active' : ''} onClick={() => patchAgent(selectedAgent.id, { executionMode: mode }, `执行模式已切换为${executionModeLabels[mode]}`)}>{executionModeLabels[mode]}</button>)}</div></section>
        <section className="agent-skills-section"><header><Cpu size={16} /><strong>已绑定技能</strong><span>{selectedAgent.skills.length}</span></header><div className="tag-list">{selectedAgent.skills.length ? selectedAgent.skills.map((skill) => <span key={skill}>{skill}</span>) : <small>尚未绑定技能</small>}</div></section>
        {selectedAgent.currentTask ? <section className="agent-task-callout"><Zap size={16} /><div><small>正在执行</small><strong>{selectedAgent.currentTask}</strong></div></section> : null}
      </div>
      <footer className="inspector-footer">
        {['stale', 'offline'].includes(selectedAgent.status) ? <Button variant="primary" icon={<RefreshCw size={15} />} onClick={() => patchAgent(selectedAgent.id, { status: 'idle' }, '已发起恢复连接')}>恢复连接</Button> : <Button icon={<Activity size={15} />} onClick={() => notify('心跳检查待后端 runtime 接口接入。', { tone: 'info' })}>检查心跳</Button>}
        <Button variant="ghost" icon={selectedAgent.status === 'offline' ? <Wifi size={15} /> : <WifiOff size={15} />} onClick={() => patchAgent(selectedAgent.id, { status: selectedAgent.status === 'offline' ? 'idle' : 'offline' }, selectedAgent.status === 'offline' ? '已启用实例' : '已停用实例')}>{selectedAgent.status === 'offline' ? '启用实例' : '停用实例'}</Button>
      </footer>
    </aside>
  ) : view === 'squads' && selectedSquad ? (
    <aside className="squad-inspector" role="tabpanel" aria-label="小队详情">
      <header className="inspector-heading"><div><UsersRound size={17} /><strong>小队配置</strong></div><IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton></header>
      <div className="inspector-body" data-scroll-region="inspector-body">
        <span className="inspector-id">{selectedSquad.id}</span><h2>{selectedSquad.name}</h2><p className="inspector-summary">{selectedSquad.focus || '尚未填写小队职责。'}</p>
        <section className="squad-member-section"><header><strong>成员与职责</strong><span>{selectedSquad.members.length}</span></header>{agentRows.map((agent) => { const isLead = agent.id === selectedSquad.leadAgentId; const checked = selectedSquad.members.includes(agent.id); return <label key={agent.id} className={checked ? 'squad-member is-selected' : 'squad-member'}><input type="checkbox" checked={checked} disabled={isLead} onChange={() => toggleSquadMember(selectedSquad.id, agent.id)} /><AgentAvatar agent={agent} /><span><strong>{agent.name}</strong><small>{isLead ? 'Lead' : kindLabels[agent.kind]}</small></span><StatusBadge status={agent.status} /></label> })}</section>
      </div>
    </aside>
  ) : null

  return (
    <div className="agents-page">
      <PageHeader title="Agent 与小队" description="运行时、预算、心跳与协同关系" />
      <SummaryStrip items={[
        { label: '在线实例', value: `${onlineCount}/${agentRows.length}`, detail: '本地与云端合计', icon: <Wifi size={16} />, tone: 'blue' },
        { label: '执行中', value: busyCount, detail: '当前承接任务', icon: <Zap size={16} />, tone: 'green' },
        { label: '平均成功率', value: `${averageSuccess.toFixed(1)}%`, detail: '最近 30 天', icon: <ShieldCheck size={16} />, tone: 'violet' },
        { label: '需要关注', value: staleCount, detail: '失联或离线实例', icon: <WifiOff size={16} />, tone: staleCount ? 'red' : 'amber' },
      ]} />

      {credentialNotice ? <div className="credential-notice"><KeyRound size={16} /><span>{credentialNotice}</span><button onClick={() => setCredentialNotice('')}>关闭</button></div> : null}

      <WorkbenchLayout
        className="agents-workbench"
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((value) => !value)}
        mobileView={mobileView}
        onMobileViewChange={(value) => setMobileView(value as 'list' | 'detail')}
        mobileViewOptions={[{ value: 'list', label: '列表', count: view === 'agents' ? filteredAgents.length : squads.length }, { value: 'detail', label: '详情' }]}
        inspector={inspector}
      >
        <div className="agents-main-panel" role="tabpanel" aria-label="Agent 列表">
          <header className="agents-toolbar">
            <div className="scope-tabs" role="tablist" aria-label="Agent 视图">
              <button className={view === 'agents' ? 'is-active' : ''} onClick={() => { setView('agents'); setMobileView('list') }}>Agent 实例 <b>{agentRows.length}</b></button>
              <button className={view === 'squads' ? 'is-active' : ''} onClick={() => { setView('squads'); setMobileView('list') }}>协作小队 <b>{squads.length}</b></button>
            </div>
            <div className="agents-tools">
              <label className="compact-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === 'agents' ? '搜索 Agent 或技能' : '搜索小队'} /></label>
              {view === 'agents' ? (
                <>
                  <label className="toolbar-select"><Activity size={15} /><select value={status} onChange={(event) => setStatus(event.target.value as 'all' | AgentStatus)}><option value="all">全部状态</option><option value="idle">空闲</option><option value="busy">忙碌</option><option value="stale">失联</option><option value="offline">离线</option></select><ChevronDown size={13} /></label>
                  <label className="toolbar-select"><Bot size={15} /><select value={kind} onChange={(event) => setKind(event.target.value as 'all' | Agent['kind'])}><option value="all">全部类型</option><option value="digital">数字人</option><option value="coder">Coder</option><option value="qa">QA</option><option value="assistant">助理</option></select><ChevronDown size={13} /></label>
                  <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setAgentDialogOpen(true)}>注册 Agent</Button>
                </>
              ) : <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setSquadDialogOpen(true)}>创建小队</Button>}
            </div>
          </header>

          {view === 'agents' ? (
            <div className="agent-list" data-scroll-region="agent-list">
              {agentsQuery.isLoading ? <StatePanel icon={<LoaderCircle size={22} />} title="正在加载 Agent 列表" description="从后端拉取已注册实例…" />
                : agentsQuery.error ? <StatePanel icon={<AlertTriangle size={22} />} title="Agent 列表加载失败" description={(agentsQuery.error as ApiClientError)?.message ?? '请稍后重试或检查登录状态。'} />
                : filteredAgents.length ? filteredAgents.map((agent) => (
                  <button key={agent.id} className={selectedAgent?.id === agent.id ? 'agent-row is-active' : 'agent-row'} onClick={() => { setSelectedAgentId(agent.id); setMobileView('detail') }}>
                  <AgentAvatar agent={agent} />
                  <span className="agent-row-identity"><strong>{agent.name}</strong><small>{kindLabels[agent.kind]} · {agent.model || '—'}</small></span>
                  <span className="agent-runtime">{agent.runtime === 'local' ? <Laptop size={14} /> : <Cloud size={14} />}{agent.runtime === 'local' ? '本地' : '云端'}</span>
                  <span className="agent-current-task"><small>当前任务</small><b>{agent.currentTask ?? '等待分配'}</b></span>
                  <span className="agent-token-cell"><small>{agent.tokenUsed.toLocaleString()} / {agent.tokenBudget.toLocaleString()}</small><ProgressBar value={agent.tokenBudget ? Math.round((agent.tokenUsed / agent.tokenBudget) * 100) : 0} warning={agent.tokenBudget > 0 && agent.tokenUsed / agent.tokenBudget > 0.8} /></span>
                  <StatusBadge status={agent.status} />
                </button>
              )) : <EmptyState icon={<Bot size={23} />} title="没有匹配的 Agent" description="调整状态、类型或搜索条件后再试。" />}
            </div>
          ) : (
            <div className="squad-grid" data-scroll-region="squad-list">
              {squadsQuery.isLoading ? <StatePanel icon={<LoaderCircle size={22} />} title="正在加载小队列表" description="从后端拉取协作小队…" />
                : squadsQuery.error ? <StatePanel icon={<AlertTriangle size={22} />} title="小队列表加载失败" description={(squadsQuery.error as ApiClientError)?.message ?? '请稍后重试或检查登录状态。'} />
                : squads.filter((squad) => !query.trim() || `${squad.name} ${squad.focus}`.toLowerCase().includes(query.trim().toLowerCase())).length ? squads.filter((squad) => !query.trim() || `${squad.name} ${squad.focus}`.toLowerCase().includes(query.trim().toLowerCase())).map((squad) => {
                const lead = agentRows.find((agent) => agent.id === squad.leadAgentId)
                return (
                  <button key={squad.id} className={selectedSquad?.id === squad.id ? 'squad-card is-active' : 'squad-card'} onClick={() => { setSelectedSquadId(squad.id); setMobileView('detail') }}>
                    <header><span><UsersRound size={18} /></span><StatusBadge status={squad.members.some((id) => agentRows.find((agent) => agent.id === id)?.status === 'busy') ? 'busy' : 'idle'} /></header>
                    <h3>{squad.name}</h3><p>{squad.focus || '尚未填写小队职责。'}</p>
                    <div className="squad-card-meta"><span><b>{squad.members.length}</b> 名成员</span><span><b>{squad.activeTaskCount}</b> 个活跃任务</span></div>
                    <footer><span className="mini-avatar"><Bot size={13} /></span><small>Lead</small><strong>{lead?.name ?? '未设置'}</strong></footer>
                  </button>
                )
              }) : <EmptyState icon={<UsersRound size={23} />} title="暂无协作小队" description="后端尚未创建小队，或列表为空。" />}
            </div>
          )}
        </div>

       </WorkbenchLayout>

      <Dialog open={agentDialogOpen} onClose={() => setAgentDialogOpen(false)} title="注册 Agent" description="创建实例并生成独立鉴权凭证。" footer={<><Button onClick={() => setAgentDialogOpen(false)}>取消</Button><Button variant="primary" type="submit" form="register-agent-form" disabled={registerAgentMutation.isPending}>{registerAgentMutation.isPending ? '注册中…' : '注册实例'}</Button></>}>
        <form id="register-agent-form" className="form-stack" onSubmit={handleRegisterAgent}>
          <div className="form-field"><label htmlFor="agent-name">名称</label><input id="agent-name" value={agentForm.name} onChange={(event) => setAgentForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如 Orion Coder" required /></div>
          <div className="form-grid"><div className="form-field"><label htmlFor="agent-kind">类型</label><select id="agent-kind" value={agentForm.kind} onChange={(event) => setAgentForm((current) => ({ ...current, kind: event.target.value as Agent['kind'] }))}><option value="digital">数字人</option><option value="coder">Coder</option><option value="qa">QA</option><option value="assistant">助理</option></select></div><div className="form-field"><label htmlFor="agent-runtime">运行时</label><select id="agent-runtime" value={agentForm.runtime} onChange={(event) => setAgentForm((current) => ({ ...current, runtime: event.target.value as Agent['runtime'] }))}><option value="local">本地</option><option value="cloud">云端</option></select></div></div>
          <div className="form-grid"><div className="form-field"><label htmlFor="agent-model">模型</label><input id="agent-model" value={agentForm.model} onChange={(event) => setAgentForm((current) => ({ ...current, model: event.target.value }))} /></div><div className="form-field"><label htmlFor="agent-budget">周期 Token 预算</label><input id="agent-budget" type="number" min={0} step={10000} value={agentForm.tokenBudget} onChange={(event) => setAgentForm((current) => ({ ...current, tokenBudget: Number(event.target.value) }))} /><small>0 表示不限。</small></div></div>
        </form>
      </Dialog>

      <Dialog open={squadDialogOpen} onClose={() => setSquadDialogOpen(false)} title="创建协作小队" description="设置 Lead，创建后可继续添加 Coder 与 QA。" footer={<><Button onClick={() => setSquadDialogOpen(false)}>取消</Button><Button variant="primary" type="submit" form="create-squad-form">创建小队</Button></>}>
        <form id="create-squad-form" className="form-stack" onSubmit={handleCreateSquad}>
          <div className="form-field"><label htmlFor="squad-name">小队名称</label><input id="squad-name" value={squadForm.name} onChange={(event) => setSquadForm((current) => ({ ...current, name: event.target.value }))} required /></div>
          <div className="form-field"><label htmlFor="squad-focus">职责范围</label><textarea id="squad-focus" value={squadForm.focus} onChange={(event) => setSquadForm((current) => ({ ...current, focus: event.target.value }))} rows={4} /></div>
          <div className="form-field"><label htmlFor="squad-lead">Lead Agent</label><select id="squad-lead" value={squadForm.leadAgentId} onChange={(event) => setSquadForm((current) => ({ ...current, leadAgentId: event.target.value }))}><option value="">选择 Lead</option>{agentRows.filter((agent) => agent.kind !== 'assistant').map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {kindLabels[agent.kind]}</option>)}</select></div>
        </form>
      </Dialog>
    </div>
  )
}
