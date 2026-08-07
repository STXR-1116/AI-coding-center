import { expect, test, type Page } from '@playwright/test'

type RouteSpec = {
  path: string
  main: string
  detail: string
  bodyText: string
  supportingText: string
  workbench?: string
}

type ScrollMetrics = {
  clientHeight: number
  scrollHeight: number
  startScrollTop: number
  endScrollTop: number
  height: number
}

const viewports = [
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'workstation', width: 1600, height: 900 },
  { name: 'standard', width: 1440, height: 900 },
  { name: 'compact', width: 1366, height: 768 },
  { name: 'laptop', width: 1280, height: 720 },
]

const routes: RouteSpec[] = [
  { path: '/tasks', main: '.task-center-column', detail: '.task-inspector', bodyText: '.task-row strong', supportingText: '.task-row small' },
  { path: '/requirements', main: '.requirements-main-panel', detail: '.requirement-inspector', bodyText: '.requirement-row strong', supportingText: '.requirement-row small' },
  { path: '/agents', main: '.agents-main-panel', detail: '.agent-inspector, .squad-inspector', bodyText: '.agent-row-identity strong', supportingText: '.agent-row-identity small' },
  { path: '/repositories', main: '.repository-main-panel', detail: '.repository-inspector', bodyText: '.repository-row strong', supportingText: '.repository-row small' },
  { path: '/knowledge', main: '.knowledge-main-panel', detail: '.knowledge-inspector', bodyText: '.knowledge-row-identity strong', supportingText: '.knowledge-row-identity code' },
  { path: '/skills', main: '.skills-catalog-pane', detail: '.skill-detail-pane', bodyText: '.skill-list-row strong', supportingText: '.skill-list-row small' },
  { path: '/analytics', main: '.analytics-focus-panel', detail: '.analytics-inspector-panel', bodyText: '.agent-health-main strong', supportingText: '.agent-health-main small' },
  { path: '/settings', main: '.settings-main-panel', detail: '.settings-sidebar', bodyText: '.module-setting-main h2', supportingText: '.module-setting-main p' },
  { path: '/workspace?project=repo-1', main: '.conversation-pane', detail: '.output-pane', bodyText: '.file-tree-row span:last-child', supportingText: '.code-preview header small', workbench: '.workspace-grid' },
]

async function injectScrollableContent(page: Page, selector: string, marker: string): Promise<ScrollMetrics> {
  return page.locator(selector).evaluate((element: Element, fillerMarker: string) => {
    const scroller = element as HTMLElement
    scroller.querySelector(`[data-layout-test-filler="${fillerMarker}"]`)?.remove()
    const filler = document.createElement('div')
    filler.dataset.layoutTestFiller = fillerMarker
    filler.setAttribute('aria-hidden', 'true')
    filler.style.cssText = 'display:block;width:1px;height:2400px;min-height:2400px;flex:0 0 auto;grid-column:1 / -1;pointer-events:none;'
    scroller.append(filler)
    scroller.scrollTop = 0
    const startScrollTop = scroller.scrollTop
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    scroller.scrollTop = Math.min(160, maxScrollTop)
    return {
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      startScrollTop,
      endScrollTop: scroller.scrollTop,
      height: scroller.getBoundingClientRect().height,
    }
  }, marker)
}

async function readRects(page: Page, selectors: string[]) {
  return page.evaluate((targetSelectors: string[]) => Object.fromEntries(targetSelectors.map((selector) => {
    const element = document.querySelector(selector)
    if (!element) return [selector, null]
    const rect = element.getBoundingClientRect()
    return [selector, { top: rect.top, bottom: rect.bottom, height: rect.height }]
  })), selectors)
}

async function readDocumentBounds(page: Page) {
  return page.evaluate(() => ({
    viewportHeight: innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
  }))
}

async function expectMinimumHitTarget(page: Page, labels: string[]) {
  for (const label of labels) {
    const control = page.getByRole('button', { name: label }).first()
    await expect(control).toBeVisible()
    const box = await control.boundingBox()
    expect(box, `${label} should have a measurable hit target`).not.toBeNull()
    expect(box!.width, `${label} hit target width`).toBeGreaterThanOrEqual(36)
    expect(box!.height, `${label} hit target height`).toBeGreaterThanOrEqual(36)
  }
}

function alphaOf(color: string) {
  if (color === 'transparent') return 0
  const alpha = color.match(/^rgba\\([^)]*,\\s*([0-9.]+)\\)$/)?.[1]
  return alpha ? Number(alpha) : 1
}

function longestTransitionMs(value: string) {
  return Math.max(...value.split(',').map((duration) => {
    const trimmed = duration.trim()
    return trimmed.endsWith('ms') ? Number(trimmed.slice(0, -2)) : Number(trimmed.slice(0, -1)) * 1_000
  }))
}

async function emulateReducedTransparency(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  })
}

function expectScrollable(metrics: ScrollMetrics) {
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 1)
  expect(metrics.endScrollTop).toBeGreaterThan(metrics.startScrollTop)
}

function expectStableEdge(before: { top: number; bottom: number }, after: { top: number; bottom: number }, edge: 'top' | 'bottom') {
  expect(Math.abs(before[edge] - after[edge])).toBeLessThanOrEqual(1)
}

for (const viewport of viewports) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    for (const route of routes) {
      test(`${route.path} has a filled, aligned workbench`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: 'networkidle' })
        await page.locator('.page-content').waitFor()

        const metrics = await page.evaluate((selectors) => {
          const find = (selector: string) => document.querySelector(selector)
          const box = (element: Element | null) => {
            if (!element) return null
            const rect = element.getBoundingClientRect()
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
          }
          const workbench = find(selectors.workbench ?? '.cc-workbench, .analytics-workbench, .settings-workbench-redesign')
          const main = find(selectors.main)
          const detail = find(selectors.detail)
          const pageContent = find('.page-content')
          const appMain = find('.app-main')
          const fontSize = (selector: string) => {
            const element = find(selector)
            return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null
          }
          return {
            viewport: { width: innerWidth, height: innerHeight },
            document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
            workbench: box(workbench),
            main: box(main),
            detail: box(detail),
            pageContent: box(pageContent),
            appMain: box(appMain),
            typography: {
              body: fontSize(selectors.bodyText),
              supporting: fontSize(selectors.supportingText),
            },
          }
        }, route)

        expect(metrics.document.width - metrics.viewport.width).toBeLessThanOrEqual(1)
        expect(metrics.workbench).not.toBeNull()
        expect(metrics.main).not.toBeNull()
        expect(metrics.detail).not.toBeNull()
        expect(metrics.pageContent).not.toBeNull()
        expect(Math.abs(metrics.main!.top - metrics.detail!.top)).toBeLessThanOrEqual(2)
        expect(Math.abs(metrics.main!.bottom - metrics.detail!.bottom)).toBeLessThanOrEqual(2)
        expect(metrics.workbench!.top).toBeLessThanOrEqual(metrics.main!.top + 1)
        expect(metrics.workbench!.bottom).toBeGreaterThanOrEqual(metrics.main!.bottom - 1)
        expect(metrics.workbench!.height).toBeGreaterThan(260)
        expect(metrics.pageContent!.width / metrics.appMain!.width).toBeGreaterThanOrEqual(viewport.width === 1920 ? 0.94 : 0.88)
        expect(metrics.typography.body).not.toBeNull()
        expect(metrics.typography.supporting).not.toBeNull()
        expect(metrics.typography.body!).toBeGreaterThanOrEqual(13)
        expect(metrics.typography.supporting!).toBeGreaterThanOrEqual(11)
        expect(await page.locator('.cc-mobile-view-tabs:visible').count()).toBe(0)
      })
    }
  })
}

test.describe('workspace and inspector behavior', () => {
  test('workspace columns fill the viewport and stay aligned', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/workspace?project=repo-1', { waitUntil: 'networkidle' })
    const columns = await page.locator('[data-layout-region="workspace"] > *').evaluateAll((elements) => elements.slice(0, 3).map((element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, height: rect.height }
    }))
    expect(columns).toHaveLength(3)
    expect(Math.max(...columns.map((column) => column.bottom)) - Math.min(...columns.map((column) => column.bottom))).toBeLessThanOrEqual(2)
  })

  for (const path of ['/tasks', '/requirements', '/agents', '/repositories']) {
    test(`${path} keeps workbench height when inspector collapses`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto(path, { waitUntil: 'networkidle' })
      const workbench = page.locator('.cc-workbench')
      const before = await workbench.boundingBox()
      await page.getByRole('button', { name: '收起详情面板' }).click()
      await expect(page.getByRole('button', { name: '展开详情面板' })).toBeVisible()
      const closed = await workbench.boundingBox()
      expect(closed?.height).toBeCloseTo(before?.height ?? 0, 0)
      await page.getByRole('button', { name: '展开详情面板' }).click()
      await expect(page.getByRole('button', { name: '收起详情面板' })).toBeVisible()
    })
  }

  test('tasks keep list and inspector scrolling inside the workbench', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/tasks', { waitUntil: 'networkidle' })
    const workbench = page.locator('.cc-workbench')
    const beforeWorkbench = await workbench.boundingBox()
    const beforeChrome = await readRects(page, ['.task-inspector .inspector-heading', '.task-inspector .inspector-footer'])
    const taskList = await injectScrollableContent(page, '[data-scroll-region="task-list"]', 'tasks-list')
    const inspectorBody = await injectScrollableContent(page, '.task-inspector [data-scroll-region="inspector-body"]', 'tasks-inspector')
    const afterChrome = await readRects(page, ['.task-inspector .inspector-heading', '.task-inspector .inspector-footer'])
    const afterWorkbench = await workbench.boundingBox()
    expectScrollable(taskList)
    expectScrollable(inspectorBody)
    expect(afterWorkbench?.height).toBeCloseTo(beforeWorkbench?.height ?? 0, 0)
    expectStableEdge(beforeChrome['.task-inspector .inspector-heading'], afterChrome['.task-inspector .inspector-heading'], 'top')
    expectStableEdge(beforeChrome['.task-inspector .inspector-footer'], afterChrome['.task-inspector .inspector-footer'], 'bottom')
    const bounds = await readDocumentBounds(page)
    expect(Math.max(bounds.documentHeight, bounds.bodyHeight)).toBeLessThanOrEqual(bounds.viewportHeight + 1)
  })

  test('resource lists keep long content inside the main panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const resourceLists = [
      ['/requirements', '.requirements-list'],
      ['/agents', '.agent-list'],
      ['/repositories', '.repository-list'],
      ['/knowledge', '.knowledge-list'],
      ['/skills', '.skill-list'],
    ] as const

    for (const [path, selector] of resourceLists) {
      await page.goto(path, { waitUntil: 'networkidle' })
      await page.locator(selector).waitFor()
      const workbench = page.locator('.cc-workbench')
      const beforeWorkbench = await workbench.boundingBox()
      const list = await injectScrollableContent(page, selector, `resource-list-${path.slice(1)}`)
      const afterWorkbench = await workbench.boundingBox()
      expectScrollable(list)
      expect(afterWorkbench?.height).toBeCloseTo(beforeWorkbench?.height ?? 0, 0)
      const bounds = await readDocumentBounds(page)
      expect(Math.max(bounds.documentHeight, bounds.bodyHeight)).toBeLessThanOrEqual(bounds.viewportHeight + 1)
    }
  })

  test('analytics keeps agent and audit scrolling inside their panels', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/analytics', { waitUntil: 'networkidle' })
    const content = page.locator('.analytics-content-scroll')
    const beforeContent = await content.boundingBox()
    const beforeChrome = await readRects(page, [
      '.analytics-inspector-panel > .analytics-panel-header',
      '.selected-agent-summary',
      '.audit-panel-heading',
    ])
    const agentList = await injectScrollableContent(page, '.agent-health-list', 'analytics-agents')
    const auditTable = await injectScrollableContent(page, '.audit-table-wrap', 'analytics-audit')
    const afterChrome = await readRects(page, [
      '.analytics-inspector-panel > .analytics-panel-header',
      '.selected-agent-summary',
      '.audit-panel-heading',
    ])
    const afterContent = await content.boundingBox()
    expectScrollable(agentList)
    expectScrollable(auditTable)
    expect(afterContent?.height).toBeCloseTo(beforeContent?.height ?? 0, 0)
    expectStableEdge(beforeChrome['.analytics-inspector-panel > .analytics-panel-header'], afterChrome['.analytics-inspector-panel > .analytics-panel-header'], 'top')
    expectStableEdge(beforeChrome['.selected-agent-summary'], afterChrome['.selected-agent-summary'], 'bottom')
    expectStableEdge(beforeChrome['.audit-panel-heading'], afterChrome['.audit-panel-heading'], 'top')
    const bounds = await readDocumentBounds(page)
    expect(Math.max(bounds.documentHeight, bounds.bodyHeight)).toBeLessThanOrEqual(bounds.viewportHeight + 1)
  })

  test('settings keeps the main body scrollable while chrome stays fixed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: '运行与预算' }).click()
    const workbench = page.locator('.settings-workbench-redesign')
    const beforeWorkbench = await workbench.boundingBox()
    const beforeChrome = await readRects(page, ['.settings-view-header', '.settings-savebar'])
    const settingsBody = await injectScrollableContent(page, '.settings-view-panel', 'settings-body')
    const afterChrome = await readRects(page, ['.settings-view-header', '.settings-savebar'])
    const afterWorkbench = await workbench.boundingBox()
    expectScrollable(settingsBody)
    expect(afterWorkbench?.height).toBeCloseTo(beforeWorkbench?.height ?? 0, 0)
    expectStableEdge(beforeChrome['.settings-view-header'], afterChrome['.settings-view-header'], 'top')
    expectStableEdge(beforeChrome['.settings-savebar'], afterChrome['.settings-savebar'], 'bottom')
    const bounds = await readDocumentBounds(page)
    expect(Math.max(bounds.documentHeight, bounds.bodyHeight)).toBeLessThanOrEqual(bounds.viewportHeight + 1)
  })

  test('workspace keeps message, file, and output scrolling inside its three columns', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/workspace?project=repo-1', { waitUntil: 'networkidle' })
    const workbench = page.locator('.workspace-grid')
    const beforeWorkbench = await workbench.boundingBox()
    const beforeChrome = await readRects(page, [
      '.conversation-pane > .conversation-tabs',
      '.workspace-explorer > .workspace-pane-header',
      '.output-pane > .workspace-pane-header',
      '.conversation-pane > .chat-composer',
    ])
    const messageFeed = await injectScrollableContent(page, '.message-feed', 'workspace-messages')
    const fileTree = await injectScrollableContent(page, '.file-tree', 'workspace-files')
    const outputScroll = await injectScrollableContent(page, '.output-scroll', 'workspace-output')
    const afterChrome = await readRects(page, [
      '.conversation-pane > .conversation-tabs',
      '.workspace-explorer > .workspace-pane-header',
      '.output-pane > .workspace-pane-header',
      '.conversation-pane > .chat-composer',
    ])
    const afterWorkbench = await workbench.boundingBox()
    expectScrollable(messageFeed)
    expectScrollable(fileTree)
    expectScrollable(outputScroll)
    expect(afterWorkbench?.height).toBeCloseTo(beforeWorkbench?.height ?? 0, 0)
    expectStableEdge(beforeChrome['.conversation-pane > .conversation-tabs'], afterChrome['.conversation-pane > .conversation-tabs'], 'top')
    expectStableEdge(beforeChrome['.workspace-explorer > .workspace-pane-header'], afterChrome['.workspace-explorer > .workspace-pane-header'], 'top')
    expectStableEdge(beforeChrome['.output-pane > .workspace-pane-header'], afterChrome['.output-pane > .workspace-pane-header'], 'top')
    expectStableEdge(beforeChrome['.conversation-pane > .chat-composer'], afterChrome['.conversation-pane > .chat-composer'], 'bottom')
    const bounds = await readDocumentBounds(page)
    expect(Math.max(bounds.documentHeight, bounds.bodyHeight)).toBeLessThanOrEqual(bounds.viewportHeight + 1)
  })
})

test.describe('Apple desktop affordances', () => {
  test('gives persistent icon controls a 36px minimum hit target', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/tasks', { waitUntil: 'networkidle' })
    await expectMinimumHitTarget(page, ['通知', '消息', '筛选', '排序', '更多操作', '上一个项目', '下一个项目'])

    await page.goto('/workspace?project=repo-1', { waitUntil: 'networkidle' })
    await expectMinimumHitTarget(page, ['新建会话', '查看需求', '查看任务'])
  })

  test('uses non-vestibular motion fallbacks when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/tasks', { waitUntil: 'networkidle' })

    const motion = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector)
        if (!element) return null
        const style = getComputedStyle(element)
        return { transitionDuration: style.transitionDuration, scrollBehavior: style.scrollBehavior }
      }
      return {
        card: read('.cascade-card'),
        control: read('.cascade-control'),
        viewport: read('.cascade-viewport'),
      }
    })

    expect(motion.card).not.toBeNull()
    expect(motion.control).not.toBeNull()
    expect(motion.viewport).not.toBeNull()
    expect(longestTransitionMs(motion.card!.transitionDuration)).toBeLessThanOrEqual(50)
    expect(longestTransitionMs(motion.control!.transitionDuration)).toBeLessThanOrEqual(50)
    expect(motion.viewport!.scrollBehavior).toBe('auto')
  })

  test('uses solid, unblurred materials when transparency is reduced', async ({ page }) => {
    await emulateReducedTransparency(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/tasks', { waitUntil: 'networkidle' })

    const surfaces = await page.evaluate(() => ['.topbar', '.cascade-summary', '.cascade-control'].map((selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const style = getComputedStyle(element)
      return { selector, background: style.backgroundColor, backdropFilter: style.backdropFilter }
    }))

    expect(surfaces).not.toContain(null)
    for (const surface of surfaces) {
      expect(surface!.backdropFilter).toBe('none')
      expect(alphaOf(surface!.background)).toBeGreaterThanOrEqual(0.98)
    }
  })

  test('adds solid surfaces and defined borders when contrast is increased', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/tasks', { waitUntil: 'networkidle' })

    const surfaces = await page.evaluate(() => ['.topbar', '.cascade-summary', '.cascade-control'].map((selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const style = getComputedStyle(element)
      return {
        selector,
        background: style.backgroundColor,
        borderWidth: Math.max(
          Number.parseFloat(style.borderTopWidth),
          Number.parseFloat(style.borderRightWidth),
          Number.parseFloat(style.borderBottomWidth),
          Number.parseFloat(style.borderLeftWidth),
        ),
      }
    }))

    expect(surfaces).not.toContain(null)
    for (const surface of surfaces) {
      expect(alphaOf(surface!.background)).toBeGreaterThanOrEqual(0.98)
      expect(surface!.borderWidth).toBeGreaterThanOrEqual(1)
    }
  })
})

test.describe('task cascade geometry', () => {
  for (const viewport of viewports) {
    test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } })

      test('keeps the project focus stage centered and contained', async ({ page }) => {
        await page.goto('/tasks', { waitUntil: 'networkidle' })
        await expect(page.locator('.cascade-stage')).toBeVisible()

        // The initial selection is centered by a deferred layout effect.
        await expect.poll(async () => page.evaluate(() => {
          const viewportElement = document.querySelector('.cascade-viewport')
          const selectedElement = document.querySelector('.cascade-card.is-highlighted')
          if (!viewportElement || !selectedElement) return Number.POSITIVE_INFINITY
          const viewportRect = viewportElement.getBoundingClientRect()
          const selectedRect = selectedElement.getBoundingClientRect()
          return Math.abs(
            selectedRect.left + selectedRect.width / 2 - (viewportRect.left + viewportRect.width / 2),
          )
        }), { timeout: 5_000 }).toBeLessThanOrEqual(6)

        const geometry = await page.evaluate(() => {
          const readRect = (selector: string) => {
            const element = document.querySelector(selector)
            if (!element) return null
            const rect = element.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              cx: rect.left + rect.width / 2,
              cy: rect.top + rect.height / 2,
            }
          }
          const stage = document.querySelector('.cascade-stage')
          const viewportElement = document.querySelector('.cascade-viewport') as HTMLElement | null
          const viewportStyle = viewportElement ? getComputedStyle(viewportElement) : null
          return {
            stage: readRect('.cascade-stage'),
            summary: readRect('.cascade-summary'),
            viewport: readRect('.cascade-viewport'),
            selected: readRect('.cascade-card.is-highlighted'),
            controls: readRect('.cascade-controls'),
            stageScrollWidth: stage?.scrollWidth ?? 0,
            stageClientWidth: stage?.clientWidth ?? 0,
            viewportClientWidth: viewportElement?.clientWidth ?? 0,
            viewportMaskImage: viewportStyle?.getPropertyValue('mask-image')
              || viewportStyle?.getPropertyValue('-webkit-mask-image')
              || '',
            viewportEdgeFade: viewportStyle?.getPropertyValue('--cascade-edge-fade').trim() ?? '',
          }
        })

        expect(geometry.stage).not.toBeNull()
        expect(geometry.summary).not.toBeNull()
        expect(geometry.viewport).not.toBeNull()
        expect(geometry.selected).not.toBeNull()
        expect(geometry.controls).not.toBeNull()
        if (!geometry.stage || !geometry.summary || !geometry.viewport || !geometry.selected || !geometry.controls) {
          throw new Error('任务看板项目焦点舞台缺少必需几何节点')
        }

        // Allow one pixel of rounding at the 300px/422px contract boundaries.
        expect(geometry.stage.height).toBeGreaterThanOrEqual(299)
        expect(geometry.stage.height).toBeLessThanOrEqual(423)
        expect(Math.abs(geometry.summary.cy - geometry.viewport.cy)).toBeLessThanOrEqual(2)
        expect(Math.abs(geometry.selected.cx - geometry.viewport.cx)).toBeLessThanOrEqual(6)
        expect(Math.abs(geometry.viewportClientWidth - geometry.stageClientWidth)).toBeLessThanOrEqual(1)
        expect(Math.abs(geometry.viewport.width - geometry.stage.width)).toBeLessThanOrEqual(2)
        expect(geometry.viewportMaskImage).toContain('linear-gradient')
        expect(geometry.viewportMaskImage).not.toBe('none')
        expect(geometry.viewportEdgeFade).not.toBe('')

        const controlsRightInset = geometry.stage.right - geometry.controls.right
        const controlsBottomInset = geometry.stage.bottom - geometry.controls.bottom
        expect(controlsRightInset).toBeGreaterThanOrEqual(8)
        expect(controlsRightInset).toBeLessThanOrEqual(24)
        expect(controlsBottomInset).toBeGreaterThanOrEqual(8)
        expect(controlsBottomInset).toBeLessThanOrEqual(24)
        expect(geometry.controls.left).toBeGreaterThanOrEqual(geometry.stage.left - 1)
        expect(geometry.controls.top).toBeGreaterThanOrEqual(geometry.stage.top - 1)
        expect(geometry.controls.right).toBeLessThanOrEqual(geometry.stage.right + 1)
        expect(geometry.controls.bottom).toBeLessThanOrEqual(geometry.stage.bottom + 1)
        expect(geometry.controls.cx).toBeGreaterThan(geometry.stage.cx)
        expect(geometry.controls.cy).toBeGreaterThan(geometry.stage.cy)

        const horizontalOverlap = Math.min(geometry.summary.right, geometry.viewport.right)
          - Math.max(geometry.summary.left, geometry.viewport.left)
        const verticalOverlap = Math.min(geometry.summary.bottom, geometry.viewport.bottom)
          - Math.max(geometry.summary.top, geometry.viewport.top)
        expect(horizontalOverlap).toBeGreaterThanOrEqual(24)
        expect(horizontalOverlap).toBeLessThanOrEqual(Math.min(geometry.summary.width, geometry.viewport.width) + 2)
        expect(verticalOverlap).toBeGreaterThanOrEqual(24)
        expect(verticalOverlap).toBeLessThanOrEqual(Math.min(geometry.summary.height, geometry.viewport.height) + 2)

        expect(geometry.stageScrollWidth - geometry.stageClientWidth).toBeLessThanOrEqual(1)
        for (const rect of [geometry.summary, geometry.viewport]) {
          expect(rect.left).toBeGreaterThanOrEqual(geometry.stage.left - 1)
          expect(rect.right).toBeLessThanOrEqual(geometry.stage.right + 1)
        }
      })
    })
  }

  test('keeps hover as preview and synchronizes selection across the board', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/tasks', { waitUntil: 'networkidle' })

    const cards = page.locator('.cascade-card')
    const summary = page.locator('.cascade-summary')

    await cards.nth(0).hover()
    await expect(summary).toHaveAttribute('data-selected-stage', 'docs')
    await expect(summary).toContainText('项目文档')
    await expect(summary).toContainText('87%')
    await expect(page.locator('.cascade-card.is-highlighted')).toHaveAttribute('data-stage-id', 'docs')

    await cards.nth(0).click()
    await expect(cards.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(summary).toContainText('需求评审')
    await expect(page.locator('.task-row.is-active strong')).toHaveText('需求评审流程完善')
    await expect(page.locator('.task-inspector .inspector-title-row h2')).toHaveText('需求评审流程完善')

    await cards.nth(0).focus()
    await page.keyboard.press('ArrowRight')
    await expect(cards.nth(1)).toHaveAttribute('aria-selected', 'true')

    const lastCardIndex = (await cards.count()) - 1
    await page.keyboard.press('End')
    await expect(cards.nth(lastCardIndex)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.cascade-control').nth(1)).toBeDisabled()

    await page.keyboard.press('Home')
    await expect(cards.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.cascade-control').nth(0)).toBeDisabled()
  })
})
