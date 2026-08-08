import { useMemo, useState, type FormEvent } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileClock,
  FileText,
  Filter,
  FolderKanban,
  GitBranch,
  History,
  Layers3,
  ListChecks,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Sparkles,
  UserRound,
  XCircle,
} from 'lucide-react'
import { EmptyState, Button, Dialog, IconButton, PriorityBadge, ProgressBar, StatusBadge } from '../components/ui'
import { PageHeader, SummaryStrip, WorkbenchLayout } from '../components/layout'
import { useApp } from '../state/useApp'
import { useToast } from '../state/useToast'
import { handleApiError } from '../queries/errors'
import {
  useAnalyzeRequirement,
  useCancelRequirement,
  useCreateRequirement,
  useRequirementSpecs,
  useRequirements,
} from '../queries/requirements'
import type {
  Priority,
  Requirement,
  RequirementDto,
  RequirementSpecDto,
  RequirementStatus,
} from '../types'
import '../resource-pages.css'

const requirementStatuses: Array<{ value: 'all' | RequirementStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'analyzing', label: '解析中' },
  { value: 'in_progress', label: '执行中' },
  { value: 'done', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const VALID_STATUSES: RequirementStatus[] = ['draft', 'analyzing', 'in_progress', 'done', 'cancelled']

function asPriority(value: string | null): Priority {
  return VALID_PRIORITIES.includes(value as Priority) ? (value as Priority) : 'medium'
}

function asStatus(value: string): RequirementStatus {
  return VALID_STATUSES.includes(value as RequirementStatus) ? (value as RequirementStatus) : 'draft'
}

/**
 * Bridge a REST `RequirementDto` (wire format) to the UI-domain `Requirement`
 * model consumed by the list/inspector views (P1-6b). The DTO is string/null-
 * typed to mirror the backend verbatim; the UI expects a few display-only
 * fields the backend MVP does not return yet (`owner`, `projectName`,
 * `taskCount`/`doneCount`, `specVersion`). Those get safe defaults so the
 * existing views render without per-component changes — the spec-version
 * column is later driven from `useRequirementSpecs` instead.
 *
 * `projectId` is intentionally absent: the backend `RequirementDto` carries no
 * project dimension (requirements hang off the session/submitter, not a
 * project), so the project filter and create-form field were dead controls and
 * have been removed (P1-6b-fix M1). `Requirement.projectId` keeps its default
 * for type completeness; nothing filters on it anymore.
 */
function toRequirement(dto: RequirementDto): Requirement {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    status: asStatus(dto.status),
    priority: asPriority(dto.priority),
    owner: dto.submitterId ?? '—',
    projectId: '',
    projectName: '—',
    taskCount: 0,
    doneCount: 0,
    specVersion: 0,
    createdAt: dto.createdAt.slice(0, 10),
  }
}

/**
 * Render a spec snapshot's `content` (a JSON decomposition snapshot string) as a
 * compact human label. The backend transmits it verbatim; if it parses to a
 * task array we summarize the count, otherwise we show the raw text truncated.
 */
function specSummary(spec: RequirementSpecDto): string {
  try {
    const parsed = JSON.parse(spec.content)
    if (Array.isArray(parsed)) {
      return parsed.length
        ? `${parsed.length} 个任务：${parsed.map((t: { title?: string }) => t.title ?? '任务').slice(0, 3).join('、')}${parsed.length > 3 ? '…' : ''}`
        : '拆解未产出任务'
    }
  } catch {
    // content 非 JSON —— 透传原文
  }
  const text = spec.content.trim()
  return text.length > 60 ? `${text.slice(0, 60)}…` : text || '空快照'
}

const templates = {
  feature: {
    label: '功能开发',
    description: '目标：\n用户场景：\n验收标准：\n范围外事项：',
  },
  defect: {
    label: '缺陷修复',
    description: '现象：\n复现步骤：\n期望结果：\n影响范围：',
  },
  infrastructure: {
    label: '基础设施',
    description: '当前问题：\n目标架构：\n迁移约束：\n验证方式：',
  },
}

function RequirementListItem({
  requirement,
  active,
  onSelect,
}: {
  requirement: Requirement
  active: boolean
  onSelect: () => void
}) {
  const progress = requirement.taskCount ? Math.round((requirement.doneCount / requirement.taskCount) * 100) : 0

  return (
    <button className={active ? 'requirement-row is-active' : 'requirement-row'} onClick={onSelect}>
      <span className="requirement-row-icon"><FileText size={17} /></span>
      <span className="requirement-row-content">
        <span className="requirement-row-heading">
          <strong>{requirement.title}</strong>
          <PriorityBadge priority={requirement.priority} />
        </span>
        <small>{requirement.id} · {requirement.projectName}</small>
        <span className="requirement-row-progress">
          <ProgressBar value={progress} />
          <b>{requirement.doneCount}/{requirement.taskCount || 0}</b>
        </span>
      </span>
      <StatusBadge status={requirement.status} />
      <ChevronRight size={16} />
    </button>
  )
}

export function RequirementsPage() {
  const { tasks } = useApp()
  const { notify } = useToast()
  const { data: requirements, isLoading: requirementsLoading } = useRequirements()
  const createMutation = useCreateRequirement()
  const analyzeMutation = useAnalyzeRequirement()
  const cancelMutation = useCancelRequirement()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | RequirementStatus>('all')
  const [selectedId, setSelectedId] = useState('')
  const [specExpanded, setSpecExpanded] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [createOpen, setCreateOpen] = useState(false)
  const [template, setTemplate] = useState<keyof typeof templates>('feature')
  const [form, setForm] = useState({ title: '', description: templates.feature.description, priority: 'medium' as Priority })

  // REST DTO → UI 模型桥接（同 P1-2b toTask 模式）
  const rows = useMemo(
    () => (requirements ?? []).map(toRequirement),
    [requirements],
  )

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return rows.filter((requirement) => {
      if (status !== 'all' && requirement.status !== status) return false
      return !text || `${requirement.id} ${requirement.title} ${requirement.description} ${requirement.owner}`.toLowerCase().includes(text)
    })
  }, [query, rows, status])

  // 列表加载完成后默认选中首条；已选 id 不在过滤结果中时回落首条。
  const selected = filtered.find((requirement) => requirement.id === selectedId) ?? filtered[0]
  const { data: specs, isLoading: specsLoading } = useRequirementSpecs(selected?.id ?? null)
  const linkedTasks = selected ? tasks.filter((task) => task.requirementId === selected.id) : []
  const activeCount = rows.filter((item) => item.status === 'in_progress').length
  const draftCount = rows.filter((item) => item.status === 'draft').length
  const completion = rows.length ? Math.round((rows.filter((item) => item.status === 'done').length / rows.length) * 100) : 0
  const latestSpecVersion = specs && specs.length ? specs[0].version : 0

  const handleTemplateChange = (value: keyof typeof templates) => {
    setTemplate(value)
    setForm((current) => ({ ...current, description: templates[value].description }))
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.title.trim() || !form.description.trim()) return
    try {
      const created = await createMutation.mutateAsync({
        title: form.title.trim(),
        summary: form.description.trim(),
        description: form.description.trim(),
        priority: form.priority,
      })
      setSelectedId(created.id)
      setForm({ title: '', description: templates.feature.description, priority: 'medium' })
      setTemplate('feature')
      setStatus('all')
      setCreateOpen(false)
    } catch (error) {
      notify(handleApiError(error), { tone: 'error' })
    }
  }

  const handleAnalyze = async (id: string) => {
    try {
      const result = await analyzeMutation.mutateAsync(id)
      notify(`分析完成，Spec 已生成（${result.tasksCreated} 个任务）`, { title: '分析完成' })
    } catch (error) {
      notify(handleApiError(error), { tone: 'error' })
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelMutation.mutateAsync({ id })
      notify('需求已取消', { title: '已取消' })
    } catch (error) {
      notify(handleApiError(error), { tone: 'error' })
    }
  }

  return (
    <div className="requirements-page">
      <PageHeader title="需求管理" description="从用户想法到可执行任务的完整链路" />
      <SummaryStrip items={[
        { label: '需求总数', value: rows.length, detail: `${draftCount} 个待解析`, icon: <Layers3 size={16} />, tone: 'blue' },
        { label: '等待解析', value: draftCount, detail: '需要管理角色处理', icon: <FileClock size={16} />, tone: 'amber' },
        { label: '执行中', value: activeCount, detail: `${tasks.filter((task) => task.status === 'running').length} 个任务正在运行`, icon: <Play size={16} />, tone: 'green' },
        { label: '完成率', value: `${completion}%`, detail: '按需求数量统计', icon: <CheckCircle2 size={16} />, tone: 'violet' },
      ]} />

      <WorkbenchLayout
        className="requirements-workbench"
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((value) => !value)}
        mobileView={mobileView}
        onMobileViewChange={(value) => setMobileView(value as 'list' | 'detail')}
        mobileViewOptions={[{ value: 'list', label: '列表', count: filtered.length }, { value: 'detail', label: '详情' }]}
        inspector={selected ? (
          <aside className="requirement-inspector" role="tabpanel" aria-label="需求详情">
            <header className="inspector-heading"><div><Sparkles size={17} /><strong>需求详情</strong></div><IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton></header>
            <div className="inspector-body" data-scroll-region="inspector-body">
              <div className="requirement-detail-title"><span>{selected.id}</span><h2>{selected.title}</h2><div><StatusBadge status={selected.status} /><PriorityBadge priority={selected.priority} /></div></div>
              <p className="requirement-description">{selected.description}</p>
              <dl className="detail-list">
                <div><dt>负责人</dt><dd><UserRound size={14} />{selected.owner}</dd></div>
                <div><dt>所属项目</dt><dd><FolderKanban size={14} />{selected.projectName}</dd></div>
                <div><dt>创建时间</dt><dd><CalendarDays size={14} />{selected.createdAt}</dd></div>
                <div><dt>当前 Spec</dt><dd><GitBranch size={14} />v{latestSpecVersion || '—'}</dd></div>
              </dl>

              <section className="requirement-task-progress">
                <header><span>任务完成度</span><strong>{selected.doneCount}/{selected.taskCount}</strong></header>
                <ProgressBar value={selected.taskCount ? Math.round((selected.doneCount / selected.taskCount) * 100) : 0} />
              </section>

              <section className="linked-task-section">
                <header><div><ListChecks size={16} /><strong>关联任务</strong></div><span>{linkedTasks.length}</span></header>
                {linkedTasks.length ? linkedTasks.map((task) => (
                  <button key={task.id} className="linked-task-row">
                    <span><strong>{task.title}</strong><small>{task.id} · {task.assignee}</small></span>
                    <StatusBadge status={task.status} />
                  </button>
                )) : <p className="inline-empty">解析需求后将在这里生成任务。</p>}
              </section>

              <section className="spec-history-section">
                <button className="section-disclosure" onClick={() => setSpecExpanded((value) => !value)} aria-expanded={specExpanded}>
                  <span><History size={16} /><strong>Spec 版本历史</strong></span><ChevronDown size={15} />
                </button>
                {specExpanded ? (
                  <div className="spec-history-list">
                    {specsLoading ? (
                      <p className="inline-empty">加载版本历史…</p>
                    ) : specs && specs.length ? (
                      specs.map((spec, index) => (
                        <button key={spec.id} className={index === 0 ? 'spec-version is-current' : 'spec-version'}>
                          <span>v{spec.version}</span><div><strong>{index === 0 ? '当前版本' : '历史快照'}</strong><small>{specSummary(spec)}</small></div><ChevronRight size={14} />
                        </button>
                      ))
                    ) : (
                      <p className="inline-empty">尚未解析，暂无 Spec 版本。</p>
                    )}
                  </div>
                ) : null}
              </section>
            </div>
            <footer className="inspector-footer">
              {selected.status === 'draft' || selected.status === 'analyzing' ? <Button variant="primary" icon={<Sparkles size={15} />} disabled={analyzeMutation.isPending} onClick={() => handleAnalyze(selected.id)}>{analyzeMutation.isPending ? '解析中…' : '解析需求'}</Button> : null}
              {!['done', 'cancelled'].includes(selected.status) ? <Button variant="ghost" icon={<XCircle size={15} />} disabled={cancelMutation.isPending} onClick={() => handleCancel(selected.id)}>取消需求</Button> : null}
            </footer>
          </aside>
        ) : null}
      >
        <div className="requirements-main-panel" role="tabpanel" aria-label="需求列表">
          <header className="requirements-toolbar">
            <div className="requirements-status-tabs" role="tablist" aria-label="需求状态">
              {requirementStatuses.map((item) => (
                <button key={item.value} className={status === item.value ? 'is-active' : ''} onClick={() => setStatus(item.value)}>
                  {item.label}
                  {item.value === 'all' ? <b>{rows.length}</b> : null}
                </button>
              ))}
            </div>
            <div className="requirements-tools">
              <label className="compact-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、编号或负责人" /></label>
              <IconButton label="更多筛选"><Filter size={17} /></IconButton>
              <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>新建需求</Button>
            </div>
          </header>

          <div className="requirements-list" aria-live="polite" data-scroll-region="requirements-list">
            {requirementsLoading ? (
              <p className="inline-empty">加载需求列表…</p>
            ) : filtered.length ? filtered.map((requirement) => (
              <RequirementListItem key={requirement.id} requirement={requirement} active={selected?.id === requirement.id} onSelect={() => { setSelectedId(requirement.id); setMobileView('detail') }} />
            )) : (
              <EmptyState icon={<Search size={22} />} title="没有匹配需求" description="调整状态或搜索关键词后再试。" action={<Button size="sm" onClick={() => { setQuery(''); setStatus('all') }}>清除筛选</Button>} />
            )}
          </div>
        </div>
      </WorkbenchLayout>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建需求" description="从模板开始，补充目标、上下文和验收标准。" footer={<><Button onClick={() => setCreateOpen(false)}>取消</Button><Button variant="primary" form="create-requirement-form" type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? '创建中…' : '创建草稿'}</Button></>}>
        <form id="create-requirement-form" className="form-stack" onSubmit={handleCreate}>
          <div className="form-field"><label htmlFor="requirement-template">需求模板</label><select id="requirement-template" value={template} onChange={(event) => handleTemplateChange(event.target.value as keyof typeof templates)}>{Object.entries(templates).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select><small>模板仅用于预填，可继续编辑。</small></div>
          <div className="form-field"><label htmlFor="requirement-title">标题</label><input id="requirement-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="用一句话说明交付目标" maxLength={40} required /></div>
          <div className="form-field"><label htmlFor="requirement-description">完整描述</label><textarea id="requirement-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={8} required /></div>
          <div className="form-field"><label htmlFor="requirement-priority">优先级</label><select id="requirement-priority" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as Priority }))}><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">紧急</option></select></div>
        </form>
      </Dialog>
    </div>
  )
}
