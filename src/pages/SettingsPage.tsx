import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Database,
  Gauge,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Network,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  Zap,
} from 'lucide-react'
import { Button, Dialog, ProgressBar } from '../components/ui'
import { useApp } from '../state/useApp'
import { useCapability } from '../state/useCapability'
import { useToast } from '../state/useToast'
import {
  useTokenBudgetConfig,
  useUpdateTokenBudgetConfig,
  usePlatformConfig,
  useUpdatePlatformConfig,
  VersionConflictError,
} from '../queries/config'
import { useModules, useSetModuleToggle } from '../queries/modules'
import { handleApiError } from '../queries/errors'
import { ApiClientError } from '../api/client'
import type { ExecutionMode, ModuleSetting, TokenBudgetConfig, PlatformConfig } from '../types'
import '../secondary-pages.css'

type SettingsTab = 'modules' | 'runtime' | 'security' | 'notifications'

/**
 * Fallback platform config shown before the REST value arrives (and as the
 * `saved` baseline for dirty-checking). Real values come from
 * `usePlatformConfig`; this only shapes the first paint so inputs are never
 * empty. The `version` starts at 0 — the server's real version replaces it on
 * load and again after every successful save.
 */
const defaultConfig: PlatformConfig = {
  defaultExecutionMode: 'auto',
  monthlyTokenBudget: 1_200_000,
  singleTaskTokenLimit: 32_000,
  budgetWarningThreshold: 80,
  staleAfterMinutes: 5,
  reclaimAfterMinutes: 15,
  cloudFallback: true,
  sandboxScripts: true,
  credentialRotationDays: 90,
  auditRetentionDays: 180,
  backupEnabled: true,
  backupHour: '02:30',
  notifyTaskFailure: true,
  notifyBudgetWarning: true,
  notifyAgentStale: true,
  dailyDigest: false,
  email: 'brandon@codingcenter.local',
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  version: 0,
}

/**
 * Fallback Token-budget config shown before the REST value arrives (and as the
 * `saved` baseline for dirty-checking). Real values come from
 * `useTokenBudgetConfig`; this only shapes the first paint so inputs are never
 * empty. The `version` starts at 0 — the server's real version replaces it on
 * load and again after every successful save.
 */
const DEFAULT_TOKEN_BUDGET: TokenBudgetConfig = {
  base: 24_000,
  per100Chars: 800,
  min: 8_000,
  max: 200_000,
  version: 0,
}

const moduleImpact: Record<string, string> = {
  task_dispatch: '停止新任务分发、执行触发和状态回写，运行中的任务不强制终止。',
  agents: '隐藏 Agent 配置入口，暂停运行时注册与心跳状态更新。',
  repositories: '关闭仓库上下文、文件预览、提交记录和变更审查接口。',
  knowledge: '任务上下文不再注入知识库，Agent 将跳过 MCP 检索。',
  skills: '隐藏技能目录，任务分发时不再注入 Skill 能力包。',
  accounts: '阻止账号、角色和访问令牌配置，现有登录会话保持有效。',
  dashboard: '停止指标聚合查询并隐藏可观测中心入口，审计写入仍继续。',
}

const tabItems: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'modules', label: '模块开关', icon: <Settings2 size={16} /> },
  { id: 'runtime', label: '运行与预算', icon: <Gauge size={16} /> },
  { id: 'security', label: '安全与备份', icon: <ShieldCheck size={16} /> },
  { id: 'notifications', label: '通知策略', icon: <Bell size={16} /> },
]

function ModuleIcon({ id }: { id: string }) {
  if (id === 'task_dispatch') return <Zap size={19} />
  if (id === 'agents') return <Bot size={19} />
  if (id === 'repositories') return <GitBranch size={19} />
  if (id === 'knowledge') return <Database size={19} />
  if (id === 'skills') return <Boxes size={19} />
  if (id === 'accounts') return <UsersRound size={19} />
  return <LayoutDashboard size={19} />
}

function SettingSwitch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? 'toggle-switch is-on' : 'toggle-switch'}
      disabled={disabled}
      onClick={onChange}
    ><span /></button>
  )
}

function SettingSection({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="setting-section">
      <header className="setting-section-header"><span>{icon}</span><div><h2>{title}</h2><p>{description}</p></div></header>
      <div className="setting-section-body">{children}</div>
    </section>
  )
}

function SettingRow({ icon, title, description, control }: { icon: ReactNode; title: string; description: string; control: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-row-icon">{icon}</span>
      <div className="setting-row-copy"><strong>{title}</strong><p>{description}</p></div>
      <div className="setting-row-control">{control}</div>
    </div>
  )
}

export function SettingsPage() {
  const { user, tasks } = useApp()
  const { notify } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>('modules')
  const [moduleQuery, setModuleQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | ModuleSetting['risk']>('all')
  const [pendingModuleId, setPendingModuleId] = useState<string | null>(null)
  const [config, setConfig] = useState(defaultConfig)
  const [savedConfig, setSavedConfig] = useState(defaultConfig)
  const [savedNotice, setSavedNotice] = useState(false)
  // P3-4b：模块开关走 REST（useModules——select 已桥接为 ModuleSetting）
  const modulesQuery = useModules()
  const moduleToggleMutation = useSetModuleToggle()
  const moduleSettings = modulesQuery.data ?? []

  // 运行与预算 tab：Token 预算走版本化 REST（GET /config/token-budget）。
  // budgetForm 是本地编辑态；budgetSaved 是上次保存后的基线（dirty 判定）。
  const budgetQuery = useTokenBudgetConfig()
  const updateBudgetMutation = useUpdateTokenBudgetConfig()
  const [budgetForm, setBudgetForm] = useState<TokenBudgetConfig>(DEFAULT_TOKEN_BUDGET)
  const [budgetSaved, setBudgetSaved] = useState<TokenBudgetConfig>(DEFAULT_TOKEN_BUDGET)

  // 首次拿到服务端配置后，把表单与基线都对齐到最新值（version 含乐观锁令牌）。
  useEffect(() => {
    if (budgetQuery.data) {
      setBudgetForm(budgetQuery.data)
      setBudgetSaved(budgetQuery.data)
    }
  }, [budgetQuery.data])

  // 平台参数 tab（运行 / 安全 / 通知）：走版本化 REST（GET/PUT /config/platform）。
  // config 是本地编辑态；savedConfig 是上次保存后的基线（dirty 判定）。后端存整块
  // JSON，version 做乐观锁；defaultConfig 仅在首屏服务端值到达前兜底，避免输入空白。
  const platformQuery = usePlatformConfig()
  const updatePlatformMutation = useUpdatePlatformConfig()

  // 首次拿到服务端配置后，把表单与基线都对齐到最新值（version 含乐观锁令牌）。
  useEffect(() => {
    if (platformQuery.data) {
      setConfig(platformQuery.data)
      setSavedConfig(platformQuery.data)
    }
  }, [platformQuery.data])

  const canManageModules = useCapability('module:toggle')
  const enabledCount = moduleSettings.filter((setting) => setting.enabled).length
  const coreDisabled = moduleSettings.filter((setting) => setting.risk === 'core' && !setting.enabled)
  const pendingModule = moduleSettings.find((setting) => setting.id === pendingModuleId)
  const configDirty = JSON.stringify(config) !== JSON.stringify(savedConfig)
  const currentTokenUsage = tasks.reduce((total, task) => total + task.tokenUsed, 0)
  // 预算进度：当前样例用量 vs 任务估算上限（max——后端 token-budget 契约字段）
  const monthlyBudgetUsage = Math.min(100, currentTokenUsage / budgetForm.max * 100)

  const filteredModules = useMemo(() => {
    const text = moduleQuery.trim().toLowerCase()
    return moduleSettings.filter((setting) => {
      if (riskFilter !== 'all' && setting.risk !== riskFilter) return false
      return !text || `${setting.label} ${setting.description} ${moduleImpact[setting.id] ?? ''}`.toLowerCase().includes(text)
    })
  }, [moduleQuery, moduleSettings, riskFilter])

  const updateConfig = <Key extends keyof PlatformConfig>(key: Key, value: PlatformConfig[Key]) => {
    setConfig((current) => ({ ...current, [key]: value }))
    setSavedNotice(false)
  }

  const requestModuleToggle = (setting: ModuleSetting) => {
    if (!canManageModules) return
    if (setting.risk === 'core') setPendingModuleId(setting.id)
    else {
      moduleToggleMutation.mutate(
        { key: setting.id, enabled: !setting.enabled },
        {
          onSuccess: () => {
            notify(`${setting.label}已${setting.enabled ? '停用' : '启用'}，导航与直接访问权限已同步。`, {
              title: '模块状态已更新',
              tone: setting.enabled ? 'warning' : 'success',
            })
          },
          onError: (error) => {
            // M1（审查修复）：失败纠错——不再乐观假成功
            notify(handleApiError(error), { title: '模块状态更新失败', tone: 'error' })
          },
        },
      )
    }
  }

  const confirmModuleToggle = () => {
    if (!pendingModule) return
    moduleToggleMutation.mutate(
      { key: pendingModule.id, enabled: !pendingModule.enabled },
      {
        onSuccess: () => {
          notify(`${pendingModule.label}已${pendingModule.enabled ? '停用' : '启用'}，相关入口与工作流已同步。`, {
            title: '核心模块已更新',
            tone: pendingModule.enabled ? 'warning' : 'success',
          })
        },
        onError: (error) => {
          notify(handleApiError(error), { title: '核心模块更新失败', tone: 'error' })
        },
      },
    )
    setPendingModuleId(null)
  }

  // 保存平台参数：PUT /config/platform（带 version 乐观锁，整块 JSON）。
  // 成功 → toast + 用返回的递增 version 同步基线；409 → mutation 已重拉最新值，
  // 这里把表单/基线对齐到 latest 并提示"已被他人修改"；其他错误 → 错误 toast。
  const saveConfig = () => {
    updatePlatformMutation.mutate(config, {
      onSuccess: (data) => {
        setConfig(data)
        setSavedConfig(data)
        setSavedNotice(true)
        notify('平台参数已保存，立即生效并写入配置审计。', { title: '配置已保存', tone: 'success' })
      },
      onError: (error) => {
        if (error instanceof VersionConflictError) {
          setConfig(error.latest)
          setSavedConfig(error.latest)
          setSavedNotice(false)
          notify('配置已被他人修改，已刷新最新值，请确认后再次保存。', {
            title: '版本冲突',
            tone: 'info',
          })
          return
        }
        notify(
          error instanceof ApiClientError ? error.message : '保存失败，请稍后重试。',
          { title: '保存失败', tone: 'error' },
        )
      },
    })
  }

  const resetConfig = () => {
    setConfig(savedConfig)
    setSavedNotice(false)
  }

  // Token 预算表单字段更新（数字字段做 Number 归一）。改任意字段即清除保存提示。
  const updateBudget = <Key extends keyof TokenBudgetConfig>(key: Key, value: TokenBudgetConfig[Key]) => {
    setBudgetForm((current) => ({ ...current, [key]: value }))
    setSavedNotice(false)
  }

  const budgetDirty = JSON.stringify(budgetForm) !== JSON.stringify(budgetSaved)

  // 保存 Token 预算：PUT /config/token-budget（带 version 乐观锁）。
  // 成功 → toast + 用返回的递增 version 同步基线；409 → mutation 已重拉最新值，
  // 这里把表单/基线对齐到 latest 并提示"已被他人修改"；其他错误 → 错误 toast。
  const saveBudget = () => {
    updateBudgetMutation.mutate(budgetForm, {
      onSuccess: (data) => {
        setBudgetForm(data)
        setBudgetSaved(data)
        setSavedNotice(true)
        notify('Token 预算配置已保存，立即生效。', { title: '配置已保存', tone: 'success' })
      },
      onError: (error) => {
        if (error instanceof VersionConflictError) {
          setBudgetForm(error.latest)
          setBudgetSaved(error.latest)
          setSavedNotice(false)
          notify('配置已被他人修改，已刷新最新值，请确认后再次保存。', {
            title: '版本冲突',
            tone: 'info',
          })
          return
        }
        notify(
          error instanceof ApiClientError ? error.message : '保存失败，请稍后重试。',
          { title: '保存失败', tone: 'error' },
        )
      },
    })
  }

  const resetBudget = () => {
    setBudgetForm(budgetSaved)
    setSavedNotice(false)
  }

  return (
    <div className="settings-page secondary-page settings-redesign">
      <header className="secondary-page-header settings-page-header">
        <div className="secondary-page-heading">
          <span className="secondary-page-kicker"><Settings2 size={14} />平台治理</span>
          <h2>设置中心</h2>
          <p>集中管理模块权限、运行预算、安全策略与通知触达。</p>
        </div>
        <section className="settings-access-banner">
          <span className="settings-access-icon"><LockKeyhole size={20} /></span>
          <div><strong>平台配置权限</strong><p>当前身份：{user.title}。模块变更即时生效，并记录操作者与影响范围。</p></div>
          <span className={canManageModules ? 'settings-permission is-allowed' : 'settings-permission'}>{canManageModules ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{canManageModules ? '可管理' : '只读'}</span>
        </section>
      </header>

      <section className="settings-summary-strip" aria-label="配置摘要">
        <div><span>模块启用</span><strong>{enabledCount}<small> / {moduleSettings.length}</small></strong><p>{coreDisabled.length ? `${coreDisabled.length} 个核心模块受限` : '核心能力运行正常'}</p></div>
        <div><span>当前样例 Token</span><strong>{currentTokenUsage.toLocaleString()}</strong><p>月度预算 {monthlyBudgetUsage.toFixed(1)}% 已使用</p></div>
        <div><span>身份权限</span><strong>{canManageModules ? '可管理' : '只读'}</strong><p>{user.title} · 变更写入审计</p></div>
      </section>

      <div className="settings-layout settings-workbench-redesign" data-layout-region="workbench">
        <nav className="settings-nav settings-sidebar" data-layout-region="inspector" aria-label="设置分类" role="tablist" aria-orientation="vertical">
          {tabItems.map((tab) => <button key={tab.id} id={`settings-tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id} aria-controls={`settings-panel-${tab.id}`} type="button" className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.icon}<span>{tab.label}</span></button>)}
          <div className="settings-nav-status">
            <span>配置状态</span>
            <strong>{enabledCount} / {moduleSettings.length} 模块启用</strong>
            <ProgressBar value={enabledCount / moduleSettings.length * 100} warning={coreDisabled.length > 0} />
            <small>{coreDisabled.length ? `${coreDisabled.length} 个核心模块已关闭` : '核心能力运行正常'}</small>
          </div>
        </nav>

        <main className="settings-content settings-main-panel" data-layout-region="main">
          {activeTab === 'modules' ? (
            <div className="module-settings-view settings-view-panel" id="settings-panel-modules" role="tabpanel" aria-labelledby="settings-tab-modules" tabIndex={0} data-scroll-region="settings-modules">
              <header className="settings-view-header">
                <div><h1>模块开关</h1><p>控制平台七项能力。开关保存后立即生效，无需重启服务。</p></div>
                <span className="settings-live-badge"><Sparkles size={14} />即时生效</span>
              </header>

              {coreDisabled.length ? <div className="settings-warning-banner"><AlertTriangle size={18} /><span><strong>核心能力受限</strong><p>{coreDisabled.map((setting) => setting.label).join('、')}已关闭，相关工作流可能无法继续。</p></span></div> : null}

              <div className="module-filterbar">
                <label className="compact-search"><Search size={15} /><input value={moduleQuery} onChange={(event) => setModuleQuery(event.target.value)} placeholder="搜索模块或影响范围" /></label>
                <label className="toolbar-select"><ShieldCheck size={14} /><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as 'all' | ModuleSetting['risk'])} aria-label="按风险筛选"><option value="all">全部风险</option><option value="core">核心模块</option><option value="normal">普通模块</option></select><ChevronDown size={13} /></label>
              </div>

              <div className="module-setting-list">
                {filteredModules.map((setting) => (
                  <article key={setting.id} className={setting.enabled ? 'module-setting-row is-enabled' : 'module-setting-row is-disabled'}>
                    <span className="module-setting-icon"><ModuleIcon id={setting.id} /></span>
                    <div className="module-setting-main">
                      <div><h2>{setting.label}</h2><span className={`module-risk module-risk-${setting.risk}`}>{setting.risk === 'core' ? <LockKeyhole size={12} /> : <ShieldCheck size={12} />}{setting.risk === 'core' ? '核心' : '普通'}</span></div>
                      <p>{setting.description}</p>
                      <small>{moduleImpact[setting.id]}</small>
                    </div>
                    <div className="module-setting-state"><strong>{setting.enabled ? '已启用' : '已禁用'}</strong><span>{setting.enabled ? '接口与入口正常' : '接口返回 423 Locked'}</span></div>
                    <SettingSwitch checked={setting.enabled} disabled={!canManageModules} label={`${setting.enabled ? '禁用' : '启用'}${setting.label}`} onChange={() => requestModuleToggle(setting)} />
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'runtime' ? (
            <div className="settings-config-view settings-view-panel" id="settings-panel-runtime" role="tabpanel" aria-labelledby="settings-tab-runtime" tabIndex={0} data-scroll-region="settings-runtime">
              <header className="settings-view-header"><div><h1>运行与预算</h1><p>定义任务默认执行方式、Token 限额和运行时恢复策略。</p></div></header>

              <SettingSection title="执行策略" description="新任务使用的默认行为，可在单个任务中覆盖。" icon={<Zap size={18} />}>
                <SettingRow icon={<SlidersHorizontal size={17} />} title="默认执行模式" description="手动需要逐次批准，自动按策略执行，全权允许连续推进。" control={<div className="segmented-control settings-segmented">{([{ value: 'manual', label: '手动' }, { value: 'auto', label: '自动' }, { value: 'full', label: '全权' }] as { value: ExecutionMode; label: string }[]).map((mode) => <button key={mode.value} className={config.defaultExecutionMode === mode.value ? 'is-active' : ''} onClick={() => updateConfig('defaultExecutionMode', mode.value)}>{mode.label}</button>)}</div>} />
                <SettingRow icon={<Network size={17} />} title="云端故障转移" description="本地 Connector 不可用时，允许任务切换到云端运行时。" control={<SettingSwitch checked={config.cloudFallback} label="切换云端故障转移" onChange={() => updateConfig('cloudFallback', !config.cloudFallback)} />} />
                <SettingRow icon={<RefreshCw size={17} />} title="失联与回收" description="先标记 Agent stale，再在观察窗口结束后回收任务。" control={<div className="setting-inline-fields"><label><span>失联</span><input type="number" min="1" max="60" value={config.staleAfterMinutes} onChange={(event) => updateConfig('staleAfterMinutes', Number(event.target.value))} /><small>分钟</small></label><label><span>回收</span><input type="number" min="2" max="120" value={config.reclaimAfterMinutes} onChange={(event) => updateConfig('reclaimAfterMinutes', Number(event.target.value))} /><small>分钟</small></label></div>} />
              </SettingSection>

              <SettingSection title="Token 预算" description="预算在任务分配时预扣，未使用部分在结束后退回。" icon={<CircleDollarSign size={18} />}>
                {budgetQuery.isLoading ? (
                  <div className="settings-loading-state"><LoaderCircle size={20} /><span>正在加载预算配置…</span></div>
                ) : budgetQuery.error ? (
                  <div className="settings-error-state"><AlertTriangle size={18} /><div><strong>预算配置加载失败</strong><p>{(budgetQuery.error as ApiClientError)?.message ?? '请稍后重试或检查登录状态。'}</p></div><Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => { void budgetQuery.refetch() }}>重试</Button></div>
                ) : (
                  <>
                    <div className="budget-overview"><div><span>当前样例用量</span><strong>{currentTokenUsage.toLocaleString()} <small>/ {budgetForm.max.toLocaleString()}</small></strong></div><span>{monthlyBudgetUsage.toFixed(1)}%</span><ProgressBar value={monthlyBudgetUsage} warning={monthlyBudgetUsage >= 90} /></div>
                    <SettingRow icon={<SlidersHorizontal size={17} />} title="任务估算模型" description="按 base + 每 100 字符增量估算单任务预算，并限制在 min/max 区间内。" control={<div className="setting-inline-fields"><label><span>基础</span><input type="number" min="0" step="1000" value={budgetForm.base} onChange={(event) => updateBudget('base', Number(event.target.value))} /><small>Token</small></label><label><span>每 100 字符</span><input type="number" min="0" step="50" value={budgetForm.per100Chars} onChange={(event) => updateBudget('per100Chars', Number(event.target.value))} /><small>Token</small></label><label><span>最小</span><input type="number" min="0" step="1000" value={budgetForm.min} onChange={(event) => updateBudget('min', Number(event.target.value))} /><small>Token</small></label><label><span>最大</span><input type="number" min="0" step="10000" value={budgetForm.max} onChange={(event) => updateBudget('max', Number(event.target.value))} /><small>Token</small></label></div>} />
                    <p className="settings-config-meta">配置版本 v{budgetForm.version} · 保存后服务端递增版本并写入审计。</p>
                    <div className="settings-budget-savebar">
                      {savedNotice && !budgetDirty ? <span className="settings-saved-notice"><Check size={15} />预算配置已保存并立即生效</span> : <span>{budgetDirty ? '有尚未保存的预算更改' : '当前预算已同步'}</span>}
                      <Button variant="ghost" icon={<RotateCcw size={15} />} disabled={!budgetDirty || updateBudgetMutation.isPending} onClick={resetBudget}>撤销更改</Button>
                      <Button variant="primary" icon={updateBudgetMutation.isPending ? <LoaderCircle size={15} /> : <Save size={15} />} disabled={!budgetDirty || updateBudgetMutation.isPending} onClick={saveBudget}>{updateBudgetMutation.isPending ? '保存中…' : '保存预算'}</Button>
                    </div>
                  </>
                )}
              </SettingSection>
            </div>
          ) : null}

          {activeTab === 'security' ? (
            <div className="settings-config-view settings-view-panel" id="settings-panel-security" role="tabpanel" aria-labelledby="settings-tab-security" tabIndex={0} data-scroll-region="settings-security">
              <header className="settings-view-header"><div><h1>安全与备份</h1><p>约束 Skill 执行、凭证轮换、审计保留和数据库备份。</p></div></header>
              <SettingSection title="执行安全" description="平台只下发最小权限上下文，凭证不会写入配置 JSON。" icon={<ShieldCheck size={18} />}>
                <SettingRow icon={<Boxes size={17} />} title="Skill 脚本沙箱" description="自定义脚本只能在受限环境执行，禁止直接访问宿主机。" control={<SettingSwitch checked={config.sandboxScripts} label="切换 Skill 脚本沙箱" onChange={() => updateConfig('sandboxScripts', !config.sandboxScripts)} />} />
                <SettingRow icon={<KeyRound size={17} />} title="凭证轮换周期" description="到期前七天通知管理员更新 Agent 与仓库凭证。" control={<label className="setting-number-input"><input type="number" min="30" max="365" step="30" value={config.credentialRotationDays} onChange={(event) => updateConfig('credentialRotationDays', Number(event.target.value))} /><span>天</span></label>} />
                <SettingRow icon={<LockKeyhole size={17} />} title="审计保留周期" description="到期记录转入归档存储，不允许从业务库直接恢复。" control={<label className="setting-number-input"><input type="number" min="30" max="730" step="30" value={config.auditRetentionDays} onChange={(event) => updateConfig('auditRetentionDays', Number(event.target.value))} /><span>天</span></label>} />
              </SettingSection>
              <SettingSection title="数据库备份" description="记录备份时间、大小、位置、状态与最近校验结果。" icon={<Database size={18} />}>
                <SettingRow icon={<Database size={17} />} title="自动备份" description="每天在低峰时段创建数据库快照并执行校验。" control={<SettingSwitch checked={config.backupEnabled} label="切换自动备份" onChange={() => updateConfig('backupEnabled', !config.backupEnabled)} />} />
                <SettingRow icon={<RefreshCw size={17} />} title="计划时间" description="时间使用平台所在时区 Asia/Hong_Kong。" control={<label className="setting-time-input"><input type="time" value={config.backupHour} disabled={!config.backupEnabled} onChange={(event) => updateConfig('backupHour', event.target.value)} /></label>} />
                <div className="backup-status-row"><span><CheckCircle2 size={16} /></span><div><strong>最近备份校验通过</strong><small>今天 02:47，1.8 GB，保留位置 storage-primary</small></div><Button variant="secondary" size="sm" icon={<RotateCcw size={14} />}>验证恢复</Button></div>
              </SettingSection>
            </div>
          ) : null}

          {activeTab === 'notifications' ? (
            <div className="settings-config-view settings-view-panel" id="settings-panel-notifications" role="tabpanel" aria-labelledby="settings-tab-notifications" tabIndex={0} data-scroll-region="settings-notifications">
              <header className="settings-view-header"><div><h1>通知策略</h1><p>选择需要立即触达的异常，以及非紧急消息的汇总方式。</p></div></header>
              <SettingSection title="事件通知" description="高风险事件建议保持开启，避免任务长时间无人处理。" icon={<Bell size={18} />}>
                <SettingRow icon={<AlertTriangle size={17} />} title="任务执行失败" description="任务进入 failed 状态时通知负责人和项目管理者。" control={<SettingSwitch checked={config.notifyTaskFailure} label="切换任务失败通知" onChange={() => updateConfig('notifyTaskFailure', !config.notifyTaskFailure)} />} />
                <SettingRow icon={<CircleDollarSign size={17} />} title="预算达到阈值" description={`Token 用量达到当前 ${config.budgetWarningThreshold}% 阈值时通知。`} control={<SettingSwitch checked={config.notifyBudgetWarning} label="切换预算通知" onChange={() => updateConfig('notifyBudgetWarning', !config.notifyBudgetWarning)} />} />
                <SettingRow icon={<Bot size={17} />} title="Agent 心跳异常" description="Agent 进入 stale 或 offline 状态时立即通知。" control={<SettingSwitch checked={config.notifyAgentStale} label="切换 Agent 心跳通知" onChange={() => updateConfig('notifyAgentStale', !config.notifyAgentStale)} />} />
                <SettingRow icon={<Mail size={17} />} title="每日摘要" description="每天发送任务、预算与 Agent 健康概览。" control={<SettingSwitch checked={config.dailyDigest} label="切换每日摘要" onChange={() => updateConfig('dailyDigest', !config.dailyDigest)} />} />
              </SettingSection>
              <SettingSection title="触达设置" description="严重故障不受免打扰时段影响。" icon={<Mail size={18} />}>
                <SettingRow icon={<Mail size={17} />} title="通知邮箱" description="用于接收平台告警和每日摘要。" control={<label className="setting-text-input"><input type="email" value={config.email} onChange={(event) => updateConfig('email', event.target.value)} /></label>} />
                <SettingRow icon={<Bell size={17} />} title="免打扰时段" description="普通提醒延迟到时段结束后发送。" control={<SettingSwitch checked={config.quietHoursEnabled} label="切换免打扰时段" onChange={() => updateConfig('quietHoursEnabled', !config.quietHoursEnabled)} />} />
                <SettingRow icon={<SlidersHorizontal size={17} />} title="时段范围" description="开始和结束时间可跨越午夜。" control={<div className="setting-inline-fields setting-time-range"><label><span>开始</span><input type="time" value={config.quietStart} disabled={!config.quietHoursEnabled} onChange={(event) => updateConfig('quietStart', event.target.value)} /></label><label><span>结束</span><input type="time" value={config.quietEnd} disabled={!config.quietHoursEnabled} onChange={(event) => updateConfig('quietEnd', event.target.value)} /></label></div>} />
              </SettingSection>
            </div>
          ) : null}

          {activeTab !== 'modules' ? (
            <footer className="settings-savebar settings-savebar-redesign">
              <div>{savedNotice && !configDirty ? <span className="settings-saved-notice"><Check size={15} />配置已保存并立即生效</span> : <span>{configDirty ? '有尚未保存的更改' : '当前配置已同步'}</span>}</div>
              <Button variant="ghost" icon={<RotateCcw size={15} />} disabled={!configDirty || updatePlatformMutation.isPending} onClick={resetConfig}>撤销更改</Button>
              <Button variant="primary" icon={updatePlatformMutation.isPending ? <LoaderCircle size={15} /> : <Save size={15} />} disabled={!configDirty || updatePlatformMutation.isPending} onClick={saveConfig}>{updatePlatformMutation.isPending ? '保存中…' : '保存配置'}</Button>
            </footer>
          ) : null}
        </main>
      </div>

      <Dialog
        open={Boolean(pendingModule)}
        onClose={() => setPendingModuleId(null)}
        title={`${pendingModule?.enabled ? '禁用' : '启用'}核心模块`}
        description="核心模块变更会立即影响平台工作流，请确认影响范围。"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setPendingModuleId(null)}>取消</Button>
            <Button variant={pendingModule?.enabled ? 'danger' : 'primary'} icon={<Check size={15} />} onClick={confirmModuleToggle}>确认{pendingModule?.enabled ? '禁用' : '启用'}</Button>
          </>
        )}
      >
        {pendingModule ? (
          <div className="module-confirmation">
            <span className="module-confirmation-icon"><AlertTriangle size={22} /></span>
            <div><strong>{pendingModule.label}</strong><p>{moduleImpact[pendingModule.id]}</p></div>
            <dl><div><dt>当前状态</dt><dd>{pendingModule.enabled ? '已启用' : '已禁用'}</dd></div><div><dt>变更后</dt><dd>{pendingModule.enabled ? '接口返回 423 Locked' : '接口与入口立即恢复'}</dd></div><div><dt>操作者</dt><dd>{user.name} ({user.title})</dd></div></dl>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
