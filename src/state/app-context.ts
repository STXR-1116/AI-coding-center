import { createContext } from 'react'
import type {
  ChangeItem,
  Conversation,
  ExecutionMode,
  ModuleSetting,
  Project,
  Requirement,
  Task,
  TaskStatus,
  User,
} from '../types'

export interface NewTaskInput {
  title: string
  summary: string
  projectId: string
  priority: Task['priority']
  executionMode: ExecutionMode
}

export interface AppContextValue {
  user: User
  tasks: Task[]
  requirements: Requirement[]
  projects: Project[]
  activeProjectId: string
  selectedConversationId: string | null
  conversations: Conversation[]
  changes: ChangeItem[]
  moduleSettings: ModuleSetting[]
  setActiveProjectId: (id: string) => void
  selectConversation: (id: string) => void
  addTask: (input: NewTaskInput) => Task
  updateTaskStatus: (id: string, status: TaskStatus) => void
  updateTaskMode: (id: string, mode: ExecutionMode) => void
  addRequirement: (requirement: Requirement) => void
  startConversation: () => string
  deleteConversation: (id: string) => void
  sendMessage: (conversationId: string, content: string) => void
  completeMessage: (conversationId: string) => void
  reviewChange: (id: string, status: 'accepted' | 'rejected') => void
  toggleModule: (id: string) => void
}

export const AppContext = createContext<AppContextValue | null>(null)
