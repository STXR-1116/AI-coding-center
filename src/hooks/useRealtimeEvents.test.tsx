import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useRealtimeEvents } from './useRealtimeEvents'

/**
 * Unit tests for the useRealtimeEvents hook (P1-7b).
 *
 * A global fake EventSource records instances and exposes the registered
 * onopen/onmessage/onerror handlers so tests can drive them deterministically.
 * The hook resolves its own QueryClient via useQueryClient, so we wrap it in a
 * real QueryClientProvider and spy on `invalidateQueries` to assert the
 * event→invalidation mapping.
 */

/** Minimal fake EventSource matching the surface the hook touches. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  static readonly CLOSED = 2

  url: string
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => {
    /* spy — real impl not needed */
  })

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  FakeEventSource.instances = []
  // The hook reads the global EventSource; swap in our fake.
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useRealtimeEvents', () => {
  it('does not create an EventSource when enabled=false', () => {
    const queryClient = makeQueryClient()
    renderHook(() => useRealtimeEvents(false), { wrapper: wrapper(queryClient) })

    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('creates an EventSource at /api/v1/events when enabled=true', () => {
    const queryClient = makeQueryClient()
    renderHook(() => useRealtimeEvents(true), { wrapper: wrapper(queryClient) })

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0].url).toBe('/api/v1/events')
  })

  it('flips connected to true on open', () => {
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useRealtimeEvents(true), {
      wrapper: wrapper(queryClient),
    })

    expect(result.current.connected).toBe(false)
    act(() => actOpen())
    expect(result.current.connected).toBe(true)
  })

  it('flips connected to false on error (native reconnect, no close)', () => {
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useRealtimeEvents(true), {
      wrapper: wrapper(queryClient),
    })

    act(() => actOpen())
    expect(result.current.connected).toBe(true)

    act(() => FakeEventSource.instances[0].onerror?.())
    expect(result.current.connected).toBe(false)
    // 关键：onerror 不应手动 close——交给浏览器 EventSource 原生重连恢复。
    expect(FakeEventSource.instances[0].close).not.toHaveBeenCalled()
  })

  it('restores connected to true after reconnect (onopen after onerror)', () => {
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useRealtimeEvents(true), {
      wrapper: wrapper(queryClient),
    })

    act(() => actOpen())
    act(() => FakeEventSource.instances[0].onerror?.())
    expect(result.current.connected).toBe(false)

    // 浏览器原生重连成功后再次触发 onopen → connected 恢复 true。
    act(() => actOpen())
    expect(result.current.connected).toBe(true)
  })

  it('invalidates queries on task.status_changed', async () => {
    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useRealtimeEvents(true), { wrapper: wrapper(queryClient) })

    sendMessage({ type: 'task.status_changed', taskId: 'task-1' })

    // List invalidation always fires; detail invalidation fires because taskId is present.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 'task-1'] })
  })

  it('does not invalidate on an unknown event type', () => {
    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useRealtimeEvents(true), { wrapper: wrapper(queryClient) })

    sendMessage({ type: 'something.unknown', taskId: 'task-9' })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('closes the EventSource on unmount', () => {
    const queryClient = makeQueryClient()
    const { unmount } = renderHook(() => useRealtimeEvents(true), {
      wrapper: wrapper(queryClient),
    })

    expect(FakeEventSource.instances).toHaveLength(1)
    const source = FakeEventSource.instances[0]

    unmount()

    expect(source.close).toHaveBeenCalledTimes(1)
  })

  it('closes the EventSource when enabled flips to false', () => {
    const queryClient = makeQueryClient()
    const { rerender } = renderHook(({ enabled }: { enabled: boolean }) => useRealtimeEvents(enabled), {
      wrapper: wrapper(queryClient),
      initialProps: { enabled: true },
    })

    const source = FakeEventSource.instances[0]

    rerender({ enabled: false })

    expect(source.close).toHaveBeenCalledTimes(1)
  })
})

/* ---------- fake EventSource driver helpers ---------- */

function actOpen() {
  const source = FakeEventSource.instances.at(-1)
  if (!source?.onopen) throw new Error('onopen not registered yet')
  source.onopen()
}

function sendMessage(data: unknown) {
  const source = FakeEventSource.instances.at(-1)
  if (!source?.onmessage) throw new Error('onmessage not registered yet')
  source.onmessage({ data: JSON.stringify(data) })
}
