import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from './stream'
import type { ChatStreamFrame } from '../types'

/**
 * Unit tests for the NDJSON streaming client (P1-3b).
 *
 * `streamChat` calls `global.fetch` and reads the `ReadableStream` body line by
 * line, so we stub `fetch` with a Response whose `body` is a ReadableStream
 * emitting NDJSON. jsdom (vitest's environment) ships TextDecoder and
 * ReadableStream, so no extra polyfills are needed.
 */

const STREAM_URL = '/api/chat/stream'

/** Build a ReadableStream<Uint8Array> that emits the given string chunks. */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function streamResponse(
  chunks: string[],
  init: { status?: number; statusText?: string } = {},
): Response {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? '',
    body: makeStream(chunks),
  } as Response
}

/** A Response with no body (e.g. a non-JSON gateway error page). */
function textResponse(status: number, text: string, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => text,
  } as Response
}

function stubFetch(responder: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn(async (url: string, init?: RequestInit) =>
    responder(url, init ?? {}),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

let lastInit: RequestInit | undefined
let lastUrl: string | undefined

afterEach(() => {
  vi.unstubAllGlobals()
  lastInit = undefined
  lastUrl = undefined
})

describe('streamChat', () => {
  it('dispatches frames in order: user → status → delta×2 → done', async () => {
    const ndjson = [
      JSON.stringify({ type: 'user', id: 'msg-user-1' }),
      JSON.stringify({ type: 'status', status: 'thinking' }),
      JSON.stringify({ type: 'delta', text: '你好' }),
      JSON.stringify({ type: 'delta', text: '，世界' }),
      JSON.stringify({ type: 'done', text: '你好，世界' }),
    ].join('\n')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        lastUrl = url
        lastInit = init
        return streamResponse([ndjson])
      }),
    )

    const calls: string[] = []
    const onUser = vi.fn(() => calls.push('user'))
    const onStatus = vi.fn(() => calls.push('status'))
    const onDelta = vi.fn((_f: Extract<ChatStreamFrame, { type: 'delta' }>) => calls.push('delta'))
    const onDone = vi.fn((_f: Extract<ChatStreamFrame, { type: 'done' }>) => calls.push('done'))
    const onError = vi.fn()

    await streamChat(
      { conversationId: 'conv-1', content: '你好' },
      { onUser, onStatus, onDelta, onDone, onError },
    )

    expect(lastUrl).toBe(STREAM_URL)
    const body = JSON.parse((lastInit?.body as string) ?? '{}')
    expect(body).toEqual({ conversationId: 'conv-1', content: '你好' })

    expect(calls).toEqual(['user', 'status', 'delta', 'delta', 'done'])
    expect(onUser).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onDelta).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()

    // Delta payloads reach the handler verbatim.
    expect(onDelta.mock.calls[0][0].text).toBe('你好')
    expect(onDelta.mock.calls[1][0].text).toBe('，世界')
    // done carries the server-assembled full text.
    expect(onDone.mock.calls[0][0].text).toBe('你好，世界')
  })

  it('skips a line with bad JSON and keeps streaming', async () => {
    const ndjson = [
      JSON.stringify({ type: 'delta', text: '前' }),
      'this is not json',
      JSON.stringify({ type: 'delta', text: '后' }),
      JSON.stringify({ type: 'done', text: '前后' }),
    ].join('\n')

    stubFetch(() => streamResponse([ndjson]))

    const onDelta = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await streamChat(
      { conversationId: 'conv-1', content: 'hi' },
      { onDelta, onDone, onError },
    )

    // Both good deltas were delivered; the bad line was dropped, not fatal.
    expect(onDelta).toHaveBeenCalledTimes(2)
    expect(onDelta.mock.calls[0][0].text).toBe('前')
    expect(onDelta.mock.calls[1][0].text).toBe('后')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('handles frames split across chunks (partial line buffering)', async () => {
    // One logical frame split across two chunks; the line must be reassembled.
    const full = JSON.stringify({ type: 'delta', text: '分块' })
    // 第一 chunk 是 JSON 前半（无换行），第二 chunk 是后半 + 换行——完整行由缓冲拼接后解析
    const chunks = [full.slice(0, 5), full.slice(5) + '\n']

    stubFetch(() => streamResponse(chunks))

    const onDelta = vi.fn()
    await streamChat(
      { conversationId: 'conv-1', content: 'hi' },
      { onDelta },
    )

    expect(onDelta).toHaveBeenCalledTimes(1)
    expect(onDelta.mock.calls[0][0].text).toBe('分块')
  })

  it('calls onError with a message on non-2xx (NDJSON error frame)', async () => {
    const errLine = JSON.stringify({
      type: 'error',
      message: '会话不存在',
      code: 'NOT_FOUND',
    })
    stubFetch(() => textResponse(404, `${errLine}\n`, 'Not Found'))

    const onError = vi.fn()
    await streamChat(
      { conversationId: 'missing', content: 'hi' },
      { onError },
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatchObject({
      type: 'error',
      message: '会话不存在',
      code: 'NOT_FOUND',
    })
  })

  it('falls back to a generic error when the body is not JSON', async () => {
    stubFetch(() => textResponse(502, '<html>Bad Gateway</html>', 'Bad Gateway'))

    const onError = vi.fn()
    await streamChat(
      { conversationId: 'conv-1', content: 'hi' },
      { onError },
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].type).toBe('error')
    expect(typeof onError.mock.calls[0][0].message).toBe('string')
    expect(onError.mock.calls[0][0].message.length).toBeGreaterThan(0)
  })

  it('resolves cleanly when aborted via AbortSignal', async () => {
    // A fetch that rejects with an AbortError, simulating a cancel.
    stubFetch(() => {
      const e = new Error('aborted')
      e.name = 'AbortError'
      throw e
    })

    const onError = vi.fn()
    const controller = new AbortController()
    // Not aborting here — streamChat treats an AbortError-shaped rejection as
    // an intentional cancel and resolves without calling onError.
    await expect(
      streamChat(
        { conversationId: 'conv-1', content: 'hi' },
        { onError },
        controller.signal,
      ),
    ).resolves.toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError on a network failure (non-abort fetch rejection)', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    const onError = vi.fn()
    await streamChat(
      { conversationId: 'conv-1', content: 'hi' },
      { onError },
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatchObject({
      type: 'error',
      code: 'NETWORK_ERROR',
    })
  })

  it('ignores frames with an unknown type', async () => {
    const ndjson = [
      JSON.stringify({ type: 'delta', text: 'ok' }),
      JSON.stringify({ type: 'mystery', foo: 'bar' }),
      JSON.stringify({ type: 'done', text: 'ok' }),
    ].join('\n')

    stubFetch(() => streamResponse([ndjson]))

    const onDelta = vi.fn()
    const onDone = vi.fn()
    await streamChat(
      { conversationId: 'conv-1', content: 'hi' },
      { onDelta, onDone },
    )

    expect(onDelta).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
