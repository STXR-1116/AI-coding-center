import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen } from 'lucide-react'

export interface SummaryItem {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  tone?: 'blue' | 'green' | 'amber' | 'violet' | 'red' | 'neutral'
}

export interface WorkbenchViewOption {
  value: string
  label: string
  count?: ReactNode
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  context,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  context?: ReactNode
}) {
  return (
    <header className="cc-page-header">
      <div className="cc-page-header-copy">
        {eyebrow ? <span className="cc-page-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {context || actions ? <div className="cc-page-header-actions">{context}{actions}</div> : null}
    </header>
  )
}

export function SummaryStrip({ items, className = '' }: { items: SummaryItem[]; className?: string }) {
  return (
    <section className={`cc-summary-strip ${className}`.trim()} aria-label="页面摘要">
      {items.map((item) => (
        <div key={item.label} className={`cc-summary-item cc-summary-${item.tone ?? 'neutral'}`}>
          {item.icon ? <span className="cc-summary-icon">{item.icon}</span> : null}
          <span className="cc-summary-label">{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </section>
  )
}

export function WorkbenchLayout({
  children,
  inspector,
  inspectorOpen = true,
  onToggleInspector,
  mobileView = 'main',
  mobileViewOptions,
  onMobileViewChange,
  className = '',
}: {
  children: ReactNode
  inspector?: ReactNode
  inspectorOpen?: boolean
  onToggleInspector?: () => void
  mobileView?: string
  mobileViewOptions?: WorkbenchViewOption[]
  onMobileViewChange?: (value: string) => void
  className?: string
}) {
  const hasMobileViews = Boolean(mobileViewOptions?.length && onMobileViewChange)
  return (
    <>
      {hasMobileViews ? (
        <MobileViewTabs
          value={mobileView}
          options={mobileViewOptions!}
          onChange={onMobileViewChange!}
          className="cc-workbench-mobile-tabs"
        />
      ) : null}
      <section
        className={`cc-workbench ${inspectorOpen ? 'is-inspector-open' : 'is-inspector-closed'} mobile-view-${mobileView} ${className}`.trim()}
        data-mobile-view={mobileView}
      >
        <div
          className="cc-workbench-main"
          data-layout-region="main"
          role={hasMobileViews ? 'tabpanel' : undefined}
          aria-label={hasMobileViews ? '主工作区' : undefined}
        >
          {children}
        </div>
        {inspector && onToggleInspector ? (
          <button
            type="button"
            className="cc-inspector-toggle"
            aria-label={inspectorOpen ? '收起详情面板' : '展开详情面板'}
            title={inspectorOpen ? '收起详情面板' : '展开详情面板'}
            aria-expanded={inspectorOpen}
            onClick={onToggleInspector}
          >
            {inspectorOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            <span>{inspectorOpen ? '收起详情' : '展开详情'}</span>
          </button>
        ) : null}
        {inspector ? (
          <div
            className="cc-workbench-inspector"
            data-layout-region="inspector"
            role={hasMobileViews ? 'tabpanel' : undefined}
            aria-label={hasMobileViews ? '详情面板' : undefined}
          >
            {inspector}
          </div>
        ) : null}
      </section>
    </>
  )
}

export function MobileViewTabs({
  value,
  options,
  onChange,
  idPrefix,
  className = '',
}: {
  value: string
  options: Array<{ value: string; label: string; count?: ReactNode }>
  onChange: (value: string) => void
  idPrefix?: string
  className?: string
}) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1)
    if (event.key === 'ArrowRight') nextIndex = Math.min(options.length - 1, index + 1)
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = options.length - 1
    if (nextIndex === null || nextIndex === index) return
    event.preventDefault()
    onChange(options[nextIndex].value)
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[nextIndex]?.focus()
  }

  return (
    <div className={`cc-mobile-view-tabs ${className}`.trim()} role="tablist" aria-label="内容视图">
      {options.map((option, index) => (
        <button
          key={option.value}
          id={idPrefix ? `${idPrefix}-tab-${option.value}` : undefined}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          aria-controls={idPrefix ? `${idPrefix}-panel-${option.value}` : undefined}
          tabIndex={value === option.value ? 0 : -1}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => moveFocus(event, index)}
        >
          <span>{option.label}</span>
          {option.count !== undefined ? <b>{option.count}</b> : null}
        </button>
      ))}
    </div>
  )
}

export function DisclosureButton({ open, onClick, children }: { open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="cc-disclosure-button" aria-expanded={open} onClick={onClick}>
      <span>{children}</span>
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
  )
}
