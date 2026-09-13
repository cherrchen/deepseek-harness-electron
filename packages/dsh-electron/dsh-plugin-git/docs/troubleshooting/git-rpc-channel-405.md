# `/git` RPC 通道 405：客户端 UI 全部空白的根因

## 症状

- 输入框控件右侧的分支选择器与变更 chip 完全不出现。
- 右侧边栏的 git / git graph / git diff 三个 tab **存在**，但点进去正文空白。
- 全程无任何可见报错（客户端错误只在分支菜单展开时才渲染，而菜单因控件不渲染而无法展开；宿主侧嵌套 fiber 的失败被 dsh web 日志吞掉）。

对运行中的实例探测：`POST /api/…` 返回 401 而 `POST /git/...` 返回 405——405 来自 frontend-static 的 SPA 静态回退，说明请求到达时宿主路由表里没有这条通道路由。

## 根因

宿主半边（`src/index.ts` 的 `apply`）曾在嵌套 fiber 中只声明 `connection`：

```ts
ctx.inject(['connection'], (connectionCtx) => {
  const connection = connectionCtx.connection
  return connection.rpc.handle('/git', ...)
})
```

而 `connection` 包的通道注册内部以属性访问读取路由表（`connection/src/rpc-host.ts`）：
`owner.effect(() => owner.webServer.register(route), ...)`，其中 `owner` 就是上面那个嵌套 fiber 的 ctx。cordis v4 的属性访问只能看到**读取方 fiber 自己注入的服务**——兄弟行提供的 `webServer` 从该 fiber 永远不可见，于是抛出
`cannot get property "webServer" without inject`，嵌套 fiber 进入 FAILED 状态，`/git` 通道从未注册。唯一的例外是从根上下文读取服务（走共享服务 store）：上游 connection 的测试恰好都是从根 ctx 调用的，所以这个坑在测试面上不可见。

后果链：客户端 `controller` 的所有 `/git` 请求（discover/status/diff/log…）落到 SPA 静态回退（405）→ `repository` 永远为 `undefined` → `GitBranchControl` 渲染 `null`（分支选择器、chip 消失）；`GitChangesSurface` 的三个空态分支（loading / 无工作区 / 非仓库）都不命中（`repository === undefined` 而非 `null`），tab 正文什么都不渲染。tab 定义本身是纯客户端注册，不受影响——所以 tabs 仍在。

同一坑在 `dsh-plugin-multi-root-workspace` 的 `/workspace-folders` 面板通道上先被发现并修复（其 `src/command.ts` 有完整注释）。

## 解法（已验证）

嵌套 inject 的依赖列表必须包含 `webServer`，且服务必须从根上下文读取：

```ts
ctx.inject(['connection', 'webServer'], (connectionCtx) => {
  const connection = connectionCtx.root.get('connection')
  if (connection === undefined) return // soft：headless/sdk 等 profile 无 web 服务，跳过挂载
  return connection.rpc.handle('/git', ...)
})
```

- `webServer` 入依赖列表：回调只在路由表存在后运行，且该 fiber 能解析属性。
- `root.get('connection')`：`rpc.handle` 内部的 `webServer` 解析跟随"服务被读取的上下文"，从根读取走共享 store。
- 保留 soft 语义：无 webServer 的 profile（headless、sdk）不挂载适配器，git 服务本体不受影响。

验证方式：`tests/rpc-channel.spec.ts` 固化了三项契约（inject 列表含 `webServer`、路由表就绪后 handler 注册到 `/git`、缺路由表时保持未挂载）；活体探测用 `curl` 对比通道与 `/api/…` 的状态码（通道返回 401/业务响应而非 405）。

## 关联

- 测试：`tests/rpc-channel.spec.ts`；`tests/generation.spec.ts` 的 fake 顶层提供 `webServer` 以对齐真实拓扑。
- 同源先例：`dsh-plugin-multi-root-workspace/src/command.ts`（panel channel 注释块）。
