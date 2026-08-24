# Electron 插件生命周期

[English](plugin-lifecycle.md) | 中文

> 状态：**当前下游参考**
>
> 范围：`apps/electron/**`、`apps/electron/runtime/**`
>
> 读者：维护者、coding agent（编程智能体）、评审人与未来贡献者

## 目的

本文描述 Electron 打包生态插件的已实现运行时生命周期。

Electron 拥有插件的 desired state。DSH Host 拥有实际的 Cordis fiber state。运行时生命周期路径在不重启 Electron Main 与受监督 `dsh web` 进程的前提下桥接这两个事实。

## 受管理插件类别

Electron 通过 `apps/electron/src/runtime-plugins.ts` 发现两类 bundled 插件：

* **桌面运行时适配器** 是必需项，在 Host 启动前完成链接，且不允许用户在运行时管理。
* **bundled 生态插件** 在 Host 启动前完成链接，允许用户在运行时管理，并通过生成的 include 文件进入组合。

链接本身不是启用状态信号。Electron 会把 bundled artifact 同时暴露到 `$DSH_HOME/profiles/node_modules` 与 `$DSH_HOME/electron/node_modules`；运行时启停仅由生成的 Cordis 组合控制。

## 运行时拥有的文件

Electron 在 `$DSH_HOME/electron/` 下写入这些文件：

* `plugins.cordis.yml` 是 manageable 生态插件的生成 desired roster。
* `plugin-state.json` 仅保存持久化的 disabled package-name 集合。

Electron 还会在 Electron `userData` 下写入 `electron-host.patch.yml`，并将其传给 `dsh web --patch`。

bootstrap patch 只保留桌面必需基础设施行，为 `plugins.cordis.yml` 打开窄 HMR，并安装一个稳定的 `cordis:include` seat 指向该生成文件。bootstrap overlay 不列出各个生态插件。

## 启动顺序

Electron Main 以如下顺序启动 Host：

1. 解析 `DSH_HOME`；
2. 发现 bundled runtime 与 ecosystem 插件 artifact；
3. 修复所有必需 symlink；
4. 加载 `plugin-state.json`；
5. 生成初始 `plugins.cordis.yml`；
6. 渲染 `electron-host.patch.yml`；
7. 启动 `dsh web --patch <electron-host.patch.yml>`。

启动阶段与后续生命周期变更都操作同一个生成的 `plugins.cordis.yml` 路径。

## 运行时操作

`PluginLifecycleController` 串行化 `list()`、`enable(name)`、`disable(name)` 与 `reload(name)`。

这些操作通过重写 `plugins.cordis.yml` 来修改 desired state，然后轮询现有 Host `pluginInventory.list()` Remote 真相，直到目标状态稳定：

* **enable** 等待包出现且 fiber phase 为 `active`；
* **disable** 等待该包从 inventory 中消失；
* **reload** 移除该包、等待消失、恢复该包、再等待其变为 `active`。

若稳定失败，Electron 会先恢复上一份生成 roster，再向外报告失败。controller 还会在连续 mutation 之间等待一个 HMR quiet window，避免第二次生成文件写入落在前一次变更的 watcher debounce 窗口内。

## Renderer refresh 边界

Electron 只会在 Host 稳定之后，并且仅当 manageable 插件分发产物带有 client half（`hasClient === true`）时刷新 BrowserWindow。

纯 Host 插件不会触发 Renderer reload。

该边界是刻意的：

* Host 插件生命周期保持为真正的 Cordis hot plug。
* Renderer 插件图协调仍是由 Electron 拥有的整页 reload。
* Electron 不尝试对上游模块图做 client 侧热协调。

## 状态文件行为

`plugin-state.json` 保存单一当前格式对象：

```json
{
  "version": 1,
  "disabled": ["@dsh-electron/dsh-plugin-git"]
}
```

行为规则：

* 缺失文件表示 `disabled: []`；
* 非法 JSON 记录 warning 并回退，不会导致启动崩溃；
* 重复名称会被去重；
* 失效名称会在下一次成功写入时被移除。

## 嵌套 include 限制

生成的 `plugins.cordis.yml` 位于 `$DSH_HOME/electron/` 下，而嵌套 `cordis:include` 会从该目录解析 bare package name。

因此 Electron 除了保留 `$DSH_HOME/profiles/node_modules` 这一现有 profile fallback 外，还会在 `$DSH_HOME/electron/node_modules` 下保留 bundled 插件链接。

若上游未来提供能在嵌套 include 间保留包解析上下文的原生运行时组合 API，这一额外链接面可以移除。

## 验证

聚焦的 `apps/electron` 覆盖验证：

* runtime overlay 渲染与占位符替换；
* plugin-state 解析与持久化行为；
* runtime config 的确定性生成；
* lifecycle controller 的成功路径、回滚、串行化与 client-refresh 分支；
* 通过 fixture 插件与 bundled Git 插件验证真实 Host 的 disable/enable/reload，并确认 PID 保持不变。
