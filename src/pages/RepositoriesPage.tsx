import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Cloud,
  Code2,
  Copy,
  Database,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  HardDrive,
  History,
  LoaderCircle,
  MoreHorizontal,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { codePreview, repositoryTree } from '../data/mock'
import { useApp } from '../state/useApp'
import { Button, Dialog, EmptyState, IconButton, StatusBadge } from '../components/ui'
import { PageHeader, SummaryStrip, WorkbenchLayout } from '../components/layout'
import { useChanges, useCommits, useRepositories, useRegisterRepository, useTestRepository } from '../queries/repositories'
import { ApiClientError } from '../api/client'
import { useToast } from '../state/useToast'
import type {
  CommitDto,
  RepositoryFile,
  WorktreeChangeDto,
} from '../types'
import '../resource-pages.css'

// 仓库 REST DTO 状态（active|disabled）→ UI 健康标签。后端无「同步中」概念，
// 同步态是前端 mock 专属，迁移后以 hasLocalPath + active 区分健康度。
const repoHealthLabels: Record<'active' | 'disabled', string> = {
  active: '已接入',
  disabled: '已停用',
}

/** 把后端 vcsType（git|svn）收敛为 UI 用的版本控制标签。 */
function vcsLabel(vcsType: string): 'git' | 'svn' {
  return vcsType === 'svn' ? 'svn' : 'git'
}

/** ISO 字符串 → 本地可读日期（后端 updatedAt 是 ISO，mock 时代是相对文案）。 */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // 与其它页面一致的简洁本地时间
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ISO git %ai → 简短本地时间（提交记录列表用）。 */
function formatCommitTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function findFile(items: RepositoryFile[], path: string): RepositoryFile | undefined {
  for (const item of items) {
    if (item.path === path) return item
    if (item.children) {
      const nested = findFile(item.children, path)
      if (nested) return nested
    }
  }
  return undefined
}

function RepositoryTreeNode({
  item,
  depth,
  selectedPath,
  openFolders,
  onToggle,
  onSelect,
}: {
  item: RepositoryFile
  depth: number
  selectedPath: string
  openFolders: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}) {
  const isFolder = item.type === 'folder'
  const isOpen = openFolders.has(item.path)

  return (
    <div className="repository-tree-node">
      <button
        className={selectedPath === item.path ? 'repository-tree-row is-active' : 'repository-tree-row'}
        style={{ '--tree-depth': depth } as React.CSSProperties}
        onClick={() => (isFolder ? onToggle(item.path) : onSelect(item.path))}
      >
        {isFolder ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="tree-indent" />}
        {isFolder ? (isOpen ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileCode2 size={15} />}
        <span>{item.name}</span>
      </button>
      {isFolder && isOpen ? item.children?.map((child) => (
        <RepositoryTreeNode key={child.path} item={child} depth={depth + 1} selectedPath={selectedPath} openFolders={openFolders} onToggle={onToggle} onSelect={onSelect} />
      )) : null}
    </div>
  )
}

/** 加载/错误占位——列表区与详情区共用。 */
function StatePanel({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <EmptyState icon={icon} title={title} description={description} />
}

export function RepositoriesPage() {
  const { notify } = useToast()
  // tasks 仍来自 AppContext（关联任务统计），仓库列表改走 REST（P1-4b）。
  const { tasks } = useApp()
  const reposQuery = useRepositories()
  const registerMutation = useRegisterRepository()
  const testMutation = useTestRepository()
  const [query, setQuery] = useState('')
  const [vcs, setVcs] = useState<'all' | 'git' | 'svn'>('all')
  const [status, setStatus] = useState<'all' | 'active' | 'disabled'>('all')
  const [selectedId, setSelectedId] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [tab, setTab] = useState<'overview' | 'files' | 'commits'>('overview')
  const [selectedFilePath, setSelectedFilePath] = useState('src/components/AppShell.tsx')
  const [openFolders, setOpenFolders] = useState(() => new Set(['src', 'src/components']))
  const [selectedCommit, setSelectedCommit] = useState('')
  const [showAllCommits, setShowAllCommits] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  // 接入表单（P2-3b 接 REST：registerRepository 真实注册）。
  const [form, setForm] = useState({ name: '', description: '', vcs: 'git' as 'git' | 'svn', remoteUrl: '', localPath: '', branch: 'main', language: 'TypeScript' })

  const repositories = reposQuery.data ?? []

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return repositories.filter((repository) => {
      if (vcs !== 'all' && vcsLabel(repository.vcsType) !== vcs) return false
      if (status !== 'all' && repository.status !== status) return false
      return !text || `${repository.name} ${repository.url} ${repository.defaultBranch} ${repository.ownerName ?? ''}`.toLowerCase().includes(text)
    })
  }, [query, repositories, status, vcs])

  // 选中仓库：优先按 selectedId 命中，否则回退到过滤结果首项。
  const selected = filtered.find((repository) => repository.id === selectedId) ?? filtered[0]
  const effectiveSelectedId = selected?.id ?? ''
  // 仅当仓库配置了本地路径时才请求 commits/changes（后端无 localPath 直接 400）。
  const detailEnabled = Boolean(selected?.hasLocalPath)

  const commitsQuery = useCommits(effectiveSelectedId, detailEnabled)
  const changesQuery = useChanges(effectiveSelectedId, detailEnabled)
  const commits: CommitDto[] = commitsQuery.data ?? []
  const changes: WorktreeChangeDto[] = changesQuery.data ?? []

  const selectedFile = findFile(repositoryTree, selectedFilePath)
  const selectedCommitRecord = commits.find((commit) => commit.hash === selectedCommit) ?? commits[0]
  const linkedTasks = selected ? tasks.filter((task) => task.projectId === selected.id) : []
  const activeCount = repositories.filter((item) => item.status === 'active').length
  const disabledCount = repositories.length - activeCount
  const changesTotal = changes.reduce((sum, c) => sum + c.addedLines + c.deletedLines, 0)

  const toggleFolder = (path: string) => {
    setOpenFolders((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // 接入表单提交（P2-3b：registerRepository 真实注册 → invalidate 列表）
  const handleConnect = (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || (!form.remoteUrl.trim() && !form.localPath.trim())) return
    registerMutation.mutate(
      { name: form.name, vcsType: form.vcs, url: form.remoteUrl, localPath: form.localPath, defaultBranch: form.branch },
      {
        onSuccess: () => {
          setCopyNotice('')
          setConnectOpen(false)
          notify('仓库已接入，正在读取分支信息。', { title: '接入成功', tone: 'success' })
          setForm({ name: '', description: '', vcs: 'git', remoteUrl: '', localPath: '', branch: 'main', language: 'TypeScript' })
        },
        onError: (error) => {
          notify(error instanceof Error ? error.message : '接入失败，请检查地址与凭证后重试。', { title: '接入失败', tone: 'error' })
        },
      },
    )
  }

  const previewText = selectedFile?.path === 'package.json'
    ? `{"name":"codingcenter-web","private":true,"scripts":{"dev":"vite","build":"tsc -b && vite build"}}`
    : selectedFile?.path === 'README.md'
      ? '# CodingCenter\n\nMulti-agent coding orchestration frontend.'
      : codePreview

  const inspector = selected ? (
    <aside className="repository-inspector" role="tabpanel" aria-label="版本库详情">
      <header className="inspector-heading"><div><GitBranch size={17} /><strong>仓库详情</strong></div><IconButton label="更多操作"><MoreHorizontal size={18} /></IconButton></header>
      <div className="inspector-body" data-scroll-region="inspector-body">
        <span className="inspector-id">{selected.id}</span><h2>{selected.name}</h2><p className="inspector-summary">{selected.url || selected.name}</p>
        <div className={`repository-health-card health-${selected.status === 'active' ? 'clean' : 'syncing'}`}>{selected.status === 'active' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<div><strong>{repoHealthLabels[selected.status as 'active' | 'disabled'] ?? selected.status}</strong><span>{selected.hasLocalPath ? '已配置本地路径，支持提交记录与变更统计' : '未配置本地路径，不支持 git log / 文件树'}</span></div></div>
        <dl className="detail-list">
          <div><dt>版本控制</dt><dd><GitFork size={14} />{vcsLabel(selected.vcsType).toUpperCase()}</dd></div>
          <div><dt>接入方式</dt><dd><Cloud size={14} />{selected.url ? '远端 + 本地路径' : '本地路径'}</dd></div>
          <div><dt>默认分支</dt><dd><GitBranch size={14} />{selected.defaultBranch || '—'}</dd></div>
          <div><dt>负责人</dt><dd><Code2 size={14} />{selected.ownerName ?? '—'}</dd></div>
          <div><dt>最近更新</dt><dd><History size={14} />{formatTime(selected.updatedAt)}</dd></div>
        </dl>
        <section className="repository-linked-tasks"><header><strong>关联任务</strong><span>{linkedTasks.length}</span></header>{linkedTasks.slice(0, 3).map((task) => <button key={task.id}><span><strong>{task.title}</strong><small>{task.id}</small></span><StatusBadge status={task.status} /></button>)}{!linkedTasks.length ? <p className="inline-empty">当前仓库没有关联任务。</p> : null}</section>
        <section className="repository-storage"><HardDrive size={16} /><div><small>工作区变更</small><strong>{detailEnabled ? `${changes.length} 个文件 · ${changesTotal} 行` : '需要本地路径'}</strong><span>{detailEnabled ? '基于 git status 实时统计' : '该仓库未配置本地路径'}</span></div></section>
      </div>
      <footer className="inspector-footer"><Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => { void reposQuery.refetch(); void commitsQuery.refetch(); void changesQuery.refetch() }}>刷新</Button><Button variant="ghost" icon={<Plug size={15} />} disabled={testMutation.isPending} onClick={() => { testMutation.mutate(selected.id, { onSuccess: (r) => notify(r.ok ? `连接正常（${r.latencyMs}ms）` : (r.message ?? '仓库不可达'), { title: r.ok ? '连接正常' : '连接异常', tone: r.ok ? 'success' : 'error' }) }) }}>{testMutation.isPending ? '测试中…' : '测试连接'}</Button><Button variant="ghost" icon={<FileText size={15} />} onClick={() => { setTab('files'); setMobileView('list') }}>浏览文件</Button></footer>
    </aside>
  ) : null

  return (
    <div className="repositories-page">
      <PageHeader title="版本库" description="仓库上下文、提交记录与代码产出" />
      <SummaryStrip items={[
        { label: '已接入仓库', value: repositories.length, detail: `${activeCount} 启用 · ${disabledCount} 停用`, icon: <GitFork size={16} />, tone: 'blue' },
        { label: '连接健康', value: activeCount, detail: '最近检查无凭证错误', icon: <CheckCircle2 size={16} />, tone: 'green' },
        { label: '待处理变更', value: changes.length, detail: detailEnabled ? `${changesTotal} 行待审查` : '需本地路径', icon: <GitPullRequest size={16} />, tone: changes.length ? 'red' : 'amber' },
        { label: '关联任务', value: tasks.filter((task) => repositories.some((repo) => repo.id === task.projectId)).length, detail: '提供代码执行上下文', icon: <Database size={16} />, tone: 'violet' },
      ]} />

      {copyNotice ? <div className="copy-notice"><CheckCircle2 size={15} />{copyNotice}</div> : null}

      <WorkbenchLayout
        className="repository-workbench"
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((value) => !value)}
        mobileView={mobileView}
        onMobileViewChange={(value) => setMobileView(value as 'list' | 'detail')}
        mobileViewOptions={[{ value: 'list', label: '列表', count: filtered.length }, { value: 'detail', label: '详情' }]}
        inspector={inspector}
      >
        <div className="repository-main-panel" role="tabpanel" aria-label="版本库列表">
          <header className="repository-toolbar">
            <div className="repository-view-tabs" role="tablist" aria-label="版本库视图">
              <button className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}>仓库概览</button>
              <button className={tab === 'files' ? 'is-active' : ''} onClick={() => setTab('files')}>文件浏览</button>
              <button className={tab === 'commits' ? 'is-active' : ''} onClick={() => setTab('commits')}>提交记录</button>
            </div>
            <div className="repository-tools">
              <label className="compact-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索仓库、分支或负责人" /></label>
              <label className="toolbar-select"><GitBranch size={15} /><select value={vcs} onChange={(event) => setVcs(event.target.value as 'all' | 'git' | 'svn')}><option value="all">全部类型</option><option value="git">Git</option><option value="svn">SVN</option></select><ChevronDown size={13} /></label>
              <label className="toolbar-select"><CircleDot size={15} /><select value={status} onChange={(event) => setStatus(event.target.value as 'all' | 'active' | 'disabled')}><option value="all">全部状态</option><option value="active">已启用</option><option value="disabled">已停用</option></select><ChevronDown size={13} /></label>
              <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setConnectOpen(true)}>接入仓库</Button>
            </div>
          </header>

          {tab === 'overview' ? (
            <div className="repository-list" data-scroll-region="repository-list">
              {reposQuery.isLoading ? <StatePanel icon={<LoaderCircle size={22} />} title="正在加载仓库列表" description="从后端拉取已接入仓库…" />
                : reposQuery.error ? <StatePanel icon={<AlertTriangle size={22} />} title="仓库列表加载失败" description={(reposQuery.error as ApiClientError)?.message ?? '请稍后重试或检查登录状态。'} />
                : filtered.length ? filtered.map((repository) => {
                  const taskCount = tasks.filter((task) => task.projectId === repository.id).length
                  return (
                    <button key={repository.id} className={selected?.id === repository.id ? 'repository-row is-active' : 'repository-row'} onClick={() => { setSelectedId(repository.id); setSelectedCommit(''); setMobileView('detail') }}>
                      <span className="repository-icon">{vcsLabel(repository.vcsType) === 'git' ? <GitBranch size={18} /> : <Server size={18} />}</span>
                      <span className="repository-identity"><strong>{repository.name}</strong><small>{repository.url || repository.name}</small></span>
                      <span className="repository-branch"><GitBranch size={14} />{repository.defaultBranch || '—'}</span>
                      <span className="repository-language"><Code2 size={14} />{repository.ownerName ?? '—'}</span>
                      <span className="repository-task-count"><b>{taskCount}</b><small>关联任务</small></span>
                      <span className={`repo-health repo-health-${repository.status === 'active' ? 'clean' : 'syncing'}`}><i />{repoHealthLabels[repository.status as 'active' | 'disabled'] ?? repository.status}</span>
                      <span className="repository-updated">{formatTime(repository.updatedAt)}</span>
                      <ChevronRight size={16} />
                    </button>
                  )
                }) : <StatePanel icon={<Search size={22} />} title="没有匹配仓库" description="调整类型、状态或搜索条件后再试。" />}
            </div>
          ) : null}

          {tab === 'files' && selected ? (
            <div className="repository-explorer">
              <aside className="repository-file-tree">
                <header><div><FolderTree size={16} /><strong>{selected.name}</strong></div><IconButton label="刷新文件"><RefreshCw size={15} /></IconButton></header>
                 <div data-scroll-region="repository-file-tree">{repositoryTree.map((item) => <RepositoryTreeNode key={item.path} item={item} depth={0} selectedPath={selectedFilePath} openFolders={openFolders} onToggle={toggleFolder} onSelect={setSelectedFilePath} />)}</div>
              </aside>
              <section className="repository-code-preview">
                <header><div><FileCode2 size={15} /><strong>{selectedFile?.path ?? selectedFilePath}</strong></div><span>{selectedFile?.language ?? 'text'}</span></header>
                 <pre data-scroll-region="repository-code-preview"><code>{previewText}</code></pre>
                <footer><ShieldCheck size={14} /><span>安全预览，最大 512KB，二进制文件将被拒绝。</span></footer>
              </section>
            </div>
          ) : null}

          {tab === 'commits' && selected ? (
            <div className="commit-browser">
                 <section className="commit-list" data-scroll-region="commit-list">
                <header><div><History size={16} /><strong>{selected.defaultBranch || '—'}</strong></div><span>{detailEnabled ? `最近 ${showAllCommits ? commits.length : Math.min(commits.length, 4)} 条提交` : '该仓库未配置本地路径'}</span></header>
                {!detailEnabled ? <StatePanel icon={<AlertTriangle size={22} />} title="暂无提交记录" description="该仓库未配置本地路径，不支持 git log。" />
                  : commitsQuery.isLoading ? <StatePanel icon={<LoaderCircle size={22} />} title="正在加载提交记录" description="从后端拉取 git log…" />
                  : commitsQuery.error ? <StatePanel icon={<AlertTriangle size={22} />} title="提交记录加载失败" description={(commitsQuery.error as ApiClientError)?.message ?? '请稍后重试。'} />
                  : commits.length ? (showAllCommits ? commits : commits.slice(0, 4)).map((commit) => (
                    <button key={commit.hash} className={selectedCommitRecord?.hash === commit.hash ? 'commit-row is-active' : 'commit-row'} onClick={() => setSelectedCommit(commit.hash)} title={commit.message}>
                      <span className="commit-graph-node"><i /></span>
                      <span className="commit-content"><strong>{commit.message}</strong><small>{commit.author} · {formatCommitTime(commit.date)}</small></span>
                      <span className="commit-refs" />
                      <code>{commit.shortHash || commit.hash.slice(0, 7)}</code>
                    </button>
                  )) : <StatePanel icon={<History size={22} />} title="没有提交记录" description="该分支暂无提交。" />}
                {detailEnabled && commits.length > 4 ? <Button variant="ghost" size="sm" onClick={() => setShowAllCommits((value) => !value)}>{showAllCommits ? '收起记录' : '加载更多'}</Button> : null}
              </section>
              {selectedCommitRecord ? <aside className="commit-detail"><span className="commit-detail-hash"><GitCommitHorizontal size={15} />{selectedCommitRecord.shortHash || selectedCommitRecord.hash.slice(0, 7)}</span><h3>{selectedCommitRecord.message}</h3><dl><div><dt>作者</dt><dd>{selectedCommitRecord.author}</dd></div><div><dt>提交时间</dt><dd>{formatCommitTime(selectedCommitRecord.date)}</dd></div><div><dt>完整 Hash</dt><dd>{selectedCommitRecord.hash}</dd></div></dl><Button size="sm" icon={<Copy size={14} />} onClick={() => setCopyNotice(`已准备复制提交 ${selectedCommitRecord.hash}`)}>复制 Hash</Button></aside> : null}
            </div>
          ) : null}
        </div>

      </WorkbenchLayout>

      <Dialog open={connectOpen} onClose={() => setConnectOpen(false)} title="接入版本库" description="配置远端地址或本地路径，凭证由后端独立保存。" footer={<><Button onClick={() => setConnectOpen(false)}>取消</Button><Button variant="primary" type="submit" form="connect-repository-form">验证并接入</Button></>} size="lg">
        <form id="connect-repository-form" className="form-stack" onSubmit={handleConnect}>
          <div className="form-grid"><div className="form-field"><label htmlFor="repository-name">仓库名称</label><input id="repository-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></div><div className="form-field"><label htmlFor="repository-vcs">版本控制</label><select id="repository-vcs" value={form.vcs} onChange={(event) => setForm((current) => ({ ...current, vcs: event.target.value as 'git' | 'svn' }))}><option value="git">Git</option><option value="svn">SVN</option></select></div></div>
          <div className="form-field"><label htmlFor="repository-url">远端地址</label><input id="repository-url" value={form.remoteUrl} onChange={(event) => setForm((current) => ({ ...current, remoteUrl: event.target.value }))} placeholder="https://git.example.com/team/project.git" /></div>
          <div className="form-field"><label htmlFor="repository-path">本地路径</label><input id="repository-path" value={form.localPath} onChange={(event) => setForm((current) => ({ ...current, localPath: event.target.value }))} placeholder="C:\\workspace\\project" /><small>远端地址和本地路径至少填写一项。</small></div>
          <div className="form-grid"><div className="form-field"><label htmlFor="repository-branch">默认分支</label><input id="repository-branch" value={form.branch} onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))} /></div></div>
        </form>
      </Dialog>
    </div>
  )
}
