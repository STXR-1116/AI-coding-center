/**
 * Conversation data-layer API functions (P1-3b).
 *
 * All endpoints live under `/conversations` and reuse the shared client
 * (`get`/`post`/`del`), which unwraps the backend `{ data }` envelope and
 * throws `ApiClientError` on non-2xx. The streaming endpoint
 * `/api/chat/stream` is handled separately in `./stream` because it returns
 * NDJSON, not a single JSON body — `sendMessage` here is the non-streaming
 * fallback for callers that don't need token-by-token delivery.
 *
 * Backend contract (P1-3a):
 *   GET    /conversations                              -> { data, page }
 *   POST   /conversations   { title?, repositoryId? }  -> ConversationDto
 *   GET    /conversations/{id}                         -> ConversationDetailDto
 *   DELETE /conversations/{id}                         -> 204
 *   POST   /conversations/{id}/messages  { content }   -> { userMessage, assistantMessage }
 */

import { del, get, post } from './client'
import type {
  ConversationDetailDto,
  ConversationDto,
  ConversationListResponse,
  SendMessageResponse,
} from '../types'

export interface CreateConversationInput {
  title?: string
  repositoryId?: string | null
}

export function listConversations(): Promise<ConversationListResponse> {
  // 列表响应 { data:[...], page:{...} } 需完整 envelope → unwrap:false
  return get<ConversationListResponse>('/conversations', { unwrap: false })
}

export function createConversation(
  input: CreateConversationInput,
): Promise<ConversationDto> {
  return post<ConversationDto>('/conversations', input, { idempotent: true })
}

export function fetchConversation(id: string): Promise<ConversationDetailDto> {
  return get<ConversationDetailDto>(`/conversations/${encodeURIComponent(id)}`)
}

export function deleteConversation(id: string): Promise<void> {
  return del<void>(`/conversations/${encodeURIComponent(id)}`)
}

/**
 * Non-streaming message send — the server replies once the assistant has fully
 * generated its response. For token-by-token delivery use `streamChat` from
 * `./stream` instead; this is the fallback when streaming is unavailable or
 * unwanted (e.g. retries, headless calls).
 */
export function sendMessage(
  id: string,
  content: string,
): Promise<SendMessageResponse> {
  return post<SendMessageResponse>(
    `/conversations/${encodeURIComponent(id)}/messages`,
    { content },
    { idempotent: true },
  )
}
