# Codex 审核修复报告 — P1-3b 会话数据层 + NDJSON 流式读取

**审查范围**：`git diff b40dc9c..5d9aadb`，7 个文件 / 947 行新增
- `src/api/conversations.ts`、`src/api/stream.ts`、`src/queries/conversations.ts`
- `src/hooks/useStreamChat.ts`、`src/types.ts`（`ChatStreamFrame` 判别联合）
- `src/api/stream.test.ts`、`src/hooks/useStreamChat.test.tsx`

**审查模式**：codex-review-and-fix skill 手动模式（Codex 运行时不可用，独立审查）。判真基于：逐行阅读源码 + 对照 P1-3b 任务规约 + 后端协议（`user/status/delta{text}/done{text}/error{message}`，浏览器已验证）+ REST client `src/api/client.ts` 语义 + 实跑 14 个测试全绿。

**结论**：判真后 **真实 5 条**（高 1 / 中 3 / 低 1），误报 0，待确认 0。未改代码（按指令只出报告）。

---

## ✅ 已识别为真（5 条，未修复——本次仅审查）

### 🔴 H1 — `useStreamChat` 卸载时不 abort，流继续在已卸载组件上 setState（资源泄漏 + React 警告）
**位置**：`src/hooks/useStreamChat.ts:39-117`（整个 hook 无 `useEffect` 清理）

**问题**：hook 持有 `abortRef`，但组件卸载时没有任何 effect 调 `abortRef.current?.abort()`。若用户在流式输出进行中离开页面/切换路由，`streamChat` 仍在后台读流，后续 `onDelta`/`onDone`/`onError` 回调会继续对已卸载组件 `setAssistantText`/`setStatus`（React 18 dev 控制台 "Can't perform a React state update on an unmounted component" 警告，且请求/连接泄漏直到流自然结束）。

**判真依据**：全文件无 `useEffect` import 与卸载清理；`streamChat` 收到 abort 才会停读（`stream.ts:85` 的 `signal?.aborted` 短路）。任务规约第 5 节明确要求 `abort()` 用 `AbortController`，但未要求卸载清理——属规约未覆盖的真实缺陷。

**修复建议**（低风险）：
```ts
import { useCallback, useEffect, useRef, useState } from 'react'
// ...
useEffect(() => {
  return () => { abortRef.current?.abort() }
}, [])
```
注意：cleanup 只 abort，不 setState（卸载后 setState 无意义且会触发警告）。

---

### 🟡 M1 — `streamChat` 收到 `error`/`done` 终止帧后不提前返回，继续读到 EOF
**位置**：`src/api/stream.ts:99-127`（`dispatchFrame` 的 `error`/`done` case 仅 `break`，不通知外层循环终止）

**问题**：`done` 与 `error` 都是协议级终止帧，但 `dispatchFrame` 调用 handler 后只 `break` 出 switch，外层 `for(;;)` 读循环继续 `reader.read()`。后果：
1. **`error` 帧后继续读**：后端发了 `error` 帧但连接未立即关闭时，`streamChat` 会一直阻塞在 `reader.read()`，`start()` 的 `await` 迟迟不 resolve，UI 卡在 streaming。
2. **`done` 帧后继续读**：同理，`done` 到 EOF 之间若有延迟，`start()` 返回被推迟；调用方本应在 `done` 后 `invalidate` 刷新持久消息，现被拖到 EOF 之后。

**判真依据**：`dispatchFrame` 无返回值/无"终止"信号；`streamChat` 主循环只在 `done===true`（reader 关闭）时 break。任务规约第 3 节描述"按 type 分发"未提提前终止，但协议语义上 `done`/`error` 即终态。

**修复建议**（中风险，需改 `dispatchFrame` 签名）：让 `dispatchFrame` 返回 `boolean`（true=终止帧，应停止读取），`error`/`done` 返回 true；主循环内 `if (dispatchFrame(line, handlers)) return`。或更简单：在 `streamChat` 内联处理——遇到 `done`/`error` 帧 `reader.cancel()` 后 break。注意 `done` 帧后调用 `reader.cancel()` 可立即释放连接，无需等后端关流。

---

### 🟡 M2 — `start()` 的 `await streamChat(...)` 之后无竞态守卫，慢回调可在 abort/换轮后落进新状态
**位置**：`src/hooks/useStreamChat.ts:78-106`（handlers 闭包捕获 `controller`，但 `onDelta`/`onDone` 不校验 `controller === abortRef.current`）

**问题**：`abort()` 与 `start()` 都通过 `abortRef.current?.abort()` 取消旧流，但 `streamChat` 的 abort 是异步的——abort 后 reader.read() reject 前，**已在管道中排队但尚未派发的帧**仍可能触发 `onDelta`/`onDone`。场景：
- 用户快速连点两次"发送"：A 轮 `start` 进行中 → B 轮 `start` abort A → A 的某个迟到 `onDelta` 仍执行 `setAssistantText(prev => prev + frame.text)`，把 A 的残片拼进 B 的开头（B 已 `setAssistantText('')` 清空，但迟到的 delta 用函数式更新会基于清空后的 `''` 拼接，污染 B）。

**判真依据**：handlers 闭包未绑定"当前轮次"判断；`onDelta` 用 `prev =>` 函数式更新，无法区分是本轮还是上一轮的残留帧。当前 6 个测试未覆盖"连点两次 + 迟到帧"。

**修复建议**（中风险）：在每个 handler 入口校验 controller 仍是当前轮次：
```ts
onDelta: (frame) => {
  if (abortRef.current !== controller) return  // 本轮已被取代，丢弃迟到帧
  if (frame.text) setAssistantText((prev) => prev + frame.text)
},
```
对 `onDone`/`onStatus`/`onError` 同理加守卫。

---

### 🟡 M3 — `useConversation(null)` 产生不稳态空串 key `['conversations','detail','']`
**位置**：`src/queries/conversations.ts:62-68`

```ts
export function useConversation(id: string | null | undefined) {
  return useQuery({
    queryKey: conversationKeys.detail(id ?? ''),   // id 为 null → ['conversations','detail','']
    queryFn: () => fetchConversation(id as string),
    enabled: !!id,
  })
}
```

**问题**：`enabled: !!id` 阻止了查询执行（不会真发请求），但 `queryKey` 仍是 `['conversations','detail','']`。后果：所有"无 id"调用方共享同一个空串 key 的缓存槽；若某处对 `conversationKeys.detail('')` 做 `invalidateQueries`（如 delete 后清理），会误命中该空槽。虽然概率低，但 key 工厂的设计初衷就是"集中、稳定、唯一"，空串作为 detail id 破坏了这一不变量。

**判真依据**：`conversationKeys.detail(id ?? '')` 在 `id` 假值时退化为业务上不存在的 id `''`；`useDeleteConversation` 的 `onSuccess` 用真实 id invalidate，不会命中空槽——但代码可读性与不变量受损，且未来若有"批量 invalidate details"会踩坑。

**修复建议**（低风险）：disabled 时不入缓存，用稳定的占位 key 或直接返回 disabled query：
```ts
queryKey: id ? conversationKeys.detail(id) : ['conversations', 'detail', '__none__'],
```
或更简洁：`queryKey: conversationKeys.detail(id ?? '__none__')`。

---

### 🟢 L1 — `streamChat` 非 2xx 但 body 缺 `message` 时，`code` 退化为 `String(res.status)`，与后端错误码语义不一致
**位置**：`src/api/stream.ts:62-66`（`readErrorFrame` 的 fallback 分支）

**问题**：当响应体不可解析（HTML 502、空 body）时，fallback 帧的 `code: String(res.status)`（如 `"502"`）。而 REST client 的 `ApiClientError.fromResponse` 在同样情况下用 `'INTERNAL_ERROR'`（`client.ts:42`）。两条路径的 code 命名空间不一致：流式用数字字符串、REST 用大写枚举。下游若按 `code` 分类错误（如 `code === 'NOT_FOUND'` vs `code === '404'`），两条路径行为分叉。

**判真依据**：`client.ts:42` fallback code = `'INTERNAL_ERROR'`；`stream.ts:65` fallback code = `String(res.status)`。测试 `stream.test.ts:261-274` 只断言 `message` 非空，未断言 code 形态，故测试绿不代表语义一致。

**修复建议**（低风险，可选）：统一 fallback code 为 `'INTERNAL_ERROR'`，或保留数字但文档化"流式 fallback code 为 HTTP 状态码字符串"。若后端 error 帧本身带语义 code（如 `NOT_FOUND`），正常路径已保留（`stream.ts:56`），仅 fallback 受影响。

---

## ❌ 未接受（0 条）
无。

## ❓ 待确认（0 条）
无。

---

## 未能修复的高风险项
- **H1（卸载不 abort）**已识别为真且属高风险（资源泄漏 + 状态污染），但本次为纯审查模式未改代码。建议优先修：加 `useEffect` cleanup 一行即可，风险极低。

---

## 测试质量评估
- **覆盖度（良好）**：`stream.test.ts` 8 例覆盖了顺序派发、坏 JSON 跳过、跨 chunk 缓冲、非 2xx NDJSON error、非 JSON body fallback、abort、网络错误、未知 type——核心路径齐全。
- **缺口（建议补，非阻塞）**：
  1. **无 `done`/`error` 帧后流未关闭的测试**——即 M1 场景（终止帧后还有数据/连接未关）。当前测试的 NDJSON 都是 `done` 后立即 close，未验证"done 后 streamChat 是否及时返回"。
  2. **无 `useStreamChat` 卸载测试**——即 H1 场景（render → start → unmount → 断言 abort 被调、无 setState 警告）。
  3. **无连点/竞态测试**——即 M2 场景（两次 start 间迟到帧）。`useStreamChat.test.tsx` 的"clears prior text when starting a new turn"（`:160-176`）只验证 start 清空，未模拟迟到帧污染。
  4. `useStreamChat.test.tsx` 的 `fire()` 辅助（`:119-127`）按 `on${Type大写}` 派发，`user`→`onUser` 正确；但未测试 `onUser` 路径（hook 内 `onUser` 为空实现，无断言）——可接受，user 帧确无副作用。
- **测试隔离（良好）**：`afterEach` 清 mock + `lastHandlers`，`vi.stubGlobal`/`unstubAllGlobals` 配对正确。

---

## 帧类型 / 协议一致性
- `ChatStreamFrame` 判别联合（`types.ts:301-306`）与后端协议 `user/status/delta{text}/done{text}/error{message}` **一致**（commit `5d9aadb` 已修正 `delta` 字段 `delta→text`，浏览器验证通过）。
- `user` 帧类型 `{ type:'user'; id?; content }` 与 `useStreamChat` 的 `onUser`（空实现，未消费 `content`）一致——hook 仅把 user 帧当信号，不读 payload，可接受。
- `done` 帧的 `text` 为"服务端组装的全文"，hook 的 `onDone` 用它覆盖累加值（`useStreamChat.ts:92-98`）——与协议语义一致，且对"丢帧"有容错（注释已说明）。

## queries 一致性
- `conversationKeys` 工厂（`all/lists/details/detail`）结构稳定、层级正确。
- `useConversations` 的 `select: res => res.data` 与 `listConversations` 的 `unwrap:false`（返回完整 `{data,page}` envelope）**匹配**——正确。
- `useCreateConversation`/`useDeleteConversation` invalidate `lists()`；delete 额外 invalidate `detail(id)`——策略合理。
- `useSendMessage` 仅 invalidate `detail(vars.id)`，不碰 `lists()`——合理（发消息不改列表元数据）。规约要求"调用方 invalidate"的设计（streaming 场景由 `useStreamChat` 的 `done` 后刷新）已通过注释交代。

---

## 总结
P1-3b 整体质量良好：协议对齐、容错（坏行跳过/abort 吞掉/非 JSON fallback）扎实、测试覆盖核心路径。**5 条真实问题中，H1（卸载不 abort）应优先修**（一行 `useEffect` cleanup）；M1（终止帧不提前返回）影响 `start()` 返回时序，建议跟进；M2（迟到帧竞态）概率低但语义正确性受损；M3/L1 为健壮性/一致性优化。修复后建议补 3 类缺口测试（卸载、终止帧后流、连点竞态）再回归 build+test。
