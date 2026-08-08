import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useApp } from '../state/useApp'

/**
 * 路由守卫：auth 解析中 → 加载态；未登录 → 跳 /login；已登录 → 渲染子路由。
 * 业务路由全部包在本组件内（/login 除外）。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { auth } = useApp()

  if (auth.status === 'loading') {
    return (
      <div className="route-state route-state-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        <small>正在载入登录状态…</small>
      </div>
    )
  }

  if (auth.status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
