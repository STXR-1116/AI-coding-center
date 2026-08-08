import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Archive,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Code2,
  FileJson2,
  History,
  LoaderCircle,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  UsersRound,
  AlertTriangle,
} from 'lucide-react'
import { Button, Dialog, EmptyState, IconButton } from '../components/ui'
import { PageHeader, WorkbenchLayout } from '../components/layout'
import { agents } from '../data/mock'
import { ApiClientError } from '../api/client'
import { toBoundAgentIds, toSkill } from '../api/skills'
import type { SkillRecord } from '../api/skills'
import {
  useBindSkill,
  useCreateSkill,
  useDeprecateSkill,
  useReactivateSkill,
  useSkills,
  useUnbindSkill,
} from '../queries/skills'
import { useToast } from '../state/useToast'
import type { CreateSkillInput } from '../types'
import '../resource-pages.css'

type SkillCategory = 'development' | 'quality' | 'security' | 'workflow'
type SkillStatus = 'active' | 'deprecated'

const categoryLabels: Record<SkillCategory, string> = {
  development: '开发',
  quality: '质量',
  security: '安全',
  workflow: '工作流',
}

function SummaryCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) {
  return (
    <article className="skill-summary-card">
      <span className="skill-summary-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
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

export function SkillsPage() {
  const { notify } = useToast()
  const skillsQuery = useSkills()
  const createMutation = useCreateSkill()
  const deprecateMutation = useDeprecateSkill()
  const reactivateMutation = useReactivateSkill()
  const bindMutation = useBindSkill()
  const unbindMutation = useUnbindSkill()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | SkillCategory>('all')
  const [status, setStatus] = useState<'all' | SkillStatus>('all')
  const [selectedId, setSelectedId] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', description: '', category: 'development' as SkillCategory })

  // 后端 DTO → UI 领域模型；列表一次性返回 SkillDetail（含 manifest + boundAgents）
  const skills: SkillRecord[] = useMemo(
    () => (skillsQuery.data ?? []).map(toSkill),
    [skillsQuery.data],
  )
  // 绑定关系从每个 skill detail 的 boundAgents 派生（id 列表）
  const bindings = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const dto of skillsQuery.data ?? []) {
      map[dto.id] = toBoundAgentIds(dto)
    }
    return map
  }, [skillsQuery.data])

  const filteredSkills = useMemo(() => {
    const text = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (category !== 'all' && skill.category !== category) return false
      if (status !== 'all' && skill.status !== status) return false
      return !text || `${skill.name} ${skill.id} ${skill.description} ${skill.author}`.toLowerCase().includes(text)
    })
  }, [category, query, skills, status])

  // 首次拿到列表后默认选中第一个（列表刷新/选中项被删时回退到第一个）
  const selectedSkill = filteredSkills.find((skill) => skill.id === selectedId) ?? filteredSkills[0]
  const boundAgentIds = selectedSkill ? bindings[selectedSkill.id] ?? [] : []
  const activeCount = skills.filter((skill) => skill.status === 'active').length
  const totalExecutions = skills.reduce((total, skill) => total + skill.executions, 0)
  const averageSuccess = skills.length
    ? skills.reduce((total, skill) => total + skill.successRate, 0) / skills.length
    : 0

  // 绑定/解绑：POST/DELETE /skills/{id}/agents/{agentId} → invalidate + toast
  const toggleBinding = (skillId: string, agentId: string, bound: boolean) => {
    const mutation = bound ? unbindMutation : bindMutation
    mutation.mutate(
      { skillId, agentId },
      {
        onSuccess: () => notify(bound ? '已解绑 Agent' : '已绑定 Agent', { tone: 'success' }),
        onError: (error) => notify(
          (error instanceof ApiClientError ? error.message : '绑定操作失败，请稍后重试。'),
          { tone: 'error', title: '操作失败' },
        ),
      },
    )
  }

  // 废弃/恢复：POST /skills/{id}/deprecate | /reactivate → invalidate + toast
  const toggleDeprecated = (skill: SkillRecord) => {
    const isDeprecated = skill.status === 'deprecated'
    const mutation = isDeprecated ? reactivateMutation : deprecateMutation
    mutation.mutate(skill.id, {
      onSuccess: () => notify(isDeprecated ? `已恢复 Skill「${skill.name}」` : `已废弃 Skill「${skill.name}」`, { tone: 'success' }),
      onError: (error) => notify(
        (error instanceof ApiClientError ? error.message : '操作失败，请稍后重试。'),
        { tone: 'error', title: '操作失败' },
      ),
    })
  }

  const createSkill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = draft.name.trim()
    if (!name) return
    // manifest 为 JSON 字符串（后端校验合法 JSON + 大小上限；version 初始 1.0.0，status active）
    const manifest = JSON.stringify({
      description: draft.description.trim() || '尚未补充能力说明。',
      category: draft.category,
      permissions: ['sandbox:execute'],
      files: ['SKILL.md'],
    })
    const input: CreateSkillInput = { name, manifest }
    createMutation.mutate(input, {
      onSuccess: (dto) => {
        notify(`已创建 Skill「${dto.name}」`, { tone: 'success' })
        setSelectedId(dto.id)
        setCategory('all')
        setStatus('all')
        setQuery('')
        setDraft({ name: '', description: '', category: 'development' })
        setCreateOpen(false)
      },
      onError: (error) => notify(
        (error instanceof ApiClientError ? error.message : '创建失败，请稍后重试。'),
        { tone: 'error', title: '创建失败' },
      ),
    })
  }

  const inspector = selectedSkill ? (
    <aside className="skill-detail-pane" role="tabpanel" aria-label="技能详情">
      <header className="skill-detail-header">
        <div className={`skill-detail-icon skill-category-${selectedSkill.category}`}><Boxes size={22} /></div>
        <div>
          <span>{selectedSkill.id}</span>
          <h2>{selectedSkill.name}</h2>
        </div>
        <span className={`skill-status-badge skill-status-${selectedSkill.status}`}>{selectedSkill.status === 'active' ? '可用' : '已废弃'}</span>
      </header>

      <div className="skill-detail-body" data-scroll-region="skill-detail-body">
        <p className="skill-detail-description">{selectedSkill.description}</p>

        <dl className="skill-detail-facts">
          <div><dt>固定版本</dt><dd><PackageCheck size={14} />v{selectedSkill.version}</dd></div>
          <div><dt>来源</dt><dd><Upload size={14} />{selectedSkill.origin === 'system' ? '平台内置' : '团队上传'}</dd></div>
          <div><dt>作者</dt><dd><Bot size={14} />{selectedSkill.author}</dd></div>
          <div><dt>最近更新</dt><dd><Clock3 size={14} />{selectedSkill.updatedAt}</dd></div>
          <div><dt>执行表现</dt><dd><CircleCheck size={14} />{selectedSkill.executions} 次 / {selectedSkill.successRate}%</dd></div>
        </dl>

        <section className="skill-detail-section">
          <header><div><UsersRound size={16} /><strong>Agent 绑定</strong></div><span>{boundAgentIds.length} / {agents.length}</span></header>
          <div className="skill-agent-bindings">
            {agents.map((agent) => {
              const checked = boundAgentIds.includes(agent.id)
              return (
                <div className="skill-agent-row" key={agent.id}>
                  <span className="mini-avatar"><Bot size={13} /></span>
                  <span><strong>{agent.name}</strong><small>{agent.model} / {agent.runtime === 'local' ? '本地' : '云端'}</small></span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-label={`${checked ? '解绑' : '绑定'} ${agent.name}`}
                    className={checked ? 'toggle-switch is-on' : 'toggle-switch'}
                    disabled={selectedSkill.status === 'deprecated'}
                    onClick={() => toggleBinding(selectedSkill.id, agent.id, checked)}
                  ><span /></button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="skill-detail-section">
          <header><div><ShieldCheck size={16} /><strong>沙箱权限</strong></div></header>
          <div className="skill-token-list">{selectedSkill.permissions.length ? selectedSkill.permissions.map((permission) => <code key={permission}>{permission}</code>) : <small>未声明权限</small>}</div>
        </section>

        <section className="skill-detail-section">
          <header><div><FileJson2 size={16} /><strong>包内容</strong></div><span>{selectedSkill.files.length} 个文件</span></header>
          <div className="skill-file-list">
            {selectedSkill.files.map((file) => <span key={file}><Code2 size={14} />{file}</span>)}
          </div>
        </section>

        {selectedSkill.status === 'deprecated' ? (
          <p className="skill-impact-notice"><Archive size={15} />废弃版本不会注入新任务，既有任务仍保留版本记录。</p>
        ) : null}
      </div>

      <footer className="skill-detail-actions">
        <Button variant="secondary" icon={<History size={15} />}>版本记录</Button>
        <Button
          variant={selectedSkill.status === 'active' ? 'danger' : 'secondary'}
          icon={selectedSkill.status === 'active' ? <Archive size={15} /> : <RotateCcw size={15} />}
          disabled={deprecateMutation.isPending || reactivateMutation.isPending}
          onClick={() => toggleDeprecated(selectedSkill)}
        >{selectedSkill.status === 'active' ? '废弃此版本' : '恢复此版本'}</Button>
      </footer>
    </aside>
  ) : null

  return (
    <div className="skills-page">
      <PageHeader title="技能管理" description="版本固定、审计和能力注入" />
      <section className="skills-summary-grid" aria-label="技能概览">
        <SummaryCard icon={<PackageCheck size={21} />} label="可用技能" value={activeCount} detail={`${skills.length - activeCount} 个已废弃`} />
        <SummaryCard icon={<UsersRound size={21} />} label="Agent 绑定" value={Object.values(bindings).reduce((total, ids) => total + ids.length, 0)} detail={`${agents.length} 个 Agent 可配置`} />
        <SummaryCard icon={<Sparkles size={21} />} label="累计调用" value={totalExecutions.toLocaleString()} detail="任务执行上下文注入" />
        <SummaryCard icon={<CircleCheck size={21} />} label="平均成功率" value={`${averageSuccess.toFixed(1)}%`} detail="按当前固定版本统计" />
      </section>

      <WorkbenchLayout
        className="skills-workbench"
        mobileView={mobileView}
        onMobileViewChange={(value) => setMobileView(value as 'list' | 'detail')}
        mobileViewOptions={[
          { value: 'list', label: '列表', count: filteredSkills.length },
          { value: 'detail', label: '详情' },
        ]}
        inspector={inspector}
      >
        <div className="skills-catalog-pane" role="tabpanel" aria-label="技能列表">
          <header className="skills-catalog-header">
            <div>
              <h2>技能目录</h2>
              <span>{filteredSkills.length} / {skills.length} 个能力包</span>
            </div>
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>上传 Skill</Button>
          </header>

          <div className="skills-toolbar">
            <label className="compact-search skills-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、作者或能力" />
            </label>
            <label className="toolbar-select">
              <Tag size={14} />
              <select value={category} onChange={(event) => setCategory(event.target.value as 'all' | SkillCategory)} aria-label="技能分类">
                <option value="all">全部分类</option>
                {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown size={13} />
            </label>
            <label className="toolbar-select">
              <History size={14} />
              <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | SkillStatus)} aria-label="技能状态">
                <option value="all">全部状态</option>
                <option value="active">可用</option>
                <option value="deprecated">已废弃</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>

          <div className="skill-list" role="list" data-scroll-region="skill-list">
            {skillsQuery.isLoading ? <StatePanel icon={<LoaderCircle size={22} />} title="正在加载技能列表" description="从后端拉取已注册 Skill…" />
              : skillsQuery.error ? <StatePanel icon={<AlertTriangle size={22} />} title="技能列表加载失败" description={(skillsQuery.error as ApiClientError)?.message ?? '请稍后重试或检查登录状态。'} />
              : filteredSkills.length ? filteredSkills.map((skill) => {
              const isSelected = selectedSkill?.id === skill.id
              const agentCount = bindings[skill.id]?.length ?? 0
              return (
                <button
                  key={skill.id}
                  className={isSelected ? 'skill-list-row is-active' : 'skill-list-row'}
                  onClick={() => { setSelectedId(skill.id); setMobileView('detail') }}
                  role="listitem"
                >
                  <span className={`skill-list-icon skill-category-${skill.category}`}><Boxes size={18} /></span>
                  <span className="skill-list-main">
                    <span className="skill-list-title"><strong>{skill.name}</strong><code>v{skill.version}</code></span>
                    <small>{skill.description}</small>
                    <span className="skill-list-meta"><b>{categoryLabels[skill.category]}</b><span>{agentCount} 个 Agent</span><span>{skill.executions} 次调用</span></span>
                  </span>
                  <span className={`skill-status-badge skill-status-${skill.status}`}>{skill.status === 'active' ? '可用' : '已废弃'}</span>
                  <ChevronRight size={16} />
                </button>
              )
            }) : (
              <EmptyState icon={<Search size={22} />} title="没有匹配的 Skill" description="调整关键词、分类或状态筛选，或上传一个新的 Skill。" />
            )}
          </div>
        </div>

      </WorkbenchLayout>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="上传 Skill"
        description="创建后版本固定为 1.0.0，可在详情中绑定 Agent。"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" type="submit" form="create-skill-form" icon={<Check size={15} />} disabled={createMutation.isPending}>{createMutation.isPending ? '创建中…' : '创建 Skill'}</Button>
          </>
        )}
      >
        <form id="create-skill-form" className="skill-create-form" onSubmit={createSkill}>
          <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 Release Guard" autoFocus required /></label>
          <label><span>分类</span><select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as SkillCategory }))}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>能力说明</span><textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="说明触发条件、输入与预期产出" /></label>
          <div className="skill-upload-placeholder"><Upload size={20} /><span><strong>Manifest 与脚本</strong><small>演示模式将生成基础 SKILL.md</small></span><IconButton type="button" label="选择文件"><Plus size={16} /></IconButton></div>
        </form>
      </Dialog>
    </div>
  )
}
