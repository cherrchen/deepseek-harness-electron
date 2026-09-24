# Agent Note: Electron Windows proxy name folding

Status: implemented

[English](2026-09-24-electron-windows-proxy-name-folding.md) | 中文

## Problem

`v0.1.5-beta.3` 无法打包。[desktop-release.yml](../../../../.github/workflows/desktop-release.yml) 的两个 Windows matrix 行在 `Test Electron runtime` 步骤失败，而 macOS 与 Linux 行通过：Windows 以大小写不敏感的方式解析环境变量名，而 agent 代理策略控制九个名称、每个都有两种拼写——`HTTP_PROXY` 与 `http_proxy`、`HTTPS_PROXY` 与 `https_proxy`、`ALL_PROXY` 与 `all_proxy`、`NO_PROXY` 与 `no_proxy`，以及 `NODE_USE_ENV_PROXY`。

Host provider [desktop-network-subprocess](../../../../apps/electron/runtime/plugins/desktop-network-subprocess/src/index.ts) 会从 launch 环境各层回填非强制策略未设置的名称，因为 Host 自身继承的名称指向环回 Gateway，只有 Main 的原始值或已发现的 `.env` 层才能提供 agent 的退出代理环境。它逐个名称独立查找，而 [lookupKey](../../../../packages/util/launch-environment/src/index.ts) 在 Windows 上折叠名称，因此对 `http_proxy` 的查找返回了 `user-env` 层的 `HTTP_PROXY` 条目。策略自带的 `HTTP_PROXY` 值与回填的 `http_proxy` 值于是在指代同一个 Windows 变量时互不相同；Node 会把两种拼写都写入子进程的环境块，后写入的键生效，因此 agent 最终运行在用户层的代理上，而不是 [environment.ts](../../../../apps/electron/src/network/environment.ts) 为它推导出的值。

同一批 Windows 行还使 [network-runtime-path.spec.ts](../../../../apps/electron/tests/network-runtime-path.spec.ts) 失败：该 spec 向 [resolveNetworkRuntimePath](../../../../apps/electron/src/network/runtime-path.ts) 传入 `platform: 'win32'`，却断言 POSIX 路径。该 helper 拼接的是 Electron 在运行主机上报告的根目录，因此在 Windows 上，随包路径与“运行时缺失”错误信息都带反斜杠。

## Decision

[`fillAgentProxyValues`](../../../../apps/electron/runtime/plugins/desktop-network-subprocess/src/index.ts) 在运行平台上按九个策略名称各自对应的环境变量分组，每组只赋一个值：策略已设置的组在每种拼写下都保持该值，策略未设置的组则只从 launch 环境取一次值。POSIX 的组只含单个名称，因此 `HTTP_PROXY` 与 `http_proxy` 在那里仍相互独立，各自仍从自己的层条目回填。策略值为删除标记（tombstone）的名称仍然清除整个组。

`network-runtime-path.spec.ts` 现在通过 `node:path` 的 `join` 推导两处期望，与 helper 以及 [smoke-windows-installer.ps1](../../../../apps/electron/scripts/smoke-windows-installer.ps1) 要求的随包路径一致。

代理策略与其 launch 环境回填仍属 [Electron 托管网络设置](../../proposed/feature/2026-09-20-electron-managed-network-settings.zh.md) 的既定设计；本次变更只修正同一变量的两种拼写如何回填。

## Alternatives considered

**维持现状，逐个拼写独立回填。** 折叠查找会给同一个 Windows 变量两个不同的值，因此 agent 实际收到的值取决于 Node 环境块中的键顺序，而不取决于 Main 计算出的策略。这正是本缺陷。

**让 `agentProxyPolicyForHost` 在 Windows 上只输出大写名称。** 生产者无法观察 Host 平台，而 Host 的回填会通过同一个折叠查找重新加回小写拼写，于是分歧在下一层重新出现。

**在 `resolveNetworkRuntimePath` 内根据其 `platform` 选项选择 `path.win32` 或 `path.posix`。** 该选项决定随包可执行文件的名字与扩展名；根目录始终来自运行中的 Electron（`process.resourcesPath`、`app.getAppPath()`），运行主机的 path 模块才是这些根目录所属的模块。按平台选择 join 会让 helper 构造出未必对应真实文件的路径。

**在该 spec 内用平台分支分别写 POSIX 与 Windows 期望。** 这些断言描述的是同一个行为——helper 在给定根目录内解析——用运行主机的 path 模块即可表达，且不会让两个分支逐渐偏离。

## Consequences

Windows 上每个代理变量的两种拼写都会以相同的值传给 agent 子进程，因此哪个键生效不再改变结果。macOS 与 Linux 不受影响：它们的组各含单个名称，回填所赋的值与原先 `??=` 完全一致。

Windows 上 System 与 Manual 模式的 agent 流量现在保留 Main 从环境推导出的代理，而不再被 `.env` 层以另一种拼写携带的值取代。只设置 `http_proxy` 的 Windows 层仍能提供该变量，因为分组的查找会折叠到它。

该 path spec 现在依赖运行主机的 path 模块，因此它在 Windows 上的期望带反斜杠是有意为之，而不再是偶然结果。

## Testing

[network-agent-subprocess.spec.ts](../../../../apps/electron/tests/network-agent-subprocess.spec.ts) 新增两个用例，通过真实生产者序列化策略，并以显式平台驱动 `fillAgentProxyValues`：`win32` 断言两种拼写都取得策略的值，`darwin` 断言两种拼写保持相互独立。同文件中的集成用例正是 Windows 失败的那一个；它断言 agent 子进程实际观察到的环境，本地 macOS 运行继续覆盖本次变更未触及的平台。

两个 Windows 行都无法在本地运行，因此该修复通过移动 tag 后重新运行 [desktop-release.yml](../../../../.github/workflows/desktop-release.yml) 的两个 Windows 行来验证。

覆盖缺口：[desktop-ci.yml](../../../../.github/workflows/desktop-ci.yml) 仅在 `Windows Host startup` job 中于 `windows-latest` 上运行 `runtime.spec.ts`，因此 `apps/electron/tests` 其余 spec 首次接触 Windows 是在发布工作流中、tag 已存在之后，此时失败阻塞的是发布而非 PR。
