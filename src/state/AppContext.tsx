import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  initialChanges,
  initialConversations,
  initialModuleSettings,
  initialRequirements,
  initialTasks,
  projects,
} from '../data/mock'
import type { ExecutionMode, Requirement, Task, TaskStatus, User } from '../types'
import { AppContext, type NewTaskInput } from './app-context'
import { canTransitionTaskStatus, createTaskEvent } from './task-transitions'

export function AppProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [requirements, setRequirements] = useState(initialRequirements)
  const [activeProjectId, setActiveProjectId] = useState(projects[0].id)
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversations[0]?.id ?? null)
  const [changes, setChanges] = useState(initialChanges)
  const [moduleSettings, setModuleSettings] = useState(initialModuleSettings)

  const user: User = useMemo(
    () => ({ id: 'user-1', name: 'Brandon', role: 'leader', title: '产品经理' }),
    [],
  )

  const addTask = useCallback(
    (input: NewTaskInput) => {
      const project = projects.find((item) => item.id === input.projectId) ?? projects[0]
      const task: Task = {
        id: `CC-2026-${String(tasks.length + 32).padStart(3, '0')}`,
        title: input.title,
        summary: input.summary,
        status: input.executionMode === 'manual' ? 'pending' : 'assigned',
        priority: input.priority,
        requirementId: 'REQ-DRAFT',
        projectId: project.id,
        projectName: project.name,
        assignee: '待分配',
        assigneeKind: 'coder',
        dueAt: '未设置',
        progress: 0,
        tokenBudget: 24000,
        tokenUsed: 0,
        contextUsage: 8,
        executionMode: input.executionMode,
        tags: ['新任务'],
        updatedAt: '刚刚',
        events: [createTaskEvent(input.executionMode === 'manual' ? 'pending' : 'assigned')],
      }
      setTasks((current) => [task, ...current])
      return task
    },
    [tasks.length],
  )

  const updateTaskStatus = useCallback((id: string, status: TaskStatus) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id && canTransitionTaskStatus(task.status, status)
          ? {
              ...task,
              status,
              progress: status === 'succeeded' ? 100 : task.progress,
              updatedAt: '刚刚',
              events: [...task.events, createTaskEvent(status)],
            }
          : task,
      ),
    )
  }, [])

  const updateTaskMode = useCallback((id: string, mode: ExecutionMode) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, executionMode: mode } : task)))
  }, [])

  const addRequirement = useCallback((requirement: Requirement) => {
    setRequirements((current) => [requirement, ...current])
  }, [])

  const selectConversation = useCallback((id: string) => {
    setSelectedConversationId(id)
  }, [])

  const selectProject = useCallback((id: string) => {
    if (!projects.some((project) => project.id === id)) return
    setActiveProjectId(id)
    const projectConversations = conversations.filter((conversation) => conversation.projectId === id)
    setSelectedConversationId(projectConversations.at(-1)?.id ?? null)
  }, [conversations])

  const startConversation = useCallback(() => {
    const id = crypto.randomUUID()
    setConversations((current) => [
      ...current,
      {
        id,
        title: '新会话',
        projectId: activeProjectId,
        messages: [],
      },
    ])
    setSelectedConversationId(id)
    return id
  }, [activeProjectId])

  const deleteConversation = useCallback((id: string) => {
    const target = conversations.find((conversation) => conversation.id === id)
    if (!target) return
    const next = conversations.filter((conversation) => conversation.id !== id)
    setConversations(next)
    setSelectedConversationId((current) => {
      if (current !== id) return current
      return next.filter((conversation) => conversation.projectId === target.projectId).at(-1)?.id ?? null
    })
  }, [conversations])

  const sendMessage = useCallback(
    (conversationId: string, content: string) => {
      if (!content.trim()) return
      const timestamp = new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date())
      setConversations((current) => {
        const userMessage = {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content: content.trim(),
          createdAt: timestamp,
        }
        return current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: conversation.title === '新会话' ? content.trim().slice(0, 18) : conversation.title,
                messages: [...conversation.messages, userMessage],
              }
            : conversation,
        )
      })
    },
    [],
  )

  const completeMessage = useCallback((conversationId: string) => {
    const timestamp = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date())
    setConversations((current) => current.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: [
              ...conversation.messages,
              {
                id: crypto.randomUUID(),
                role: 'agent' as const,
                content: '已收到。我会结合当前项目上下文提炼需求，检查相关文件并准备可执行任务。',
                createdAt: timestamp,
              },
            ],
          }
        : conversation,
    ))
  }, [])

  const reviewChange = useCallback((id: string, status: 'accepted' | 'rejected') => {
    setChanges((current) => current.map((change) => (change.id === id ? { ...change, status } : change)))
  }, [])

  const toggleModule = useCallback((id: string) => {
    setModuleSettings((current) =>
      current.map((setting) => (setting.id === id ? { ...setting, enabled: !setting.enabled } : setting)),
    )
  }, [])

  const value = useMemo(
    () => ({
      user,
      tasks,
      requirements,
      projects,
      activeProjectId,
      selectedConversationId,
      conversations,
      changes,
      moduleSettings,
      setActiveProjectId: selectProject,
      selectConversation,
      addTask,
      updateTaskStatus,
      updateTaskMode,
      addRequirement,
      startConversation,
      deleteConversation,
      sendMessage,
      completeMessage,
      reviewChange,
      toggleModule,
    }),
    [
      user,
      tasks,
      requirements,
      activeProjectId,
      selectedConversationId,
      conversations,
      changes,
      moduleSettings,
      addTask,
      updateTaskStatus,
      updateTaskMode,
      addRequirement,
      selectProject,
      selectConversation,
      startConversation,
      deleteConversation,
      sendMessage,
      completeMessage,
      reviewChange,
      toggleModule,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
