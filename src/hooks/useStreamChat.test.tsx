import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useStreamChat } from './useStreamChat'

/**
 * Unit tests for the useStreamChat hook (P1-3b).
 *
 * `streamChat` is mocked so the tests drive frame callbacks deterministically
 * rather than depending on a real fetch/stream. A small harness component
 * surfaces the hook's state to the DOM so React Testing Library can assert on
 * it and we can exercise `start`/`abort` through real React renders.
 */

// Capture the handlers passed to streamChat so a test can fire frames.
type Handlers = Parameters<typeof streamChatMock>[1]
// Pending-promise mock：streamChat 保持挂起 → start() 的 await 未完成 → abortRef 仍指向本轮
// controller（M2 迟到帧守卫依赖该不变式）；测试 fire 帧后调用 resolveStream() 收尾。
let resolveStream: (() => void) | null = null
const streamChatMock = vi.fn(
  async (
    _input: { conversationId: string; content: string },
    handlers: Record<string, (frame: { type: string } & Record<string, unknown>) => void>,
    _signal?: AbortSignal,
  ) => {
    lastHandlers = handlers
    return new Promise<void>((resolve) => {
      resolveStream = resolve
    })
  },
)
let lastHandlers: Handlers | null = null

vi.mock('../api/stream', () => ({
  streamChat: (
    input: { conversationId: string; content: string },
    handlers: Record<string, (frame: { type: string } & Record<string, unknown>) => void>,
    signal?: AbortSignal,
  ) => streamChatMock(input, handlers, signal),
}))

afterEach(() => {
  resolveStream?.()
  resolveStream = null
  vi.clearAllMocks()
  lastHandlers = null
})

/** Harness that renders hook state and a button to call start/abort. */
function Harness({ conversationId }: { conversationId: string }) {
  const chat = useStreamChat(conversationId)
  return (
    <div>
      <span data-testid="status">{chat.status}</span>
      <span data-testid="text">{chat.assistantText}</span>
      <span data-testid="error">{chat.error ?? ''}</span>
      <span data-testid="statusmsg">{chat.statusMessage ?? ''}</span>
      <button data-testid="start" onClick={() => void chat.start('你好')}>
        start
      </button>
      <button data-testid="abort" onClick={() => chat.abort()}>
        abort
      </button>
      <button data-testid="reset" onClick={() => chat.reset()}>
        reset
      </button>
    </div>
  )
}

function fire(frame: { type: string } & Record<string, unknown>) {
  const handlers = lastHandlers
  if (!handlers) throw new Error('streamChat was not called yet')
  const fn = handlers[`on${frame.type[0].toUpperCase()}${frame.type.slice(1)}`]
  if (typeof fn !== 'function') {
    throw new Error(`no handler for frame type ${frame.type}`)
  }
  fn(frame)
}

describe('useStreamChat', () => {
  it('accumulates assistant text from delta frames and flips status to done', async () => {
    render(<Harness conversationId="conv-1" />)

    expect(screen.getByTestId('status').textContent).toBe('idle')

    await act(async () => {
      screen.getByTestId('start').click()
    })

    // start flips to streaming and clears prior text.
    expect(screen.getByTestId('status').textContent).toBe('streaming')
    expect(screen.getByTestId('text').textContent).toBe('')
    expect(streamChatMock).toHaveBeenCalledWith(
      { conversationId: 'conv-1', content: '你好' },
      expect.any(Object),
      expect.any(AbortSignal),
    )

    // Two deltas accumulate.
    act(() => fire({ type: 'delta', text: '你好' }))
    expect(screen.getByTestId('text').textContent).toBe('你好')
    act(() => fire({ type: 'delta', text: '，世界' }))
    expect(screen.getByTestId('text').textContent).toBe('你好，世界')

    // done carries the authoritative full text.
    act(() => fire({ type: 'done', text: '你好，世界' }))
    expect(screen.getByTestId('status').textContent).toBe('done')
    expect(screen.getByTestId('text').textContent).toBe('你好，世界')
  })

  it('records a status frame message', async () => {
    render(<Harness conversationId="conv-1" />)

    await act(async () => {
      screen.getByTestId('start').click()
    })

    act(() => fire({ type: 'status', status: 'thinking' }))
    expect(screen.getByTestId('statusmsg').textContent).toBe('thinking')
    expect(screen.getByTestId('status').textContent).toBe('streaming')
  })

  it('flips to error and records the message on an error frame', async () => {
    render(<Harness conversationId="conv-1" />)

    await act(async () => {
      screen.getByTestId('start').click()
    })

    act(() => fire({ type: 'error', message: '会话不存在', code: 'NOT_FOUND' }))
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('error').textContent).toBe('会话不存在')
  })

  it('abort flips a streaming turn to done', async () => {
    render(<Harness conversationId="conv-1" />)

    await act(async () => {
      screen.getByTestId('start').click()
    })
    expect(screen.getByTestId('status').textContent).toBe('streaming')

    act(() => fire({ type: 'delta', text: '部分' }))
    expect(screen.getByTestId('text').textContent).toBe('部分')

    act(() => {
      screen.getByTestId('abort').click()
    })
    expect(screen.getByTestId('status').textContent).toBe('done')
  })

  it('reset clears text and returns to idle', async () => {
    render(<Harness conversationId="conv-1" />)

    await act(async () => {
      screen.getByTestId('start').click()
    })
    act(() => fire({ type: 'delta', text: '残留' }))
    expect(screen.getByTestId('text').textContent).toBe('残留')

    act(() => {
      screen.getByTestId('reset').click()
    })
    expect(screen.getByTestId('status').textContent).toBe('idle')
    expect(screen.getByTestId('text').textContent).toBe('')
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('clears prior assistant text when starting a new turn', async () => {
    render(<Harness conversationId="conv-1" />)

    await act(async () => {
      screen.getByTestId('start').click()
    })
    act(() => fire({ type: 'delta', text: '上一轮' }))
    expect(screen.getByTestId('text').textContent).toBe('上一轮')

    // Start a second turn — text must be cleared up front.
    await act(async () => {
      screen.getByTestId('start').click()
    })
    expect(screen.getByTestId('text').textContent).toBe('')
    expect(screen.getByTestId('status').textContent).toBe('streaming')
  })
})
