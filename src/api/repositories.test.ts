import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from './client'
import {
  fetchRepository,
  listChanges,
  listCommits,
  listRepositories,
  revertChange,
} from './repositories'
import type { RepositoryDto } from '../types'

/**
 * Unit tests for the repository data layer (P1-4b).
 *
 * The shared client (`src/api/client.ts`) calls `global.fetch` and unwraps the
 * backend `{ data }` envelope, so we stub `fetch` here rather than mocking the
 * client module. List responses keep the full `{ data, page }` envelope
 * (`unwrap: false`); detail/commits/changes unwrap to the DTO.
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

function makeRepo(overrides: Partial<RepositoryDto> = {}): RepositoryDto {
  return {
    id: 'repo-codingcenter',
    name: 'Coding Center',
    vcsType: 'git',
    url: 'https://git.example.com/team/coding-center.git',
    defaultBranch: 'main',
    ownerUserId: 'user-1',
    ownerName: 'Team Leader',
    status: 'active',
    hasLocalPath: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
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

describe('listRepositories', () => {
  it('parses the { data, page } envelope', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        data: [makeRepo({ id: 'repo-a' }), makeRepo({ id: 'repo-b' })],
        page: { nextCursor: null, hasMore: false },
      }),
    )

    const result = await listRepositories()

    expect(lastUrl).toBe(`${API_BASE}/repositories`)
    expect(result.data).toHaveLength(2)
    expect(result.page.hasMore).toBe(false)
  })

  it('passes limit/cursor as query params', async () => {
    stubFetch(() =>
      jsonResponse(200, { data: [], page: { nextCursor: 'c1', hasMore: true } }),
    )

    const result = await listRepositories({ limit: 10, cursor: 'c0' })

    expect(lastUrl).toBe(`${API_BASE}/repositories?limit=10&cursor=c0`)
    expect(result.page.nextCursor).toBe('c1')
  })
})

describe('fetchRepository', () => {
  it('returns the unwrapped RepositoryDto', async () => {
    stubFetch(() => jsonResponse(200, { data: makeRepo({ id: 'repo-x' }) }))

    const repo = await fetchRepository('repo-x')

    expect(lastUrl).toBe(`${API_BASE}/repositories/repo-x`)
    expect(repo.id).toBe('repo-x')
    expect(repo.hasLocalPath).toBe(true)
  })

  it('throws ApiClientError with code=NOT_FOUND on 404', async () => {
    stubFetch(() =>
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: '仓库不存在' } }),
    )

    await expect(fetchRepository('missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'NOT_FOUND',
      message: '仓库不存在',
    })
  })
})

describe('listCommits', () => {
  it('returns the unwrapped CommitDto[] and forwards limit', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        data: [
          { hash: 'fullhash'.padEnd(40, '0'), shortHash: '2bc38f1', author: 'Atlas', date: '2026-08-07T10:00:00+08:00', message: 'feat: x' },
        ],
      }),
    )

    const commits = await listCommits('repo-1', 50)

    expect(lastUrl).toBe(`${API_BASE}/repositories/repo-1/commits?limit=50`)
    expect(commits).toHaveLength(1)
    expect(commits[0].shortHash).toBe('2bc38f1')
  })

  it('omits the query string when no limit', async () => {
    stubFetch(() => jsonResponse(200, { data: [] }))

    await listCommits('repo-1')

    expect(lastUrl).toBe(`${API_BASE}/repositories/repo-1/commits`)
  })
})

describe('listChanges', () => {
  it('returns the unwrapped WorktreeChangeDto[]', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        data: [
          { path: 'src/a.ts', changeType: 'modified', addedLines: 3, deletedLines: 1, diff: '@@ …', binary: false },
        ],
      }),
    )

    const changes = await listChanges('repo-1')

    expect(lastUrl).toBe(`${API_BASE}/repositories/repo-1/changes`)
    expect(changes).toHaveLength(1)
    expect(changes[0].addedLines).toBe(3)
  })
})

describe('revertChange', () => {
  it('posts { path } with an Idempotency-Key', async () => {
    stubFetch(() =>
      jsonResponse(200, { data: { ok: true, message: 'reverted' } }),
    )

    const result = await revertChange('repo-1', 'src/a.ts')

    expect(lastUrl).toBe(`${API_BASE}/repositories/repo-1/changes/revert`)
    expect(JSON.parse(lastInit?.body as string)).toEqual({ path: 'src/a.ts' })
    const headers = (lastInit?.headers ?? {}) as Record<string, string>
    expect(headers['Idempotency-Key']).toBeTruthy()
    expect(result.ok).toBe(true)
  })

  it('rethrows ApiClientError as-is (e.g. 409 conflict)', async () => {
    stubFetch(() =>
      jsonResponse(409, {
        error: { code: 'STATE_CONFLICT', message: 'revert conflict', retryable: false },
      }),
    )

    const error = await revertChange('repo-1', 'src/a.ts').catch((e) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).status).toBe(409)
    expect((error as ApiClientError).code).toBe('STATE_CONFLICT')
  })
})
