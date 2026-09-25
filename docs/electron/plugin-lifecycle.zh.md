# Electron 插件组合

[English](plugin-lifecycle.md) | 中文

> 状态：**当前下游参考**
>
> 范围：`apps/electron/**`、`apps/electron/runtime/**`
>
> 读者：维护者、coding agent（编程智能体）、评审人与未来贡献者

## 目的

Desktop 挂载必需的 adapter 和随包 Git 插件，用户安装的插件由上游 Web profile 管理。

## 启动组合

`runtime/host.patch.yml` 挂载 Desktop Capability Provider、目录选择 client、品牌、网络设置和随包 Git 插件。Theme Studio 保留在组合中但处于禁用状态，因为此 Host 不提供其所需的 `settingsScope` 服务。Main 在启动 `dsh web` 前校验每个随包插件的 Host 和 Client 产物，并将 package 链接到 `$DSH_HOME/profiles/node_modules`。缺失产物会使启动报错。

上游 Web bundle 挂载自己的插件管理 UI 和 agent tool。Main 将随包 pnpm 加入受监督 Host 的 `PATH`，使上游 profile manager 无需全局安装 pnpm 即可执行 package 命令。插件安装、移除、profile 状态和 bundle 热激活遵循上游 Web profile 的实现。Electron 不维护独立的插件状态文件或动态 Cordis include。

## 边界

`ctx.desktop` 向 Desktop-aware 插件提供操作系统能力，不包含插件管理组。Renderer 通过现有 Main transport 接收 Host 插件脚本和 RPC。Desktop Host overlay 静态列出随包插件；用户安装的 bundle 由上游 profile 组合。
