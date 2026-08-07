import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Bot,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Code2,
  Columns2,
  File,
  FileCode2,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestArrow,
  History,
  Inbox,
  MessageSquareCode,
  MoreHorizontal,
  Paperclip,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
  Play,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  TerminalSquare,
  X,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { codePreview, repositoryTree } from '../data/mock'
import { useApp } from '../state/useApp'
import { useToast } from '../state/useToast'
import type { ChangeItem, RepositoryFile } from '../types'
import { Button, EmptyState, IconButton, ProgressBar, StatusBadge } from '../components/ui'
import { PageHeader } from '../components/layout'

type MobileView = 'chat' | 'files' | 'outputs' | 'changes'

function FileTreeNode({ item, selectedPath, onSelect, depth = 0 }: { item: RepositoryFile; selectedPath: string; onSelect: (path: string) => void; depth?: number }) {
  const [open, setOpen] = useState(depth < 1)
  const isFolder = item.type === 'folder'
  const selected = selectedPath === item.path
  const Icon = isFolder ? (open ? FolderOpen : Folder) : item.language === 'tsx' ? FileCode2 : File
  return (
    <div className="file-tree-node">
      <button
        className={selected ? 'file-tree-row is-active' : 'file-tree-row'}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
        onClick={() => {
          if (isFolder) setOpen((value) => !value)
          else onSelect(item.path)
        }}
      >
        {isFolder ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="file-tree-spacer" />}
        <Icon size={15} />
        <span>{item.name}</span>
      </button>
      {isFolder && open ? item.children?.map((child) => <FileTreeNode key={child.path} item={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />) : null}
    </div>
  )
}

function ExplorerPane({ selectedPath, onSelect, onClose }: { selectedPath: string; onSelect: (path: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'files' | 'git'>('files')
  return (
    <aside className="workspace-explorer">
      <header className="workspace-pane-header">
        <div className="workspace-pane-tabs">
          <button className={tab === 'files' ? 'is-active' : ''} onClick={() => setTab('files')}><Files size={15} />文件</button>
          <button className={tab === 'git' ? 'is-active' : ''} onClick={() => setTab('git')}><History size={15} />Git 记录</button>
        </div>
        <IconButton label="关闭文件面板" className="workspace-pane-close" onClick={onClose}><X size={16} /></IconButton>
      </header>
      {tab === 'files' ? (
        <>
          <div className="explorer-section-title"><span>CodingCenter Web</span><MoreHorizontal size={15} /></div>
          <div className="file-tree" data-scroll-region="workspace-file-tree">{repositoryTree.map((item) => <FileTreeNode key={item.path} item={item} selectedPath={selectedPath} onSelect={onSelect} />)}</div>
          <div className="code-preview">
            <header><Code2 size={14} /><span>{selectedPath}</span><small>UTF-8</small></header>
            <pre data-scroll-region="workspace-code-preview">{codePreview.split('\n').map((line, index) => <code key={`${line}-${index}`}><b>{index + 1}</b>{line || ' '}</code>)}</pre>
          </div>
        </>
      ) : (
        <div className="commit-list" data-scroll-region="workspace-commit-list">
          {[
            ['c83b6e1', 'feat: 接入项目文件预览', 'Atlas', '8 分钟前'],
            ['b074d9a', 'fix: 保护仓库安全路径', 'Lin', '36 分钟前'],
            ['8d13aa7', 'chore: 更新任务契约', 'Ming', '2 小时前'],
            ['4e92bc0', 'feat: 新增变更审查抽屉', 'Atlas', '昨天'],
          ].map(([hash, message, author, time], index) => (
            <button key={hash} className="commit-row">
              <span className="commit-graph"><CircleDot size={14} />{index < 3 ? <i /> : null}</span>
              <span><strong>{message}</strong><small>{hash} · {author} · {time}</small></span>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}

function ConversationPane({ onOpenFiles, onOpenOutputs, onOpenChanges }: { onOpenFiles: () => void; onOpenOutputs: () => void; onOpenChanges: () => void }) {
  const {
    activeProjectId,
    selectedConversationId,
    conversations,
    completeMessage,
    deleteConversation,
    projects,
    selectConversation,
    sendMessage,
    startConversation,
  } = useApp()
  const { notify } = useToast()
  const [draft, setDraft] = useState('')
  const [respondingConversationId, setRespondingConversationId] = useState<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const feedRef = useRef<HTMLDivElement>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const conversationsForProject = conversations.filter((conversation) => conversation.projectId === activeProjectId)
  const conversation = conversationsForProject.find((item) => item.id === selectedConversationId)
  const responding = respondingConversationId !== null

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [conversation?.messages.length, respondingConversationId])

  const createConversation = () => {
    startConversation()
    notify('新会话已绑定到当前项目。', { title: '会话已创建' })
  }

  const removeConversation = (id: string, title: string) => {
    if (respondingConversationId === id && timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
      setRespondingConversationId(null)
    }
    deleteConversation(id)
    notify(`“${title}”已从工作台移除。`, { title: '会话已删除', tone: 'info' })
  }

  const sendDraft = () => {
    if (!draft.trim() || responding) return
    const message = draft.trim()
    const conversationId = selectedConversationId ?? startConversation()
    setDraft('')
    sendMessage(conversationId, message)
    setRespondingConversationId(conversationId)
    timerRef.current = window.setTimeout(() => {
      completeMessage(conversationId)
      setRespondingConversationId(null)
      timerRef.current = undefined
      notify('Agent 已完成本轮响应，会话产出已刷新。', { title: '响应完成' })
    }, 650)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    sendDraft()
  }

  const stopResponse = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = undefined
    setRespondingConversationId(null)
    notify('本轮生成已停止，已发送的消息仍保留在会话中。', { title: '已停止生成', tone: 'warning' })
  }

  return (
    <section className="conversation-pane">
      <header className="conversation-tabs">
        <div className="conversation-tab-list">
          {conversationsForProject.map((item) => (
            <div key={item.id} className={item.id === conversation?.id ? 'conversation-tab is-active' : 'conversation-tab'}>
              <button className="conversation-tab-main" onClick={() => selectConversation(item.id)} aria-pressed={item.id === conversation?.id}>
                <MessageSquareCode size={14} /><span>{item.title}</span>
              </button>
              <IconButton label={`删除会话 ${item.title}`} className="conversation-tab-close" onClick={() => removeConversation(item.id, item.title)}><X size={12} /></IconButton>
            </div>
          ))}
          <IconButton label="新建会话" onClick={createConversation}><Plus size={16} /></IconButton>
        </div>
        <div className="workspace-mobile-tools">
          <IconButton label="打开文件" onClick={onOpenFiles}><PanelLeftOpen size={17} /></IconButton>
          <IconButton label="打开产出" onClick={onOpenOutputs}><PanelRightOpen size={17} /></IconButton>
          <IconButton label="打开变更" onClick={onOpenChanges}><PanelBottomOpen size={17} /></IconButton>
        </div>
      </header>

      <div className="conversation-project-context">
        <div><span className="project-symbol"><Box size={16} /></span><span><strong>{activeProject.name}</strong><small>{activeProject.description}</small></span></div>
        <div><GitBranch size={14} /><span>{activeProject.branch}</span><i className={`repo-state repo-state-${activeProject.status}`} /></div>
      </div>

      <div className="message-feed" ref={feedRef} data-scroll-region="workspace-message-feed">
        {!conversation?.messages.length ? (
          <div className="conversation-empty">
            <span><Sparkles size={25} /></span>
            <h2>从项目上下文开始</h2>
            <p>{conversation ? '描述你想完成的工作，数字人会提炼需求并组织 Agent 小队执行。' : '先新建一个会话，再从当前项目上下文开始。'}</p>
            <div>
              {!conversation ? <button onClick={createConversation}>新建会话</button> : null}
              <button onClick={() => setDraft('检查当前分支的未完成任务并给出实施计划')}>检查未完成任务</button>
              <button onClick={() => setDraft('为这个项目补充关键路径测试')}>补充关键路径测试</button>
            </div>
          </div>
        ) : conversation.messages.map((message) => (
          <article key={message.id} className={`chat-message chat-message-${message.role}`}>
            <span className="message-avatar">{message.role === 'agent' ? <Bot size={16} /> : 'BR'}</span>
            <div>
              <header><strong>{message.role === 'agent' ? 'Nova · Digital' : '你'}</strong><time>{message.createdAt}</time></header>
              <p>{message.content}</p>
              {message.entities?.length ? (
                <div className="entity-list">
                  {message.entities.map((entity) => <button key={entity.id}><span>{entity.type === 'requirement' ? <FileCode2 size={15} /> : <Check size={15} />}</span><div><small>{entity.type === 'requirement' ? '需求' : '任务'} · {entity.id}</small><strong>{entity.title}</strong></div><ChevronRight size={15} /></button>)}
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {respondingConversationId === conversation?.id ? <article className="chat-message chat-message-agent is-typing"><span className="message-avatar"><Bot size={16} /></span><div><header><strong>Nova · Digital</strong></header><p><i /><i /><i /></p></div></article> : null}
      </div>

      <form className="chat-composer" onSubmit={submit}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendDraft() } }} placeholder="描述任务，使用 @ 选择 Agent，输入 / 调用 Skill" rows={3} />
        <footer>
          <div><IconButton label="添加附件"><Paperclip size={17} /></IconButton><button type="button"><TerminalSquare size={15} />项目上下文</button><button type="button"><ShieldCheck size={15} />自动模式</button></div>
          {responding ? (
            <Button variant="secondary" type="button" onClick={stopResponse} icon={<Square size={14} />}>停止</Button>
          ) : (
            <Button variant="primary" type="submit" disabled={!draft.trim()} icon={<Send size={15} />}>发送</Button>
          )}
        </footer>
      </form>
    </section>
  )
}

function OutputPane({ onClose, onOpenChanges }: { onClose: () => void; onOpenChanges: () => void }) {
  const navigate = useNavigate()
  const { selectedConversationId, conversations, requirements, tasks, updateTaskStatus } = useApp()
  const { notify } = useToast()
  const conversation = conversations.find((item) => item.id === selectedConversationId)
  const entityIds = new Set(conversation?.messages.flatMap((message) => message.entities?.map((entity) => entity.id) ?? []) ?? [])
  const conversationRequirements = requirements.filter((requirement) => entityIds.has(requirement.id))
  const conversationTasks = tasks.filter((task) => entityIds.has(task.id))
  const outputCount = conversationRequirements.length + conversationTasks.length

  const approveTask = (id: string) => {
    updateTaskStatus(id, 'assigned')
    notify('任务已批准并进入 Agent 分配队列。', { title: '审批已通过' })
  }

  return (
    <aside className="output-pane">
      <header className="workspace-pane-header">
        <div><Sparkles size={16} /><strong>会话产出</strong>{conversation ? <span className="pane-context-count">{outputCount}</span> : null}</div>
        <IconButton label="关闭产出面板" className="workspace-pane-close" onClick={onClose}><X size={16} /></IconButton>
      </header>
      {!conversation ? (
        <EmptyState icon={<MessageSquareCode size={22} />} title="尚未选择会话" description="选择或新建会话后，这里会显示本轮产生的需求、任务和变更。" />
      ) : outputCount === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="当前会话暂无产出" description="继续描述目标，Agent 完成需求提炼后会把关联产出放在这里。" />
      ) : <div className="output-scroll" data-scroll-region="workspace-output">
        <section className="output-section">
          <header><span>需求</span><b>{conversationRequirements.length}</b><IconButton label="查看需求" onClick={() => navigate('/requirements')}><ChevronRight size={15} /></IconButton></header>
          {conversationRequirements.map((requirement) => (
            <button key={requirement.id} className="output-card" onClick={() => navigate('/requirements')}>
              <div><span className="output-type-icon"><FileCode2 size={15} /></span><StatusBadge status={requirement.status} /></div>
              <strong>{requirement.title}</strong>
              <small>{requirement.id} · Spec v{requirement.specVersion}</small>
              <ProgressBar value={requirement.taskCount ? (requirement.doneCount / requirement.taskCount) * 100 : 0} />
              <span>{requirement.doneCount} / {requirement.taskCount} 个任务完成</span>
            </button>
          ))}
        </section>

        <section className="output-section">
          <header><span>任务</span><b>{conversationTasks.length}</b><IconButton label="查看任务" onClick={() => navigate('/tasks')}><ChevronRight size={15} /></IconButton></header>
          {conversationTasks.map((task) => (
            <article key={task.id} className="output-card output-task-card">
              <div><StatusBadge status={task.status} /><small>{task.id}</small></div>
              <strong>{task.title}</strong>
              <div className="output-agent"><span className="mini-avatar"><Bot size={12} /></span><span>{task.assignee}</span><b>{task.progress}%</b></div>
              <ProgressBar value={task.progress} warning={task.contextUsage > 80} />
              {task.status === 'awaiting_approval' ? <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => approveTask(task.id)}>批准执行</Button> : null}
              {task.status === 'succeeded' ? <Button size="sm" variant="secondary" icon={<GitPullRequestArrow size={14} />} onClick={onOpenChanges}>审查变更</Button> : null}
              {task.contextUsage > 80 ? <p className="inline-warning"><AlertTriangle size={13} />上下文 {task.contextUsage}%</p> : null}
            </article>
          ))}
        </section>
      </div>}
    </aside>
  )
}

function DiffDrawer({ open, selected, onSelect, onClose }: { open: boolean; selected: ChangeItem; onSelect: (change: ChangeItem) => void; onClose: () => void }) {
  const { changes, reviewChange } = useApp()
  const { notify } = useToast()
  const [mode, setMode] = useState<'unified' | 'split'>('unified')

  const review = (status: 'accepted' | 'rejected') => {
    reviewChange(selected.id, status)
    notify(
      status === 'accepted' ? '文件变更已接受并写入审查结果。' : '已创建回滚请求，原提交历史保持不变。',
      { title: status === 'accepted' ? '变更已接受' : '变更已拒绝', tone: status === 'accepted' ? 'success' : 'warning' },
    )
  }
  return (
    <section className={open ? 'diff-drawer is-open' : 'diff-drawer'} aria-hidden={!open}>
      <header className="diff-header">
        <div><GitPullRequestArrow size={17} /><strong>变更审查</strong><span>{changes.filter((change) => change.status === 'pending').length} 个待处理文件</span></div>
        <div>
          <div className="segmented-control"><button className={mode === 'unified' ? 'is-active' : ''} onClick={() => setMode('unified')}><Code2 size={13} />统一</button><button className={mode === 'split' ? 'is-active' : ''} onClick={() => setMode('split')}><Columns2 size={13} />并排</button></div>
          <IconButton label="关闭变更审查" onClick={onClose}><X size={17} /></IconButton>
        </div>
      </header>
      <div className="diff-layout">
        <aside className="diff-file-list">
          {changes.map((change) => (
            <button key={change.id} className={change.id === selected.id ? 'is-active' : ''} onClick={() => onSelect(change)}>
              <FileCode2 size={15} />
              <span><strong>{change.filePath.split('/').at(-1)}</strong><small>{change.filePath}</small></span>
              <b className="diff-add">+{change.additions}</b><b className="diff-del">-{change.deletions}</b>
            </button>
          ))}
        </aside>
        <div className={`diff-view diff-${mode}`}>
          <header><span>{selected.filePath}</span><small>+{selected.additions} -{selected.deletions}</small></header>
          <pre>{selected.diff.map((line, index) => {
            const type = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : line.startsWith('@@') ? 'meta' : 'context'
            return <code key={`${line}-${index}`} className={`diff-line diff-line-${type}`}><b>{index + 1}</b><span>{line}</span></code>
          })}</pre>
        </div>
        <aside className="diff-actions-panel">
          <span className={`review-status review-status-${selected.status}`}>{selected.status === 'pending' ? '等待审查' : selected.status === 'accepted' ? '已接受' : '已拒绝'}</span>
          <h3>{selected.filePath.split('/').at(-1)}</h3>
          <p>确认改动是否符合任务目标。拒绝将创建 git revert 审批，而不是重写历史。</p>
          <Button variant="primary" icon={<Check size={15} />} disabled={selected.status !== 'pending'} onClick={() => review('accepted')}>接受变更</Button>
          <Button variant="danger" icon={<RotateCcw size={15} />} disabled={selected.status !== 'pending'} onClick={() => review('rejected')}>拒绝并回滚</Button>
        </aside>
      </div>
    </section>
  )
}

export function WorkspacePage() {
  const { projects, activeProjectId, setActiveProjectId, changes } = useApp()
  const { notify } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPath, setSelectedPath] = useState('src/components/AppShell.tsx')
  const [mobileView, setMobileView] = useState<MobileView>('chat')
  const [diffOpen, setDiffOpen] = useState(false)
  const [selectedChangeId, setSelectedChangeId] = useState(changes[0].id)
  const [cloudFallback, setCloudFallback] = useState(false)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const selectedChange = changes.find((change) => change.id === selectedChangeId) ?? changes[0]
  const connectorWarning = activeProject.id === 'repo-2' && !cloudFallback
  const projectParam = searchParams.get('project')

  useEffect(() => {
    const projectExists = projects.some((project) => project.id === projectParam)
    if (projectParam && projectExists) {
      if (projectParam !== activeProjectId) setActiveProjectId(projectParam)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.set('project', activeProjectId)
    setSearchParams(next, { replace: true })
  }, [activeProjectId, projectParam, projects, searchParams, setActiveProjectId, setSearchParams])

  const changeProject = (id: string) => {
    setActiveProjectId(id)
    const next = new URLSearchParams(searchParams)
    next.set('project', id)
    setSearchParams(next)
    setCloudFallback(false)
  }

  const enableCloudFallback = () => {
    setCloudFallback(true)
    notify('后续任务将使用云端运行时，当前会话上下文保持不变。', { title: '已切换云端', tone: 'info' })
  }

  return (
    <div className="workspace-page">
      <PageHeader title="开发工作台" description="围绕项目组织会话、产出与变更审查" />
      <section className="workspace-surface">
        <div className="workspace-commandbar">
          <label className="project-picker"><Box size={16} /><select aria-label="切换工作台项目" value={activeProjectId} onChange={(event) => changeProject(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={14} /></label>
          <div className="branch-chip"><GitBranch size={14} /><span>{activeProject.branch}</span><i className={`repo-state repo-state-${activeProject.status}`} /></div>
          <div className="workspace-command-spacer" />
          <div className={connectorWarning ? 'connector-chip is-warning' : 'connector-chip'}><Circle size={10} fill="currentColor" /><span>{cloudFallback ? '云端运行时' : connectorWarning ? 'Connector stale' : 'Connector 在线'}</span></div>
          {connectorWarning ? <Button size="sm" variant="secondary" onClick={enableCloudFallback}>切换云端</Button> : null}
        </div>

        <div className={`workspace-grid mobile-view-${mobileView}`} data-layout-region="workspace" data-scroll-region="workspace">
          <ExplorerPane selectedPath={selectedPath} onSelect={setSelectedPath} onClose={() => setMobileView('chat')} />
          <ConversationPane onOpenFiles={() => setMobileView('files')} onOpenOutputs={() => setMobileView('outputs')} onOpenChanges={() => { setDiffOpen(true); setMobileView('changes') }} />
          <OutputPane onClose={() => setMobileView('chat')} onOpenChanges={() => { setDiffOpen(true); setMobileView('changes') }} />
        </div>
      </section>

      <nav className="workspace-mobile-nav" aria-label="工作台视图">
        <button className={mobileView === 'chat' ? 'is-active' : ''} onClick={() => setMobileView('chat')}><MessageSquareCode size={18} /><span>会话</span></button>
        <button className={mobileView === 'files' ? 'is-active' : ''} onClick={() => setMobileView('files')}><Files size={18} /><span>文件</span></button>
        <button className={mobileView === 'outputs' ? 'is-active' : ''} onClick={() => setMobileView('outputs')}><Sparkles size={18} /><span>产出</span></button>
        <button className={mobileView === 'changes' ? 'is-active' : ''} onClick={() => { setMobileView('changes'); setDiffOpen(true) }}><GitPullRequestArrow size={18} /><span>变更</span></button>
      </nav>

      <button className="diff-drawer-handle" onClick={() => setDiffOpen((value) => !value)}><GitCommitHorizontal size={16} /><span>{diffOpen ? '收起变更审查' : '打开变更审查'}</span><b>{changes.filter((change) => change.status === 'pending').length}</b></button>
      <DiffDrawer open={diffOpen} selected={selectedChange} onSelect={(change) => setSelectedChangeId(change.id)} onClose={() => { setDiffOpen(false); setMobileView('chat') }} />
    </div>
  )
}
