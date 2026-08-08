/**
 * useStreamChat — drives a single streaming chat turn (P1-3b).
 *
 * Wraps `streamChat` from `src/api/stream` and exposes the in-flight
 * assistant text plus a coarse lifecycle status. The accumulated
 * `assistantText` is the token-by-token view for a typewriter UI; once the
 * stream's `done` frame arrives the caller should invalidate the persisted
 * conversation detail (via `useConversation`/`useSendMessage`) so the final
 * message list replaces the transient text.
 *
 * State is deliberately local: streaming output is ephemeral and shouldn't
 * pollute the React Query cache. `reset()` clears it so a caller can wipe the
 * view when switching conversations.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { streamChat } from '../api/stream'
import type { ChatStreamFrame } from '../types'

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface UseStreamChatResult {
  /** Accumulated assistant text from `delta` frames (transient). */
  assistantText: string
  /** Current lifecycle status of the stream. */
  status: StreamStatus
  /** Error message when `status === 'error'`, else null. */
  error: string | null
  /** Latest `status` frame string from the server (e.g. "thinking"). */
  statusMessage: string | null
  /** Start a streaming turn. Clears any prior assistant text. */
  start: (content: string) => Promise<void>
  /** Abort the in-flight stream (no-op when idle). */
  abort: () => void
  /** Reset to idle, clearing assistantText/error/statusMessage. */
  reset: () => void
}

export function useStreamChat(conversationId: string): UseStreamChatResult {
  const [assistantText, setAssistantText] = useState('')
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Holds the AbortController for the in-flight request across renders. Kept in
  // a ref (not state) so abort/start don't trigger re-renders on their own.
  const abortRef = useRef<AbortController | null>(null)

  // H1（审查修复）：组件卸载时中止流式请求——避免回调对已卸载组件 setState + 连接泄漏
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setAssistantText('')
    setStatus('idle')
    setError(null)
    setStatusMessage(null)
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    // Aborting mid-stream leaves whatever was accumulated visible; flip to a
    // terminal-ish state so the UI knows the turn ended.
    setStatus((prev) => (prev === 'streaming' ? 'done' : prev))
  }, [])

  const start = useCallback(
    async (content: string) => {
      // Cancel any in-flight stream before starting a new one.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setAssistantText('')
      setError(null)
      setStatusMessage(null)
      setStatus('streaming')

      await streamChat(
        { conversationId, content },
        {
          onUser: () => {
            // User frame is informational; status stays 'streaming'.
          },
          onStatus: (frame: Extract<ChatStreamFrame, { type: 'status' }>) => {
            // M2（审查修复）：迟到帧守卫——仅当前轮（controller 仍最新）才消费
            if (abortRef.current === controller && frame.status) setStatusMessage(frame.status)
          },
          onDelta: (frame: Extract<ChatStreamFrame, { type: 'delta' }>) => {
            if (abortRef.current === controller && frame.text) {
              setAssistantText((prev) => prev + frame.text)
            }
          },
          onDone: (frame: Extract<ChatStreamFrame, { type: 'done' }>) => {
            if (abortRef.current !== controller) return
            // The server-assembled full text is authoritative; prefer it over
            // our accumulated delta sum in case a frame was dropped.
            if (typeof frame.text === 'string' && frame.text.length > 0) {
              setAssistantText(frame.text)
            }
            setStatus('done')
          },
          onError: (frame: Extract<ChatStreamFrame, { type: 'error' }>) => {
            if (abortRef.current !== controller) return
            setError(frame.message ?? '聊天出错，请重试。')
            setStatus('error')
          },
        },
        controller.signal,
      )

      // If an abort happened, status was already set to 'done' in abort();
      // otherwise the stream's own done/error frame set it. Clear the ref so a
      // later abort() is a no-op.
      if (abortRef.current === controller) abortRef.current = null
    },
    [conversationId],
  )

  return { assistantText, status, error, statusMessage, start, abort, reset }
}
