import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { AgentStatus, Priority, RequirementStatus, TaskStatus } from '../types'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant} button-${size} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

const statusLabels: Record<TaskStatus | RequirementStatus | AgentStatus, string> = {
  pending: '待处理',
  assigned: '已分配',
  awaiting_approval: '待审批',
  running: '进行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  draft: '草稿',
  analyzing: '解析中',
  in_progress: '进行中',
  done: '已完成',
  idle: '空闲',
  busy: '忙碌',
  offline: '离线',
  stale: '失联',
}

export function StatusBadge({ status }: { status: TaskStatus | RequirementStatus | AgentStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>
}

const priorityLabels: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority-badge priority-${priority}`}>{priorityLabels[priority]}</span>
}

export function ProgressBar({ value, warning = false }: { value: number; warning?: boolean }) {
  return (
    <div className="progress-track" aria-label={`进度 ${value}%`}>
      <span className={warning ? 'progress-fill progress-warning' : 'progress-fill'} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  )
}

interface DialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Dialog({ open, title, description, onClose, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-surface">
        <header className="dialog-header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="dialog-body">{children}</div>
        {footer ? <footer className="dialog-footer">{footer}</footer> : null}
      </div>
    </dialog>
  )
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function PageIntro({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="page-intro">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}
