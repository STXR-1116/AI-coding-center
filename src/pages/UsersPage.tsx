import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UsersRound,
} from 'lucide-react'
import { ApiClientError } from '../api/client'
import { Button, StatusBadge } from '../components/ui'
import { PageHeader, SummaryStrip } from '../components/layout'
import { useAuditLogs } from '../queries/dashboard'
import { handleApiError } from '../queries/errors'
import { useUpdateUser, useUsers } from '../queries/users'
import { useApp } from '../state/useApp'
import { useToast } from '../state/useToast'
import type { AuditLogDto, UserDto } from '../types'
import '../resource-pages.css'

/** 后端 UserRole 枚举（大写）→ 展示名。 */
const roleLabels: Record<string, string> = {
  EMPLOYEE: '员工',
  LEADER: 'Leader',
  PM: 'PM',
  ADMIN: '管理员',
}
const roleOrder: string[] = ['EMPLOYEE', 'LEADER', 'PM', 'ADMIN']

/** 后端 UserStatus → AgentStatus 兼容 StatusBadge（复用现有徽章样式）。 */
function statusOf(status: string): 'idle' | 'offline' {
  return status === 'disabled' ? 'offline' : 'idle'
}
const statusLabel: Record<string, string> = {
  active: '已启用',
  disabled: '已停用',
}

function StatePanel({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="state-panel" role="status">
      <span className="state-panel-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
    </div>
  )
}

export function UsersPage() {
  const { notify } = useToast()
  const { user: currentUser } = useApp()
  const usersQuery = useUsers()
  const updateUserMutation = useUpdateUser()
  const auditQuery = useAuditLogs({ pageSize: 10 })

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | string>('all')

  const users: UserDto[] = usersQuery.data ?? []

  const filteredUsers = useMemo(() => {
    const text = query.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      return !text || `${u.username} ${u.displayName} ${u.email} ${u.role}`.toLowerCase().includes(text)
    })
  }, [users, query, roleFilter])

  const activeCount = users.filter((u) => u.status === 'active').length
  const disabledCount = users.length - activeCount
  const adminCount = users.filter((u) => u.role === 'ADMIN' || u.role === 'LEADER' || u.role === 'PM').length

  const auditLogs: AuditLogDto[] = auditQuery.data?.data ?? []

  // 真实写操作：PATCH /users/{id} → invalidate + toast（role/status 三选一）
  // 409 时 useUpdateUser 已刷新列表；此处用 handleApiError 走特判文案
  const patchUser = (id: string, patch: { role?: string } | { status?: string }, successMessage: string) => {
    updateUserMutation.mutate(
      { id, patch },
      {
        onSuccess: () => notify(successMessage, { tone: 'success' }),
        onError: (error) => {
          const conflict = (error instanceof ApiClientError)
            && (error.code === 'VERSION_CONFLICT' || error.code === 'STATE_CONFLICT')
          notify(handleApiError(error), {
            tone: conflict ? 'info' : 'error',
            title: conflict ? '数据已刷新' : '更新失败',
          })
        },
      },
    )
  }

  const handleRoleChange = (user: UserDto, nextRole: string) => {
    if (nextRole === user.role) return
    patchUser(user.id, { role: nextRole }, `已将「${user.displayName}」角色改为 ${roleLabels[nextRole] ?? nextRole}`)
  }

  const handleStatusToggle = (user: UserDto) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    patchUser(user.id, { status: nextStatus }, user.status === 'active' ? `已停用「${user.displayName}」` : `已启用「${user.displayName}」`)
  }

  return (
    <div className="users-page">
      <PageHeader title="用户管理" description="成员角色与启用状态——管理类角色可调整" />
      <SummaryStrip items={[
        { label: '成员总数', value: users.length, detail: '全量账号', icon: <UsersRound size={16} />, tone: 'blue' },
        { label: '已启用', value: activeCount, detail: '可登录账号', icon: <CheckCircle2 size={16} />, tone: 'green' },
        { label: '管理角色', value: adminCount, detail: 'Leader / PM / Admin', icon: <ShieldCheck size={16} />, tone: 'violet' },
        { label: '已停用', value: disabledCount, detail: '软删除账号', icon: <ShieldAlert size={16} />, tone: disabledCount ? 'red' : 'amber' },
      ]} />

      <section className="agents-main-panel" role="tabpanel" aria-label="用户列表">
        <header className="agents-toolbar">
          <div className="scope-tabs" role="tablist" aria-label="用户视图">
            <button className="is-active">成员 <b>{users.length}</b></button>
          </div>
          <div className="agents-tools">
            <label className="compact-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名、邮箱或角色" /></label>
            <label className="toolbar-select"><UserCog size={15} /><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">全部角色</option>{roleOrder.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select><ChevronDown size={13} /></label>
          </div>
        </header>

        <div className="agent-list" data-scroll-region="user-list">
          {usersQuery.isLoading ? <StatePanel icon={<LoaderCircle size={22} className="spin" />} title="正在加载用户列表" description="从后端拉取成员账号…" />
            : usersQuery.error ? <StatePanel icon={<AlertTriangle size={22} />} title="用户列表加载失败" description={(usersQuery.error as ApiClientError)?.message ?? '可能当前角色无用户管理能力。'} />
            : filteredUsers.length ? filteredUsers.map((user) => {
              const isSelf = currentUser.id === user.id
              return (
                <div key={user.id} className={isSelf ? 'agent-row is-active' : 'agent-row'}>
                  <span className="mini-avatar"><UsersRound size={16} /></span>
                  <span className="agent-row-identity">
                    <strong>{user.displayName}{isSelf ? '（你）' : ''}</strong>
                    <small>{user.username} · {user.email}</small>
                  </span>
                  <span className="agent-current-task">
                    <small>角色</small>
                    <label className="toolbar-select" title={isSelf ? '不能修改自己' : undefined}>
                      <select
                        value={user.role}
                        disabled={isSelf}
                        aria-label={`${user.displayName} 角色`}
                        onChange={(event) => handleRoleChange(user, event.target.value)}
                      >
                        {roleOrder.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                      </select>
                    </label>
                  </span>
                  <span className="agent-token-cell">
                    <small>状态</small>
                    <StatusBadge status={statusOf(user.status)} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{statusLabel[user.status] ?? user.status}</span>
                  </span>
                  <Button
                    variant={user.status === 'active' ? 'ghost' : 'primary'}
                    size="sm"
                    disabled={isSelf}
                    title={isSelf ? '不能修改自己' : undefined}
                    onClick={() => handleStatusToggle(user)}
                  >
                    {user.status === 'active' ? '停用' : '启用'}
                  </Button>
                </div>
              )
            }) : <div className="empty-state"><span className="empty-state-icon"><UsersRound size={23} /></span><h3>没有匹配的用户</h3><p>调整角色或搜索条件后再试。</p></div>}
        </div>
      </section>

      <section className="audit-panel analytics-audit-panel" role="tabpanel" aria-label="审计追踪" style={{ marginTop: 24 }}>
        <header className="analytics-panel-header audit-panel-heading">
          <div><span className="panel-icon"><ShieldCheck size={17} /></span><span><strong>最近审计</strong><small>最近 10 条操作记录</small></span></div>
        </header>
        <div className="audit-table-wrap" data-scroll-region="users-audit-table">
          {auditQuery.isLoading ? <StatePanel icon={<LoaderCircle size={20} className="spin" />} title="正在加载审计日志" description="从后端拉取最近操作记录…" />
            : auditQuery.error ? <StatePanel icon={<AlertTriangle size={20} />} title="审计日志加载失败" description={(auditQuery.error as ApiClientError)?.message ?? '可能当前角色无 audit:read 能力。'} />
            : auditLogs.length ? (
          <table className="audit-table">
            <thead><tr><th>时间</th><th>操作主体</th><th>动作</th><th>对象</th></tr></thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td><Clock3 size={13} />{log.createdAt}</td>
                  <td><span className={`audit-actor audit-actor-${log.actorType}`}>{log.actorType === 'user' ? <UsersRound size={13} /> : <UserCog size={13} />}</span><span><strong>{log.actorId}</strong><small>{log.actorType}</small></span></td>
                  <td><code>{log.action}</code></td>
                  <td><strong>{log.entityId}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
            ) : <div className="audit-empty"><Clock3 size={20} /><strong>暂无审计记录</strong><span>近期没有可读的操作日志。</span></div>}
        </div>
      </section>
    </div>
  )
}

export default UsersPage
