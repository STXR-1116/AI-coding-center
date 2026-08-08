/**
 * useRealtimeEvents — SSE 实时事件客户端（P1-7b）。
 *
 * 订阅后端 `GET /api/v1/events`（P1-7a 实现的 SSE 通道，EventSource 兼容、
 * cookie 鉴权），把服务端推送的任务状态/进度事件映射为 React Query 缓存失效，
 * 从而让任务列表/详情在状态变更后自动刷新——不再依赖手动刷新。
 *
 * 设计要点：
 * - 同源 EventSource 自动携带 session cookie，无需手动加鉴权头。
 * - 实例由 useRef 持有单例：enabled 在 true 期间只创建一次，避免重复连接。
 * - onerror 不手动 close——浏览器 EventSource 原生重连（带 backoff）负责恢复；
 *   我们只把 connected 置 false 反映断线，重连成功后 onopen 会重新置 true。
 * - enabled 变 false（登出/未登录）或组件卸载时显式 close，断开 SSE 连接。
 * - approval/agent.health 等事件目前无对应 UI，仅 console.debug 预留。
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tasksKeys } from '../queries/tasks'

/** SSE 帧的 data 字段统一为 JSON；type 决定分发分支。 */
interface RealtimeEvent {
  type: string
  [key: string]: unknown
}

export interface UseRealtimeEventsResult {
  /** onopen 置 true；onerror/显式 close 置 false。重连成功会重新置 true。 */
  connected: boolean
}

/**
 * @param enabled 是否激活订阅。通常传入 `!!auth.user`——登录后常驻，登出即断开。
 */
export function useRealtimeEvents(enabled: boolean): UseRealtimeEventsResult {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  // 持有当前 EventSource 单例，避免 enabled 未变时重复创建。
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled) {
      // 未激活：确保残留连接被关闭（enabled 由 true→false 的登出场景）。
      sourceRef.current?.close()
      sourceRef.current = null
      setConnected(false)
      return
    }

    // 防御性冗余：当前 effect 依赖 [enabled, queryClient]，StrictMode 双挂载时
    // cleanup 已把 sourceRef.current 清 null，故正常流程不会命中此分支。
    // 保留以兜底未来若 effect 依赖扩展、cleanup 不再保证清空 ref 的情形。
    if (sourceRef.current) return

    const source = new EventSource('/api/v1/events')
    sourceRef.current = source

    source.onopen = () => setConnected(true)

    source.onmessage = (messageEvent) => {
      let event: RealtimeEvent
      try {
        event = JSON.parse(messageEvent.data) as RealtimeEvent
      } catch {
        // 非 JSON 帧（如 keep-alive 注释行不会进 onmessage；此处兜底忽略坏帧）。
        return
      }

      switch (event.type) {
        case 'task.status_changed': {
          const taskId = typeof event.taskId === 'string' ? event.taskId : undefined
          // 状态变更：列表（任意筛选）+ 该任务详情都失效，保证列表与详情一致。
          void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
          if (taskId) void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) })
          break
        }
        case 'task.execution_progress': {
          const taskId = typeof event.taskId === 'string' ? event.taskId : undefined
          // 进度更新只影响详情（列表的进度列也由列表失效覆盖——这里保守只刷详情，
          // 避免高频进度帧频繁重拉整张列表）。
          if (taskId) void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) })
          break
        }
        case 'approval.created':
        case 'approval.resolved': {
          // P3-8a：审批事件 → 刷新任务列表（任务进/出 awaiting_approval）
          const approvalTaskId = (event as { approvalId?: string; taskId?: string }).approvalId ?? (event as { taskId?: string }).taskId
          if (approvalTaskId) void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(approvalTaskId) })
          void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
          break
        }
        case 'agent.health':
          // 预留：MVP 无对应 UI，仅记录便于后续接入。
          console.debug('[realtime]', event.type, event)
          break
        default:
          // hello / keep-alive / 未知类型：无需处理。
          break
      }
    }

    source.onerror = () => {
      // 不 close——浏览器 EventSource 原生重连；仅反映断线状态。
      setConnected(false)
    }

    return () => {
      // 组件卸载 或 enabled 变 false：显式关闭，断开 SSE 连接。
      source.close()
      if (sourceRef.current === source) {
        sourceRef.current = null
        setConnected(false)
      }
    }
  }, [enabled, queryClient])

  return { connected }
}
