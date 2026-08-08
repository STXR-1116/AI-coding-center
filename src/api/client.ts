/**
 * Thin REST client for the CodingCenter backend.
 *
 * Auth uses a session cookie (NextAuth), so requests rely on same-origin
 * cookies in dev (vite proxy) and prod — there is no Bearer token. The client
 * only shapes requests/responses: it extracts `data` on success and throws an
 * `ApiClientError` carrying the backend error envelope on failure.
 */

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export interface ApiClientErrorOptions {
  status: number
  code: string
  message: string
  requestId?: string
  retryable?: boolean
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly retryable: boolean

  constructor({ status, code, message, requestId, retryable }: ApiClientErrorOptions) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.retryable = Boolean(retryable)
  }

  /**
   * Build an ApiClientError from a non-2xx response. The backend returns a
   * `{ error: { code, message, requestId, retryable } }` envelope; if parsing
   * fails (e.g. non-JSON body) we fall back to an INTERNAL_ERROR shape so the
   * caller always gets a structured error.
   */
  static async fromResponse(res: Response): Promise<ApiClientError> {
    let code = 'INTERNAL_ERROR'
    let message = '发生未知错误，请稍后重试。'
    let requestId: string | undefined
    let retryable = false

    try {
      const body = (await res.json()) as { error?: Partial<ApiClientErrorOptions> }
      if (body?.error) {
        code = body.error.code ?? code
        message = body.error.message ?? message
        requestId = body.error.requestId
        retryable = Boolean(body.error.retryable)
      }
    } catch {
      // Body wasn't JSON — keep the fallback envelope.
    }

    return new ApiClientError({
      status: res.status,
      code,
      message: message || res.statusText || message,
      requestId,
      retryable,
    })
  }
}

export interface RequestOptions {
  method?: string
  body?: unknown
  /** When true (and method is POST), attach an Idempotency-Key header. */
  idempotent?: boolean
  headers?: Record<string, string>
  /** When false, return the raw envelope body (needed for list responses `{ data, page }`). */
  unwrap?: boolean
}

function buildHeaders(opts: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': crypto.randomUUID(),
    ...opts.headers,
  }

  if (opts.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (opts.idempotent && (opts.method ?? 'GET').toUpperCase() === 'POST') {
    headers['Idempotency-Key'] = crypto.randomUUID()
  }

  return headers
}

/**
 * Perform a request against the API and return the unwrapped `data` field.
 * Throws `ApiClientError` on any non-2xx response.
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: buildHeaders(opts),
    credentials: 'same-origin',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    throw await ApiClientError.fromResponse(res)
  }

  // 204 / empty bodies have nothing to unwrap.
  if (res.status === 204) return undefined as T

  const body = (await res.json()) as { data?: T }
  return opts.unwrap === false ? (body as T) : (body.data as T)
}

export const get = <T>(path: string, opts?: RequestOptions) =>
  request<T>(path, { ...opts, method: 'GET' })

export const post = <T>(path: string, body?: unknown, opts?: RequestOptions) =>
  request<T>(path, { ...opts, method: 'POST', body })

export const patch = <T>(path: string, body?: unknown, opts?: RequestOptions) =>
  request<T>(path, { ...opts, method: 'PATCH', body })

export const put = <T>(path: string, body?: unknown, opts?: RequestOptions) =>
  request<T>(path, { ...opts, method: 'PUT', body })

export const del = <T>(path: string, opts?: RequestOptions) =>
  request<T>(path, { ...opts, method: 'DELETE' })
