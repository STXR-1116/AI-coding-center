import type { TaskEvent, TaskStatus } from '../types'

const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  pending: ['assigned', 'running', 'cancelled'],
  assigned: ['running', 'cancelled'],
  awaiting_approval: ['assigned', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  failed: ['assigned', 'running', 'cancelled'],
  succeeded: [],
  cancelled: [],
}

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus) {
  return allowedTransitions[from].includes(to)
}

const eventCopy: Record<TaskStatus, Pick<TaskEvent, 'type' | 'title' | 'description'>> = {
  pending: {
    type: 'created',
    title: '任务进入待处理队列',
    description: '等待负责人确认范围并分配执行资源。',
  },
  assigned: {
    type: 'assigned',
    title: '执行资源已分配',
    description: 'Agent 已接收任务，等待开始执行。',
  },
  awaiting_approval: {
    type: 'approval',
    title: '等待人工审批',
    description: '高影响操作需要负责人确认后继续。',
  },
  running: {
    type: 'started',
    title: '任务开始执行',
    description: 'Agent 已加载项目上下文并进入执行阶段。',
  },
  succeeded: {
    type: 'completed',
    title: '任务执行完成',
    description: '产出已生成，可进入结果检查与变更审查。',
  },
  failed: {
    type: 'failed',
    title: '任务执行失败',
    description: '执行被中断，请检查事件详情后重试。',
  },
  cancelled: {
    type: 'cancelled',
    title: '任务已取消',
    description: '任务已停止，未完成的执行资源已释放。',
  },
}

export function createTaskEvent(status: TaskStatus, createdAt = '刚刚'): TaskEvent {
  return {
    id: crypto.randomUUID(),
    ...eventCopy[status],
    createdAt,
  }
}
