import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { ToastProvider } from './components/ToastProvider'
import { AppProvider } from './state/AppContext'

function TestRouterProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div hidden>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button data-testid="navigate-knowledge" onClick={() => navigate('/knowledge')}>navigate</button>
    </div>
  )
}

function renderApp(initialEntry = '/tasks') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <AppProvider>
          <App />
          <TestRouterProbe />
        </AppProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('CodingCenter application shell', () => {
  it('renders the task command center and filters tasks by search', async () => {
    const { container } = renderApp()

    expect(await screen.findByPlaceholderText('筛选任务')).toBeInTheDocument()
    expect(container.querySelectorAll('.task-row').length).toBeGreaterThan(1)

    const search = screen.getByPlaceholderText('筛选任务')
    fireEvent.change(search, { target: { value: 'Connector' } })

    const visibleRows = Array.from(container.querySelectorAll('.task-row'))
    expect(visibleRows).toHaveLength(1)
    expect(visibleRows[0]).toHaveTextContent('Connector 心跳恢复策略')
  })

  it('navigates to the project development workspace', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('link', { name: /开发工作台/ }))

    expect(await screen.findByText('会话产出')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/描述任务/)).toBeInTheDocument()
  })

  it('moves the project folder highlight to the selected stage', async () => {
    const { container } = renderApp()
    await screen.findByPlaceholderText('筛选任务')

    const stages = Array.from(container.querySelectorAll<HTMLButtonElement>('.cascade-card'))
    const summary = container.querySelector('.cascade-summary')
    const initialStage = stages[3]
    const nextStage = stages[0]
    expect(initialStage).toHaveAttribute('aria-selected', 'true')
    expect(initialStage).toHaveAttribute('tabindex', '0')
    expect(initialStage).toHaveTextContent('项目文档')
    expect(summary).toHaveTextContent('项目文档')
    expect(summary).toHaveTextContent('87%')
    expect(container).not.toHaveTextContent('项目归档')

    fireEvent.click(nextStage)

    expect(nextStage).toHaveAttribute('aria-selected', 'true')
    expect(nextStage).toHaveAttribute('tabindex', '0')
    expect(initialStage).toHaveAttribute('aria-selected', 'false')
    expect(initialStage).toHaveAttribute('tabindex', '-1')
    expect(summary).toHaveTextContent('需求评审')
    expect(summary).toHaveTextContent('58%')

    fireEvent.keyDown(nextStage, { key: 'ArrowRight' })
    expect(stages[1]).toHaveAttribute('aria-selected', 'true')
    expect(summary).toHaveTextContent('产品设计')

    fireEvent.keyDown(stages[1], { key: 'End' })
    expect(stages[stages.length - 1]).toHaveAttribute('aria-selected', 'true')
    expect(summary).toHaveTextContent('运营复盘')

    fireEvent.keyDown(stages[stages.length - 1], { key: 'Home' })
    expect(stages[0]).toHaveAttribute('aria-selected', 'true')
    expect(summary).toHaveTextContent('需求评审')

    const previous = screen.getByRole('button', { name: '上一个项目' })
    expect(previous).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '下一个项目' }))
    expect(previous).not.toBeDisabled()
  })

  it('restores the workspace project from the URL and writes project changes back', async () => {
    renderApp('/workspace?project=repo-2')
    await screen.findByText('会话产出')

    const picker = screen.getByRole('combobox', { name: '切换工作台项目' })
    await waitFor(() => expect(picker).toHaveValue('repo-2'))
    fireEvent.change(picker, { target: { value: 'repo-3' } })

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workspace?project=repo-3'))
    expect(picker).toHaveValue('repo-3')
  })

  it('selects and deletes conversations while keeping outputs bound to the active conversation', async () => {
    renderApp('/workspace?project=repo-1')
    await screen.findByText('会话产出')

    expect(screen.getAllByText('项目开发工作台 P1').length).toBeGreaterThan(0)
    expect(screen.queryByText('需求审批与 Spec 版本化')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    expect(screen.getByRole('button', { name: '新会话' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('当前会话暂无产出')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '工作台文件树接入' }))
    expect(screen.getByRole('button', { name: '工作台文件树接入' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '删除会话 新会话' }))
    expect(screen.queryByRole('button', { name: '删除会话 新会话' })).not.toBeInTheDocument()
  })

  it('records diff review feedback and disables the completed action', async () => {
    renderApp('/workspace?project=repo-1')
    await screen.findByText('会话产出')

    fireEvent.click(screen.getByRole('button', { name: /打开变更审查/ }))
    const accept = screen.getByRole('button', { name: '接受变更' })
    fireEvent.click(accept)

    expect(await screen.findByText('文件变更已接受并写入审查结果。')).toBeInTheDocument()
    expect(accept).toBeDisabled()
    expect(screen.getByText('已接受')).toBeInTheDocument()
  })

  it('adds execution events when a task advances', async () => {
    renderApp()
    await screen.findByPlaceholderText('筛选任务')

    expect(screen.getByRole('button', { name: /执行事件/ })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: '标记完成' }))

    expect(await screen.findByText('任务执行完成')).toBeInTheDocument()
    expect(screen.getByText('任务已完成，可继续检查结果与文件变更。')).toBeInTheDocument()
  })

  it('collapses and restores the task inspector from its desktop rail control', async () => {
    renderApp()
    await screen.findByPlaceholderText('筛选任务')

    const toggle = screen.getByRole('button', { name: '收起详情面板' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: '展开详情面板' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: '展开详情面板' }))
    expect(screen.getByRole('button', { name: '收起详情面板' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('switches the task center between board, detail, and timeline views', async () => {
    const { container } = renderApp()
    await screen.findByPlaceholderText('筛选任务')

    const mobileTabs = container.querySelectorAll<HTMLButtonElement>('.tasks-page > .cc-mobile-view-tabs button')
    expect(mobileTabs).toHaveLength(3)
    expect(mobileTabs[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(mobileTabs[1])
    expect(mobileTabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(mobileTabs[0]).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(mobileTabs[2])
    expect(mobileTabs[2]).toHaveAttribute('aria-selected', 'true')
  })

  it('uses list and detail tabs for resource workbenches', async () => {
    const { container } = renderApp('/requirements')
    await screen.findByPlaceholderText('搜索标题、编号或负责人')

    const tabs = container.querySelectorAll<HTMLButtonElement>('.requirements-page > .cc-mobile-view-tabs button')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveFocus()
  })

  it('hides disabled modules and blocks their direct route', async () => {
    renderApp('/settings')
    await screen.findByRole('heading', { name: '模块开关' })
    expect(screen.getByRole('link', { name: '知识库' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: '禁用知识库' }))
    expect(screen.queryByRole('link', { name: '知识库' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('navigate-knowledge'))

    expect(await screen.findByRole('heading', { name: '知识库已停用' })).toBeInTheDocument()
    expect(screen.getByText(/423 · MODULE LOCKED/)).toBeInTheDocument()
  })
})
