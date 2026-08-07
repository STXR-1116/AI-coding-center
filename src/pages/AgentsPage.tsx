import { useMemo, useState, type FormEvent } from 'react'
import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Cpu,
  Gauge,
  KeyRound,
  Laptop,
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
import { agents as initialAgents } from '../data/mock'
import { Button, Dialog, EmptyState, IconButton, ProgressBar, StatusBadge } from '../components/ui'
import { PageHeader, SummaryStrip, WorkbenchLayout } from '../components/layout'
import type { Agent, AgentStatus, ExecutionMode } from '../types'
import '../resource-pages.css'

interface Squad {
  id: string
  name: string
  focus: string
  leadAgentId: string
  members: string[]
  activeTaskCount: number
}

const initialSquads: Squad[] = [
  {
    id: 'squad-web',
    name: 'Web 交付小队',
    focus: '负责 CodingCenter Web 的功能开发、测试和变更审查。',
    leadAgentId: 'agent-atlas',
    members: ['agent-atlas', 'agent-iris', 'agent-nova'],
    activeTaskCount: 3,
  },
  {
    id: 'squad-runtime',
    name: 'Runtime 可靠性小队',
    focus: '处理 Connector、心跳、任务 reclaim 和云端回退。',
    leadAgentId: 'agent-lin',
    members: ['agent-lin', 'agent-iris'],
    activeTaskCount: 2,
  },
]

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

export function AgentsPage() {
  const [view, setView] = useState<'agents' | 'squads'>('agents')
  const [agentRows, setAgentRows] = useState<Agent[]>(initialAgents)
  const [squads, setSquads] = useState<Squad[]>(initialSquads)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | AgentStatus>('all')
  const [kind, setKind] = useState<'all' | Agent['kind']>('all')
  const [selectedAgentId, setSelectedAgentId] = useState(initialAgents[0]?.id ?? '')
  const [selectedSquadId, setSelectedSquadId] = useState(initialSquads[0]?.id ?? '')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [executionModes, setExecutionModes] = useState<Record<string, ExecutionMode>>({
    'agent-atlas': 'auto',
    'agent-nova': 'manual',
    'agent-iris': 'auto',
    'agent-lin': 'auto',
    'agent-sora': 'manual',
  })
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [squadDialogOpen, setSquadDialogOpen] = useState(false)
  const [credentialNotice, setCredentialNotice] = useState('')
  const [agentForm, setAgentForm] = useState({ name: '', kind: 'coder' as Agent['kind'], runtime: 'cloud' as Agent['runtime'], model: 'Codex', tokenBudget: 200000 })
  const [squadForm, setSquadForm] = useState({ name: '', focus: '', leadAgentId: initialAgents[0]?.id ?? '' })

  const filteredAgents = useMemo(() => {
    const text = query.trim().toLowerCase()
    return agentRows.filter((agent) => {
      if (status !== 'all' && agent.status !== status) return false
      if (kind !== 'all' && agent.kind !== kind) return false
      return !text || `${agent.name} ${agent.model} ${kindLabels[agent.kind]} ${agent.skills.join(' ')}`.toLowerCase().includes(text)
    })
  }, [agentRows, kind, query, status])

  const selectedAgent = filteredAgents.find((agent) => agent.id === selectedAgentId) ?? filteredAgents[0]
  const selectedSquad = squads.find((squad) => squad.id === selectedSquadId) ?? squads[0]
  const onlineCount = agentRows.filter((agent) => ['idle', 'busy'].includes(agent.status)).length
  const busyCount = agentRows.filter((agent) => agent.status === 'busy').length
  const staleCount = agentRows.filter((agent) => ['stale', 'offline'].includes(agent.status)).length
  const averageSuccess = agentRows.length ? agentRows.reduce((sum, agent) => sum + agent.successRate, 0) / agentRows.length : 0

  const updateAgent = (id: string, patch: Partial<Agent>) => {
    setAgentRows((current) => current.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)))
  }

  const handleRegisterAgent = (event: FormEvent) => {
    event.preventDefault()
    if (!agentForm.name.trim()) return
    const id = `agent-${agentForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now()}`
    const next: Agent = {
      id,
      name: agentForm.name.trim(),
      kind: agentForm.kind,
      status: 'idle',
      runtime: agentForm.runtime,
      model: agentForm.model.trim() || 'Codex',
      successRate: 0,
      tokenUsed: 0,
      tokenBudget: agentForm.tokenBudget,
      lastHeartbeat: '刚刚',
      skills: [],
    }
    setAgentRows((current) => [next, ...current])
    setExecutionModes((current) => ({ ...current, [id]: 'manual' }))
    setSelectedAgentId(id)
    setCredentialNotice(`已为 ${next.name} 生成一次性凭证，请在后端接入后安全保存。`)
    setAgentForm({ name: '', kind: 'coder', runtime: 'cloud', model: 'Codex', tokenBudget: 200000 })
    setAgentDialogOpen(false)
  }

  const handleCreateSquad = (event: FormEvent) => {
    event.preventDefault()
    if (!squadForm.name.trim() || !squadForm.leadAgentId) return
    const next: Squad = {
      id: `squad-${Date.now()}`,
      name: squadForm.name.trim(),
      focus: squadForm.focus.trim() || '尚未填写小队职责。',
      leadAgentId: squadForm.leadAgentId,
      members: [squadForm.leadAgentId],
      activeTaskCount: 0,
    }
    setSquads((current) => [next, ...current])
    setSelectedSquadId(next.id)
    setSquadForm({ name: '', focus: '', leadAgentId: agentRows[0]?.id ?? '' })
    setSquadDialogOpen(false)
  }

  const toggleSquadMember = (squadId: string, agentId: string) => {
    setSquads((current) => current.map((squad) => {
      if (squad.id !== squadId || squad.leadAgentId === agentId) return squad
      const hasMember = squad.members.includes(agentId)
      return { ...squad, members: hasMember ? squad.members.filter((id) => id !== agentId) : [...squad.members, agentId] }
    }))
  }

  const inspector = view === 'agents' && selectedAgent ? (
    <aside className="agent-inspector" role="tabpanel" aria-label="Agent 详情">
      <header className="inspector-heading"><div><Sparkles size={17} /><strong>实例配置</strong></div><IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton></header>
      <div className="inspector-body" data-scroll-region="inspector-body">
        <div className="agent-profile"><AgentAvatar agent={selectedAgent} /><div><h2>{selectedAgent.name}</h2><p>{kindLabels[selectedAgent.kind]} · {selectedAgent.model}</p></div><StatusBadge status={selectedAgent.status} /></div>
        <dl className="detail-list">
          <div><dt>心跳</dt><dd><Activity size={14} />{selectedAgent.lastHeartbeat}</dd></div>
          <div><dt>运行时</dt><dd>{selectedAgent.runtime === 'local' ? <Laptop size={14} /> : <Cloud size={14} />}{selectedAgent.runtime === 'local' ? '本地 Connector' : '云端实例'}</dd></div>
          <div><dt>成功率</dt><dd><CheckCircle2 size={14} />{selectedAgent.successRate.toFixed(1)}%</dd></div>
          <div><dt>默认模式</dt><dd><Gauge size={14} />{executionModeLabels[executionModes[selectedAgent.id] ?? 'manual']}</dd></div>
        </dl>

        <section className="inspector-section"><div className="section-label"><span>周期 Token</span><strong>{Math.round((selectedAgent.tokenUsed / Math.max(1, selectedAgent.tokenBudget)) * 100)}%</strong></div><ProgressBar value={Math.round((selectedAgent.tokenUsed / Math.max(1, selectedAgent.tokenBudget)) * 100)} warning={selectedAgent.tokenUsed / Math.max(1, selectedAgent.tokenBudget) > 0.8} /><small>{selectedAgent.tokenUsed.toLocaleString()} 已用，共 {selectedAgent.tokenBudget.toLocaleString()}</small></section>

        <section className="inspector-section"><span className="section-title">运行位置</span><div className="segmented-control"><button className={selectedAgent.runtime === 'local' ? 'is-active' : ''} onClick={() => updateAgent(selectedAgent.id, { runtime: 'local' })}>本地</button><button className={selectedAgent.runtime === 'cloud' ? 'is-active' : ''} onClick={() => updateAgent(selectedAgent.id, { runtime: 'cloud' })}>云端</button></div></section>
        <section className="inspector-section"><span className="section-title">默认执行模式</span><div className="segmented-control">{(['manual', 'auto', 'full'] as ExecutionMode[]).map((mode) => <button key={mode} className={(executionModes[selectedAgent.id] ?? 'manual') === mode ? 'is-active' : ''} onClick={() => setExecutionModes((current) => ({ ...current, [selectedAgent.id]: mode }))}>{executionModeLabels[mode]}</button>)}</div></section>
        <section className="agent-skills-section"><header><Cpu size={16} /><strong>已绑定技能</strong><span>{selectedAgent.skills.length}</span></header><div className="tag-list">{selectedAgent.skills.length ? selectedAgent.skills.map((skill) => <span key={skill}>{skill}</span>) : <small>尚未绑定技能</small>}</div></section>
        {selectedAgent.currentTask ? <section className="agent-task-callout"><Zap size={16} /><div><small>正在执行</small><strong>{selectedAgent.currentTask}</strong></div></section> : null}
      </div>
      <footer className="inspector-footer">
        {['stale', 'offline'].includes(selectedAgent.status) ? <Button variant="primary" icon={<RefreshCw size={15} />} onClick={() => updateAgent(selectedAgent.id, { status: 'idle', lastHeartbeat: '刚刚' })}>恢复连接</Button> : <Button icon={<Activity size={15} />} onClick={() => updateAgent(selectedAgent.id, { lastHeartbeat: '刚刚' })}>检查心跳</Button>}
        <Button variant="ghost" icon={selectedAgent.status === 'offline' ? <Wifi size={15} /> : <WifiOff size={15} />} onClick={() => updateAgent(selectedAgent.id, { status: selectedAgent.status === 'offline' ? 'idle' : 'offline', currentTask: selectedAgent.status === 'offline' ? selectedAgent.currentTask : undefined })}>{selectedAgent.status === 'offline' ? '启用实例' : '停用实例'}</Button>
      </footer>
    </aside>
  ) : view === 'squads' && selectedSquad ? (
    <aside className="squad-inspector" role="tabpanel" aria-label="小队详情">
      <header className="inspector-heading"><div><UsersRound size={17} /><strong>小队配置</strong></div><IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton></header>
      <div className="inspector-body" data-scroll-region="inspector-body">
        <span className="inspector-id">{selectedSquad.id}</span><h2>{selectedSquad.name}</h2><p className="inspector-summary">{selectedSquad.focus}</p>
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
              {filteredAgents.length ? filteredAgents.map((agent) => (
                  <button key={agent.id} className={selectedAgent?.id === agent.id ? 'agent-row is-active' : 'agent-row'} onClick={() => { setSelectedAgentId(agent.id); setMobileView('detail') }}>
                  <AgentAvatar agent={agent} />
                  <span className="agent-row-identity"><strong>{agent.name}</strong><small>{kindLabels[agent.kind]} · {agent.model}</small></span>
                  <span className="agent-runtime">{agent.runtime === 'local' ? <Laptop size={14} /> : <Cloud size={14} />}{agent.runtime === 'local' ? '本地' : '云端'}</span>
                  <span className="agent-current-task"><small>当前任务</small><b>{agent.currentTask ?? '等待分配'}</b></span>
                  <span className="agent-token-cell"><small>{agent.tokenUsed.toLocaleString()} / {agent.tokenBudget.toLocaleString()}</small><ProgressBar value={agent.tokenBudget ? Math.round((agent.tokenUsed / agent.tokenBudget) * 100) : 0} warning={agent.tokenBudget > 0 && agent.tokenUsed / agent.tokenBudget > 0.8} /></span>
                  <StatusBadge status={agent.status} />
                </button>
              )) : <EmptyState icon={<Bot size={23} />} title="没有匹配的 Agent" description="调整状态、类型或搜索条件后再试。" />}
            </div>
          ) : (
            <div className="squad-grid" data-scroll-region="squad-list">
              {squads.filter((squad) => !query.trim() || `${squad.name} ${squad.focus}`.toLowerCase().includes(query.trim().toLowerCase())).map((squad) => {
                const lead = agentRows.find((agent) => agent.id === squad.leadAgentId)
                return (
                  <button key={squad.id} className={selectedSquad?.id === squad.id ? 'squad-card is-active' : 'squad-card'} onClick={() => { setSelectedSquadId(squad.id); setMobileView('detail') }}>
                    <header><span><UsersRound size={18} /></span><StatusBadge status={squad.members.some((id) => agentRows.find((agent) => agent.id === id)?.status === 'busy') ? 'busy' : 'idle'} /></header>
                    <h3>{squad.name}</h3><p>{squad.focus}</p>
                    <div className="squad-card-meta"><span><b>{squad.members.length}</b> 名成员</span><span><b>{squad.activeTaskCount}</b> 个活跃任务</span></div>
                    <footer><span className="mini-avatar"><Bot size={13} /></span><small>Lead</small><strong>{lead?.name ?? '未设置'}</strong></footer>
                  </button>
                )
              })}
            </div>
          )}
        </div>

       </WorkbenchLayout>

      <Dialog open={agentDialogOpen} onClose={() => setAgentDialogOpen(false)} title="注册 Agent" description="创建实例并生成独立鉴权凭证。" footer={<><Button onClick={() => setAgentDialogOpen(false)}>取消</Button><Button variant="primary" type="submit" form="register-agent-form">注册实例</Button></>}>
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
          <div className="form-field"><label htmlFor="squad-lead">Lead Agent</label><select id="squad-lead" value={squadForm.leadAgentId} onChange={(event) => setSquadForm((current) => ({ ...current, leadAgentId: event.target.value }))}>{agentRows.filter((agent) => agent.kind !== 'assistant').map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {kindLabels[agent.kind]}</option>)}</select></div>
        </form>
      </Dialog>
    </div>
  )
}
