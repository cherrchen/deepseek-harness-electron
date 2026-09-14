# Agent Note: Electron 仅在 Desktop 记录执行意图后热加载 profile package

Status: implemented

[English](2026-09-13-electron-plugin-manageable-kinds.md) | 中文

## Problem

许多普通 npm library 都会暴露 `main` 或 root export，因此仅凭 package entry point 无法证明 web profile 的 direct dependency 是 Cordis 插件。若把 CLI 安装的每个可 import dependency 都加入 Electron generated roster，Host 启动时可能会执行无关的 library module。

## Decision

健康的 profile `runtime-plugin` 只有在 Desktop 已将其名称记入 `profileManaged` 时才可管理。该列表同时记录 Desktop 安装来源，以及用户通过 Electron 私有 generated roster 执行该 package 的意图。可 import 的 CLI dependency 仍会按 inspect 结果进入 catalog，但不进入 roster。`plugin-state.json` 保持 version 2。

Desktop 安装会在激活前把有效 runtime plugin 追加到 `profileManaged`。Bundle 继续使用共享 profile 组合（`profile-restart`），因为 `dsh.bundle.patch` 是其显式插件判别信号。Distribution-owned ecosystem plugin 仍可独立于 profile state 进行管理。

## Alternatives considered

**把每个拥有 root entry 的健康 package 都当作 runtime plugin。** 拒绝：普通 library 使用相同的 npm entry field，因此会在 Host 启动时被执行。

**为 hot plugin 新增一个 package manifest 判别字段。** 拒绝：Desktop 安装已经记录了明确的执行意图，无需修改公开 package 格式。

## Consequences

启动组合与 package 重新激活同时要求 catalog health、runtime-plugin kind 与 Desktop membership。CLI dependency 仍可见且可执行 package action，但不获得 runtime control，也不进入 `plugins.cordis.yml`。
