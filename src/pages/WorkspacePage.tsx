import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { useCapability } from '../state/useCapability'
import { useToast } from '../state/useToast'
import type { MessageDto, RepositoryFile, WorktreeChangeDto } from '../types'
import { Button, EmptyState, IconButton, ProgressBar, StatusBadge } from '../components/ui'
import { PageHeader } from '../components/layout'
import { useStreamChat } from '../hooks/useStreamChat'
import {
  conversationKeys,
  useConversation,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
} from '../queries/conversations'
import {
  useChanges,
  useCommits,
  useRepositories,
  useRevertChange,
} from '../queries/repositories'
import type { CommitDto } from '../types'

type MobileView = 'chat' | 'files' | 'outputs' | 'changes'

/**
 * ISO git %ai → 简短本地时间（提交记录列表用）。与 RepositoriesPage 同一格式，
 * 避免两处提交时间展示不一致。
 */
function formatCommitTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** WorktreeChangeDto.changeType（added|modified|deleted）→ UI 标签。 */
function changeTypeLabel(changeType: string): string {
  if (changeType === 'added') return '新增'
  if (changeType === 'deleted') return '删除'
  return '修改'
}

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

function ExplorerPane({ selectedPath, onSelect, onClose, restRepoId, detailEnabled }: { selectedPath: string; onSelect: (path: string) => void; onClose: () => void; restRepoId: string | undefined; detailEnabled: boolean }) {
  const [tab, setTab] = useState<'files' | 'git'>('files')
  // P1-4c：Git 记录 tab 走 REST（useCommits）。文件树 tab 仍用 repositoryTree mock
  // ——主工程暂无文件树端点，REST 化放 P2（标注于此）。
  const commitsQuery = useCommits(restRepoId, detailEnabled)
  const commits: CommitDto[] = commitsQuery.data ?? []
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
          {/* detailEnabled=false：仓库无本地路径，后端会 400——直接提示，不发请求。 */}
          {!detailEnabled ? <div className="commit-empty">该仓库未配置本地路径，暂无提交记录。</div>
            : commitsQuery.isLoading ? <div className="commit-empty">正在加载提交记录…</div>
            : commitsQuery.error ? <div className="commit-empty">提交记录加载失败，请稍后重试。</div>
            : commits.length ? commits.map((commit, index) => (
            <button key={commit.hash} className="commit-row" title={commit.message}>
              <span className="commit-graph"><CircleDot size={14} />{index < commits.length - 1 ? <i /> : null}</span>
              <span><strong>{commit.message}</strong><small>{commit.shortHash || commit.hash.slice(0, 7)} · {commit.author} · {formatCommitTime(commit.date)}</small></span>
            </button>
          )) : <div className="commit-empty">暂无提交记录</div>}
        </div>
      )}
    </aside>
  )
}

function ConversationPane({ onOpenFiles, onOpenOutputs, onOpenChanges }: { onOpenFiles: () => void; onOpenOutputs: () => void; onOpenChanges: () => void }) {
  const {
    activeProjectId,
    selectedConversationId,
    projects,
    selectConversation,
  } = useApp()
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const { data: conversations = [] } = useConversations()
  const createConversationMutation = useCreateConversation()
  const deleteConversationMutation = useDeleteConversation()
  // REST 会话无 projectId（repositoryId 绑定留待后续 P 阶段）——MVP 显示全部会话。
  const conversationsForProject = conversations
  const conversation = conversationsForProject.find((item) => item.id === selectedConversationId)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  // 待发送内容：跨"先建会话再流式"两步传递——新建后子组件 key 重挂，挂载即自动发送。
  const [pendingSend, setPendingSend] = useState<string | null>(null)

  const createConversation = async () => {
    try {
      const created = await createConversationMutation.mutateAsync({ title: '新会话', repositoryId: null })
      selectConversation(created.id)
      notify('新会话已创建。', { title: '会话已创建' })
      return created.id
    } catch {
      notify('创建会话失败，请稍后重试。', { title: '创建失败', tone: 'warning' })
      return null
    }
  }

  const removeConversation = (id: string, title: string) => {
    deleteConversationMutation.mutate(id, {
      onSuccess: () => {
        // 删除的是当前选中会话 → 切到剩余最后一个（或清空）。M1：清空用 null 而非空串 ''
        if (id === selectedConversationId) {
          const remaining = conversationsForProject.filter((item) => item.id !== id)
          selectConversation(remaining.at(-1)?.id ?? null)
        }
        notify(`“${title}”已从工作台移除。`, { title: '会话已删除', tone: 'info' })
      },
      onError: () => notify('删除会话失败，请稍后重试。', { title: '删除失败', tone: 'warning' }),
    })
  }

  // 发送入口（无会话时由 StreamingChat 回调）：先投递待发送内容，再创建会话选中；
  // StreamingChat 挂载（key 变化）后消费 pendingSend 触发流式。
  // M3（审查修复）：创建中守卫——连点发送不覆盖 pendingSend、不重复创建。
  const creatingRef = useRef(false)
  const handleNeedConversation = async (content: string) => {
    if (creatingRef.current) return
    creatingRef.current = true
    try {
      setPendingSend(content)
      const id = await createConversation()
      if (!id) setPendingSend(null)
    } finally {
      creatingRef.current = false
    }
  }

  // 流式完成后：拉取持久消息（详情失效）+ 列表失效（updatedAt 变化）。
  const handleStreamDone = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) })
    void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
  }

  const handleStreamError = () => {
    notify('聊天出错，请重试。', { title: '流式失败', tone: 'warning' })
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
          <IconButton label="新建会话" onClick={() => void createConversation()}><Plus size={16} /></IconButton>
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

      <StreamingChat
        key={conversation?.id ?? 'none'}
        conversationId={conversation?.id ?? ''}
        pendingSend={pendingSend}
        onConsumePending={() => setPendingSend(null)}
        onNeedConversation={handleNeedConversation}
        onStreamDone={handleStreamDone}
        onStreamError={handleStreamError}
      />
    </section>
  )
}

interface StreamingChatProps {
  conversationId: string
  /** 父组件投递的待发送内容；子组件消费后清空。 */
  pendingSend: string | null
  onConsumePending: () => void
  /** 无选中会话时用户发送 → 父组件创建会话并投递（P1-3c 接线）。 */
  onNeedConversation: (content: string) => void
  onStreamDone: (id: string) => void
  onStreamError: () => void
}

/**
 * StreamingChat — 单个会话的流式打字机视图（P1-3c）。
 *
 * 内部持有 useStreamChat(conversationId) 与输入草稿。切换会话时父组件用
 * key={conversationId} 强制重挂，使 assistantText/状态随会话重置——比在
 * hook 内部处理 conversationId 变更更稳。持久消息来自 useConversation(id)，
 * 流式增量附加在最后；done 后由父组件失效详情缓存拉取最终消息。
 */
function StreamingChat({ conversationId, pendingSend, onConsumePending, onNeedConversation, onStreamDone, onStreamError }: StreamingChatProps) {
  const { data: detail } = useConversation(conversationId || null)
  const chat = useStreamChat(conversationId)
  const [draft, setDraft] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)
  const messages: MessageDto[] = detail?.messages ?? []
  const streaming = chat.status === 'streaming'
  const hasConversation = !!conversationId

  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [messages.length, chat.assistantText, chat.status])

  // 消费父组件投递的待发送内容（首次发送或"无会话→自动创建后发送"）。
  useEffect(() => {
    if (!pendingSend || !hasConversation) return
    const content = pendingSend
    onConsumePending()
    void chat.start(content)
    // 仅在 pendingSend 变化时消费；chat.start 故意不进依赖（取最新闭包）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSend, hasConversation])

  // 流式终态通知父组件（P1-3c 接线）：done → 失效详情拉取持久消息；error → 错误提示。
  // 用 useEffect 监听 status（不依赖 await 时序）。
  const prevStatusRef = useRef(chat.status)
  useEffect(() => {
    if (prevStatusRef.current === chat.status) return
    prevStatusRef.current = chat.status
    if (chat.status === 'done' && conversationId) onStreamDone(conversationId)
    else if (chat.status === 'error') onStreamError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status])

  // M4（审查修复）：done 后清流式态（持久消息由 refetch 提供，避免短暂重复渲染）。
  // abort 场景（用户手动停）保留文本不重置。
  useEffect(() => {
    if (chat.status === 'done') chat.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void sendDraft()
  }

  // M2（审查修复）：保存最后发送内容——错误后重试不再依赖已清空的 draft
  const lastSentRef = useRef('')

  const sendDraft = async () => {
    const content = draft.trim()
    if (!content || streaming) return
    setDraft('')
    lastSentRef.current = content
    // 无会话：交给父组件创建并投递（pendingSend 机制）
    if (!hasConversation) {
      onNeedConversation(content)
      return
    }
    await chat.start(content)
  }

  const stopResponse = () => {
    chat.abort()
  }

  const retry = () => {
    const content = lastSentRef.current
    if (!content || streaming) return
    void chat.start(content)
  }

  return (
    <>
      <div className="message-feed" ref={feedRef} data-scroll-region="workspace-message-feed">
        {!hasConversation ? (
          <div className="conversation-empty">
            <span><Sparkles size={25} /></span>
            <h2>从项目上下文开始</h2>
            <p>先新建一个会话，或直接在下方输入——系统会自动创建会话并从当前项目上下文开始。</p>
            <div>
              <button onClick={() => setDraft('检查当前分支的未完成任务并给出实施计划')}>检查未完成任务</button>
              <button onClick={() => setDraft('为这个项目补充关键路径测试')}>补充关键路径测试</button>
            </div>
          </div>
        ) : !messages.length && !chat.assistantText && chat.status !== 'streaming' ? (
          <div className="conversation-empty">
            <span><Sparkles size={25} /></span>
            <h2>从项目上下文开始</h2>
            <p>描述你想完成的工作，数字人会提炼需求并组织 Agent 小队执行。</p>
            <div>
              <button onClick={() => setDraft('检查当前分支的未完成任务并给出实施计划')}>检查未完成任务</button>
              <button onClick={() => setDraft('为这个项目补充关键路径测试')}>补充关键路径测试</button>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <article key={message.id} className={`chat-message chat-message-${message.role === 'assistant' ? 'agent' : 'user'}`}>
                <span className="message-avatar">{message.role === 'assistant' ? <Bot size={16} /> : 'BR'}</span>
                <div>
                  <header><strong>{message.role === 'assistant' ? 'Nova · Digital' : '你'}</strong><time>{formatTime(message.createdAt)}</time></header>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
            {/* 流式增量：附在持久消息之后，逐字呈现 */}
            {chat.assistantText ? (
              <article className="chat-message chat-message-agent">
                <span className="message-avatar"><Bot size={16} /></span>
                <div>
                  <header><strong>Nova · Digital</strong></header>
                  <p>{chat.assistantText}</p>
                </div>
              </article>
            ) : null}
            {streaming ? <article className="chat-message chat-message-agent is-typing"><span className="message-avatar"><Bot size={16} /></span><div><header><strong>Nova · Digital</strong></header><p><i /><i /><i /></p></div></article> : null}
          </>
        )}
      </div>

      {chat.status === 'error' ? (
        <div className="chat-error-bar" role="alert">
          <AlertTriangle size={15} />
          <span>{chat.error ?? '聊天出错，请重试。'}</span>
          <Button size="sm" variant="secondary" onClick={retry} disabled={streaming}>重试</Button>
        </div>
      ) : null}

      <form className="chat-composer" onSubmit={submit}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendDraft() } }} placeholder={hasConversation ? '描述任务，使用 @ 选择 Agent，输入 / 调用 Skill' : '输入消息将自动创建会话并发送'} rows={3} />
        <footer>
          <div><IconButton label="添加附件"><Paperclip size={17} /></IconButton><button type="button"><TerminalSquare size={15} />项目上下文</button><button type="button"><ShieldCheck size={15} />自动模式</button></div>
          {streaming ? (
            <Button variant="secondary" type="button" onClick={stopResponse} icon={<Square size={14} />}>停止</Button>
          ) : (
            <Button variant="primary" type="submit" disabled={!draft.trim() || !hasConversation} icon={<Send size={15} />}>发送</Button>
          )}
        </footer>
      </form>
    </>
  )
}

/** ISO 时间串 → HH:mm 显示；后端返回 ISO，mock/旧数据可能是已格式化串，原样返回。 */
function formatTime(createdAt: string): string {
  // 已是 HH:mm 等非 ISO 形态时直接返回（容错旧数据）
  if (/^\d{1,2}:\d{2}$/.test(createdAt)) return createdAt
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return createdAt
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function OutputPane({ onClose, onOpenChanges }: { onClose: () => void; onOpenChanges: () => void }) {
  const navigate = useNavigate()
  const { selectedConversationId, requirements, tasks, updateTaskStatus } = useApp()
  const canExecute = useCapability('task:execute')
  const canReview = useCapability('vcs:revert')
  const { notify } = useToast()
  // H1（审查修复）：会话从 REST 列表查找（与 ConversationPane 同一数据源）——避免 mock id 割裂
  const { data: restConversations } = useConversations()
  const conversation = restConversations?.find((item) => item.id === selectedConversationId)
  // REST 消息无 entities 字段（MVP）——聚合兜底空数组；产出 REST 化在后续 P 阶段
  const entityIds = new Set<string>(conversation?.id ? [] : [])
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
              {task.status === 'awaiting_approval' && canExecute ? <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => approveTask(task.id)}>批准执行</Button> : null}
              {task.status === 'succeeded' && canReview ? <Button size="sm" variant="secondary" icon={<GitPullRequestArrow size={14} />} onClick={onOpenChanges}>审查变更</Button> : null}
              {task.contextUsage > 80 ? <p className="inline-warning"><AlertTriangle size={13} />上下文 {task.contextUsage}%</p> : null}
            </article>
          ))}
        </section>
      </div>}
    </aside>
  )
}

function DiffDrawer({ open, selected, changes, repoId, canRevert, onRevert, onSelect, onClose }: { open: boolean; selected: WorktreeChangeDto | undefined; changes: WorktreeChangeDto[]; repoId: string | undefined; canRevert: boolean; onRevert: (path: string) => void; onSelect: (change: WorktreeChangeDto) => void; onClose: () => void }) {
  const { notify } = useToast()
  const [mode, setMode] = useState<'unified' | 'split'>('unified')

  const review = (status: 'accepted' | 'rejected') => {
    // P1-4c：审查反馈持久化 P2——"拒绝并回滚"走真实 revert（还原变更）；接受仅提示（保留工作区）
    if (status === 'rejected' && selected) {
      onRevert(selected.path)
      return
    }
    notify(
      status === 'accepted' ? '已确认该文件变更，保留在工作区（审查记录持久化 P2）。' : '已创建回滚请求。',
      { title: status === 'accepted' ? '变更已确认' : '变更已拒绝', tone: status === 'accepted' ? 'success' : 'warning' },
    )
  }
  return (
    <section className={open ? 'diff-drawer is-open' : 'diff-drawer'} aria-hidden={!open}>
      <header className="diff-header">
        <div><GitPullRequestArrow size={17} /><strong>变更审查</strong><span>{changes.length} 个工作区变更</span></div>
        <div>
          <div className="segmented-control"><button className={mode === 'unified' ? 'is-active' : ''} onClick={() => setMode('unified')}><Code2 size={13} />统一</button><button className={mode === 'split' ? 'is-active' : ''} onClick={() => setMode('split')}><Columns2 size={13} />并排</button></div>
          <IconButton label="关闭变更审查" onClick={onClose}><X size={17} /></IconButton>
        </div>
      </header>
      <div className="diff-layout">
        <aside className="diff-file-list">
          {changes.length === 0 ? <div className="commit-empty">工作区无未提交变更。</div>
            : changes.map((change) => (
            <button key={change.path} className={change.path === selected?.path ? 'is-active' : ''} onClick={() => onSelect(change)}>
              <FileCode2 size={15} />
              <span><strong>{change.path.split('/').at(-1)}</strong><small>{change.path}</small></span>
              <b className="diff-add">+{change.addedLines}</b><b className="diff-del">-{change.deletedLines}</b>
            </button>
          ))}
        </aside>
        <div className={`diff-view diff-${mode}`}>
          {!selected ? <div className="commit-empty">选择一个变更文件查看详情。</div>
            : <><header><span>{selected.path}</span><small>{changeTypeLabel(selected.changeType)} · +{selected.addedLines} -{selected.deletedLines}</small></header>
            <div className="diff-stats">
              <p>变更类型：<strong>{changeTypeLabel(selected.changeType)}</strong></p>
              <p>新增 {selected.addedLines} 行 · 删除 {selected.deletedLines} 行</p>
              <p className="diff-note">diff 内容预览在 P2（当前端点返回统计级数据）。</p>
            </div></>}
        </div>
        <aside className="diff-actions-panel">
          {selected ? <>
          <h3>{selected.path.split('/').at(-1)}</h3>
          <p>确认改动是否符合任务目标。拒绝将真实还原该文件工作区变更（git checkout），而不是重写历史。</p>
          {/* M1（审查修复）：确认保留是只读操作——仅需 repoId；拒绝并还原才需 vcs:revert */}
          {repoId ? <Button variant="primary" icon={<Check size={15} />} onClick={() => review('accepted')}>确认保留</Button> : null}
          {canRevert && repoId ? <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => review('rejected')}>拒绝并还原</Button> : <p className="diff-note">还原需要 vcs:revert 权限（LEADER/ADMIN）。</p>}
          </> : null}
        </aside>
      </div>
    </section>
  )
}

export function WorkspacePage() {
  const { projects, activeProjectId, setActiveProjectId } = useApp()
  const canManageAgents = useCapability('agent:manage')
  const canRevertChanges = useCapability('vcs:revert')
  const { notify } = useToast()
  // P1-4c：REST 仓库数据源——MVP 用第一个仓库（repo-cc-main）；项目切换器 ↔ REST 仓库映射放 P2
  const { data: restRepos } = useRepositories()
  const restRepoId = restRepos?.[0]?.id
  const restRepoHasLocalPath = !!restRepos?.[0]?.hasLocalPath
  const { data: restChanges } = useChanges(restRepoId, restRepoHasLocalPath)
  const revertChange = useRevertChange()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPath, setSelectedPath] = useState('src/components/AppShell.tsx')
  const [mobileView, setMobileView] = useState<MobileView>('chat')
  const [diffOpen, setDiffOpen] = useState(false)
  const [selectedChangeId, setSelectedChangeId] = useState('')
  const [cloudFallback, setCloudFallback] = useState(false)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const selectedChange = restChanges?.find((change) => change.path === selectedChangeId) ?? restChanges?.[0]
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
          {connectorWarning && canManageAgents ? <Button size="sm" variant="secondary" onClick={enableCloudFallback}>切换云端</Button> : null}
        </div>

        <div className={`workspace-grid mobile-view-${mobileView}`} data-layout-region="workspace" data-scroll-region="workspace">
          <ExplorerPane selectedPath={selectedPath} onSelect={setSelectedPath} onClose={() => setMobileView('chat')} restRepoId={restRepoId} detailEnabled={restRepoHasLocalPath} />
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

      <button className="diff-drawer-handle" onClick={() => setDiffOpen((value) => !value)}><GitCommitHorizontal size={16} /><span>{diffOpen ? '收起变更审查' : '打开变更审查'}</span><b>{restChanges?.length ?? 0}</b></button>
      <DiffDrawer open={diffOpen} selected={selectedChange} changes={restChanges ?? []} repoId={restRepoId} canRevert={canRevertChanges} onRevert={(path) => {
        // L1（审查修复）：显式守卫替代 as string 断言
        if (!restRepoId) return
        revertChange.mutate({ id: restRepoId, path }, {
          onSuccess: () => {
            // M2（审查修复）：还原成功后重置选中态（path 已消失）
            setSelectedChangeId('')
            notify('已还原该文件变更。', { title: '还原成功' })
          },
          onError: () => notify('还原失败，请稍后重试。', { title: '还原失败', tone: 'warning' }),
        })
      }} onSelect={(change) => setSelectedChangeId(change.path)} onClose={() => { setDiffOpen(false); setMobileView('chat') }} />
    </div>
  )
}
