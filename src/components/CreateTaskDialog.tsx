import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { useApp } from '../state/useApp'
import { useToast } from '../state/useToast'
import type { ExecutionMode, Priority } from '../types'
import { Button, Dialog } from './ui'

export function CreateTaskDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { projects, activeProjectId, addTask } = useApp()
  const { notify } = useToast()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [projectId, setProjectId] = useState(activeProjectId)
  const [priority, setPriority] = useState<Priority>('medium')
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto')

  useEffect(() => {
    if (open) setProjectId(activeProjectId)
  }, [activeProjectId, open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !summary.trim()) return
    const task = addTask({ title: title.trim(), summary: summary.trim(), projectId, priority, executionMode })
    notify(`${task.id} 已加入任务队列。`, { title: '任务已创建' })
    setTitle('')
    setSummary('')
    onCreated?.(task.id)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="新建任务"
      description="直接建立执行单元，后端接入后可关联需求、Agent 或小队。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" type="submit" form="create-task-form" icon={<Check size={16} />}>创建任务</Button>
        </>
      }
    >
      <form id="create-task-form" className="form-grid" onSubmit={submit}>
        <label className="field field-span-2">
          <span>任务标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：接入任务流式进度事件" autoFocus required />
        </label>
        <label className="field field-span-2">
          <span>任务说明</span>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="写清目标、约束和验收条件" rows={4} required />
        </label>
        <label className="field">
          <span>关联项目</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>优先级</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </select>
        </label>
        <fieldset className="field field-span-2">
          <legend>执行模式</legend>
          <div className="segmented-control segmented-control-wide">
            {([
              ['manual', '手动', '执行前必须审批'],
              ['auto', '自动', '高危动作仍审批'],
              ['full', '全权', '完全自主执行'],
            ] as const).map(([value, label, description]) => (
              <button key={value} type="button" className={executionMode === value ? 'is-active' : ''} onClick={() => setExecutionMode(value)}>
                <strong>{label}</strong>
                <small>{description}</small>
              </button>
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  )
}
