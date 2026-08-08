import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastContext, type ToastOptions, type ToastTone } from '../state/toast-context'
import { IconButton } from './ui'

interface ToastItem {
  id: string
  title: string
  message: string
  tone: ToastTone
  duration: number
}

const defaultTitles: Record<ToastTone, string> = {
  success: '操作已完成',
  info: '状态已更新',
  warning: '需要注意',
  error: '操作失败',
}

const toastIcons = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((message: string, options: ToastOptions = {}) => {
    const id = crypto.randomUUID()
    const tone = options.tone ?? 'success'
    const duration = options.duration ?? 3600
    const toast: ToastItem = {
      id,
      title: options.title ?? defaultTitles[tone],
      message,
      tone,
      duration,
    }
    setToasts((current) => [...current.slice(-3), toast])
    timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
    return id
  }, [dismiss])

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current.clear()
  }, [])

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => {
          const Icon = toastIcons[toast.tone]
          return (
            <article key={toast.id} className={`toast toast-${toast.tone}`} role="status">
              <span className="toast-icon"><Icon size={17} /></span>
              <div><strong>{toast.title}</strong><p>{toast.message}</p></div>
              <IconButton label="关闭通知" onClick={() => dismiss(toast.id)}><X size={15} /></IconButton>
              <span className="toast-progress" style={{ animationDuration: `${toast.duration}ms` }} />
            </article>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
