import { afterEach, describe, expect, it, vi } from 'vitest'
import { listRequirements } from './requirements'
import type { RequirementDto } from '../types'

/**
 * Unit tests for the requirement data layer (P1-2d).
 *
 * Mirrors tasks.test.ts: the shared client (`src/api/client.ts`) calls
 * `global.fetch` and unwraps the backend `{ data }` envelope, so we stub
 * `fetch` here rather than mocking the client module.
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

function makeRequirement(overrides: Partial<RequirementDto> = {}): RequirementDto {
  return {
    id: 'req-1',
    title: '需求评审流程完善',
    description: '完善需求评审流程',
    status: 'in_progress',
    priority: 'high',
    submitterId: null,
    submitterType: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  }
}

/** Capture the URL passed to fetch. */
let lastUrl: string | undefined

function stubFetch(responder: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => responder(url, init ?? {}))
  lastUrl = undefined
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    lastUrl = url
    return fn(url, init)
  })
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  lastUrl = undefined
})

describe('listRequirements', () => {
  it('parses the { data, page } envelope', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        data: [makeRequirement({ id: 'req-1' }), makeRequirement({ id: 'req-2' })],
        page: { nextCursor: 'cursor-2', hasMore: true },
      }),
    )

    const result = await listRequirements({ status: 'in_progress', limit: 2 })

    expect(lastUrl).toBe(`${API_BASE}/requirements?status=in_progress&limit=2`)
    expect(result.data).toHaveLength(2)
    expect(result.page.nextCursor).toBe('cursor-2')
    expect(result.page.hasMore).toBe(true)
  })

  it('omits empty params and produces a clean URL', async () => {
    stubFetch(() => jsonResponse(200, { data: [], page: { nextCursor: null, hasMore: false } }))

    await listRequirements()

    expect(lastUrl).toBe(`${API_BASE}/requirements`)
  })
})

describe('fetchRequirement', () => {
  it('returns the unwrapped RequirementDto', async () => {
    stubFetch(() => jsonResponse(200, { data: makeRequirement({ id: 'req-9' }) }))

    const requirement = await import('./requirements').then((m) => m.fetchRequirement('req-9'))

    expect(lastUrl).toBe(`${API_BASE}/requirements/req-9`)
    expect(requirement.id).toBe('req-9')
  })
})
