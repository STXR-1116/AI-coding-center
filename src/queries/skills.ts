/**
 * React Query hooks for the skill data layer (P2-2b).
 *
 * These hooks wrap the `src/api/skills` functions and own cache invalidation.
 * The UI (SkillsPage) consumes them; this module touches no UI. Mutations
 * invalidate both the list and the affected detail entry so the cache stays
 * consistent after a write — same strategy as `queries/agents`.
 *
 * `useSkill` is gated on a non-empty id (the backend would 404 on an empty
 * path segment), and the disabled-state key goes through the factory so it
 * never lands inside the `detail` prefix tree and gets caught by a prefix
 * invalidate.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  bindAgent,
  createSkill,
  deprecateSkill,
  fetchSkill,
  listSkills,
  reactivateSkill,
  unbindAgent,
  updateSkillManifest,
} from '../api/skills'
import type { CreateSkillInput, UpdateSkillManifestPatch } from '../types'

/**
 * Query-key factory for skills. Centralized so mutations can invalidate the
 * exact list/detail entries without re-deriving key shapes.
 */
export const skillsKeys = {
  all: ['skills'] as const,
  lists: () => [...skillsKeys.all, 'list'] as const,
  list: () => [...skillsKeys.lists(), {}] as const,
  details: () => [...skillsKeys.all, 'detail'] as const,
  detail: (id: string) => [...skillsKeys.details(), id] as const,
}

/** List skills — select unwraps the `{ data }` envelope for the UI. */
export function useSkills() {
  return useQuery({
    queryKey: skillsKeys.list(),
    queryFn: () => listSkills(),
    select: (res) => res.data,
  })
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    // 禁用态 key 走工厂（避免字面量落入 detail 前缀树被前缀 invalidate 误伤）
    queryKey: skillsKeys.detail(id ?? '__disabled__'),
    queryFn: () => fetchSkill(id as string),
    enabled: !!id,
  })
}

/** Create a new skill. On success invalidate the list so the new entry appears. */
export function useCreateSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSkillInput) => createSkill(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.lists() })
    },
  })
}

/** Update a skill's manifest (bumps patch version). On success invalidate list + detail. */
export function useUpdateSkillManifest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateSkillManifestPatch }) =>
      updateSkillManifest(vars.id, vars.patch),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: skillsKeys.detail(vars.id) })
    },
  })
}

/** Deprecate a skill. On success invalidate list + detail. */
export function useDeprecateSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deprecateSkill(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: skillsKeys.detail(id) })
    },
  })
}

/** Reactivate a deprecated skill. On success invalidate list + detail. */
export function useReactivateSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reactivateSkill(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: skillsKeys.detail(id) })
    },
  })
}

/** Bind an agent to a skill. On success invalidate list + detail. */
export function useBindSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { skillId: string; agentId: string }) =>
      bindAgent(vars.skillId, vars.agentId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: skillsKeys.detail(vars.skillId) })
    },
  })
}

/** Unbind an agent from a skill. On success invalidate list + detail. */
export function useUnbindSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { skillId: string; agentId: string }) =>
      unbindAgent(vars.skillId, vars.agentId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: skillsKeys.detail(vars.skillId) })
    },
  })
}
