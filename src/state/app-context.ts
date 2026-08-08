import { createContext } from 'react'
import type {
  Conversation,
  ExecutionMode,
  ModuleSetting,
  Project,
  Requirement,
  Task,
  TaskStatus,
  User,
} from '../types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthState {
  user: User | null
  capabilities: string[]
  visibleModules: string[]
  status: AuthStatus
}

export interface NewTaskInput {
  title: string
  summary: string
  projectId: string
  priority: Task['priority']
  executionMode: ExecutionMode
}

export interface AppContextValue {
  auth: AuthState
  /** Convenience accessor; non-null whenever auth.status === 'authenticated'. */
  user: User
  tasks: Task[]
  requirements: Requirement[]
  projects: Project[]
  activeProjectId: string
  selectedConversationId: string | null
  conversations: Conversation[]
  moduleSettings: ModuleSetting[]
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setActiveProjectId: (id: string) => void
  selectConversation: (id: string | null) => void
  addTask: (input: NewTaskInput) => Task
  updateTaskStatus: (id: string, status: TaskStatus) => void
  updateTaskMode: (id: string, mode: ExecutionMode) => void
  addRequirement: (requirement: Requirement) => void
  startConversation: () => string
  deleteConversation: (id: string) => void
  sendMessage: (conversationId: string, content: string) => void
  completeMessage: (conversationId: string) => void
  toggleModule: (id: string) => void
  /**
   * Replace the whole module-settings list with a server-authoritative one.
   * Used by `useSetModuleToggle` (queries/modules) to mirror the REST list into
   * AppContext so AppShell nav + ModuleGate update live after a toggle, without
   * rewriting those consumers to read React Query directly. SettingsPage itself
   * now reads REST via `useModules`; AppContext remains the nav/guard source.
   */
  replaceModuleSettings: (next: ModuleSetting[]) => void
}

export const AppContext = createContext<AppContextValue | null>(null)
