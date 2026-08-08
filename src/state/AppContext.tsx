import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  initialConversations,
  initialModuleSettings,
  initialRequirements,
  initialTasks,
  projects,
} from '../data/mock'
import { fetchMe, login as loginRequest, logout as logoutRequest, normalizeRole } from '../api/auth'
import type { ExecutionMode, ModuleSetting, Requirement, Task, TaskStatus, User } from '../types'
import { AppContext, type AuthState, type NewTaskInput } from './app-context'
import { canTransitionTaskStatus, createTaskEvent } from './task-transitions'

/** Placeholder shown only while auth is still resolving (status === 'loading'). */
const ANONYMOUS_USER: User = { id: '', name: '', role: 'employee', title: '' }

export function AppProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [requirements, setRequirements] = useState(initialRequirements)
  const [activeProjectId, setActiveProjectId] = useState(projects[0].id)
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversations[0]?.id ?? null)
  const [moduleSettings, setModuleSettings] = useState(initialModuleSettings)

  const [auth, setAuth] = useState<AuthState>({
    user: null,
    capabilities: [],
    visibleModules: [],
    status: 'loading',
  })

  // Resolve the existing session (if any) on mount. A 401 → fetchMe returns
  // null → status 'anonymous'; any other failure also lands as anonymous so the
  // user is sent to the login page rather than stuck on a perpetual spinner.
  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled) return
        if (!me) {
          setAuth({ user: null, capabilities: [], visibleModules: [], status: 'anonymous' })
          return
        }
        const role = normalizeRole(me.role)
        setAuth({
          user: { id: me.user.id, username: me.user.username, name: me.user.name, role, title: me.user.title ?? '' },
          capabilities: me.capabilities ?? [],
          visibleModules: me.visibleModules ?? [],
          status: 'authenticated',
        })
      })
      .catch(() => {
        if (cancelled) return
        setAuth({ user: null, capabilities: [], visibleModules: [], status: 'anonymous' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password)
    const role = normalizeRole(result.user.role)
    setAuth({
      user: { id: result.user.id, username: result.user.username, name: result.user.name, role, title: result.user.title ?? '' },
      capabilities: result.capabilities ?? [],
      visibleModules: [],
      status: 'authenticated',
    })
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // Even if the server call fails, clear local auth so the UI returns to login.
    }
    setAuth({ user: null, capabilities: [], visibleModules: [], status: 'anonymous' })
  }, [])

  // Non-null `user` accessor for components rendered behind RequireAuth.
  const user: User = auth.user ?? ANONYMOUS_USER

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
        result: '',
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

  // M1（审查修复）：支持传 null 表达"无选中"——删除当前会话后清空，避免用空串 '' 污染语义。
  const selectConversation = useCallback((id: string | null) => {
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

  // M3（审查清理）：reviewChange 已随 P1-4c 迁移移除（变更审查走真实 revert）——原实现：
  // setChanges((current) => current.map((change) => (change.id === id ? { ...change, status } : change)))

  const toggleModule = useCallback((id: string) => {
    setModuleSettings((current) =>
      current.map((setting) => (setting.id === id ? { ...setting, enabled: !setting.enabled } : setting)),
    )
  }, [])

  /**
   * Replace the whole module-settings list. Called by `useSetModuleToggle`
   * (queries/modules) after a successful REST toggle to mirror the server-
   * authoritative list into AppContext — keeps AppShell nav + ModuleGate live.
   * Stable identity (empty deps) so the query hook's `useApp()` value doesn't
   * churn on every moduleSettings change.
   */
  const replaceModuleSettings = useCallback((next: ModuleSetting[]) => {
    setModuleSettings(next)
  }, [])

  const value = useMemo(
    () => ({
      auth,
      user,
      tasks,
      requirements,
      projects,
      activeProjectId,
      selectedConversationId,
      conversations,
      moduleSettings,
      login,
      logout,
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
      toggleModule,
      replaceModuleSettings,
    }),
    [
      auth,
      user,
      tasks,
      requirements,
      activeProjectId,
      selectedConversationId,
      conversations,
      moduleSettings,
      login,
      logout,
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
      toggleModule,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
