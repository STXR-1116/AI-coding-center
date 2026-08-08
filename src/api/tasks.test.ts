import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from './client'
import { assignTask, cancelTask, createTask, fetchTask, listTasks } from './tasks'
import type { TaskDto } from '../types'

/**
 * Unit tests for the task data layer (P1-2a).
 *
 * The shared client (`src/api/client.ts`) calls `global.fetch` and unwraps the
 * backend `{ data }` envelope, so we stub `fetch` here rather than mocking the
 * client module. Error responses carry a `{ error: { code, message, ... } }`
 * envelope which `ApiClientError.fromResponse` parses.
 */

const API_BASE = '/api/v1'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response
}

function makeTask(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task-1',
    title: 'Connector 心跳恢复策略',
    summary: 'Stabilize the connector heartbeat loop.',
    status: 'pending',
    priority: 'high',
    requirementId: 'req-1',
    assignee: null,
    assigneeKind: null,
    progress: 0,
    tokenBudget: 10000,
    tokenUsed: 0,
    contextUsage: null,
    executionMode: null,
    tags: [],
    result: null,
    updatedAt: '2026-08-07T00:00:00.000Z',
    version: 1,
    allowedActions: ['execute', 'cancel', 'assign'],
    ...overrides,
  }
}

/** Capture the Request init passed to fetch (method, headers, body). */
let lastInit: RequestInit | undefined
let lastUrl: string | undefined

function stubFetch(responder: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => responder(url, init ?? {}))
  lastInit = undefined
  lastUrl = undefined
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    lastUrl = url
    lastInit = init
    return fn(url, init)
  })
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  lastInit = undefined
  lastUrl = undefined
})

describe('listTasks', () => {
  it('parses the { data, page } envelope', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        data: [makeTask({ id: 'task-1' }), makeTask({ id: 'task-2' })],
        page: { nextCursor: 'cursor-2', hasMore: true },
      }),
    )

    const result = await listTasks({ status: 'pending', limit: 2 })

    expect(lastUrl).toBe(`${API_BASE}/tasks?status=pending&limit=2`)
    expect(result.data).toHaveLength(2)
    expect(result.page.nextCursor).toBe('cursor-2')
    expect(result.page.hasMore).toBe(true)
  })

  it('omits empty params and produces a clean URL', async () => {
    stubFetch(() => jsonResponse(200, { data: [], page: { nextCursor: null, hasMore: false } }))

    await listTasks()

    expect(lastUrl).toBe(`${API_BASE}/tasks`)
  })
})

describe('fetchTask', () => {
  it('returns the unwrapped TaskDto', async () => {
    stubFetch(() => jsonResponse(200, { data: makeTask({ id: 'task-9' }) }))

    const task = await fetchTask('task-9')

    expect(lastUrl).toBe(`${API_BASE}/tasks/task-9`)
    expect(task.id).toBe('task-9')
  })

  it('throws ApiClientError with code=NOT_FOUND on 404', async () => {
    stubFetch(() =>
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: '任务不存在' } }),
    )

    await expect(fetchTask('missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'NOT_FOUND',
      message: '任务不存在',
    })
  })
})

describe('createTask', () => {
  it('throws ApiClientError with code=STATE_CONFLICT on 409', async () => {
    stubFetch(() =>
      jsonResponse(409, {
        error: { code: 'STATE_CONFLICT', message: '任务已存在', retryable: false },
      }),
    )

    await expect(
      createTask({ requirementId: 'req-1', title: 'dup' }),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 409,
      code: 'STATE_CONFLICT',
    })
  })

  it('attaches a non-empty Idempotency-Key on POST', async () => {
    stubFetch(() => jsonResponse(201, { data: makeTask({ id: 'task-new' }) }))

    await createTask({ requirementId: 'req-1', title: 'new task' })

    const headers = (lastInit?.headers ?? {}) as Record<string, string>
    expect(headers['Idempotency-Key']).toBeTruthy()
    expect(typeof headers['Idempotency-Key']).toBe('string')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(lastInit?.body as string)).toEqual({
      requirementId: 'req-1',
      title: 'new task',
    })
  })
})

describe('assignTask', () => {
  it('posts to /tasks/{id}/assign with the agent payload', async () => {
    stubFetch(() => jsonResponse(200, { data: makeTask({ id: 'task-1', status: 'assigned' }) }))

    const task = await assignTask('task-1', { agentId: 'agent-7' })

    expect(lastUrl).toBe(`${API_BASE}/tasks/task-1/assign`)
    expect(task.status).toBe('assigned')
    expect(JSON.parse(lastInit?.body as string)).toEqual({ agentId: 'agent-7' })
  })
})

describe('cancelTask', () => {
  it('posts to /tasks/{id}/cancel and attaches an Idempotency-Key', async () => {
    stubFetch(() => jsonResponse(200, { data: makeTask({ id: 'task-1', status: 'cancelled' }) }))

    const task = await cancelTask('task-1')

    expect(lastUrl).toBe(`${API_BASE}/tasks/task-1/cancel`)
    expect(task.status).toBe('cancelled')
    const headers = (lastInit?.headers ?? {}) as Record<string, string>
    expect(headers['Idempotency-Key']).toBeTruthy()
  })

  it('rethrows ApiClientError as-is (e.g. 401 unauthorized)', async () => {
    stubFetch(() =>
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: '未登录' } }),
    )

    const error = await cancelTask('task-1').catch((e) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).status).toBe(401)
  })
})
