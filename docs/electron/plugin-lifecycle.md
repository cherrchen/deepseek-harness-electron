# Electron Plugin Composition

English | [中文](plugin-lifecycle.zh.md)

> Status: **Current downstream reference**
>
> Scope: `apps/electron/**`, `apps/electron/runtime/**`
>
> Audience: maintainers, coding agents, reviewers, and future contributors

## Purpose

Desktop mounts its required adapters and bundled Git plugin while the upstream Web profile manages user-installed plugins.

## Startup composition

`runtime/host.patch.yml` mounts the Desktop Capability Provider, directory picker client, brand, Network Settings, and the bundled Git plugin. Theme Studio is present but disabled because this Host does not provide its required `settingsScope` service. Main validates every bundled Host and Client artifact and links the packages under `$DSH_HOME/profiles/node_modules` before starting `dsh web`. A missing artifact stops startup with an error.

The upstream Web bundle mounts its own Plugin Manager UI and agent tool. Main places the packaged pnpm executable on the supervised Host `PATH` so the upstream profile manager can run package commands without a global pnpm installation. Plugin installation, removal, profile state, and live bundle activation follow the upstream Web profile implementation. Electron does not maintain a separate plugin state file or dynamic Cordis include.

## Boundaries

`ctx.desktop` exposes OS capabilities to Desktop-aware plugins. It has no plugin management group. The Renderer receives Host plugin scripts and RPC through the existing Main transport. The Desktop Host overlay lists bundled plugins statically; user-installed bundles are composed by the upstream profile.
