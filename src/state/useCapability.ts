import { useApp } from './useApp'

/**
 * 权限判断 hook —— 按钮显隐/禁用统一由后端返回的 capabilities 驱动
 * （README 契约：前端不得仅根据 role 推导权限）。
 *
 * @example
 *   const canExecute = useCapability('task:execute')
 *   {canExecute ? <Button>执行</Button> : null}
 */
export function useCapability(cap: string): boolean {
  const { auth } = useApp()
  return auth.capabilities.includes(cap)
}
