import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { useRequirements } from '../queries/requirements'
import { useCreateTask } from '../queries/tasks'
import { handleApiError } from '../queries/errors'
import { useToast } from '../state/useToast'
import { Button, Dialog } from './ui'

export function CreateTaskDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { data: reqsData, isLoading: reqsLoading } = useRequirements()
  const createMutation = useCreateTask()
  const { notify } = useToast()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [requirementId, setRequirementId] = useState('')

  // useRequirements 经 select 解包为 RequirementDto[]；加载中/失败兜底空数组。
  const requirements = reqsData ?? []

  // 默认选中第一个需求，使下拉在加载完成后立刻有值可提交。
  // M2（审查修复）：重开对话框时校验残留值仍存在于列表，否则重置为首个——防止提交失效 requirementId。
  useEffect(() => {
    if (open && requirements.length) {
      setRequirementId((current) =>
        current && requirements.some((r) => r.id === current)
          ? current
          : requirements[0].id,
      )
    }
  }, [open, requirements])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !requirementId) return
    try {
      const task = await createMutation.mutateAsync({
        requirementId,
        title: title.trim(),
        spec: summary.trim() || undefined,
      })
      notify(`任务已创建：${task.id}`, { title: '任务已创建' })
      setTitle('')
      setSummary('')
      // M3（审查修复）：重置 requirementId——避免重开对话框残留上次选择
      setRequirementId('')
      onCreated?.(task.id)
      onClose()
    } catch (error) {
      notify(handleApiError(error), { tone: 'error' })
    }
  }

  // 需求未加载完或没有任何需求时禁用提交——避免向无 requirementId 的请求落库。
  // M1（审查修复）：isPending 期间禁用提交按钮，防止双击并发创建两条任务。
  const canSubmit =
    !!requirementId && !reqsLoading && requirements.length > 0 && !createMutation.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="新建任务"
      description="选择需求并建立执行单元，提交后关联需求进入任务队列。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" type="submit" form="create-task-form" icon={<Check size={16} />} disabled={!canSubmit}>创建任务</Button>
        </>
      }
    >
      <form id="create-task-form" className="form-grid" onSubmit={submit}>
        <label className="field field-span-2">
          <span>关联需求</span>
          <select
            value={requirementId}
            onChange={(event) => setRequirementId(event.target.value)}
            disabled={reqsLoading || requirements.length === 0}
            required
          >
            {reqsLoading && <option value="">加载需求中…</option>}
            {!reqsLoading && requirements.length === 0 && <option value="">暂无可用需求</option>}
            {requirements.map((requirement) => (
              <option key={requirement.id} value={requirement.id}>{requirement.title}</option>
            ))}
          </select>
        </label>
        <label className="field field-span-2">
          <span>任务标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：接入任务流式进度事件" autoFocus required />
        </label>
        <label className="field field-span-2">
          <span>任务说明</span>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="写清目标、约束和验收条件（可选）" rows={4} />
        </label>
      </form>
    </Dialog>
  )
}
