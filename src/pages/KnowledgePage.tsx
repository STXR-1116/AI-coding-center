import { useMemo, useState, type FormEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  EyeOff,
  KeyRound,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Search,
  ServerOff,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Unplug,
  Wifi,
} from 'lucide-react'
import { agents } from '../data/mock'
import { Button, Dialog, EmptyState, IconButton, StatusBadge } from '../components/ui'
import { PageHeader, WorkbenchLayout } from '../components/layout'
import { ApiClientError } from '../api/client'
import { toKnowledgeBase, toKnowledgeBaseDetail } from '../api/knowledge'
import type { KnowledgeBase } from '../api/knowledge'
import {
  useBindKnowledgeBase,
  useDisableKnowledgeBase,
  useKnowledgeBase,
  useKnowledgeBases,
  useRegisterKnowledgeBase,
  useUnbindKnowledgeBase,
} from '../queries/knowledge'
import { useToast } from '../state/useToast'
import type { RegisterKnowledgeBaseInput } from '../types'
import '../resource-pages.css'

type KnowledgeHealth = 'healthy' | 'degraded' | 'offline' | 'checking'
type RetrievalMode = 'hybrid' | 'semantic' | 'keyword'

const healthLabels: Record<KnowledgeHealth, string> = {
  healthy: '健康',
  degraded: '降级',
  offline: '不可达',
  checking: '检查中',
}

const retrievalLabels: Record<RetrievalMode, string> = {
  hybrid: '混合检索',
  semantic: '语义检索',
  keyword: '关键词检索',
}

function HealthBadge({ status }: { status: KnowledgeHealth }) {
  const Icon = status === 'healthy' ? CheckCircle2 : status === 'degraded' ? AlertTriangle : status === 'checking' ? RefreshCw : ServerOff
  return <span className={`knowledge-health knowledge-health-${status}`}><Icon size={13} />{healthLabels[status]}</span>
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

export function KnowledgePage() {
  const { notify } = useToast()
  const knowledgeBasesQuery = useKnowledgeBases()
  const registerMutation = useRegisterKnowledgeBase()
  const disableMutation = useDisableKnowledgeBase()
  const bindMutation = useBindKnowledgeBase()
  const unbindMutation = useUnbindKnowledgeBase()

  const [query, setQuery] = useState('')
  const [health, setHealth] = useState<'all' | KnowledgeHealth>('all')
  const [selectedId, setSelectedId] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'detail' | 'activity'>('list')
  const [createOpen, setCreateOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ name: '', description: '', endpoint: '', authType: 'bearer' as 'bearer' | 'api_key' | 'none', credential: '', retrievalMode: 'hybrid' as RetrievalMode })

  // 后端 DTO → UI 领域模型
  const knowledgeBases: KnowledgeBase[] = useMemo(
    () => (knowledgeBasesQuery.data ?? []).map(toKnowledgeBase),
    [knowledgeBasesQuery.data],
  )

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return knowledgeBases.filter((knowledgeBase) => {
      if (health !== 'all' && knowledgeBase.status !== health) return false
      return !text || `${knowledgeBase.name} ${knowledgeBase.description} ${knowledgeBase.endpoint}`.toLowerCase().includes(text)
    })
  }, [health, knowledgeBases, query])

  // 首次拿到列表后默认选中第一个（列表刷新/选中项被删时回退到第一个）
  const selected = filtered.find((knowledgeBase) => knowledgeBase.id === selectedId) ?? filtered[0]

  // 绑定明细走详情端点：KB 列表 DTO 只带 boundAgentCount，不带 boundAgents 明细
  // （与 Skill 列表 DTO 不同）。选中 KB 时拉详情，用 toKnowledgeBaseDetail 填充
  // boundAgents 驱动绑定开关勾选态；详情未就绪前回退空数组（避免误勾选/误解绑）。
  const knowledgeBaseDetailQuery = useKnowledgeBase(selected?.id)
  const boundAgentIds: string[] = knowledgeBaseDetailQuery.data
    ? toKnowledgeBaseDetail(knowledgeBaseDetailQuery.data).boundAgents
    : []

  const enabledCount = knowledgeBases.filter((item) => item.enabled).length
  const healthyCount = knowledgeBases.filter((item) => item.status === 'healthy').length
  const calls = knowledgeBases.reduce((sum, item) => sum + item.calls24h, 0)
  const reachable = knowledgeBases.filter((item) => item.latency > 0)
  const averageLatency = reachable.length ? Math.round(reachable.reduce((sum, item) => sum + item.latency, 0) / reachable.length) : 0

  // 停用：POST /knowledge-bases/{id}/disable → invalidate + toast
  const handleDisable = (knowledgeBase: KnowledgeBase) => {
    disableMutation.mutate(knowledgeBase.id, {
      onSuccess: () => notify(`已停用知识库「${knowledgeBase.name}」`, { tone: 'success' }),
      onError: (error) => notify(
        (error instanceof ApiClientError ? error.message : '停用失败，请稍后重试。'),
        { tone: 'error', title: '停用失败' },
      ),
    })
  }

  // 测试连接：后端 MVP 无 health-check 端点（P2-2a 仅 disable/bind）；本地提示
  const testConnection = (knowledgeBase: KnowledgeBase) => {
    void knowledgeBase
    notify('连通性检查待后端 health-check 接口接入（P2-2a 未实现）。', { tone: 'info' })
  }

  // 绑定/解绑：POST/DELETE /knowledge-bases/{id}/agents/{agentId} → invalidate + toast
  const toggleAgentBinding = (knowledgeBaseId: string, agentId: string, bound: boolean) => {
    const mutation = bound ? unbindMutation : bindMutation
    mutation.mutate(
      { knowledgeBaseId, agentId },
      {
        onSuccess: () => notify(bound ? '已解绑 Agent' : '已绑定 Agent', { tone: 'success' }),
        onError: (error) => notify(
          (error instanceof ApiClientError ? error.message : '绑定操作失败，请稍后重试。'),
          { tone: 'error', title: '操作失败' },
        ),
      },
    )
  }

  // 检索参数写回：后端 PATCH 仅接受 name/mcpServerUrl/config（检索参数可序列化进 config，
  // 但 health-check 未实现，此处保留本地态，待后端 config schema 落地后接入）
  const updateRetrievalParams = (_id: string, _params: Record<string, unknown>) => {
    notify('检索参数持久化待后端 config schema 落地后接入。', { tone: 'info' })
  }

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    if (!form.name.trim()) return
    try {
      const endpoint = new URL(form.endpoint)
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('unsupported protocol')
    } catch {
      setFormError('请输入有效的 HTTP 或 HTTPS MCP Server 地址。')
      return
    }
    if (form.authType !== 'none' && !form.credential.trim()) {
      setFormError('所选鉴权方式需要填写凭证。')
      return
    }
    // 把用途说明 + 检索模式 + 鉴权方式序列化进 config（后端 config 为 JSON 字符串，透传）
    const config = JSON.stringify({
      description: form.description.trim() || '尚未填写知识库说明。',
      retrievalMode: form.retrievalMode,
      authType: form.authType,
    })
    // 凭证序列化为 JSON 字符串（后端独立加密保存，永不回显）
    const credentials = form.authType === 'none' ? undefined : JSON.stringify({ type: form.authType, secret: form.credential.trim() })
    const input: RegisterKnowledgeBaseInput = {
      name: form.name.trim(),
      mcpServerUrl: form.endpoint.trim(),
      config,
      ...(credentials ? { credentials } : {}),
    }
    registerMutation.mutate(input, {
      onSuccess: (dto) => {
        notify(`已登记知识库「${dto.name}」`, { tone: 'success' })
        setSelectedId(dto.id)
        setHealth('all')
        setForm({ name: '', description: '', endpoint: '', authType: 'bearer', credential: '', retrievalMode: 'hybrid' })
        setCreateOpen(false)
        setNotice(`${dto.name} 已登记，等待后端完成首次连通性检查。`)
      },
      onError: (error) => notify(
        (error instanceof ApiClientError ? error.message : '注册失败，请稍后重试。'),
        { tone: 'error', title: '注册失败' },
      ),
    })
  }

  const inspector = selected ? (
    <aside className="knowledge-inspector">
      <header className="inspector-heading"><div><Sparkles size={17} /><strong>MCP 配置</strong></div><IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton></header>
      <div className="inspector-body" data-scroll-region="inspector-body">
        <div className="knowledge-detail-heading"><span><BrainCircuit size={20} /></span><div><h2>{selected.name}</h2><p>{selected.id}</p></div><HealthBadge status={selected.status} /></div>
        <p className="inspector-summary">{selected.description}</p>
        {selected.status !== 'healthy' ? <div className="knowledge-degradation-warning"><AlertTriangle size={16} /><p><strong>检索将自动降级</strong><span>不可达时 Agent 会跳过此服务，并在执行结果中提示。</span></p></div> : null}
        <dl className="detail-list">
          <div><dt>服务地址</dt><dd><Link2 size={14} /><span className="truncate-value">{selected.endpoint}</span></dd></div>
          <div><dt>鉴权</dt><dd><KeyRound size={14} />{selected.authType === 'bearer' ? 'Bearer Token' : selected.authType === 'api_key' ? 'API Key' : '无鉴权'}</dd></div>
          <div><dt>凭证</dt><dd><EyeOff size={14} />{selected.authType === 'none' ? '不需要' : '已加密保存'}</dd></div>
          <div><dt>最近检查</dt><dd><Clock3 size={14} />{selected.lastCheck}</dd></div>
        </dl>

        <section className="knowledge-config-section">
          <header><SlidersHorizontal size={16} /><strong>检索参数</strong></header>
          <label><span>检索模式</span><select value={selected.retrievalMode} onChange={(event) => updateRetrievalParams(selected.id, { retrievalMode: event.target.value as RetrievalMode })}>{Object.entries(retrievalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>召回数量 <b>{selected.topK}</b></span><input type="range" min={1} max={20} value={selected.topK} onChange={(event) => updateRetrievalParams(selected.id, { topK: Number(event.target.value) })} /></label>
          <label><span>相似度阈值 <b>{selected.threshold.toFixed(2)}</b></span><input type="range" min={0.4} max={0.95} step={0.01} value={selected.threshold} onChange={(event) => updateRetrievalParams(selected.id, { threshold: Number(event.target.value) })} /></label>
        </section>

        <section className="knowledge-binding-section">
          <header><div><Bot size={16} /><strong>Agent 绑定</strong></div><span>{boundAgentIds.length}</span></header>
          {agents.map((agent) => {
            const checked = boundAgentIds.includes(agent.id)
            return <label key={agent.id} className={checked ? 'knowledge-agent-binding is-selected' : 'knowledge-agent-binding'}><input type="checkbox" checked={checked} onChange={() => toggleAgentBinding(selected.id, agent.id, checked)} /><span className="mini-avatar"><Bot size={13} /></span><span><strong>{agent.name}</strong><small>{agent.model}</small></span><StatusBadge status={agent.status} /></label>
          })}
        </section>
      </div>
      <footer className="inspector-footer">
        <Button variant={selected.status === 'healthy' ? 'secondary' : 'primary'} icon={<RefreshCw size={15} />} title="连通性检查接口待 P2-3 接入" onClick={() => testConnection(selected)}>测试连接</Button>
        {selected.enabled ? (
          <Button variant="ghost" icon={<Unplug size={15} />} disabled={disableMutation.isPending} onClick={() => handleDisable(selected)}>停用挂载</Button>
        ) : (
          <span className="knowledge-disabled-badge" title="重新启用待 P2-3 config 端点接入"><ServerOff size={15} />已停用</span>
        )}
      </footer>
    </aside>
  ) : null

  return (
    <div className="knowledge-page">
      <PageHeader title="知识库" description="ContextDB MCP 健康状态与 Agent 绑定" />
      <section className="knowledge-summary" aria-label="知识库概览">
        <article><span><Database size={19} /></span><div><small>已登记</small><strong>{knowledgeBases.length}</strong><p>{enabledCount} 个已启用</p></div></article>
        <article><span><Wifi size={19} /></span><div><small>健康服务</small><strong>{healthyCount}</strong><p>{knowledgeBases.length - healthyCount} 个需要关注</p></div></article>
        <article><span><Network size={19} /></span><div><small>24 小时调用</small><strong>{calls.toLocaleString()}</strong><p>由 Agent 通过 MCP 发起</p></div></article>
        <article><span><Clock3 size={19} /></span><div><small>平均延迟</small><strong>{averageLatency}ms</strong><p>仅统计可达服务</p></div></article>
      </section>

      {notice ? <div className="knowledge-notice" role="status"><Activity size={15} /><span>{notice}</span><button onClick={() => setNotice('')}>关闭</button></div> : null}

      <WorkbenchLayout
        className="knowledge-workbench"
        mobileView={mobileView}
        onMobileViewChange={(value) => setMobileView(value as 'list' | 'detail' | 'activity')}
        mobileViewOptions={[
          { value: 'list', label: '列表', count: filtered.length },
          { value: 'detail', label: '详情' },
          { value: 'activity', label: '活动' },
        ]}
        inspector={inspector}
      >
        <div className="knowledge-main-panel">
          <div className="knowledge-list-panel" role="tabpanel" aria-label="知识库列表">
            <header className="knowledge-toolbar">
            <div><h2>ContextDB MCP</h2><p>平台只管理连接、凭证与注入参数，内容由外部服务维护。</p></div>
            <div className="knowledge-tools">
              <label className="compact-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或地址" /></label>
              <label className="toolbar-select"><Activity size={15} /><select value={health} onChange={(event) => setHealth(event.target.value as 'all' | KnowledgeHealth)}><option value="all">全部状态</option><option value="healthy">健康</option><option value="degraded">降级</option><option value="offline">不可达</option><option value="checking">检查中</option></select><ChevronDown size={13} /></label>
              <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>注册知识库</Button>
            </div>
            </header>

            <div className="knowledge-list" data-scroll-region="knowledge-list">
              {knowledgeBasesQuery.isLoading ? <StatePanel icon={<LoaderCircle size={22} />} title="正在加载知识库列表" description="从后端拉取已登记的 ContextDB MCP…" />
                : knowledgeBasesQuery.error ? <StatePanel icon={<AlertTriangle size={22} />} title="知识库列表加载失败" description={(knowledgeBasesQuery.error as ApiClientError)?.message ?? '请稍后重试或检查登录状态。'} />
                : filtered.length ? filtered.map((knowledgeBase) => (
                <button key={knowledgeBase.id} className={selected?.id === knowledgeBase.id ? 'knowledge-row is-active' : 'knowledge-row'} onClick={() => { setSelectedId(knowledgeBase.id); setMobileView('detail') }}>
                  <span className="knowledge-row-icon"><BrainCircuit size={18} /></span>
                  <span className="knowledge-row-identity"><strong>{knowledgeBase.name}</strong><small>{knowledgeBase.description}</small><code>{knowledgeBase.endpoint}</code></span>
                  <span className="knowledge-bound-count"><Bot size={14} /><b>{knowledgeBase.boundAgents.length}</b><small>Agent</small></span>
                  <span className="knowledge-latency"><Clock3 size={14} /><b>{knowledgeBase.latency || '-'}</b><small>{knowledgeBase.latency ? 'ms' : '无响应'}</small></span>
                  <span className="knowledge-call-count"><Network size={14} /><b>{knowledgeBase.calls24h}</b><small>今日调用</small></span>
                  <HealthBadge status={knowledgeBase.status} />
                  <span className={knowledgeBase.enabled ? 'module-switch is-on' : 'module-switch'} aria-label={knowledgeBase.enabled ? '已启用' : '已停用'}><i /></span>
                </button>
              )) : <EmptyState icon={<Unplug size={23} />} title="没有匹配的知识库" description="调整健康状态或搜索条件后再试，或注册一个新的 ContextDB MCP。" />}
            </div>
          </div>

          <section className="knowledge-activity-panel" role="tabpanel" aria-label="最近检索活动">
            <header><div><Activity size={16} /><strong>最近检索活动</strong></div><span>审计旁路</span></header>
            <div className="knowledge-activity-grid">
              <div><span className="mini-avatar"><Bot size={13} /></span><p><strong>Atlas Coder</strong> 检索了“安全路径校验”</p><small>团队工程记忆 · 2 分钟前 · 148ms</small></div>
              <div><span className="mini-avatar"><Bot size={13} /></span><p><strong>Nova PM</strong> 检索了“需求验收模板”</p><small>产品规范库 · 11 分钟前 · 176ms</small></div>
              <div><span className="mini-avatar"><Bot size={13} /></span><p><strong>Iris QA</strong> 检索降级，已跳过不可达服务</p><small>安全与合规手册 · 18 分钟前 · 824ms</small></div>
            </div>
          </section>
        </div>

      </WorkbenchLayout>

      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); setFormError('') }} title="注册知识库" description="登记 ContextDB MCP Server，并在接入时验证地址和凭证。" footer={<><Button onClick={() => setCreateOpen(false)}>取消</Button><Button variant="primary" type="submit" form="create-knowledge-form" disabled={registerMutation.isPending}>{registerMutation.isPending ? '注册中…' : '验证并注册'}</Button></>} size="lg">
        <form id="create-knowledge-form" className="form-stack" onSubmit={handleCreate}>
          <div className="form-field"><label htmlFor="knowledge-name">名称</label><input id="knowledge-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></div>
          <div className="form-field"><label htmlFor="knowledge-description">用途说明</label><textarea id="knowledge-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} /></div>
          <div className="form-field"><label htmlFor="knowledge-endpoint">MCP Server URL</label><input id="knowledge-endpoint" type="url" value={form.endpoint} onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://context.example.com/mcp" required /></div>
          <div className="form-grid"><div className="form-field"><label htmlFor="knowledge-auth">鉴权方式</label><select id="knowledge-auth" value={form.authType} onChange={(event) => setForm((current) => ({ ...current, authType: event.target.value as 'bearer' | 'api_key' | 'none' }))}><option value="bearer">Bearer Token</option><option value="api_key">API Key</option><option value="none">无鉴权</option></select></div><div className="form-field"><label htmlFor="knowledge-mode">检索模式</label><select id="knowledge-mode" value={form.retrievalMode} onChange={(event) => setForm((current) => ({ ...current, retrievalMode: event.target.value as RetrievalMode }))}>{Object.entries(retrievalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
          {form.authType !== 'none' ? <div className="form-field"><label htmlFor="knowledge-credential">访问凭证</label><input id="knowledge-credential" type="password" value={form.credential} onChange={(event) => setForm((current) => ({ ...current, credential: event.target.value }))} autoComplete="new-password" /><small><ShieldCheck size={13} />凭证由后端独立加密保存，前端不会再次回显。</small></div> : null}
          {formError ? <p className="form-error"><AlertTriangle size={14} />{formError}</p> : null}
        </form>
      </Dialog>
    </div>
  )
}
