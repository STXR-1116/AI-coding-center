import { createContext } from 'react'

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastOptions {
  title?: string
  tone?: ToastTone
  duration?: number
}

export interface ToastContextValue {
  notify: (message: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
