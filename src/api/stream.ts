/**
 * NDJSON streaming client for `/api/chat/stream` (P1-3b).
 *
 * Unlike the REST client in `./client`, this endpoint lives under `/api`
 * (proxied to the main backend on :3003) and returns a stream of
 * newline-delimited JSON frames rather than a single JSON body. Each frame is
 * `{ type, ...payload }` with one of:
 *   user    — echoed user message (carries the persisted message id)
 *   status  — progress/status string ("thinking", "calling_tool", …)
 *   delta   — incremental assistant text chunk
 *   done    — stream complete (carries the full assembled text)
 *   error   — terminal error (carries message/code)
 *
 * Auth uses the session cookie via same-origin credentials (vite proxy), same
 * as the REST client. A line that fails to parse as JSON is skipped — the
 * stream keeps going — so a stray partial frame never aborts a whole reply.
 * Passing an `AbortSignal` lets the caller cancel mid-stream (e.g. on unmount).
 */

import type { ChatStreamFrame } from '../types'

export type { ChatStreamFrame }

export interface StreamChatInput {
  conversationId: string
  content: string
}

export interface StreamChatHandlers {
  onUser?: (frame: Extract<ChatStreamFrame, { type: 'user' }>) => void
  onStatus?: (frame: Extract<ChatStreamFrame, { type: 'status' }>) => void
  onDelta?: (frame: Extract<ChatStreamFrame, { type: 'delta' }>) => void
  onDone?: (frame: Extract<ChatStreamFrame, { type: 'done' }>) => void
  onError?: (frame: Extract<ChatStreamFrame, { type: 'error' }>) => void
}

const STREAM_URL = '/api/chat/stream'

/**
 * Read an NDJSON error frame from a non-2xx response body. The backend emits
 * errors as a single `{ type:'error', message, code }` NDJSON line; if the body
 * isn't parseable (HTML 502, empty body, …) we fall back to a generic message
 * so the caller always gets a structured error frame.
 */
async function readErrorFrame(res: Response): Promise<Extract<ChatStreamFrame, { type: 'error' }>> {
  try {
    const text = await res.text()
    // The error may be a bare NDJSON line or, on some gateway failures, a JSON
    // object — try the first non-empty line, then the whole body.
    const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? text
    const parsed = JSON.parse(line) as { type?: string; message?: string; code?: string }
    if (parsed && (parsed.type === 'error' || parsed.message)) {
      return {
        type: 'error',
        message: parsed.message ?? (res.statusText || '聊天服务暂时不可用，请稍后重试。'),
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
      }
    }
  } catch {
    // Body wasn't JSON — fall through to the generic envelope below.
  }
  return {
    type: 'error',
    message: res.statusText || '聊天服务暂时不可用，请稍后重试。',
    code: String(res.status),
  }
}

/**
 * Stream a chat turn. POSTs `{ conversationId, content }` to
 * `/api/chat/stream` and dispatches each NDJSON frame to the matching handler.
 * Resolves once the stream ends (after a `done`/`error` frame or a clean EOF),
 * or rejects if the fetch itself fails (network error / abort).
 *
 * Abort: when the caller's `signal` aborts, `fetch` rejects with an
 * `AbortError`; `streamChat` swallows that rejection and resolves normally so
 * the caller's `.then`/`await` doesn't surface a spurious error for an
 * intentional cancel.
 */
export async function streamChat(
  input: StreamChatInput,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(STREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ conversationId: input.conversationId, content: input.content }),
      signal,
    })
  } catch (error) {
    // An intentional abort is not an error — resolve cleanly.
    if (signal?.aborted || (error as Error)?.name === 'AbortError') return
    handlers.onError?.({
      type: 'error',
      message: '无法连接聊天服务，请检查网络后重试。',
      code: 'NETWORK_ERROR',
    })
    return
  }

  if (!res.ok) {
    handlers.onError?.(await readErrorFrame(res))
    return
  }

  const body = res.body
  if (!body) {
    // No streamable body — nothing to dispatch; treat as a clean (empty) end.
    return
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dispatchedTerminal = false // M1：done/error 终止帧已处理 → 停止读取

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Process every complete line in the buffer; keep the trailing partial
      // line for the next chunk. `\n` is the NDJSON record separator.
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) continue
        // M1（审查修复）：done/error 终止帧后立即停止读取（后端可能不关闭连接）
        if (dispatchFrame(line, handlers)) {
          dispatchedTerminal = true
          break
        }
      }
      // 终止帧已处理 → 退出外层读循环
      if (dispatchedTerminal) break
    }
    if (dispatchedTerminal) return
    // Flush any trailing line that wasn't newline-terminated.
    const tail = buffer.trim()
    if (tail) dispatchFrame(tail, handlers)
  } catch (error) {
    // A reader read can reject on abort; treat as a clean stop.
    if (signal?.aborted || (error as Error)?.name === 'AbortError') return
    handlers.onError?.({
      type: 'error',
      message: '聊天流中断，请稍后重试。',
      code: 'STREAM_INTERRUPTED',
    })
  }
}

/**
 * Parse one NDJSON line and route it to the matching handler. A line that
 * fails to parse, or carries an unknown `type`, is skipped — the stream keeps
 * going so one bad frame can't kill an otherwise-good reply.
 * Returns true when a terminal frame (done/error) was dispatched — the caller
 * should stop reading the stream.
 */
function dispatchFrame(line: string, handlers: StreamChatHandlers): boolean {
  let frame: ChatStreamFrame
  try {
    frame = JSON.parse(line) as ChatStreamFrame
  } catch {
    return false
  }
  if (!frame || typeof frame.type !== 'string') return false
  switch (frame.type) {
    case 'user':
      handlers.onUser?.(frame as Extract<ChatStreamFrame, { type: 'user' }>)
      break
    case 'status':
      handlers.onStatus?.(frame as Extract<ChatStreamFrame, { type: 'status' }>)
      break
    case 'delta':
      handlers.onDelta?.(frame as Extract<ChatStreamFrame, { type: 'delta' }>)
      break
    case 'done':
      handlers.onDone?.(frame as Extract<ChatStreamFrame, { type: 'done' }>)
      return true // 终止帧
    case 'error':
      handlers.onError?.(frame as Extract<ChatStreamFrame, { type: 'error' }>)
      return true // 终止帧
    default:
      // Unknown frame type — ignore rather than fail the whole stream.
      break
  }
  return false
}
