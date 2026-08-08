import { describe, expect, it } from 'vitest'
import { ApiClientError } from '../api/client'
import { handleApiError, parseApiError } from './errors'

describe('parseApiError', () => {
  it('ApiClientError → 结构化信息（message/code/retryable）', () => {
    const err = new ApiClientError({ status: 409, code: 'STATE_CONFLICT', message: '状态冲突', requestId: 'r1', retryable: false })
    expect(parseApiError(err)).toEqual({ message: '状态冲突', code: 'STATE_CONFLICT', retryable: false })
  })

  it('非 ApiClientError → 通用兜底', () => {
    expect(parseApiError(new Error('boom'))).toEqual({ message: '操作失败' })
    expect(parseApiError(undefined)).toEqual({ message: '操作失败' })
  })
})

describe('handleApiError 特判文案（P3-2）', () => {
  it('401 → 登录过期提示', () => {
    const err = new ApiClientError({ status: 401, code: 'UNAUTHENTICATED', message: '未登录', requestId: 'r', retryable: false })
    expect(handleApiError(err)).toContain('登录已过期')
  })

  it('403 → 权限不足提示', () => {
    const err = new ApiClientError({ status: 403, code: 'FORBIDDEN', message: '无权限', requestId: 'r', retryable: false })
    expect(handleApiError(err)).toContain('没有执行此操作的权限')
  })

  it('409 → 数据变化提示', () => {
    const err = new ApiClientError({ status: 409, code: 'VERSION_CONFLICT', message: '版本冲突', requestId: 'r', retryable: false })
    expect(handleApiError(err)).toContain('刷新')
  })

  it('STATE_CONFLICT → 透传后端 message（不误判为"被他人修改"——H1 回归）', () => {
    const err = new ApiClientError({ status: 409, code: 'STATE_CONFLICT', message: '任务已存在', requestId: 'r', retryable: false })
    expect(handleApiError(err)).toBe('任务已存在')
  })

  it('其他 code → 透传后端 message', () => {
    const err = new ApiClientError({ status: 400, code: 'VALIDATION_ERROR', message: '标题不能为空', requestId: 'r', retryable: false })
    expect(handleApiError(err)).toBe('标题不能为空')
  })
})
