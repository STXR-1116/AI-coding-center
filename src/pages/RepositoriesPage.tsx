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
  MoreHorizontal,
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
import type { Project, RepositoryFile } from '../types'
import '../resource-pages.css'

interface CommitRecord {
  hash: string
  message: string
  body: string
  author: string
  time: string
  refs?: string[]
}

const commits: CommitRecord[] = [
  { hash: '2bc38f1', message: 'feat(workspace): connect repository explorer', body: 'Add lazy tree expansion, preview limits and safe-path feedback.', author: 'Atlas Coder', time: '8 分钟前', refs: ['HEAD', 'feature/workbench'] },
  { hash: '745a2de', message: 'fix(review): preserve rejected diff state', body: 'Keep review outcome visible after switching files.', author: 'Iris QA', time: '42 分钟前' },
  { hash: '92fa401', message: 'feat(requirement): add spec history panel', body: 'Display immutable requirement snapshots in the inspector.', author: 'Lin Coder', time: '昨天 19:24' },
  { hash: '10e6b8a', message: 'chore: align frontend contracts', body: 'Update mock contracts for repository-bound conversations.', author: 'Brandon', time: '昨天 16:08', refs: ['origin/feature/workbench'] },
  { hash: 'b6c9380', message: 'test: cover task approval transitions', body: 'Add manual mode and approval state coverage.', author: 'Iris QA', time: '2 天前' },
  { hash: 'a3e1d50', message: 'feat: scaffold CodingCenter shell', body: 'Create the initial application shell and routing.', author: 'Atlas Coder', time: '3 天前', refs: ['main'] },
]

const repoStatusLabels: Record<Project['status'], string> = {
  clean: '已同步',
  modified: '有变更',
  syncing: '同步中',
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

export function RepositoriesPage() {
  const { projects, tasks } = useApp()
  const [repositories, setRepositories] = useState<Project[]>(projects)
  const [query, setQuery] = useState('')
  const [vcs, setVcs] = useState<'all' | Project['vcs']>('all')
  const [status, setStatus] = useState<'all' | Project['status']>('all')
  const [selectedId, setSelectedId] = useState(projects[0]?.id ?? '')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [tab, setTab] = useState<'overview' | 'files' | 'commits'>('overview')
  const [selectedFilePath, setSelectedFilePath] = useState('src/components/AppShell.tsx')
  const [openFolders, setOpenFolders] = useState(() => new Set(['src', 'src/components']))
  const [selectedCommit, setSelectedCommit] = useState(commits[0]?.hash ?? '')
  const [showAllCommits, setShowAllCommits] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const [form, setForm] = useState({ name: '', description: '', vcs: 'git' as Project['vcs'], remoteUrl: '', localPath: '', branch: 'main', language: 'TypeScript' })

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return repositories.filter((repository) => {
      if (vcs !== 'all' && repository.vcs !== vcs) return false
      if (status !== 'all' && repository.status !== status) return false
      return !text || `${repository.name} ${repository.description} ${repository.branch} ${repository.language}`.toLowerCase().includes(text)
    })
  }, [query, repositories, status, vcs])

  const selected = filtered.find((repository) => repository.id === selectedId) ?? filtered[0]
  const selectedFile = findFile(repositoryTree, selectedFilePath)
  const selectedCommitRecord = commits.find((commit) => commit.hash === selectedCommit) ?? commits[0]
  const linkedTasks = selected ? tasks.filter((task) => task.projectId === selected.id) : []
  const modifiedCount = repositories.filter((repository) => repository.status === 'modified').length

  const toggleFolder = (path: string) => {
    setOpenFolders((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const syncRepository = (id: string) => {
    setRepositories((current) => current.map((repository) => {
      if (repository.id !== id) return repository
      return { ...repository, status: repository.status === 'syncing' ? 'clean' : 'syncing', updatedAt: repository.status === 'syncing' ? '刚刚' : repository.updatedAt }
    }))
  }

  const changeBranch = (id: string, branch: string) => {
    setRepositories((current) => current.map((repository) => (repository.id === id ? { ...repository, branch, status: 'syncing' } : repository)))
  }

  const handleConnect = (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || (!form.remoteUrl.trim() && !form.localPath.trim())) return
    const next: Project = {
      id: `repo-${Date.now()}`,
      name: form.name.trim(),
      description: form.description.trim() || (form.remoteUrl.trim() ? `远端仓库 ${form.remoteUrl.trim()}` : `本地仓库 ${form.localPath.trim()}`),
      vcs: form.vcs,
      branch: form.branch.trim() || 'main',
      status: 'syncing',
      language: form.language.trim() || '未知',
      updatedAt: '刚刚',
    }
    setRepositories((current) => [next, ...current])
    setSelectedId(next.id)
    setForm({ name: '', description: '', vcs: 'git', remoteUrl: '', localPath: '', branch: 'main', language: 'TypeScript' })
    setConnectOpen(false)
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
        <span className="inspector-id">{selected.id}</span><h2>{selected.name}</h2><p className="inspector-summary">{selected.description}</p>
        <div className={`repository-health-card health-${selected.status}`}>{selected.status === 'modified' ? <AlertTriangle size={18} /> : selected.status === 'syncing' ? <RefreshCw size={18} /> : <CheckCircle2 size={18} />}<div><strong>{repoStatusLabels[selected.status]}</strong><span>{selected.status === 'modified' ? '存在尚未审查的本地变更' : selected.status === 'syncing' ? '正在拉取远端状态' : '工作区与远端一致'}</span></div></div>
        <dl className="detail-list">
          <div><dt>版本控制</dt><dd><GitFork size={14} />{selected.vcs.toUpperCase()}</dd></div>
          <div><dt>接入方式</dt><dd><Cloud size={14} />远端 + 本地路径</dd></div>
          <div><dt>主要语言</dt><dd><Code2 size={14} />{selected.language}</dd></div>
          <div><dt>最近更新</dt><dd><History size={14} />{selected.updatedAt}</dd></div>
        </dl>
        <section className="inspector-section"><span className="section-title">当前分支</span><label className="inspector-select"><GitBranch size={15} /><select value={selected.branch} onChange={(event) => changeBranch(selected.id, event.target.value)}><option value={selected.branch}>{selected.branch}</option>{selected.branch !== 'main' ? <option value="main">main</option> : null}<option value="release/0.8">release/0.8</option></select><ChevronDown size={13} /></label></section>
        <section className="repository-linked-tasks"><header><strong>关联任务</strong><span>{linkedTasks.length}</span></header>{linkedTasks.slice(0, 3).map((task) => <button key={task.id}><span><strong>{task.title}</strong><small>{task.id}</small></span><StatusBadge status={task.status} /></button>)}{!linkedTasks.length ? <p className="inline-empty">当前仓库没有关联任务。</p> : null}</section>
        <section className="repository-storage"><HardDrive size={16} /><div><small>上下文索引</small><strong>文件树已就绪</strong><span>深度限制 3 层，已排除依赖目录</span></div></section>
      </div>
      <footer className="inspector-footer"><Button variant={selected.status === 'syncing' ? 'primary' : 'secondary'} icon={<RefreshCw size={15} />} onClick={() => syncRepository(selected.id)}>{selected.status === 'syncing' ? '完成同步' : '同步仓库'}</Button><Button variant="ghost" icon={<FileText size={15} />} onClick={() => { setTab('files'); setMobileView('list') }}>浏览文件</Button></footer>
    </aside>
  ) : null

  return (
    <div className="repositories-page">
      <PageHeader title="版本库" description="仓库上下文、提交记录与代码产出" />
      <SummaryStrip items={[
        { label: '已接入仓库', value: repositories.length, detail: `${repositories.filter((item) => item.vcs === 'git').length} Git · ${repositories.filter((item) => item.vcs === 'svn').length} SVN`, icon: <GitFork size={16} />, tone: 'blue' },
        { label: '连接健康', value: repositories.filter((item) => item.status !== 'syncing').length, detail: '最近检查无凭证错误', icon: <CheckCircle2 size={16} />, tone: 'green' },
        { label: '待处理变更', value: modifiedCount, detail: '提交前需要审查', icon: <GitPullRequest size={16} />, tone: modifiedCount ? 'red' : 'amber' },
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
              <label className="compact-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索仓库、分支或语言" /></label>
              <label className="toolbar-select"><GitBranch size={15} /><select value={vcs} onChange={(event) => setVcs(event.target.value as 'all' | Project['vcs'])}><option value="all">全部类型</option><option value="git">Git</option><option value="svn">SVN</option></select><ChevronDown size={13} /></label>
              <label className="toolbar-select"><CircleDot size={15} /><select value={status} onChange={(event) => setStatus(event.target.value as 'all' | Project['status'])}><option value="all">全部状态</option><option value="clean">已同步</option><option value="modified">有变更</option><option value="syncing">同步中</option></select><ChevronDown size={13} /></label>
              <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setConnectOpen(true)}>接入仓库</Button>
            </div>
          </header>

          {tab === 'overview' ? (
            <div className="repository-list" data-scroll-region="repository-list">
              {filtered.length ? filtered.map((repository) => {
                const taskCount = tasks.filter((task) => task.projectId === repository.id).length
                return (
                  <button key={repository.id} className={selected?.id === repository.id ? 'repository-row is-active' : 'repository-row'} onClick={() => { setSelectedId(repository.id); setMobileView('detail') }}>
                    <span className="repository-icon">{repository.vcs === 'git' ? <GitBranch size={18} /> : <Server size={18} />}</span>
                    <span className="repository-identity"><strong>{repository.name}</strong><small>{repository.description}</small></span>
                    <span className="repository-branch"><GitBranch size={14} />{repository.branch}</span>
                    <span className="repository-language"><Code2 size={14} />{repository.language}</span>
                    <span className="repository-task-count"><b>{taskCount}</b><small>关联任务</small></span>
                    <span className={`repo-health repo-health-${repository.status}`}><i />{repoStatusLabels[repository.status]}</span>
                    <span className="repository-updated">{repository.updatedAt}</span>
                    <ChevronRight size={16} />
                  </button>
                )
              }) : <EmptyState icon={<Search size={22} />} title="没有匹配仓库" description="调整类型、状态或搜索条件后再试。" />}
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
                <header><div><History size={16} /><strong>{selected.branch}</strong></div><span>最近 {showAllCommits ? commits.length : 4} 条提交</span></header>
                {(showAllCommits ? commits : commits.slice(0, 4)).map((commit) => (
                  <button key={commit.hash} className={selectedCommitRecord?.hash === commit.hash ? 'commit-row is-active' : 'commit-row'} onClick={() => setSelectedCommit(commit.hash)} title={commit.body}>
                    <span className="commit-graph-node"><i /></span>
                    <span className="commit-content"><strong>{commit.message}</strong><small>{commit.author} · {commit.time}</small></span>
                    <span className="commit-refs">{commit.refs?.map((ref) => <b key={ref}>{ref}</b>)}</span>
                    <code>{commit.hash}</code>
                  </button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setShowAllCommits((value) => !value)}>{showAllCommits ? '收起记录' : '加载更多'}</Button>
              </section>
              {selectedCommitRecord ? <aside className="commit-detail"><span className="commit-detail-hash"><GitCommitHorizontal size={15} />{selectedCommitRecord.hash}</span><h3>{selectedCommitRecord.message}</h3><p>{selectedCommitRecord.body}</p><dl><div><dt>作者</dt><dd>{selectedCommitRecord.author}</dd></div><div><dt>提交时间</dt><dd>{selectedCommitRecord.time}</dd></div><div><dt>分支引用</dt><dd>{selectedCommitRecord.refs?.join(', ') ?? '无'}</dd></div></dl><Button size="sm" icon={<Copy size={14} />} onClick={() => setCopyNotice(`已准备复制提交 ${selectedCommitRecord.hash}`)}>复制 Hash</Button></aside> : null}
            </div>
          ) : null}
        </div>

      </WorkbenchLayout>

      <Dialog open={connectOpen} onClose={() => setConnectOpen(false)} title="接入版本库" description="配置远端地址或本地路径，凭证由后端独立保存。" footer={<><Button onClick={() => setConnectOpen(false)}>取消</Button><Button variant="primary" type="submit" form="connect-repository-form">验证并接入</Button></>} size="lg">
        <form id="connect-repository-form" className="form-stack" onSubmit={handleConnect}>
          <div className="form-grid"><div className="form-field"><label htmlFor="repository-name">仓库名称</label><input id="repository-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></div><div className="form-field"><label htmlFor="repository-vcs">版本控制</label><select id="repository-vcs" value={form.vcs} onChange={(event) => setForm((current) => ({ ...current, vcs: event.target.value as Project['vcs'] }))}><option value="git">Git</option><option value="svn">SVN</option></select></div></div>
          <div className="form-field"><label htmlFor="repository-description">说明</label><input id="repository-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="这个仓库为哪些任务提供上下文" /></div>
          <div className="form-field"><label htmlFor="repository-url">远端地址</label><input id="repository-url" value={form.remoteUrl} onChange={(event) => setForm((current) => ({ ...current, remoteUrl: event.target.value }))} placeholder="https://git.example.com/team/project.git" /></div>
          <div className="form-field"><label htmlFor="repository-path">本地路径</label><input id="repository-path" value={form.localPath} onChange={(event) => setForm((current) => ({ ...current, localPath: event.target.value }))} placeholder="C:\\workspace\\project" /><small>远端地址和本地路径至少填写一项。</small></div>
          <div className="form-grid"><div className="form-field"><label htmlFor="repository-branch">默认分支</label><input id="repository-branch" value={form.branch} onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))} /></div><div className="form-field"><label htmlFor="repository-language">主要语言</label><input id="repository-language" value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))} /></div></div>
        </form>
      </Dialog>
    </div>
  )
}
