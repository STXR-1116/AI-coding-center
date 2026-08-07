export type Role = 'employee' | 'leader' | 'pm'
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'awaiting_approval'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
export type RequirementStatus = 'draft' | 'analyzing' | 'in_progress' | 'done' | 'cancelled'
export type AgentStatus = 'idle' | 'busy' | 'offline' | 'stale'
export type ExecutionMode = 'manual' | 'auto' | 'full'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type TaskEventType =
  | 'created'
  | 'assigned'
  | 'approval'
  | 'started'
  | 'checkpoint'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface TaskEvent {
  id: string
  type: TaskEventType
  title: string
  description: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  role: Role
  title: string
}

export interface Task {
  id: string
  title: string
  summary: string
  status: TaskStatus
  priority: Priority
  requirementId: string
  projectId: string
  projectName: string
  assignee: string
  assigneeKind: 'digital' | 'coder' | 'qa'
  dueAt: string
  progress: number
  tokenBudget: number
  tokenUsed: number
  contextUsage: number
  executionMode: ExecutionMode
  tags: string[]
  updatedAt: string
  events: TaskEvent[]
}

export interface Requirement {
  id: string
  title: string
  description: string
  status: RequirementStatus
  priority: Priority
  owner: string
  projectId: string
  projectName: string
  taskCount: number
  doneCount: number
  specVersion: number
  createdAt: string
}

export interface Agent {
  id: string
  name: string
  kind: 'digital' | 'coder' | 'qa' | 'assistant'
  status: AgentStatus
  runtime: 'local' | 'cloud'
  model: string
  currentTask?: string
  successRate: number
  tokenUsed: number
  tokenBudget: number
  lastHeartbeat: string
  skills: string[]
}

export interface Project {
  id: string
  name: string
  description: string
  vcs: 'git' | 'svn'
  branch: string
  status: 'clean' | 'modified' | 'syncing'
  language: string
  updatedAt: string
}

export interface MessageEntity {
  type: 'requirement' | 'task'
  id: string
  title: string
  status: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  createdAt: string
  entities?: MessageEntity[]
}

export interface Conversation {
  id: string
  title: string
  projectId: string
  messages: ChatMessage[]
}

export interface RepositoryFile {
  name: string
  path: string
  type: 'file' | 'folder'
  language?: string
  children?: RepositoryFile[]
}

export interface ChangeItem {
  id: string
  taskId: string
  filePath: string
  additions: number
  deletions: number
  status: 'pending' | 'accepted' | 'rejected'
  diff: string[]
}

export interface ModuleSetting {
  id: string
  label: string
  description: string
  enabled: boolean
  risk: 'normal' | 'core'
}
