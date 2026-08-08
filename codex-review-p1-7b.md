# 代码审查报告 — P1-7b（SSE 实时事件客户端）

**审查范围**：`git diff c490ca0..b3db417`
- `src/hooks/useRealtimeEvents.ts`（hook 主体，c490ca0 引入）
- `src/App.tsx`（`RealtimeBridge` 接入，c490ca0 引入）
- `src/hooks/useRealtimeEvents.test.tsx`（单元测试，本 diff 新增 152 行 / 7 用例）

**审查模式**：codex-review-and-fix 手动模式（Codex 运行时不可用，Claude 独立审查）
**审查日期**：2026-08-07
**测试验证**：`vitest run src/hooks/useRealtimeEvents.test.tsx` → 7 passed ✅

---

## 总体评价

P1-7b 是一个**设计良好、实现干净**的 SSE 客户端 hook。生命周期管理（`useRef` 单例 + cleanup 显式 close）、JSON.parse 防护、invalidate 映射精确性、以及"浏览器原生重连 vs 手动 close"的决策都正确且注释清晰。App 接入位置正确（`QueryClientProvider` 内、`enabled=!!auth.user` 登录后常驻）。

发现 **0 高 / 2 中 / 4 低**。没有阻塞性缺陷；中等问题集中在测试覆盖盲区与一处可简化的死代码分支。

---

## 审查要点逐项结论

### 1. hook 生命周期与正确性 ✅（核心逻辑正确）

| 要点 | 结论 | 证据 |
|---|---|---|
| EventSource 创建/关闭生命周期 | ✅ 正确 | `useRealtimeEvents.ts:53` 创建并赋值 `sourceRef.current`；`:99-106` cleanup 显式 `source.close()` + 仅当 ref 仍指向同一实例时清 null（防止 StrictMode 双调用竞态） |
| `enabled` 切换 | ✅ 正确 | `:42-48` enabled=false 时 close 残留连接并清 null；`:51` 已有连接则复用。true→false→true 循环可正常重建 |
| StrictMode 双挂载安全 | ✅ 安全 | `main.tsx:21` 启用 StrictMode。mount→unmount(cleanup 清 null)→remount 重建，无泄漏、无重复挂 handler。**但 `:51` 的 `if (sourceRef.current) return` 在 StrictMode 下实为死代码**（见 M2） |
| JSON.parse 防护 | ✅ 正确 | `:60-65` try/catch 包裹，坏帧静默 return，注释说明 keep-alive 注释行不进 onmessage |
| invalidate 映射精确性 | ✅ 正确 | `tasksKeys` 工厂（`tasks.ts:30-36`）：`lists()→['tasks','list']`、`detail(id)→['tasks','detail',id]`。hook `:71-72`/`:79` 完全匹配工厂形状，不写字面量 key |
| onerror 处理（原生重连 vs 手动） | ✅ 决策正确 | `:94-97` 不 close，仅 `setConnected(false)`，依赖浏览器 EventSource 原生 backoff 重连；onopen 重连成功后重置 true。符合 EventSource 规范语义 |
| 内存（单例 ref） | ✅ 正确 | `:39` `useRef<EventSource|null>(null)` 持单例；cleanup 守卫 `sourceRef.current === source` 避免清掉已被新连接替换的 ref |

### 2. App 接入位置 ✅

- **QueryClientProvider 内**：`main.tsx:22` `<QueryClientProvider>` 包裹整个 `<App/>`，故 `RealtimeBridge`（`App.tsx:121-125`）内 `useRealtimeEvents` 调 `useQueryClient` 可用。✅
- **登录后常驻**：`App.tsx:123` `useRealtimeEvents(!!auth.user)`。`AppContext.tsx:25-30` 初始 `status:'loading'`/`user:null` → 加载期不连接；登录后 user 非空 → 连接；登出（`:78` user 置 null）→ enabled=false → SSE 断开。✅
- **接入层级**：`RealtimeBridge` 渲染在 `<AppShell>` 内、与 `<RoutedApplication/>` 同级（`App.tsx:128-133`），不在 `RequireAuth` 内。这是正确的——bridge 自身用 `enabled` 门控，挂在 app 级别才能跨路由常驻订阅，而非随某个受保护页面挂载/卸载。✅

### 3. 测试质量 ✅（结构良好，但有覆盖盲区）

- **fake EventSource**（`test.tsx:18-34`）：最小化、只覆盖 hook 触碰的表面（onopen/onmessage/onerror/close），静态 `instances[]` 记录实例，`close=vi.fn()` 便于断言。✅ 干净。
- **7 用例**：覆盖 enabled=false 不创建 / enabled=true 创建于正确 URL / onopen 翻 connected / status_changed invalidate 双 key / 未知类型不 invalidate / unmount close / enabled→false close。✅ 关键路径齐全。
- **测试隔离**：`beforeEach` 清 `instances[]` + `stubGlobal`；`afterEach` `unstubAllGlobals` + `restoreAllMocks`。✅ 无跨用例污染。
- **覆盖盲区**：见 L1–L3。

---

## 发现清单

### 🟡 中（M）

#### M1 — 缺少 `onerror` / 重连 / `connected` 回落路径的测试覆盖
**文件**：`src/hooks/useRealtimeEvents.test.tsx`（全文件，无对应用例）
**问题**：7 个用例覆盖了 onopen 翻 true，但**没有任何用例验证 `onerror` 把 `connected` 置回 false**，也没有验证"onerror 后 onopen 重新触发 → connected 恢复 true"的重连语义。这是 hook 注释（`useRealtimeEvents.ts:11-12, 28`）明确承诺的核心行为之一，却完全未被测试守护。
**失败场景**：未来有人误改 `:94-97` 的 onerror（例如错误地加了 `source.close()` 或漏掉 `setConnected(false)`），现有 7 个用例仍全绿——回归无防护。
**修复建议**：补 2 个用例：
```ts
it('flips connected to false on error (native reconnect, no close)', () => {
  const queryClient = makeQueryClient()
  const { result } = renderHook(() => useRealtimeEvents(true), { wrapper: wrapper(queryClient) })
  act(() => actOpen())
  expect(result.current.connected).toBe(true)
  act(() => FakeEventSource.instances[0].onerror?.())
  expect(result.current.connected).toBe(false)
  // 关键：onerror 不应触发 close（交给浏览器原生重连）
  expect(FakeEventSource.instances[0].close).not.toHaveBeenCalled()
})

it('restores connected to true after reconnect (onopen after onerror)', () => {
  const queryClient = makeQueryClient()
  const { result } = renderHook(() => useRealtimeEvents(true), { wrapper: wrapper(queryClient) })
  act(() => actOpen())
  act(() => FakeEventSource.instances[0].onerror?.())
  expect(result.current.connected).toBe(false)
  act(() => actOpen()) // 浏览器重连成功再次 onopen
  expect(result.current.connected).toBe(true)
})
```
**注意**：第一个用例还能锁死"onerror 不手动 close"这一设计决策——目前没有任何测试守护这一点。

---

#### M2 — `if (sourceRef.current) return` 在当前 effect 结构下是死代码
**文件**：`src/hooks/useRealtimeEvents.ts:50-51`
**问题**：`sourceRef.current` 在两个位置被清 null：`enabled=false` 分支（`:45`）和 cleanup（`:103`）。effect 的依赖是 `[enabled, queryClient]`——只要这俩不变，effect 不会重跑，`:51` 永远不会在 `sourceRef.current` 非空时被命中；当 effect 因 enabled/queryClient 变化重跑时，前一次 cleanup 必然已把 ref 清 null。因此 `:51` 的守卫**在当前依赖数组下不可达**。
**为何仍是中而非低**：它不是 bug（行为正确），但作为"防 StrictMode 重复创建"的防御代码，它给出的安全感是虚假的——StrictMode 的双挂载是 mount→unmount→remount，cleanup 一定会先跑，真正的保护来自 cleanup 而非这行。注释（`:50` "已有连接则复用，不重复创建（StrictMode 双调用由下方 cleanup 兜底）"）甚至自承认 cleanup 才是兜底。
**修复建议**（二选一）：
- **删除** `:50-51`，简化为依赖 cleanup 兜底（最小改动，意图更清晰）；
- **保留但改注释**，明确说明这是"为未来若 effect 依赖扩展、cleanup 不再保证清空"的防御，而非 StrictMode 防护，避免误导后续维护者。

---

### 🟢 低（L）

#### L1 — 缺少 `task.execution_progress` 事件的测试覆盖
**文件**：`src/hooks/useRealtimeEvents.test.tsx`（无对应用例）
**问题**：hook 对 `task.execution_progress`（`:75-81`）有专门分支——只 invalidate detail、不 invalidate list（注释说明为避免高频进度帧重拉整张列表）。这一**与 status_changed 不同的失效策略**没有任何测试守护。
**失败场景**：有人把 `:79` 误改成也 invalidate `lists()`（性能回归），或漏掉 detail invalidate，测试不报警。
**修复建议**：补 1 用例，断言 progress 事件只触发 detail key、不触发 list key：
```ts
it('invalidates only detail (not list) on task.execution_progress', () => {
  const queryClient = makeQueryClient()
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  renderHook(() => useRealtimeEvents(true), { wrapper: wrapper(queryClient) })
  sendMessage({ type: 'task.execution_progress', taskId: 'task-2' })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 'task-2'] })
  expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] })
})
```

---

#### L2 — 缺少 `taskId` 缺失时 status_changed 只 invalidate list 的测试覆盖
**文件**：`src/hooks/useRealtimeEvents.test.tsx:89-99`
**问题**：hook `:69` 用 `typeof event.taskId === 'string'` 守卫——taskId 缺失/非字符串时只失效 list、跳过 detail（`:72` 的 `if (taskId)`）。现有用例只测了 taskId 存在的情况，**taskId 缺失分支未测**。
**修复建议**：补 1 用例 `sendMessage({ type: 'task.status_changed' })`，断言只触发 `['tasks','list']`、不触发任何 detail key。

---

#### L3 — 缺少 JSON.parse 失败（坏帧）静默丢弃的测试覆盖
**文件**：`src/hooks/useRealtimeEvents.test.tsx`（无对应用例）
**问题**：hook `:60-65` 的 try/catch 是关键健壮性设计（坏帧不应崩溃整个订阅），但无测试。`sendMessage` helper（`:148`）总是 `JSON.stringify`，无法注入非法 JSON。
**修复建议**：扩展 helper 或直接在用例里 `source.onmessage({ data: 'not-json' })`，断言 `invalidateQueries` 未被调用且不抛异常。

---

#### L4 — `FakeEventSource.CLOSED` 常量未被使用
**文件**：`src/hooks/useRealtimeEvents.test.tsx:20`
**问题**：`static readonly CLOSED = 2` 定义了但全文件无引用（hook 也不读 `EventSource.CLOSED`）。属无害残留，但会让读者以为有用到 readyState 语义。
**修复建议**：删除 `:20` 该行，或在用例中真正断言 close 后的 readyState（若要保留语义）。倾向删除。

---

## 非缺陷性观察（不计入发现，仅供参考）

1. **`queryClient` 在依赖数组中**（`useRealtimeEvents.ts:107`）：`useQueryClient()` 返回的 client 实例在 `QueryClientProvider` 下稳定，故不会触发额外 effect 重跑。正确，无需改。

2. **`RealtimeBridge` 返回 `null`**（`App.tsx:124`）：纯副作用组件，模式正确。可考虑未来用 React 19 的 `useEffectEvent` 或将其副作用上提，但当前实现完全可接受。

3. **`approval.*` / `agent.health` 仅 `console.debug`**（`:82-87`）：注释明确标注"预留，MVP 无对应 UI"。符合渐进式接入策略，不是缺陷。建议未来接入 UI 时补对应 invalidate 或 context 更新。

4. **测试中 `actOpen()` 取 `instances.at(-1)`**（`:141`）：用最后一个实例驱动 onopen。在当前单实例场景下正确；若未来 hook 改为多连接模型需调整，但当前无需改。

---

## 结论

P1-7b 的**生产代码质量高、可直接合并**。核心生命周期、invalidate 精确性、原生重连决策均正确，App 接入位置无误。

主要改进空间在**测试覆盖**：当前 7 用例覆盖了"快乐路径 + 卸载/禁用关闭"，但对 hook 注释明确承诺的 **onerror/重连语义（M1）** 和 **progress/坏帧/taskId 缺失分支（L1–L3）** 完全没有守护——这些恰恰是最容易在未来被误改、且改后仍全绿的回归点。建议合并前至少补 M1 的两个用例（锁死 onerror 不 close + 重连恢复 connected），L1–L3 可作为后续测试加固。

| 级别 | 数量 | 阻塞合并？ |
|---|---|---|
| 高 | 0 | — |
| 中 | 2 | 否（M1 为测试补强，M2 为可简化死代码） |
| 低 | 4 | 否 |
