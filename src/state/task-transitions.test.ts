import { describe, expect, it } from 'vitest'
import { canTransitionTaskStatus } from './task-transitions'

describe('task state machine', () => {
  it('allows the supported execution lifecycle', () => {
    expect(canTransitionTaskStatus('pending', 'running')).toBe(true)
    expect(canTransitionTaskStatus('awaiting_approval', 'assigned')).toBe(true)
    expect(canTransitionTaskStatus('assigned', 'running')).toBe(true)
    expect(canTransitionTaskStatus('running', 'succeeded')).toBe(true)
    expect(canTransitionTaskStatus('failed', 'running')).toBe(true)
  })

  it('rejects terminal and out-of-order transitions', () => {
    expect(canTransitionTaskStatus('pending', 'succeeded')).toBe(false)
    expect(canTransitionTaskStatus('awaiting_approval', 'running')).toBe(false)
    expect(canTransitionTaskStatus('succeeded', 'running')).toBe(false)
    expect(canTransitionTaskStatus('cancelled', 'assigned')).toBe(false)
  })
})
