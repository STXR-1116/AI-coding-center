/**
 * REST client for the audit-log export (SEC-6).
 *
 * Mirrors the backend endpoint:
 *   GET /audit-logs/export -> CSV file (Blob)              (LEADER+)
 *
 * Unlike the JSON endpoints, the export is a binary/text blob the browser
 * downloads directly, so it cannot go through the shared `request()` helper
 * (which parses the body as JSON and unwraps `{ data }`). Instead it issues a
 * raw `fetch` against the same base URL with the same-origin session cookie and
 * throws an `ApiClientError` carrying the backend error envelope on failure —
 * the same error contract every other call uses, so `handleApiError` produces
 * consistent toast copy (401/403/500) at the call site.
 */

import { ApiClientError, API_BASE } from './client'

/**
 * `GET /audit-logs/export` — stream the audit log as a CSV blob (LEADER+ only).
 * The blob is handed back to the caller, which builds an object URL and triggers
 * a download. Non-2xx responses throw `ApiClientError` for unified error handling.
 */
export async function exportAuditLogs(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/audit-logs/export`, {
    method: 'GET',
    headers: { Accept: 'text/csv', 'X-Request-Id': crypto.randomUUID() },
    credentials: 'same-origin',
  })

  if (!res.ok) {
    throw await ApiClientError.fromResponse(res)
  }

  return res.blob()
}
