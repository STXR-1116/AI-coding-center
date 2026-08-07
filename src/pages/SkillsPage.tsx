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
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  UsersRound,
} from 'lucide-react'
import { Button, Dialog, EmptyState, IconButton } from '../components/ui'
import { PageHeader, WorkbenchLayout } from '../components/layout'
import { agents } from '../data/mock'
import '../resource-pages.css'

type SkillCategory = 'development' | 'quality' | 'security' | 'workflow'
type SkillStatus = 'active' | 'deprecated'

interface SkillRecord {
  id: string
  name: string
  description: string
  category: SkillCategory
  version: string
  status: SkillStatus
  origin: 'system' | 'custom'
  author: string
  updatedAt: string
  executions: number
  successRate: number
  permissions: string[]
  files: string[]
}

const categoryLabels: Record<SkillCategory, string> = {
  development: '开发',
  quality: '质量',
  security: '安全',
  workflow: '工作流',
}

const initialSkills: SkillRecord[] = [
  {
    id: 'repo-preview',
    name: 'Repo Preview',
    description: '读取受限仓库目录、预览代码文件并生成结构化上下文。',
    category: 'development',
    version: '2.4.1',
    status: 'active',
    origin: 'system',
    author: 'Platform Team',
    updatedAt: '今天 10:24',
    executions: 286,
    successRate: 96.8,
    permissions: ['repository:read', 'artifact:read'],
    files: ['SKILL.md', 'scripts/read-tree.ts', 'references/safety.md'],
  },
  {
    id: 'test-runner',
    name: 'Test Runner',
    description: '识别项目测试框架，执行关键测试并整理失败上下文。',
    category: 'quality',
    version: '1.8.0',
    status: 'active',
    origin: 'system',
    author: 'QA Platform',
    updatedAt: '昨天 18:40',
    executions: 194,
    successRate: 93.4,
    permissions: ['repository:read', 'sandbox:execute'],
    files: ['SKILL.md', 'scripts/detect-runner.ts'],
  },
  {
    id: 'api-contract',
    name: 'API Contract',
    description: '根据接口契约检查请求、响应、错误码和兼容性风险。',
    category: 'quality',
    version: '1.5.3',
    status: 'active',
    origin: 'custom',
    author: 'Iris QA',
    updatedAt: '2 天前',
    executions: 128,
    successRate: 95.1,
    permissions: ['repository:read', 'network:restricted'],
    files: ['SKILL.md', 'references/openapi-checklist.md'],
  },
  {
    id: 'secure-paths',
    name: 'Secure Paths',
    description: '审查目录穿越、命令参数化和仓库边界保护。',
    category: 'security',
    version: '1.2.2',
    status: 'active',
    origin: 'custom',
    author: 'Security Guild',
    updatedAt: '2026-08-01',
    executions: 72,
    successRate: 98.6,
    permissions: ['repository:read'],
    files: ['SKILL.md', 'scripts/audit-paths.ts'],
  },
  {
    id: 'task-decomposer',
    name: 'Task Decomposer',
    description: '把已确认需求拆成可独立执行、可验收的任务序列。',
    category: 'workflow',
    version: '3.0.0',
    status: 'active',
    origin: 'system',
    author: 'Nova PM',
    updatedAt: '2026-07-29',
    executions: 341,
    successRate: 97.2,
    permissions: ['requirement:read', 'task:write'],
    files: ['SKILL.md', 'references/task-schema.md'],
  },
  {
    id: 'legacy-commit-summary',
    name: 'Legacy Commit Summary',
    description: '旧版提交记录摘要器，已由 Repo Preview 的审查能力替代。',
    category: 'workflow',
    version: '0.9.4',
    status: 'deprecated',
    origin: 'custom',
    author: 'Platform Team',
    updatedAt: '2026-07-12',
    executions: 58,
    successRate: 86.2,
    permissions: ['repository:read'],
    files: ['SKILL.md'],
  },
]

const initialBindings: Record<string, string[]> = {
  'repo-preview': ['agent-atlas'],
  'test-runner': ['agent-atlas', 'agent-iris'],
  'api-contract': ['agent-iris'],
  'secure-paths': ['agent-atlas', 'agent-lin'],
  'task-decomposer': ['agent-nova'],
  'legacy-commit-summary': [],
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

export function SkillsPage() {
  const [skills, setSkills] = useState(initialSkills)
  const [bindings, setBindings] = useState(initialBindings)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | SkillCategory>('all')
  const [status, setStatus] = useState<'all' | SkillStatus>('all')
  const [selectedId, setSelectedId] = useState(initialSkills[0].id)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', description: '', category: 'development' as SkillCategory })

  const filteredSkills = useMemo(() => {
    const text = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (category !== 'all' && skill.category !== category) return false
      if (status !== 'all' && skill.status !== status) return false
      return !text || `${skill.name} ${skill.id} ${skill.description} ${skill.author}`.toLowerCase().includes(text)
    })
  }, [category, query, skills, status])

  const selectedSkill = filteredSkills.find((skill) => skill.id === selectedId) ?? filteredSkills[0]
  const boundAgentIds = selectedSkill ? bindings[selectedSkill.id] ?? [] : []
  const activeCount = skills.filter((skill) => skill.status === 'active').length
  const totalExecutions = skills.reduce((total, skill) => total + skill.executions, 0)
  const averageSuccess = skills.length
    ? skills.reduce((total, skill) => total + skill.successRate, 0) / skills.length
    : 0

  const toggleBinding = (skillId: string, agentId: string) => {
    setBindings((current) => {
      const existing = current[skillId] ?? []
      return {
        ...current,
        [skillId]: existing.includes(agentId)
          ? existing.filter((id) => id !== agentId)
          : [...existing, agentId],
      }
    })
  }

  const toggleDeprecated = (skillId: string) => {
    setSkills((current) => current.map((skill) => (
      skill.id === skillId
        ? { ...skill, status: skill.status === 'active' ? 'deprecated' : 'active', updatedAt: '刚刚' }
        : skill
    )))
  }

  const createSkill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = draft.name.trim()
    if (!name) return
    const baseId = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || 'custom-skill'
    const id = skills.some((skill) => skill.id === baseId) ? `${baseId}-${skills.length + 1}` : baseId
    const newSkill: SkillRecord = {
      id,
      name,
      description: draft.description.trim() || '尚未补充能力说明。',
      category: draft.category,
      version: '0.1.0',
      status: 'active',
      origin: 'custom',
      author: 'Brandon',
      updatedAt: '刚刚',
      executions: 0,
      successRate: 0,
      permissions: ['sandbox:execute'],
      files: ['SKILL.md'],
    }
    setSkills((current) => [newSkill, ...current])
    setBindings((current) => ({ ...current, [id]: [] }))
    setSelectedId(id)
    setCategory('all')
    setStatus('all')
    setQuery('')
    setDraft({ name: '', description: '', category: 'development' })
    setCreateOpen(false)
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
                    onClick={() => toggleBinding(selectedSkill.id, agent.id)}
                  ><span /></button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="skill-detail-section">
          <header><div><ShieldCheck size={16} /><strong>沙箱权限</strong></div></header>
          <div className="skill-token-list">{selectedSkill.permissions.map((permission) => <code key={permission}>{permission}</code>)}</div>
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
          onClick={() => toggleDeprecated(selectedSkill.id)}
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
            {filteredSkills.length ? filteredSkills.map((skill) => {
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
              <EmptyState icon={<Search size={22} />} title="没有匹配的 Skill" description="调整关键词、分类或状态筛选。" />
            )}
          </div>
        </div>

      </WorkbenchLayout>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="上传 Skill"
        description="创建后版本固定为 0.1.0，可在详情中绑定 Agent。"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" type="submit" form="create-skill-form" icon={<Check size={15} />}>创建 Skill</Button>
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
